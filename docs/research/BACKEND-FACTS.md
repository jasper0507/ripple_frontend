# Bluebell 当前后端对视觉设计的约束

日期：2026-10-04。唯一业务事实源是 `/home/jasper0507/dev/work/bluebell_backend` 当前工作树。最新 HEAD `c0e1438372d1cc76a50c8657d9ad32905ecb0d91`；最终复核时工作树干净；研究期间看到的用户修改已包含在新提交中，本轮未改动后端。本文件由主代理在范围更新后重新核验；初期 subagent 完整报告在 [历史快照](BACKEND-FACTS-INITIAL.md)，当前指纹见 [CURRENT-BASELINE](CURRENT-BASELINE.md)。

## 当前端点及 UI 作用

除最后两行外，路径都有 `/api/v1` 前缀。业务 JSON 使用 code/message/data；删除和退出为 204 无正文。[路由源码](../../../bluebell_backend/internal/router/router.go)、[响应源码](../../../bluebell_backend/internal/response/response.go)。

| 方法与路径 | 真实权限与输入 | 输出与视觉约束 |
| --- | --- | --- |
| POST /signup | 公开；username/password/confirm_password | 201 username；注册不是登录 |
| POST /login | 公开；username/password | username/access_token/token_type + HttpOnly Cookie；无头像 |
| POST /refresh | refresh Cookie | token/type；不返回 username |
| POST /logout | 可选 Cookie | 204；失败不能画成已退出 |
| GET /communities | 公开 | 仅 id/name；目录无简介、成员数、头像 |
| GET /communities/{id} | 公开 | id/name/introduction/created_at |
| GET /posts | 公开；page、order=time/hot、community_id | 每页 10，page/page_size/total/items；可连续加载，但不是游标分页 |
| POST /posts | Bearer；title/content/community_id | 201 id；无上传或标签 |
| GET /posts/{id} | 公开 | 列表字段+content；正文格式由前端渲染选择 |
| DELETE /posts/{id} | Bearer，仅帖子作者 | 204；无撤销接口 |
| GET /posts/{id}/vote | 公开路由但 handler 依赖 user_id | 查询空用户，不能恢复本人方向 |
| PUT /posts/{id}/vote | Bearer；direction=-1/0/1 | post_id/direction；无时间截止，需重新读票数 |
| GET /posts/{id}/comments | 公开；page | 每页 10；时间/ID 升序平铺，total 包含回复 |
| POST /posts/{id}/comments | Bearer；content/reply_to_comment_id? | 201 id；无单条评论详情查询 |
| DELETE /comments/{id} | Bearer，仅评论作者 | 204；回复保留，帖子作者不能删他人评论 |
| GET /ping | 公开 | message:pong；非业务页面 |
| GET /health | 公开 | status:ok；不代表数据库健康 |

## 会改变视觉承诺的事实

1. **没有投票期限。** 当前 [service Vote](../../../bluebell_backend/internal/service/post.go) 与 [store Lua](../../../bluebell_backend/internal/store/post.go) 已移除期限判断和个人投票 Hash 到期设置；当前 [错误码](../../../bluebell_backend/internal/response/code.go) 不再定义 VOTE_CLOSED。旧研究的七日截止和 TTL 作废，旧前端 schema 不能作为保留期限的依据。
2. **本人方向未知。** [router](../../../bluebell_backend/internal/router/router.go) 的 GET vote 未安装 JWT，handler 从空 user_id 读取。PUT 回显可确认该次选择，刷新后不可凭 GET 的 0 宣称未投票。总票数不能反推个人方向。
3. **列表字段有限。** [post handler](../../../bluebell_backend/internal/handler/post.go) 只返回 id/title/author_id/author_name/community_id/community_name/up_votes/down_votes/created_at。无摘要、评论数、阅读数。净票只是两个真实字段相减，必须标明。
4. **评论按时间平铺。** [comment handler](../../../bluebell_backend/internal/handler/comment.go) 与 [repository](../../../bluebell_backend/internal/repository/comment.go) 没有完整树或单条查找。缺失目标不能当成删除，除非有已确认本地删除等独立证据。
5. **权限以服务端为准。** author_id/JWT sub 可控制删除入口，但不能替代后端 403。没有 /me、用户资料编辑、社区管理路由。
6. **输入规则不同。** [register](../../../bluebell_backend/internal/handler/user.go) 要求用户名 3–64、密码 8–64 且 ASCII 字母数字；[login](../../../bluebell_backend/internal/handler/auth.go) 只非空且 max64。title max128 按 validator 的 Unicode 码点；content 仅 required，数据库 TEXT，不等于无限容量。Markdown 是前端显示选择，不是后端格式校验。
7. **写失败可能结果不确定。** [post service](../../../bluebell_backend/internal/service/post.go) 的 MySQL 写入与 Redis 初始化/清理没有整体回滚；网络中断、500 不能证明没发布或没删除。界面保留输入并避免误导重发。
8. **列表错误处理已变化。** 当前工作树先处理查询 err 再处理空列表，初期报告的错误遮蔽观察已失效。

## 验证边界

以上为只读源码核验。初期 Go 构建成功适用于历史快照，不冒充当前 commit 的构建结果。本轮没有运行后端业务写入，默认地址没有可连通服务。没有改后端文件、迁移数据、清理工作树或替换用户修改。

类型继续由现有前端契约机制维护；本次不新增 OpenAPI overlay 工具链。旧 schema 与当前代码差异交给后续契约维护，产品页面以当前代码事实为准。
