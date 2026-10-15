# Bluebell 当前设计基线

核对日期：2026-10-04。当前范围是既有前端UI/UX重设计，非新工程开发。本文件在用户提供 frontend01 后重新核验；它取代研究初期的后端快照。

## 当前仓库状态

- 前端路径：`/home/jasper0507/dev/work/bluebell_frontend01`；HEAD `26639b75c4556b70c4b6784a748d6fccca544d44`。
- 前端工作树：检查时干净。
- 后端路径：`/home/jasper0507/dev/work/bluebell_backend`；HEAD `c0e1438372d1cc76a50c8657d9ad32905ecb0d91`。
- 后端工作树：检查时干净。

本次没有运行迁移、写入业务数据、启动原项目或改动前后端文件。默认5173/5174/4173/8080探测没有可连接HTTP服务；不据此判断其他地址是否有服务。

## 当前后端边界

- 后端新增提交 `2b2b18d` 移除投票时间窗口，`898460d` 同步文档。当前service/store没有七日截止，投票方向Hash不再因该窗口设置EXPIREAT。不存在UI倒计时或按年龄禁用投票的依据。
- GET vote仍是公开路由，handler从未填充的user_id上下文取值；发送Authorization不能修复这个问题。PUT投票仍受JWT保护，支持-1/0/1。
- PostService当前工作树先检查MySQL查询err，再判断结果为空，初期报告“空列表可能掩盖错误”的旧观察已失效。
- 当前router仍有17个端点；社区目录只含id/name，帖子列表不含正文/摘要/评论数，评论按时间和ID升序平铺，每批10条。
- 认证Cookie轮换、无/me、204、本人删除、POST结果不确定等既有边界不因换视觉改变。

## 已有前端行为

| 已核验文件 | 当前可复用行为 |
| --- | --- |
| [src/app/router.tsx](../../../bluebell_frontend01/src/app/router.tsx) | 六类业务页面、RequireAuth和错误边界；不新增社区目录路由 |
| [src/app/layouts/content-layout.tsx](../../../bluebell_frontend01/src/app/layouts/content-layout.tsx) | 顶部+右侧重复社区导航；1200px、3:1主辅栏；手机details菜单 |
| [src/styles.css](../../../bluebell_frontend01/src/styles.css) | 暖米色网格、荧光绿主色、统一黑色焦点、Markdown基础排版 |
| [src/components/post-list.tsx](../../../bluebell_frontend01/src/components/post-list.tsx) | infinite query、IntersectionObserver、当前位置保存、ID去重、手动刷新及删除后暂停追加 |
| [src/components/post-markdown.tsx](../../../bluebell_frontend01/src/components/post-markdown.tsx) | react-markdown；无rehype-raw，图片只留alt |
| [src/components/comment-thread.tsx](../../../bluebell_frontend01/src/components/comment-thread.tsx) | 平铺滚动、回复目标引用、草稿、刚发表echo、同ID合并、已知删除后的暂停追加 |
| [src/components/vote-controls.tsx](../../../bluebell_frontend01/src/components/vote-controls.tsx) | 显式赞成/反对/取消、未知状态、提交态、确认后刷新统计；仍有旧closed兼容分支 |
| [src/api/votes.ts](../../../bluebell_frontend01/src/api/votes.ts) | voteDirectionReadIdentifiesUser=false，当前不读取不可靠的本人投票GET |
| [src/app/session/coordinator.ts](../../../bluebell_frontend01/src/app/session/coordinator.ts) | Web Locks/BroadcastChannel、身份代次；已发送write不自动重放；退出失败不清会话 |
| [src/api/query-client.ts](../../../bluebell_frontend01/src/api/query-client.ts) | Query自动重试关闭；请求层首次读最多一次重试，追加和写不重试 |
| [docs/adr/0001-auth-session.md](../../../bluebell_frontend01/docs/adr/0001-auth-session.md) | 已接受的认证与存储策略，不由此次视觉设计覆盖 |

前端实现说明不是后端能力证明：Markdown是前端渲染选择；草稿是本地能力；净票是两个真实字段的算术差值。旧frontend-plan进度段落有未同步历史，以源码确认现状，不能据旧文字重新搭建项目。

## 需要保留或单独追踪的差异

- 当前前端OpenAPI/投票处理仍包含旧VOTE_CLOSED概念。此次设计不得展示期限；生成类型/旧兼容分支清理单列后续契约维护，不把它扩成UI项目的后端修改。
- 标题Input原生maxLength=128使用UTF-16长度；后端validator按Unicode码点。UI任务应明确计数和错误反馈，不能通过换标签声称问题已经修复。
- 现有投票“结果未确认”提示中建议看总票数，不能进一步推断个人方向。设计将未确认独立呈现；实际逻辑修正须有单独行为验证。

## 源码指纹

下列SHA256用于追溯本次读取的工作树，不是发布签名。后续实施前如变更，先重核涉及UI的事实。

```text
584e97a3f68b12d0f152aa3f685989f6743a972bea7ddab5961c655deb3e7d6f  bluebell_frontend01/src/styles.css
842bd4e8762210e23ffe02c9a5fccdfbfc74a58d60b694cd40f479990bca1ebf  bluebell_frontend01/src/app/router.tsx
97227b6f2b120bbc05cd74b3e68f3d1536010fedde833ab9a40e40274cef8ee4  bluebell_frontend01/src/app/layouts/content-layout.tsx
07012e5c68e9c2674d9a0ed969ae78ccd4c7df2ff302c29300c5ab63bd6e7e9c  bluebell_frontend01/src/app/layouts/auth-layout.tsx
f8dee1a5ffd0885603f74bfd691fe5bad0f943775eb0862dd536df3c8ca0d1ad  bluebell_frontend01/src/components/post-list.tsx
7ae42ee32ce65d0694e3b5e83bec11fe0ce83e4b0dc80b8906ee365c33879424  bluebell_frontend01/src/components/post-markdown.tsx
4e0809f76facea43a1ca0ce4cc4da51cd534a14be74626c17cbfd69bfe13ce57  bluebell_frontend01/src/components/comment-thread.tsx
b095061950f52843bfe7295b26f0544132eb6e115096c7ba6f954a23ac476de0  bluebell_frontend01/src/components/vote-controls.tsx
cf21c15235751810af25717d2afdd4015457bf451cef6a56cac81d9760f4b834  bluebell_frontend01/src/pages/new-post-page.tsx
0323d2427b74ca1ea14af71e1c250f5288ee4fd1ecc1239f805ccd8cf704fb6e  bluebell_frontend01/src/app/session/coordinator.ts
4c74f9aca5d522cb6ccc33dc5bc6669b5a35890d1f9d4fbd6855cc1ad2ee5c78  bluebell_frontend01/src/api/votes.ts
f80b73ef6c4bfb79909bec9274a08b3ba417fe7687a4b636baac249fdae71fbd  bluebell_frontend01/src/api/query-client.ts
4ccea07bba4451b7e1a16ed14f3ecc5d06eeabb9d8fe9d129a98ba651e6f840b  bluebell_frontend01/docs/adr/0001-auth-session.md
38801c11d0258e6986bbbe51ad04d4227b8f3510e45ace37222b062c64d6747c  bluebell_backend/internal/router/router.go
31bbe22aabe395eaf77ae636e9b00847194cd909b3b2d9cc0f3cbce521cf0af3  bluebell_backend/internal/handler/post.go
66da196a1113603b390888194eae03b3cdddf33969585e399b4a39bab54f4865  bluebell_backend/internal/service/post.go
831e75a22dc6e1dc6b12f0aef3b9ad46e467797873a45c7fcb715001768fbe8e  bluebell_backend/internal/store/post.go
057693f404bd63ee6d8de8394423c0f2cb002c2e9630f7b6a74bf22f412b7a79  bluebell_backend/internal/response/code.go
46be394c42ca9ab0eb5e1b261f4ca0edeeb846a98262fde59a5480b4f10ad858  bluebell_backend/docs/openapi.yaml
```
