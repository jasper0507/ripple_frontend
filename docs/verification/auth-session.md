# 账号认证与会话模块验证记录（Issue #3）

契约：前端快照 SHA256 `6539ce9a…`（后端 `07b149c`）；验证时后端 HEAD `11f1e47a`，认证契约无变化。

## 已完成的静态与模块公开入口验证（2026-10-04）

- `pnpm typecheck`、`pnpm lint`（0 error）、`pnpm build`、`pnpm contract:check` 全部通过。
- `pnpm test`：95 项通过。覆盖：
  - `src/api/request.test.ts`（#2 既有）：业务信封、204、错误分类、重试边界。
  - `src/api/auth.test.ts`：登录/刷新蛇形契约字段映射、凭据错误业务码、注册 201、退出 204。
  - `src/lib/auth-token.test.ts`：JWT sub/exp 解析、协议错误、到期余量。
  - `src/lib/validation.test.ts`：注册/登录校验分离、安全返回目标（拒绝 `//`、绝对 URL、控制字符）。
  - `src/app/session/coordinator.test.ts`（29 项）：冷启动恢复（成功/401/网络故障重试一次/连续故障临时化/500）、登录（建会话/代次广播/凭据错误不触发续期/换账号）、退出（204 清理与广播/500 不宣称完成/等待在途刷新）、续期（并发合并/临时故障/401 最终失效）、受保护操作（写首发、写不重放、读重发一次）、跨标签页（logout/login/expired 消息、旧代次忽略、迟到刷新丢弃、休眠代次核对、恢复在途遇登录不卡 unknown）。

## 真实浏览器验证（2026-10-04 执行）

环境：WSL2，Docker Compose 启动 MySQL 8.4 + Redis 7.4，后端 `go run ./cmd/server`
（`configs/config.yaml` 默认：access 15m、refresh 168h、cookie_secure=false），
Vite dev 代理 `:5173 → :8080`；浏览器为 playwright-cli 驱动的 Chromium，
两个独立持久 Profile（verify-main / device2）模拟两台设备。
验证账号 verifyb1（经注册接口创建）。

| 项目 | 结果 |
| --- | --- |
| 注册前端校验（空提交、两次密码不一致） | 通过：分别提示用户名规则与"两次输入的密码不一致"，未发请求 |
| 注册成功跳登录并带入用户名 | 通过：跳转 `/login`，用户名已填入 |
| 凭据错误留表单 | 通过：`401 / INVALID_CREDENTIALS` 显示"用户名或密码错误"，不跳转 |
| 登录设置 Cookie | 通过：`refresh_token`，HttpOnly、SameSite=Lax、Path=/、持久（过期时间约 7 天） |
| 登录后账号入口显示用户名 | 通过：顶栏与侧栏显示 verifyb1；localStorage 写入 username 与 epoch |
| 刷新页面恢复 | 通过：`POST /api/v1/refresh` 200，恢复为 verifyb1 |
| 轮换作废旧令牌、TTL 不延长 | 通过：旧 Redis key 删除（PTTL=-2）；新 key PTTL 604737643ms < 旧 604770327ms（差值为经过时间，未延长） |
| 新标签页恢复 | 通过：第二个标签页各自轮换成功并显示用户名 |
| 多标签页并发刷新串行 | 通过：两标签页近同时重载后均保持登录，该账号 Redis 中始终只有 1 个刷新令牌，与浏览器 Cookie 一致 |
| 重开浏览器恢复 | 通过：关闭并重开浏览器（持久 Profile），持久 Cookie 仍在，恢复为 verifyb1 |
| 退出：Cookie 清除、双标签页同步、清理本账号草稿 | 通过：204 后 Cookie 与 localStorage 用户名清除；另一标签页经广播同步为游客；植入的 `bluebell:draft:{本人UUID}:*` 被清除、其他账号草稿键保留；停留在首页保留公共阅读 |
| 退出删除服务端令牌 | 通过：Redis 中本浏览器令牌 key 删除（3→2 个 key） |
| 退出 500 不宣称完成 | 通过：提示"退出未完成，请重试"，保持登录，Cookie 未变 |
| 独立浏览器配置不受退出影响 | 通过：device2 在本浏览器退出后仍登录，重载后经自有刷新令牌恢复 |
| 刷新 500 按临时故障 | 通过：进入游客阅读并提示"暂时无法确认登录状态"+重试入口，localStorage 用户名保留；解除故障后点重试恢复为 verifyb1 |
| 服务端令牌被删（真 401）按最终失效 | 通过：进入游客阅读、无临时故障提示、localStorage 用户名清除，与临时故障明确区分 |

## 未在浏览器复现、由模块测试覆盖的排列

- 真实休眠（冻结/丢弃）标签页：playwright-cli 无法可靠模拟冻结标签页；代次核对
  路径由 coordinator 测试"休眠标签页恢复操作前核对代次并重新恢复"覆盖。
- 退出与刷新竞态的迟到响应：浏览器难以稳定复现；由"刷新期间代次变化：迟到刷新
  结果被丢弃""退出等待在途刷新结束后再发送"两项测试覆盖。
- 跨站 POST 构造 CSRF：SameSite=Lax 由浏览器强制（POST 不携带 Cookie），未构造
  跨站页面；边界已记录于 ADR 0001。
- 受保护请求携带 Bearer 头：当前 UI 尚无受保护接口调用（发帖/投票/评论属后续
  模块），接缝 `runProtected` 已由模块测试覆盖。

## 验证中发现并已修复的问题

1. **`access_token` 字段映射缺失**（浏览器登录时发现）：登录/刷新响应为蛇形
   `access_token`，传输层未映射导致登录成功却提示失败。已修复（`src/api/auth.ts`）
   并补 `src/api/auth.test.ts` 传输映射测试。
2. **恢复在途遇跨标签页登录卡在 unknown**（code-review 发现）：见提交 `349887c`。
3. 已知残留边界（用户已接受，见 ADR 0001）：孤儿刷新令牌自然过期；CSRF 无
   token 依赖 SameSite=Lax+同源；用户单独清 localStorage 时恢复后显示"已登录"
   占位（验证中实际观察到一次，符合预期）；不支持 Web Locks 的环境降级为标签页内
   串行（Chromium 实测支持 Web Locks）。
