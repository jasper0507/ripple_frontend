> 历史研究材料，已被用户的新范围和后端新提交取代。不可作为当前实施规范；请读 [当前基线](CURRENT-BASELINE.md)、[PRD](../PRD.md) 和 [DESIGN](../DESIGN.md)。

# Bluebell 后端事实清单

核验日期：2026-10-04。核验人：独立后端核验 subagent。目的：为前端 PRD、DESIGN 和实施计划提供可追溯的产品边界；本文不修改后端，不把竞品能力或 OpenAPI 描述当成实际已实现能力。

## 1. 事实源与快照

唯一业务事实源是本机 `/home/jasper0507/dev/work/bluebell_backend` **当前工作树代码**，不是 Git HEAD 单独一个版本。HEAD 为 `11f1e47a0a0a37fcfc68f6ca091284ee820601fe`，提交标题 `refactor: 优化帖子详情响应结构与查询逻辑`。核验开始时已有 `M internal/service/post.go`；这是原有改动，本次未修改、还原或格式化它。该改动在列表查询 MySQL 后增加 `len(posts)==0` 的提前返回，见 [service/post.go:197](../../../bluebell_backend/internal/service/post.go#L197)。

OpenAPI 是辅助输入，必须与代码比对。当前 [docs/openapi.yaml](../../../bluebell_backend/docs/openapi.yaml) 的 SHA-256 为 `6ba89027725b5eef9aae3156e7817cfa7f12a039c54b9788e5f46ae3c7399326`；当前已修改的 `internal/service/post.go` SHA-256 为 `34c9ae69ff537de303749cc31950daf6a0d51349297a027b30810c174e39d2a0`。完整核验文件清单及摘要见末尾。

本文源码链接相对于本文件，`#L数字` 和标签中的 `:数字` 均指本次核验行号；代码变化后须重新核验。以下“前端决定”是为了适配事实所作的设计建议，不能倒推为后端承诺。

## 2. 完整端点矩阵：17 个

路由总表：[router/router.go:31](../../../bluebell_backend/internal/router/router.go#L31)。除 `/ping`、`/health` 外，下表路径省略统一前缀 `/api/v1`。`data` 列只写成功响应中的 `data`；`204` 没有响应体。所有业务接口都可能返回 `500 INTERNAL_ERROR`，下表“失败”列不重复列出 500。公开接口不会解析 Authorization；Bearer 鉴权只安装在标为 Bearer 的 5 个写接口上。

| # | HTTP / 路径 | 真实鉴权 | 请求 | 成功 / data | 其他失败 | 精确证据 |
|---|---|---|---|---|---|---|
| 1 | POST `/signup` | 无 | JSON `username,password,confirm_password` | 201 `{username}` | 400 INVALID_PARAMS；409 USERNAME_EXISTS | [handler/user.go:24](../../../bluebell_backend/internal/handler/user.go#L24) |
| 2 | POST `/login` | 无 | JSON `username,password` | 200 `{username,access_token,token_type:"Bearer"}`；设置 Cookie | 400 INVALID_PARAMS；401 INVALID_CREDENTIALS | [handler/auth.go:35](../../../bluebell_backend/internal/handler/auth.go#L35) |
| 3 | POST `/refresh` | `refresh_token` Cookie | 无请求体；不需 Bearer | 200 `{access_token,token_type:"Bearer"}`；轮换 Cookie | 401 UNAUTHORIZED | [handler/auth.go:107](../../../bluebell_backend/internal/handler/auth.go#L107) |
| 4 | POST `/logout` | 可选 `refresh_token` Cookie | 无请求体；不需 Bearer | 204；带 Cookie 时尝试注销并清 Cookie | 无 Cookie 也 204；存储错误 500 | [handler/auth.go:147](../../../bluebell_backend/internal/handler/auth.go#L147) |
| 5 | GET `/communities` | 无 | 无分页参数 | 200 `[{id,name}]`，按 ID 升序 | 无特定业务错误 | [handler/community.go:25](../../../bluebell_backend/internal/handler/community.go#L25)、[repository/community.go:26](../../../bluebell_backend/internal/repository/community.go#L26) |
| 6 | GET `/communities/{communityID}` | 无 | 正整数路径 ID | 200 `{id,name,introduction,created_at}` | 400 INVALID_PARAMS；404 COMMUNITY_NOT_FOUND | [handler/community.go:64](../../../bluebell_backend/internal/handler/community.go#L64) |
| 7 | POST `/posts` | Bearer | JSON `title,content,community_id` | 201 `{id}` | 400 INVALID_PARAMS；401 UNAUTHORIZED；404 COMMUNITY_NOT_FOUND | [handler/post.go:25](../../../bluebell_backend/internal/handler/post.go#L25)、[handler/post.go:76](../../../bluebell_backend/internal/handler/post.go#L76) |
| 8 | GET `/posts` | 无 | query `page=1,order=time,community_id?` | 200 `{page,page_size:10,total,items:PostSummary[]}` | 400 INVALID_PARAMS | [handler/post.go:32](../../../bluebell_backend/internal/handler/post.go#L32)、[handler/post.go:206](../../../bluebell_backend/internal/handler/post.go#L206) |
| 9 | GET `/posts/{postID}` | 无 | 正整数路径 ID | 200 `{...PostSummary,content}`，平铺字段 | 400 INVALID_PARAMS；404 POST_NOT_FOUND | [handler/post.go:66](../../../bluebell_backend/internal/handler/post.go#L66)、[handler/post.go:165](../../../bluebell_backend/internal/handler/post.go#L165) |
| 10 | DELETE `/posts/{postID}` | Bearer；只能本人 | 正整数路径 ID | 204 | 400 INVALID_PARAMS；401 UNAUTHORIZED；403 FORBIDDEN；404 POST_NOT_FOUND | [handler/post.go:119](../../../bluebell_backend/internal/handler/post.go#L119)、[service/post.go:105](../../../bluebell_backend/internal/service/post.go#L105) |
| 11 | GET `/posts/{postID}/vote` | **实际无鉴权，存在缺陷** | 正整数路径 ID | 200 `{direction}`，实际查询空用户 ID，不能代表本人 | 400 INVALID_PARAMS；404 POST_NOT_FOUND；没有 JWT 产生的 401 | [router/router.go:56](../../../bluebell_backend/internal/router/router.go#L56)、[handler/post.go:267](../../../bluebell_backend/internal/handler/post.go#L267) |
| 12 | PUT `/posts/{postID}/vote` | Bearer | JSON `direction:-1\|0\|1` | 200 `{post_id,direction}`，不带最新票数 | 400 INVALID_PARAMS；401 UNAUTHORIZED；404 POST_NOT_FOUND；409 VOTE_CLOSED | [handler/post.go:308](../../../bluebell_backend/internal/handler/post.go#L308) |
| 13 | POST `/posts/{postID}/comments` | Bearer | JSON `content,reply_to_comment_id?` | 201 `{id}` | 400 INVALID_PARAMS（含无效回复目标）；401 UNAUTHORIZED；404 POST_NOT_FOUND | [handler/comment.go:25](../../../bluebell_backend/internal/handler/comment.go#L25)、[handler/comment.go:58](../../../bluebell_backend/internal/handler/comment.go#L58) |
| 14 | GET `/posts/{postID}/comments` | 无 | query `page=1` | 200 `{page,page_size:10,total,items:Comment[]}` | 400 INVALID_PARAMS；404 POST_NOT_FOUND | [handler/comment.go:31](../../../bluebell_backend/internal/handler/comment.go#L31)、[handler/comment.go:113](../../../bluebell_backend/internal/handler/comment.go#L113) |
| 15 | DELETE `/comments/{commentID}` | Bearer；只能本人 | 正整数路径 ID | 204 | 400 INVALID_PARAMS；401 UNAUTHORIZED；403 FORBIDDEN；404 COMMENT_NOT_FOUND | [handler/comment.go:177](../../../bluebell_backend/internal/handler/comment.go#L177)、[service/comment.go:92](../../../bluebell_backend/internal/service/comment.go#L92) |
| 16 | GET `/ping` | 无 | 无 | 200 `{"message":"pong"}`，不包 envelope | 无业务存储探测 | [handler/health.go:9](../../../bluebell_backend/internal/handler/health.go#L9) |
| 17 | GET `/health` | 无 | 无 | 200 `{"status":"ok"}`，不包 envelope | 无业务存储探测 | [handler/health.go:15](../../../bluebell_backend/internal/handler/health.go#L15) |

`PostSummary` 的完整字段为 `id,title,author_id,author_name,community_id,community_name,up_votes,down_votes,created_at`。无正文摘要、评论数、浏览数、编辑时间、头像、当前用户投票字段。证据：[handler/post.go:45](../../../bluebell_backend/internal/handler/post.go#L45)。

`Comment` 的完整字段为 `id,content,author_id,author_name,reply_to_comment_id,created_at`；回复 ID 为正整数或 `null`，无目标作者名、目标正文、楼层号、子评论数组。证据：[handler/comment.go:36](../../../bluebell_backend/internal/handler/comment.go#L36)。

## 3. 通用响应、输入边界与分页

### F01 — 响应协议

业务 JSON 成功为 `{code:"OK",message:"成功",data:...}`；失败为 `{code,message,data:null}`。客户端必须同时处理 HTTP 状态与业务 `code`，不能假设 HTTP 200 才有有效业务信息，也不能把网络/代理返回的 HTML 当成符合协议的错误。204 分支不得强行 `response.json()`。证据：[response/response.go:5](../../../bluebell_backend/internal/response/response.go#L5)、[response/code.go:52](../../../bluebell_backend/internal/response/code.go#L52)。

| HTTP | code | 前端解释 |
|---|---|---|
| 400 | INVALID_PARAMS | 请求字段或回复目标无效；响应不提供逐字段错误结构 |
| 401 | INVALID_CREDENTIALS | 登录用户名或密码错误；不能触发刷新死循环 |
| 401 | UNAUTHORIZED | 受保护请求无有效访问令牌，或刷新 Cookie 无效 |
| 403 | FORBIDDEN | 非作者无删除权限 |
| 404 | COMMUNITY_NOT_FOUND / POST_NOT_FOUND / COMMENT_NOT_FOUND | 对应资源不可用；代码不区分从未存在与已软删 |
| 409 | USERNAME_EXISTS | 注册用户名冲突 |
| 409 | VOTE_CLOSED | 投票窗口结束 |
| 500 | INTERNAL_ERROR | 后端错误；写请求结果可能需要人工确认，不能自动重发 POST |

### F02 — 字段校验

| 字段 / 情况 | 后端事实 | 前端设计影响 |
|---|---|---|
| 注册 username | `required,min=3,max=64,alphanum` | 明示 3–64 个英文字母或数字；不增加中文、下划线、邮箱注册 |
| 注册 password | `required,min=8,max=64,alphanum` | 明示 8–64 个英文字母或数字；不能推荐或强制后端不接受的特殊符号 |
| confirm_password | 必填，与 password 相等 | 仅用于注册表单；不得上传额外密码策略字段 |
| 登录 username/password | 仅 `required,max=64` | 登录不能复用注册最小长度/字符集限制；不 trim 密码 |
| 帖子 title | 必填，最多 128 | 计数应遵循 Unicode 字符而非 UTF-16 代码单元，避免表情计数差异 |
| 帖子/评论 content | 仅 `required`，handler 无字符长度上限；数据库列为 `TEXT` | 不向用户声称“无限长度”；不凭空标记 500/5000 字为后端限制；若设前端防滥用上限须明确是产品选择 |
| community_id | 创建必填非 0；服务查询社区存在性 | 社区列表为空时不能发帖；不得前端虚构默认社区 |
| direction | 必填，`-1,0,1`，0 合法；省略/null 不合法 | `0` 不得被 truthy 判断过滤；使用显式整数枚举 |
| reply_to_comment_id | 可省略/null；存在时至少 1 | 直接评论省略或传 null；取消回复时清除该字段 |
| 路径 ID | 十进制正整数，Go `uint` 范围内，0 无效 | URL 参数先校验；不得接受负数、小数、NaN |
| author_id | 字符串 UUID；注册时 UUID v7 | 不转换为数值；本人判断使用 JWT sub 与 author_id |

证据：[handler/user.go:24](../../../bluebell_backend/internal/handler/user.go#L24)、[handler/auth.go:36](../../../bluebell_backend/internal/handler/auth.go#L36)、[handler/post.go:25](../../../bluebell_backend/internal/handler/post.go#L25)、[handler/comment.go:25](../../../bluebell_backend/internal/handler/comment.go#L25)、[handler/helper.go:9](../../../bluebell_backend/internal/handler/helper.go#L9)、[model/post.go:5](../../../bluebell_backend/internal/model/post.go#L5)、[model/comment.go:5](../../../bluebell_backend/internal/model/comment.go#L5)、[service/user.go:37](../../../bluebell_backend/internal/service/user.go#L37)。

字符串长度与字符集的补充证据来自该后端锁定依赖：`go.mod:6,27` 为 Gin v1.12.0 / validator v10.30.1；本地 `github.com/gin-gonic/gin@v1.12.0/binding/default_validator.go:92` 使用 validator 的 binding tag；`github.com/go-playground/validator/v10@v10.30.1/baked_in.go:2508` 的 max 调用 `isLte`，`:2421` 使用 `utf8.RuneCountInString`；其 `regexes.go:11` 的 alphanum 正则为 `^[a-zA-Z0-9]+$`。这是核验本项目实际依赖代码的结果，不以第三方文章替代实现。正文容量只确认模型 `TEXT` 与 `internal/database/mysql.go:40` 的 utf8mb4 连接设置；没有连接真实数据库验证现有表结构，不能把模型声明误报为实测数据库容量。

代码没有去除 title/content 的首尾空白。前端可拒绝纯空白文本作为输入体验规则，但应保留正文换行，不将前端规则写成后端保证。帖子、社区、评论 ID 在 JSON 中为数值；Go `uint` 的理论上限可能超过 JavaScript 安全整数。V1 以安全正整数校验接口结果，超界作为协议错误，不默默四舍五入、也不改变后端类型契约。时间由 `time.Time` JSON 输出为带时区字符串；前端按真实时区解析，显示时提供完整时间。

### F03 — 排序和分页

帖子与评论每页都固定 10 条；只有 page，无 cursor、page_size 自定义、分页快照令牌。page 从 1 开始，越界可以是 `items:[]` 且 total 仍大于 0。帖子 order 只有 `time` / `hot`；热门由服务端 Redis 排名计算，结合净票数与发布时间，不能前端按赞成票重新排序。社区筛选是可选 `community_id`，帖子列表本身不校验社区存在；不存在的社区筛选可能返回空列表，社区详情接口才会返回 COMMUNITY_NOT_FOUND。证据：[handler/post.go:32](../../../bluebell_backend/internal/handler/post.go#L32)、[handler/post.go:72](../../../bluebell_backend/internal/handler/post.go#L72)、[service/post.go:167](../../../bluebell_backend/internal/service/post.go#L167)、[store/post.go:387](../../../bluebell_backend/internal/store/post.go#L387)、[store/post.go:542](../../../bluebell_backend/internal/store/post.go#L542)。

帖子 total 来自 Redis 排名总数，items 根据 ID 从 MySQL 查询，因此不能以当前页 items 数反推 total。现有工作树的 `len(posts)==0` 提前返回还可能掩盖同时存在的 MySQL 查询错误；这是后端既有行为，前端不能修正数据源。设计应能表达“当前页暂无内容”，提供返回第一页，而不是把 `total>0,items=[]` 强制当成 404。证据：[service/post.go:179](../../../bluebell_backend/internal/service/post.go#L179)。

## 4. 认证与会话

### F04 — JWT、用户名与当前用户

只有 5 个写路由挂载 JWTAuth：发帖、删帖、设置投票、发评论、删评论。中间件只从 Bearer token 解析 userID 写入上下文。JWT 包含标准 `iss,sub,iat,exp`，`sub` 是用户 ID；**没有 username**。登录 JSON 返回 username（回显请求中的 username），刷新 JSON 不返回 username；没有 `/me`、用户详情或资料更新端点。证据：[router/router.go:58](../../../bluebell_backend/internal/router/router.go#L58)、[middleware/auth.go:16](../../../bluebell_backend/internal/middleware/auth.go#L16)、[service/token.go:82](../../../bluebell_backend/internal/service/token.go#L82)、[handler/auth.go:97](../../../bluebell_backend/internal/handler/auth.go#L97)、[handler/auth.go:139](../../../bluebell_backend/internal/handler/auth.go#L139)。

前端决定：access token 放内存；解码 sub 只用于界面显示删除入口与缓存隔离，不能声称客户端已校验签名或拥有最终授权。刷新恢复后无已知用户名时显示“已登录”，不得将 UUID 冒充用户名。若保留 `{sub,username}` 的非敏感显示缓存，必须与当前 sub 匹配，退出清理；该缓存不是用户资料接口。401/403 始终以后端为准。

### F05 — Refresh 轮换和退出

refresh token 由 HttpOnly、Path=/、SameSite=Lax Cookie 承载；Secure 由后端配置决定，未设置 Domain。登录和刷新都写 Cookie。refresh 原子删除旧 token 并用旧 token 的剩余 TTL 创建新 token，**不会滑动延长会话**；并发使用同一旧 token 只有一个能成功。默认 Access TTL 15 分钟、Refresh TTL 7 天只是可配置默认值，不能当成硬编码界面承诺。证据：[handler/auth.go:173](../../../bluebell_backend/internal/handler/auth.go#L173)、[service/auth.go:75](../../../bluebell_backend/internal/service/auth.go#L75)、[store/refresh_token.go:36](../../../bluebell_backend/internal/store/refresh_token.go#L36)、[config/config.go:80](../../../bluebell_backend/internal/config/config.go#L80)。

前端决定：启动恢复和保护请求的刷新共用 single-flight；失败请求最多刷新并重试一次，login/refresh 自身不进入该重试分支。双标签页共享 Cookie 的轮换竞争需要显式纳入 DESIGN 与验收，不能只靠单页 Promise 宣称跨标签可靠。公开阅读不因无 Cookie 的 refresh 401 被强制跳到登录页；仅在用户访问受保护操作时引导登录，保留编辑草稿。

logout 删除 refresh token，清 Cookie 并 204；无 Cookie 也 204。已发出的无状态 access JWT 不会被服务端注销；前端必须丢弃内存 token。若 logout 返回 500，handler 在清 Cookie 之前就返回，因此前端本地清 token 不等于服务器会话已注销；界面不可显示“全部退出成功”，须保留重试退出方式并阻止当前页后台立刻 refresh 恢复。证据：[handler/auth.go:147](../../../bluebell_backend/internal/handler/auth.go#L147)、[service/auth.go:67](../../../bluebell_backend/internal/service/auth.go#L67)、[middleware/auth.go:30](../../../bluebell_backend/internal/middleware/auth.go#L30)。

## 5. 投票：明确可交付边界

### F06 — 当前投票方向无法可靠读取

`GET /posts/:postID/vote` 定义在公开路由上，未安装 JWTAuth；handler 仍读取 `ContextUserIDKey`，其值为空字符串；service 只确认帖子存在后，store 查询该空字符串对应的 Redis Hash field。正常通过受保护 PUT 写入的记录使用非空 JWT sub，因此该 GET 通常得到 `direction:0`，即使带正确 Authorization 也不能恢复本人状态。它返回的 0 **不能当成“你没有投过票”**。证据链：[router/router.go:52](../../../bluebell_backend/internal/router/router.go#L52) → [handler/post.go:275](../../../bluebell_backend/internal/handler/post.go#L275) → [service/post.go:290](../../../bluebell_backend/internal/service/post.go#L290) → [store/post.go:517](../../../bluebell_backend/internal/store/post.go#L517)。

不改后端的可交付方案：页面重新进入或刷新时，个人投票状态为 `unknown`，显示中性、不选中状态，并提供“赞成”“反对”“取消投票”三个明确动作。不能根据 unknown 的外观暗示“未投票”，不能用“再次点击同按钮取消”作为唯一取消路径。PUT 1/-1/0 是设置目标状态，成功后允许在当前会话内标记刚确认的方向，随后重新读取帖子票数。跨页缓存只能表述为本次会话的已确认操作，不代表跨端历史真值；不得用 localStorage 投票记录伪造后端恢复能力。该降级与未知状态说明需纳入 PRD、DESIGN 和验收。

### F07 — 七天窗口和历史数据

投票截止时间为 `post.CreatedAt + 7*24h`，精度到秒，由 Redis TIME 判定 `now>=expiresAt`。脚本先检查截止再检查相同方向，所以关闭后赞成、反对、取消、重复提交全部 409 VOTE_CLOSED。个人投票明细 Hash 只保存到截止时间；统计 Hash 与排行榜没有同样 TTL。即便未来恢复鉴权，七天后也不能保证读取历史投票方向。证据：[service/post.go:56](../../../bluebell_backend/internal/service/post.go#L56)、[service/post.go:309](../../../bluebell_backend/internal/service/post.go#L309)、[store/post.go:110](../../../bluebell_backend/internal/store/post.go#L110)、[store/post.go:196](../../../bluebell_backend/internal/store/post.go#L196)。

前端决定：按 created_at 计算预估截止、显示“投票已结束”与最终票数，全部投票写动作禁用；后端 409 是最终依据。客户端时钟偏差是 UI 预估局限，不尝试提交 direction=0 来探测历史状态。PUT 成功只回显 post_id/direction，没有票数，所以未知旧方向时不能盲目 `up_votes+1`；成功后重取详情。窗口内同方向重复 PUT 不重复计票，切换方向调整两边统计。证据：[handler/post.go:357](../../../bluebell_backend/internal/handler/post.go#L357)、[store/post.go:124](../../../bluebell_backend/internal/store/post.go#L124)。

## 6. 评论、回复与删除

### F08 — 平铺评论，不存在完整回复树 API

评论和回复在同一列表平铺，固定 10 条，`created_at ASC,id ASC`。回复目标必须是同帖未删除评论；目标已删除、不存在或属于其他帖均 400 INVALID_PARAMS。接口只返回 reply_to_comment_id，不返回目标正文或作者，也没有 GET `/comments/{id}`。证据：[repository/comment.go:78](../../../bluebell_backend/internal/repository/comment.go#L78)、[service/comment.go:59](../../../bluebell_backend/internal/service/comment.go#L59)、[handler/comment.go:36](../../../bluebell_backend/internal/handler/comment.go#L36)、[router/router.go:71](../../../bluebell_backend/internal/router/router.go#L71)。

前端决定：默认按服务端次序平铺，目标在已载入数据中才显示可核实的作者/引用；不在当前页时显示“回复评论 #ID（原评论未在当前页）”或更中性的“回复评论 #ID”。不得仅因缺少目标就标为“已删除”，不得伪造树的完整性或自动抓取全部评论。可点击当前页目标并聚焦；未知目标不做假链接。新增评论返回 ID，无完整 Comment 对象，应重新查询列表。评论总数来自独立评论列表接口，可用于详情页；列表页不做逐帖请求来虚构评论数。

### F09 — 只允许作者删除，删除不可撤回

帖子与评论使用 Gorm soft delete；查询默认不返回已删除记录。帖子只能由帖子作者删除；评论只能由评论作者删除，帖子作者没有额外删他人评论权限。评论删除不级联删除回复，删除评论时也不检查所属帖子是否存在。帖子删除先更新 MySQL 再清 Redis；不提供恢复接口。证据：[model/post.go:5](../../../bluebell_backend/internal/model/post.go#L5)、[model/comment.go:5](../../../bluebell_backend/internal/model/comment.go#L5)、[repository/post.go:33](../../../bluebell_backend/internal/repository/post.go#L33)、[repository/comment.go:33](../../../bluebell_backend/internal/repository/comment.go#L33)、[service/post.go:104](../../../bluebell_backend/internal/service/post.go#L104)、[service/comment.go:91](../../../bluebell_backend/internal/service/comment.go#L91)。

前端决定：删除前确认、成功后移除并刷新相关列表与计数；不提供“撤销删除”。二次删除返回对应 404，可说明“内容已不可用”后同步 UI；不能把任何 404 都解释为刚刚删除成功。删除最后一页唯一一项时回退到有效页。删除某条评论后保留其回复，并清除当前正在回复该条评论的目标或提示重新选择。

## 7. 存储一致性与联调约束

### F10 — 写操作失败可能不是全量回滚

创建帖子先 MySQL Create，再 Redis InitPost，后者失败会返回 500，但前者没有补偿删除；删除帖子先 MySQL soft delete，再 Redis 清数据。POST 没有 idempotency key 或查重接口。列表又依赖 Redis 排名，因此“接口 500 后列表看不到帖子”也不能证明没写入。证据：[service/post.go:70](../../../bluebell_backend/internal/service/post.go#L70)、[service/post.go:104](../../../bluebell_backend/internal/service/post.go#L104)。

前端决定：网络错误/500 不自动重放发帖或评论 POST；保留输入、说明提交结果未确认，用户检查后再手动决定重试。受保护请求收到明确 JWT 401 时，handler 尚未执行，才允许刷新后重试一次；认证端点自身不自动重试。删除/投票也不因笼统 fetch 异常循环重发。

### F11 — 同源代理与可验证范围

路由只全局安装 RequestLogger 和 Recovery，没有 CORS 中间件；前端需 Vite 同源 `/api` 代理，部署需同源网关保留 `/api/v1` 路径和 Set-Cookie。不能靠给 fetch 加 Authorization/credentials 或导入 OpenAPI 自动解决 CORS。Cookie Path=/、无 Domain 的现状适合同源代理；不能在前端 JavaScript 读取 HttpOnly refresh token。证据：[router/router.go:21](../../../bluebell_backend/internal/router/router.go#L21)、[handler/auth.go:179](../../../bluebell_backend/internal/handler/auth.go#L179)。

默认监听 `:8080`；后端启动需要 MySQL 和 Redis 可用。配置来源可用 `BLUEBELL_CONFIG_FILE` 指定，环境变量 `BLUEBELL_*` 覆盖；本次未读取实际密钥，不输出凭证。前端环境变量只允许公开地址类配置，不复制 JWT 密钥、数据库/Redis 凭证。证据：[config/config.go:59](../../../bluebell_backend/internal/config/config.go#L59)、[config/config.go:88](../../../bluebell_backend/internal/config/config.go#L88)、[cmd/server/main.go:42](../../../bluebell_backend/cmd/server/main.go#L42)、[cmd/server/main.go:65](../../../bluebell_backend/cmd/server/main.go#L65)。

本次对 `http://127.0.0.1:8080/health` 的只读访问返回连接失败（curl exit 7，HTTP 000）；这只能说明当前地址无可连通服务，不能声称系统业务联调通过。`/health` 本身仅固定返回 ok，也不能证明运行中的 MySQL/Redis 健康。实际服务未运行时，可交付接口模拟与静态验收结果，但必须明确标为模拟，真实登录、Cookie 轮换、数据读写验收留为发布前门槛。

## 8. OpenAPI 与代码的差异台账

| 编号 | 文档描述 | 当前代码事实 | 前端处理 |
|---|---|---|---|
| D01（功能性差异） | [openapi.yaml:11](../../../bluebell_backend/docs/openapi.yaml#L11)、[openapi.yaml:569](../../../bluebell_backend/docs/openapi.yaml#L569) 将 GET vote 视为 Bearer 保护、返回当前用户状态，列出 401 | 公开路由，不解析 JWT，取空 userID；见 F06 | 不使用该 GET 恢复本人投票；前端契约快照需记录 discrepancy，禁止偷偷改后端 |
| D02（产品语义缺口） | [openapi.yaml:578](../../../bluebell_backend/docs/openapi.yaml#L578) 称投票结束后仍可查询 | 路由可调用，但个人明细到期被删；见 F07 | “可以调用”不等于“历史方向仍存在”；不做历史已投标记 |
| D03（认证描述不完整） | [openapi.yaml:131](../../../bluebell_backend/docs/openapi.yaml#L131) 文字只提 access_token/token_type；后续 schema 已有 username；[openapi.yaml:223](../../../bluebell_backend/docs/openapi.yaml#L223) 称刷新只含新的 access_token | 登录有 username；刷新还有 token_type | 按实际字段/已有 schema 生成类型，注释不能压过 handler |
| D04（前端建议不是服务端事实） | [openapi.yaml:218](../../../bluebell_backend/docs/openapi.yaml#L218) 建议 refresh 401 后跳转登录 | 服务只返回 401，没有强制页面导航能力；公开读接口无需登录 | 保留公开阅读，用户要执行写操作时引导登录 |

其余已核验的端点、核心字段、分页 10 条、主要状态码与 OpenAPI 一致。该结论仅覆盖本次快照，不能代替上线前真实运行验收。前端应保留后端 OpenAPI 的只读快照，再用**有来源说明的前端副本修订**解决 D01/D02；生成类型的源文件、修订记录、命令都应在 DESIGN 中明确。无需且不得修改后端文档。

## 9. 可交付与明确不做

| 分类 | 范围 |
|---|---|
| 可直接实现 | 注册、登录、退出、Cookie 会话恢复；社区列表与详情；帖子最新/热门/社区筛选/分页；帖子详情；创建帖子；赞成/反对/显式取消；创建评论/回复；删除本人帖子和评论 |
| 需要公开说明的降级 | 个人投票方向初始 unknown；七天后仅保留票数展示；回复目标跨页或缺失时显示 ID；刷新恢复无用户名时显示“已登录”；网络错误后的写入结果不能自动确认 |
| 纯前端可选能力，须标产品选择 | URL 保存筛选/分页；本标签页草稿保护；阅读排版；状态表达；可访问性与响应式布局 |
| 后端不支持，V1 不呈现假入口 | 搜索、标签、关注/订阅、收藏、通知、私信、头像上传、图片/附件上传、个人主页/资料编辑、密码重置、改密、OAuth、邮箱验证、帖子编辑、评论编辑、置顶、加精、审核、举报、管理员后台、社区创建/编辑、浏览计数、在线人数、用户等级、完整嵌套回复树、评论单条查询、服务端草稿、撤销删除 |

“不支持”的依据是完整 [router/router.go:31](../../../bluebell_backend/internal/router/router.go#L31) 路由集及上述响应字段，而不是竞品是否有该功能。评论总数只可由对应帖子评论分页响应 total 获得；社区列表只有 id/name，不能显示虚构的成员数、帖子数、社区简介或热门等级。右侧区域若要显示简介，应显式请求社区详情，不能把设计示例当真实数据。

## 10. 验证记录与快照摘要

只读检查完成：路由、handler、service、repository、model、Redis Lua、JWT、配置加载、OpenAPI、Git 工作树差异；未启动服务，未迁移数据库，未写入业务数据，未修改任何后端文件。

构建工具实测为 `go version go1.27.0 linux/amd64`，与 `go.mod` 的 `go 1.27.0` 一致。编译命令为 `GOCACHE=/tmp/bluebell-backend-facts-go-cache GOTELEMETRY=off GOPROXY=off GOTOOLCHAIN=local go build -mod=readonly -o /tmp/bluebell-backend-facts-server ./cmd/server`；本轮实际执行 **exit 0，构建通过**，结果核查时间为 `2026-10-04 05:26:25 UTC`（北京时间 13:26:25），未沿用上一轮记录。构建产物与构建缓存只写入 `/tmp`，不运行真实业务写入测试。Go 1.27 编译器实际接受当前详情响应字面量，不能依据旧版本语言经验将其误报为阻塞编译错误。

以下清单按文件相对路径排序，单行为 `SHA256␠␠路径\n`；整个 UTF-8 清单 SHA-256 为 `661b6eacdb93c6c01cddf5924f08427268d2b80475a5e3d2a176423850323c26`，共 35 个文件。该摘要用于识别本次规划所基于的当前工作树，不代表执行签名或发布版本。

```text
c24fc49fc14476ae922a641cbcd5d93e18cb8ea2eeedd2319c114fbb7c082f24  cmd/server/main.go
031335817474bac34ee7b6a1b05db26a1b13a650c9da362c726c932ffd3e2e41  configs/config.example.yaml
6ba89027725b5eef9aae3156e7817cfa7f12a039c54b9788e5f46ae3c7399326  docs/openapi.yaml
02c7b5585e2012ed1181d71e5eb5d31a655e42ab5d0296c877f2ae9dd8d16c0d  go.mod
e50170a8dd69e99f4b9c0d8427be7e7bce3eed3df028cc3a4fd4fde37d59e08b  go.sum
1866d89d818e6d4de961e0b95b63a9c3c42445d09949e9e43a73a8a6e2e99e40  internal/config/config.go
d9ac5063f9afcec58162d750ec753cc4dc2079b4700ff566604f78b4f3c7de12  internal/handler/auth.go
4f60b7b35061fb2919b9b37a90240629a5e160a246bc5fdd78546f2c24c76331  internal/handler/comment.go
de5b468ab21190d0cb21d5f435e2c32ba927c59dd250f4bd5d88d7d4b7708e97  internal/handler/community.go
2439edd2c47e1da769e57aaac704f19b5cfae452817519f21c21655653ef3f5b  internal/handler/health.go
f93756a0b933f3a23b2e556e9efb7b5ce8f3766d6d2c560104651863faea2597  internal/handler/helper.go
4a34ef26174277bfb3886b7cdcec76a2731a661fd705079256dc813cca71599a  internal/handler/post.go
f1ffa3197218899975d6e6a48650f9d3e1ec2666c1a014020c8edca7e97677ba  internal/handler/user.go
fbdc9cd7df753133d1222612ecb10cf7ad14c588f4c9fe10ef5d9a46f252f7d5  internal/middleware/auth.go
f679574626061deb15ef0e55a91c577cc073e2f6638fe0a9c690a0c2c0c6085d  internal/middleware/request_logger.go
beea30f5c89b3ce8118dd01491772a57e348d27292ef3937877488caf5262caf  internal/model/comment.go
981a061169f1a2fb1886861648ece9c894f8795e7e2155ab73c41556b175fb73  internal/model/community.go
4f8e7d2c6a953399a3bb4b47bb32c780273ea1906285929742957591094944da  internal/model/post.go
6b61a33e80f99b162804c78d961867fe87808576201ea757fd26a86deb6aff4d  internal/model/user.go
88e4ac2b27cb47f58b6143ab5591dd21ecc08074278bf7ba0a2cd62483365ecb  internal/repository/comment.go
aa256fb9fec4b4bbd6637935bc7818c642a565f5f31665a28cc55530250cc4e3  internal/repository/community.go
0a5636a16e9472df790c5e92be14551600f906a6417a1c1d0a88df7f073c3d7a  internal/repository/post.go
81fd879146e1689c85e5617530ae5736006e132abaf1ac79d182b4aa892b3cb2  internal/repository/user.go
c2331ec364c7f20e6a6109be1fe39f38c409b8f2477ad16ede6ff037b90c437c  internal/response/code.go
4ef0c6fff098b528bc985dd2076d8cdd87b40d420b7651f4277369746a9410f9  internal/response/response.go
38801c11d0258e6986bbbe51ad04d4227b8f3510e45ace37222b062c64d6747c  internal/router/router.go
24c1c6d0411b2be9429c5d1cc9002386c2e68260151c7a03e7058377d8bde4d3  internal/service/auth.go
4f3ead74fc88bc4693a5a397f04347439f2a326eecea7f3a3498f1c82622f122  internal/service/comment.go
a88dfb8a4115e24b147b868d458a35ea6785a19dac93e9e45e384e143c5255fd  internal/service/community.go
0bef0afe52da9f8b3c3ca9791d877f8a8fa9778226246b8d375f7cda6b96aed6  internal/service/password.go
34c9ae69ff537de303749cc31950daf6a0d51349297a027b30810c174e39d2a0  internal/service/post.go
b35338790401076589463c37f38ee4fbbc5e414341e52363e6595e4f645f1679  internal/service/token.go
c795df722c2e9053ac1924754fcd41702c0b2c93fb905f2954e03e8eb38baf81  internal/service/user.go
dcb4748564e25c83861c6a4fb2a6c946cb42529ed61b941d1f95f5b3429f79c2  internal/store/post.go
e334a3ce637b4644c25a62e52465b34e60e1730b571efe3c24f2f16736100114  internal/store/refresh_token.go
```
