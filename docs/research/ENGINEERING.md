# Bluebell 前端工程与视觉实现调研

调研日期：2026-10-04。本文记录主代理实际执行的六轮递进搜索；GitHub 竞品研究另见 [COMPETITORS](COMPETITORS.md)。外部资料只用于选择实现方式和验收方法，Bluebell 功能事实只来自 [后端代码核验](BACKEND-FACTS.md)。

> 范围说明：第1–5轮记录的是用户提供现有前端之前的历史探索。用户随后允许所有颜色，并将任务收敛为既有frontend01的UI/UX重设计；新增架构、页码和无彩色提案均不进入最终规范，当前取舍见PRD/DESIGN。

## 第一轮 单色状态是否能表达清楚

搜索问题：去掉蓝、紫、绿、红、黄以后，交互状态如何仍然可辨认？

实际查询：

- `site.w3.org WAI WCAG22 Understanding use of color non-text contrast target size minimum focus appearance`
- `site.ui.shadcn.com docs theming neutral base color CSS variables`

核验来源：[W3C Use of Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html)、[Contrast Minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)、[Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)、[Focus Appearance](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance)、[shadcn theming](https://ui.shadcn.com/docs/theming)。

观察：颜色不能作为唯一状态信号；shadcn 可用语义 CSS 变量覆盖默认颜色。普通正文按 4.5:1、必要控件边界按 3:1 检查。Focus Appearance 是 AAA 条款，不把它误写成 AA 的强制要求。

设计决定：采用纯灰阶语义 token；选中使用实心背景、文字和图标；错误带警示图标、具体说明及修复入口。项目自主采用 2px 外焦点环。浅分隔线只做装饰，输入框不能依赖低对比浅线识别边界。

下一问题：状态除了视觉，还依赖什么认证行为才能可信？

## 第二轮 认证与跨标签页

实际查询：

- `site.openapi-ts.dev openapi-fetch middleware onResponse retry request clone 401`
- `site.developer.mozilla.org Web Locks API same origin tabs secure context`
- `site.developer.mozilla.org BroadcastChannel API same origin`

来源：[openapi-fetch middleware](https://openapi-ts.dev/openapi-fetch/middleware-auth)、[Web Locks](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API)、[Broadcast Channel](https://developer.mozilla.org/en-US/docs/Web/API/Broadcast_Channel_API)。

观察：openapi-fetch 支持请求和响应中间件，但不会自动替调用方克隆可消费的流。Web Locks 可以协调同源标签页，依赖安全上下文；BroadcastChannel 可同步同源标签页事件。

设计决定：会话 Module 统一负责内存 token、同页合并刷新、跨页 cookie 变更串行化及登录失效通知。业务 401 最多重放一次；请求体在首次发送前保留可重放副本；登录、刷新、退出不能进入自身的刷新重试循环。退出及切换身份需丢弃旧请求的迟到响应。原生能力不满足时保留匿名阅读，登录入口说明需 HTTPS 和受支持浏览器，不增加自制分布式锁。

下一问题：多个页面共享请求数据时，怎样减少自制缓存，又不悄悄重试写操作？

## 第三轮 路由和服务端数据

实际查询：

- `site.tanstack.com query latest docs framework react important defaults retries refetch stale`
- `site.reactrouter.com start declarative routing useSearchParams`
- `site.openapi-ts.dev openapi-fetch react-query tanstack query integration`

来源：[TanStack Query retries](https://tanstack.com/query/latest/docs/framework/react/guides/query-retries)、[Caching](https://tanstack.com/query/latest/docs/framework/react/guides/caching)、[openapi-fetch examples](https://openapi-ts.dev/openapi-fetch/examples)、[React Router URL values](https://reactrouter.com/start/declarative/url-values)。

观察：查询库的默认重试和重新抓取行为需要显式配置；URL 参数可以保存分页和筛选。搜索结果包含旧版 Query 文档，未将 v4 的配置名称当成最新版事实；latest important-defaults 页面此次打开失败，使用可读取的最新 retries/caching 页面交叉核验。

设计决定：增加 React Router 管路由、TanStack Query 管请求去重与失效；保留用户指定的 openapi-fetch 为唯一请求客户端，不增加 openapi-react-query 第二层封装。query/mutation 自动重试均关闭，用户主动重试有明确入口；刷新认证的单次重放由会话层处理。投票成功重新查询票数，不从未知旧方向计算乐观增量。

下一问题：生成类型和 Cookie 同源要求如何落实到可复现工程？

## 第四轮 类型生成和代理

实际查询：

- `site.vite.dev config server proxy preview proxy production deployment`
- `site.openapi-ts.dev cli openapi-typescript check output schema 3.1`
- `site.tailwindcss.com docs installation using vite`

来源：[Vite server proxy](https://vite.dev/config/server-options#server-proxy)、[Vite static deployment](https://vite.dev/guide/static-deploy.html)、[openapi-typescript CLI](https://openapi-ts.dev/cli)、[Tailwind Vite integration](https://tailwindcss.com/docs/installation/using-vite)。

观察：Vite 的开发代理是开发服务器能力；`vite preview` 不是生产服务器。openapi-typescript 接受本地 YAML 并生成 TypeScript；Tailwind 提供 Vite 插件。

设计决定：只读同步后端 schema 到前端，记录 SHA256，生成文件不手改；schema 和代码冲突先记录差异，以代码为准。浏览器始终请求同源 `/api/v1`；开发代理和生产反向代理分别验收，保留完整路径。包版本在实施首步检查兼容性并锁定到 lockfile，不在规划阶段声称已安装。

下一问题：什么证据足以说明界面可以交付，而不是只看一张桌面截图？

## 第五轮 验收覆盖

实际查询：

- `site.playwright.dev docs test accessibility aria snapshots emulation mobile`
- `site.w3.org WAI WCAG22 Understanding reflow target size minimum`
- `site.ui.shadcn.com docs components alert-dialog accessibility destructive`

来源：[Playwright accessibility testing](https://playwright.dev/docs/accessibility-testing)、[Emulation](https://playwright.dev/docs/emulation)、[W3C Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)、[Target Size Minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum)、[shadcn components](https://ui.shadcn.com/docs/components)。

观察：自动可访问性扫描不能代替全部人工检查。响应式视口、触屏和键盘必须分别验证。WCAG 2.2 AA 的 target-size 最低要求为 24px 或满足规定例外，44px 是本项目主动采用的触控设计要求，不能混淆两者。

设计决定：320/390/768/1440 CSS px 检查无横向溢出；关键点击区域至少 44×44；验证焦点、字段错误关联、200% 字体缩放和减少动画。浏览器 mock 只作为自动测试输入，产品运行时不得因接口失败切成假数据。

## 初期工程取舍记录（已由现有实现替代）

采用两个有明确职责的共享 Module：会话 Module 隐藏 Cookie 轮换与身份变化；请求 Module 隐藏统一响应和失败分类。具体社区、帖子、评论请求保持直白的 typed functions，不建立通用 CRUD 框架。竞品做不到或后端没支持的能力，不能由这些工程工具补成产品承诺。

本轮交付是文档与静态视觉评审稿。上述框架配置、自动测试和真实后端联调均属于待实施工作，不能把规划中列出的检查写成已通过。

## 第六轮 配色要求更新后的语义颜色复核

用户明确“不做无彩色界面，允许蓝、紫、绿、红、黄”后执行本轮。

实际查询：

- `site.primer.style foundations color functional color roles accent success danger`
- `site.docs.flarum.org appearance primary secondary color`
- `site.meta.discourse.org create color palette theme primary secondary tertiary`

第一方来源：[Primer color usage](https://primer.style/product/getting-started/foundations/color-usage/)、[Primer color tokens](https://primer.style/product/primitives/color/)、[Flarum admin appearance](https://docs.flarum.org/admin/)、[Discourse theme variables](https://meta.discourse.org/t/use-discourse-core-variables-in-your-theme/77551)。

观察：这些系统以角色组织颜色，论坛主题可以通过变量统一变化。它们没有证明哪组具体hex“最好看”。

最终设计推断：Bluebell采用冷白阅读面、蓝色品牌与操作、珊瑚色回复关联；绿/红/琥珀用于成功/危险/结果待确认，每种状态仍有图标和文字。具体色值由本项目选择并计算对比度。既有代码已有Router、Query、认证和Markdown，UI任务复用它们，不实施此前重新搭建架构的候选方案。

文档采纳情况：颜色职责和算得的对比度见DESIGN第三节；滚动加载、Markdown和认证ADR的保留见CURRENT-BASELINE及PRD。本文检索步骤是研究证据，不是另一个竞争性的实现规格。
