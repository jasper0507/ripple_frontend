# Bluebell 界面改造独立实现审计

日期：2026-10-05。审计人：独立 `planning_audit` subagent。

**代码及文档复核结论：通过。** 本轮发现 4 项 P2，主代理已修正，审计人逐项复读确认；没有未关闭的 P1/P2 代码问题。README、PRD、DESIGN、实施计划及验证记录已同步实际实施位置、原生 dialog 方案及验证边界。真实浏览器布局、焦点锁定和后端联调未验证，不能据本报告宣称上线验收完成。

## 范围与依据

- 用户已经授权编码。本轮在可写的 `bluebell_frontend02` 中复用现有工程并改造界面；原 `bluebell_frontend01` 和后端只读。
- 比较对象：当前 `src` 与 `/home/jasper0507/dev/work/bluebell_frontend01/src`。原前端 HEAD 为 `26639b75c4556b70c4b6784a748d6fccca544d44`；后端 HEAD 为 `c0e1438372d1cc76a50c8657d9ad32905ecb0d91`。审计人只读复核时两者工作树均干净。
- 读取仓库 AGENTS、领域说明、CONTEXT、既有前端规格与认证 ADR，并以本轮 PRD/DESIGN 覆盖已经作废的视觉和投票期限规定。
- 重点检查主题、公共导航、列表与详情、投票、发帖/认证表单、评论回复、草稿提示、移动菜单和删除确认。只读审计，没有修改应用代码。
- 原 [FINAL-AUDIT](FINAL-AUDIT.md) 是设计阶段的独立审计。本报告检查已经写入的实现，二者不能互相替代。

## 发现、修正与复核

| 编号 | 级别与原问题 | 修正后证据 | 状态 |
| --- | --- | --- | --- |
| I01 | **P2：删除帖子取消后无法恢复触发焦点。** `confirming ? 弹层 : 按钮` 会先卸载触发按钮，Modal 再捕获 activeElement 时通常只能取得 body | [post-page.tsx](../../src/pages/post-page.tsx) 保留删除按钮，条件只控制 DeleteConfirm；[modal.tsx](../../src/components/ui/modal.tsx) 关闭后恢复仍在文档中的触发元素 | 已关闭；主代理 DOM 检查覆盖取消后回到同一按钮 |
| I02 | **P2：未确认投票离开再进入会显示旧方向。** 最初只设置组件本地 `unconfirmed`，Query 中旧确认方向仍在；重挂后本地状态清零，旧缓存又被当成事实 | [vote-controls.tsx](../../src/components/vote-controls.tsx) 的 `markUnconfirmed` 精确 reset 当前帖子和身份的 query，再设置本地未知。当前 GET 禁用，不会因此读回空用户方向；之后只有成功 PUT 可以重新确认 | 已关闭；主代理 DOM 检查覆盖赞成确认→反对响应丢失→离开→重进仍未知 |
| I03 | **P2：评论发布成功、列表刷新失败会把输入框误标无效。** 原新增表达式 `formError && !draft.content.trim()` 在成功清空草稿后也会成立 | [comment-thread.tsx](../../src/components/comment-thread.tsx) 仅在实际本地“请填写评论”校验错误时设置 `aria-invalid`；“评论已发布，但列表暂未更新”保留为提交反馈 | 已关闭；主代理新增 POST 成功、tail 失败的 DOM 用例并报告通过 |
| I04 | **P2：新增评论总数会显示已知过时数据。** 固定取 `pages[0].total`，而既有 tail 刷新仅更新末页、删除仅剔除 items；新增或删除后第一批总数未必更新 | [comment-thread.tsx](../../src/components/comment-thread.tsx) 省略标题旁总数，继续使用既有加载与删除规则，没有为装饰计数重写缓存流程 | 已关闭；源码已确认不再读取该总数作为当前标题数字 |

两项呈现建议也已落实：Modal 的目标说明使用 `overflow-wrap:anywhere` 处理长词；投票提交期间通过状态区明确显示“正在提交投票…”。

## 业务语义与可访问性复核

| 检查项 | 独立源码结论 |
| --- | --- |
| 认证、API、缓存基础 | `src/api`、`src/lib`、`src/app/session` 相对原前端目录无改动；没有替换认证 ADR、增加接口或自动重放写请求 |
| 账号及草稿 | 原账号/会话隔离、提交快照核对和 sessionStorage 存储保留；恢复提示与草稿正文分离，放弃或评论成功清理时同步收起提示 |
| Unicode 标题 | 去掉原生 UTF-16 `maxLength=128`；显示计数和既有校验都基于 trim 后的 Unicode 码点。无效标题不会再连带把已经选择的社区误报为未选择 |
| Markdown | 原渲染器未变，继续不执行 raw HTML、图片只显示 alt；评论仍为纯文本 |
| 列表与评论加载 | 原 infinite query、observer、去重、返回位置、已知删除后暂停追加、echo 与时间线合并策略保留 |
| 回复上下文 | 已加载目标的引用链接指向有 ID、可聚焦的评论节点；缺失目标只显示编号；选择及取消回复保留输入正文 |
| 投票未知及确认 | 不调用不能识别用户的 GET；三个按钮是明确设置动作；写结果未知时撤销旧确认，PUT 确认但票数 GET 失败时保留已确认方向，提示统计暂未更新 |
| 投票期限 | 没有新增按年龄计算的七日禁用或倒计时；原 `VOTE_CLOSED` 分支仍仅为已记录的历史兼容路径 |
| 移动菜单 | 原生 `dialog.showModal()` 承担模态边界；有可访问名称、关闭入口、初始焦点、Escape 处理和路由关闭；跨入桌面断点时关闭抽屉 |
| 删除确认 | 共用 DeleteConfirm；取消为初始焦点；写入中阻止重复确认，失败留在弹层；触发节点消失后安排主内容焦点回退 |
| 字段反馈 | 注册、登录、发帖和评论提供标签与错误关联；标题超限、空评论等错误定位到对应输入，密码没有引入 trim 行为 |

原生 dialog 是本轮实现选择：沿用 shadcn Button/Input，未增加 Radix Dialog 依赖。已复读 DESIGN 和实施计划，二者已说明替代原因及实际组件，不再将未使用的 Sheet/AlertDialog 写成当前实现。

## 证据来源区分

### 本审计独立执行

1. 对当前与原前端源码逐文件比较，读取上述变更的控制流、状态与标记。
2. 在主代理修正后重新读取 4 项 P2 的实现，确认问题对应的代码路径已经改变。
3. 只读检查原前端、后端 HEAD 与工作树；确认 API/lib/session 核心目录没有改写。
4. 阅读 `/tmp/bluebell-dom-check.cjs`，确认它装载实际 Providers、Router 和组件，使用 fetch 夹具，并包含上述关键场景。该脚本的 dialog、IntersectionObserver、滚动和 matchMedia 有测试替身，不能代表真实浏览器布局和焦点边界。
5. 复读最终 README、PRD、DESIGN、实施计划、[实现验证](../verification/ui-redesign.md) 和 [DOM 结果](../verification/ui-dom-result.json)。确认实际目录为 frontend02，U01–U09 区分代码完成与尚未完成的浏览器/联调验收，旧规划与设计审计已有历史说明。

本审计人没有独立重复运行下节命令；运行结果由主代理提供，不能混称为审计人亲自执行。

### 主代理报告的实际运行结果

- 最终 `typecheck`、`lint`、`test`、`build`、`contract:check` 均 exit 0，使用现有项目 pnpm 命令及环境所需的 `--config.verify-deps-before-run=false`。
- 原测试共 **13 个文件、203 项通过**。
- DOM 验收共 **27 项通过**：包括投票确认/响应丢失/重进、统计刷新失败、删除默认及恢复焦点、128/129 个 emoji、标题错误不误报社区、评论 echo、回复正文保留、提交成功而 tail 失败不标坏输入、写请求不自动重放、退出失败保留会话及草稿恢复。
- Lint 无错误，保留 3 条基线已有的 Fast Refresh 警告；构建保留原有的 500kB chunk 提醒。主代理报告生产 JS 为 590.14kB（gzip 185.00kB）、CSS 为 23.51kB（gzip 5.75kB）。这些警告没有被写成已经消除。
- 无新增依赖；未修改原前端和后端源仓库。

## 未验证项与交付收口

- Chromium 本轮仍启动失败。未验证真实浏览器中的 320/390/768/1440 渲染、200% 文字放大、原生 dialog top layer、焦点锁定、触屏和手机软键盘；JSDOM 不覆盖这些能力。
- fetch 夹具验收不是后端联调，未验证真实 Cookie、网络、数据库写入及跨标签浏览器行为。
- 文档同步已复核完成；旧设计阶段报告保留历史语境，当前状态由实现验证记录与本报告说明。DOM 结果已留存为 JSON，临时脚本不是加入默认 CI 的浏览器测试套件。
- 既有历史投票契约差异、3 条 Lint 警告和大 chunk 提醒属于显式保留项，不构成本轮声称修复的内容。

代码层面的审计发现及文档同步已经闭环；真实浏览器与后端验收仍明确保留为未完成项。
