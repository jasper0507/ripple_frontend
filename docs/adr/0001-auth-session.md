# ADR 0001：认证会话的浏览器端协调

- 状态：已接受（用户于 2026-10-04 确认四项取舍与 Implementation Plan）
- 关联：Issue #3、父规格 #1、docs/frontend-plan.md Phase 4 最新规格复核

## 背景

后端已实现短期 Access JWT + Redis Refresh Token：登录签发访问令牌并
通过持久 HttpOnly Cookie 交付刷新令牌；`POST /api/v1/refresh` 原子轮换
刷新令牌并继承剩余 TTL；`POST /api/v1/logout` 删除请求 Cookie 指向的
令牌并清 Cookie。规格复核留下六项差异需要在本模块收口。

## 复核来源（2026-10-04 只读复核）

- 后端 HEAD `11f1e47a0a0a37fcfc68f6ca091284ee820601fe`（工作区有未提交的
  `internal/service/post.go` 改动）；规格上次核查点 `07b149c`。
  认证相关代码在两版本间无变化（仅新增测试文件）。
- 前端 OpenAPI 快照 SHA256 `6539ce9a…`（与 `07b149c` 一致）；后端当前
  `docs/openapi.yaml` SHA256 `6ba89027…`（仅多一行 schema 注释，认证契约不变）。
- 关键文件：`internal/handler/auth.go`、`internal/service/auth.go`、
  `internal/service/token.go`、`internal/store/refresh_token.go`、
  `internal/middleware/auth.go`、`internal/response/code.go`、
  `internal/config/config.go`（`auth.cookie_secure` 默认 false）。

## 六项差异的收口

1. **身份恢复（用户名）**：刷新响应不含用户名，JWT 仅 `iss/sub(UUID)/iat/exp`，
   无当前用户资料接口。**用户决定：localStorage 持久化用户名**
   （`bluebell:auth:username`，登录时写入，最终失效与主动退出时清除）。
   这是对规格"不擅自持久化身份资料"的明确授权例外。残留边界：用户手动
   单独清 localStorage 而不清 Cookie 时，恢复后入口显示"已登录"占位而非用户名。
2. **一次性轮换**：Lua 脚本原子轮换、旧令牌即删、继承剩余 TTL，旧令牌重用
   返回 `401 / UNAUTHORIZED`（静态调用链复核，未运行复现）。
3. **跨标签页协调**：**用户决定：Web Locks + BroadcastChannel**。
   所有触碰共享 Cookie 的操作（refresh/login/logout）经
   `navigator.locks`（`bluebell:auth:lock`）浏览器级串行；登录、退出、
   最终失效经 BroadcastChannel（`bluebell:auth`）按代次同步；不广播访问
   令牌本体，各标签页持各自的内存令牌。不支持 Web Locks 时退化为标签页内
   直接执行（主浏览器 Chrome/Edge 均支持，降级在验证文档记录）。
4. **退出竞态**：退出在同一把锁内等待在途刷新结束后再发送，使 logout
   请求携带轮换后的最新 Cookie，从而删除真正存活的刷新令牌；退出成功后
   代次递增并广播，旧代次的迟到刷新响应一律丢弃。**用户已接受残留边界**：
   刷新响应丢失可能产生孤儿刷新令牌（浏览器未收到新 Cookie，服务端旧令牌
   已删除），前端无法撤销，只能等其自然过期（不超过剩余 TTL）。
5. **刷新响应丢失**：**用户决定：会话协调者对网络故障/5xx 重试一次**。
   浏览器已收新 Cookie 则重试成功（安全地再次轮换，TTL 不延长）；未收到则
   旧 Cookie 已失效、重试得到 401，与真正到期无法区分，按最终失效处理
   （清身份与账号缓存、保留草稿，用户重新登录）。连续临时故障不冒充
   确定的未登录：保留会话与输入，标记"暂时无法续期"，由用户重试。
6. **Cookie 与 CSRF**：Cookie 为 `refresh_token`、`Path=/`、HttpOnly、
   SameSite=Lax、`Expires/MaxAge` 来自剩余 TTL；Secure 由部署配置决定。
   后端无 CSRF token；refresh/logout 为 POST，SameSite=Lax 下跨站 POST
   不携带 Cookie，结合同源代理（开发 Vite、部署 Caddy；2026-10-16 由 Nginx 改为 Caddy，同源边界不变）构成边界。
   **用户已接受**：演示范围依赖 SameSite=Lax+同源，真实浏览器实测收发、
   持久性与退出清除；部署时验证 `cookie_secure=true`。

另：OpenAPI 刷新接口"401 后清状态跳登录"的文档建议与已确认前端交互冲突，
按规格决定不采纳（保留公共阅读与草稿，按需登录）。

## 会话模型

- Access JWT 仅存各标签页内存；到期判断依据 JWT `exp`（提前 30 秒视为到期），
  不硬编码 TTL。
- 账号状态隔离使用用户 UUID（JWT `sub`）与本次登录会话标识
  （`crypto.randomUUID()`，登录或恢复时生成）；续期沿用，重新登录或换账号
  重新隔离；令牌不进入任何缓存标识。
- 浏览器会话代次（`bluebell:auth:epoch`）：登录/退出时递增并持久化；
  休眠标签页在受保护操作前核对代次，不一致则丢弃本地状态并重新恢复。
- 最终失效：清身份、持久用户名与账号相关查询缓存，保留草稿与公共阅读；
  主动退出：额外清理该账号在本标签页的草稿，其他设备会话不受影响。

## 后果

- 前端可在不修改后端的前提下满足已确认的浏览器共享会话、恢复、续期与
  退出行为；残留边界（孤儿令牌、CSRF 无 token、用户名单独被清）已记录。
- 后端投票查询接口已移至公开路由（`686e802`）但 OpenAPI 未同步，该契约
  差异随投票模块（#7）处理；本模块不受影响。
