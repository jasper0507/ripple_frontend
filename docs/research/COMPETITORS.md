# Bluebell 前端竞品研究与视觉依据

调研日期：2026-10-04。研究范围：GitHub 开源社区/论坛项目的阅读、导航、投票、评论和移动交互。执行者：独立竞品研究 subagent。

> 当前范围说明：六轮搜索在旧颜色约束下完成；用户已允许所有颜色并明确不做无彩色界面。颜色结论以下方当前建议和ENGINEERING第六轮为准，旧轮次原始查询保留用于追溯。用户随后提供frontend01，本次只改造它的UI/UX设计。

## 结论边界

本次实际执行了 **6 次相互独立、前后递进的 `web.search_query` 调用**，并对返回的第一方页面进行 `open` / `find` 核验。搜索结果里的第三方排行榜、博客、讨论者主观评价和 stars 数量均未作为结论依据。研究对象选为 Discourse、Flarum、Lemmy UI、Lobsters，因为它们分别提供可核验的讨论流、紧凑列表、投票控件、内容索引参考；这不是产品质量排名。

本文的「事实观察」来自官方文档、仓库源码或官方站点的文本结构；**没有运行这些竞品，没有测量实际屏幕截图、首屏数量或操作完成率**。因此不声称某个布局经过本次用户测试，也不把无彩色风格说成这些产品已经采用的统一最佳实践。所有「设计推断」都是 Bluebell 的提案。

竞品仅提供交互与视觉参考。**Bluebell 功能、字段、权限和错误行为以本项目后端代码为唯一事实源**；竞品存在的搜索、标签、订阅、未读、收藏、通知、私信、编辑、上传和管理后台不能据此进入前端范围。

## 六轮搜索记录

### 第 1 轮：建立候选集，先确认项目归属

问题：哪些候选是有公开实现和第一方文档的社区产品？

实际查询：

```text
site.github.com discourse/discourse community forum repository
site.github.com flarum/framework nodebb/NodeBB forum
site.github.com LemmyNet/lemmy-ui lobsters/lobsters forem/forem
```

取得并核验的第一方来源：[Discourse 仓库](https://github.com/discourse/discourse)、[Flarum 仓库](https://github.com/flarum/framework)。随后直接打开 [NodeBB](https://github.com/NodeBB/NodeBB)、[Forem](https://github.com/forem/forem)、[Lobsters](https://github.com/lobsters/lobsters) 仓库补全归属检查。

观察：Discourse 的仓库明确链接官方文档和支持社区；Flarum 的核心仓库区分安装入口与核心代码，并说明可扩展架构。以上足以继续追溯其交互来源，不证明某个界面适合 Bluebell。

局限：这一轮的 `site.github.com` 写法不是严格的 `site:` 限域，多个仓库名称的组合查询也产生大量噪声。无关结果被排除；后续改为准确域名/仓库路径，并直接打开第一方页面。NodeBB、Forem 仅完成候选核查，未进入最终比较矩阵。

对下一轮的影响：从六个候选收敛至四个互补参考，改查具体的阅读、导航行为，不再以仓库介绍代替 UX 证据。

### 第 2 轮：找出从列表进入讨论的基本结构

问题：列表、社区导航、正文阅读各自承担什么任务？

实际查询：

```text
site.discourse.org "new user guide" topics replies sidebar
site:flarum.org features "two-pane"
site:github.com/LemmyNet/lemmy-ui "README"
site:github.com/lobsters/lobsters "comments"
```

第一方来源：[Discourse 使用文档索引](https://meta.discourse.org/c/documentation/using-discourse/126)、[Discourse 新用户指南](https://meta.discourse.org/t/understanding-discourse-for-new-users/96331)、[Flarum 官网](https://flarum.org/)、[Lemmy UI 仓库](https://github.com/LemmyNet/lemmy-ui)。

观察：Discourse 文档把主题列表筛选与主题内阅读分别说明；Lemmy UI 的产品模型围绕社区、帖子、投票和评论。Flarum 官网确认样式可配置，但没有提供足以证明「双栏一定更高效」的测试证据。

局限：第一条查询仍是非严格限域语法；仅采用检索到的官方原始指南。没有采用用户翻译帖作为交互的主证据，也没有从官网营销文案推断页面尺寸。

对下一轮的影响：Bluebell 应把「在哪里浏览」和「怎样排序」分开表达；需要继续核验投票和回复关系，避免只借列表外观。

### 第 3 轮：核验投票语义与评论上下文

问题：投票如何表达方向和状态？平铺评论如何保留回复关系？

实际查询：

```text
site:join-lemmy.org/docs users voting comments sorting
site:lobste.rs/about comments voting tags
site:github.com/flarum/framework "DiscussionListItem" "PostStream"
site:meta.discourse.org "Using the Discourse sidebar"
```

第一方来源：[Lemmy Votes and Ranking](https://join-lemmy.org/docs/users/03-votes-and-ranking.html)、[Lobsters About](https://lobste.rs/about)、[Discourse Sidebar](https://meta.discourse.org/t/using-the-discourse-sidebar/258478)、[Discourse 回复说明](https://meta.discourse.org/t/understanding-discourse-for-new-users/96331)。

观察：Lemmy 提供上/下投票，并明确树状评论与 Chat 平铺模式的上下文差异；Discourse 的回复可以按时间排列，同时链接回复目标；其侧栏把主要入口与分类入口区分。Lobsters 默认把故事集中展示，标签用于分类/筛选。

局限：Lemmy 的净分、评论投票与多种排序是它自己的业务语义，不能移植为 Bluebell 字段；Discourse 能展开目标内容，不等于 Bluebell 有单条评论读取接口。

对下一轮的影响：采用「时间顺序 + 回复对象」方向；不制造树状完整性。继续查焦点、按钮命名和触屏操作，防止无彩色方案仅在静态稿上可辨识。

### 第 4 轮：检验键盘、焦点与可访问性风险

问题：动作藏在悬停或省略菜单里，会不会造成不可发现、不可操作？

实际查询：

```text
site:github.com/lobsters/lobsters "app/views/stories/_story.html.erb"
site:docs.flarum.org "PostStream" "DiscussionList"
site:github.com/LemmyNet/lemmy-ui "aria-pressed" "vote"
site:discourse.org/accessibility WCAG keyboard navigation
```

第一方来源：[Discourse Accessibility Statement](https://www.discourse.org/accessibility)、[Discourse 主题焦点管理问题与实现讨论](https://meta.discourse.org/t/accessibility-focus-management-in-topics/78109)、[Discourse 浏览器新标签页快捷键修复](https://meta.discourse.org/t/open-in-new-tab-browser-keybind-fails-on-search-results/384004)。

观察：Discourse 官方说明采用 WCAG 并进行可访问性审计；历史修复记录涉及没有可见焦点、展开动作后失焦以及自定义键盘处理破坏新标签页行为。它们说明仅给控件加 `tabindex` 不足以保证完整操作路径。

局限：历史 issue 证明的是风险和修复过程，不是当前产品仍有同样缺陷；检索未命中的源码没有被写成观察结论。

对下一轮的影响：Bluebell 使用真实链接/按钮，保留浏览器行为，独立规定可见焦点与弹层焦点恢复；下一轮查 W3C 原始阈值，使黑白灰方案有可验收标准。

### 第 5 轮：给无彩色视觉建立可验证的状态标准

问题：不用蓝、紫、绿、红、黄时，怎样区分选中、错误、成功和禁用？

实际查询：

```text
site:w3.org/WAI/WCAG22/Understanding use-of-color contrast-minimum non-text-contrast
site:w3.org/WAI/WCAG22/Understanding target-size-minimum focus-visible
site:github.com/flarum/framework "hover" "iPad" "4992"
site:github.com/lobsters/lobsters "prefers-color-scheme"
```

第一方来源：[W3C 设计提示](https://www.w3.org/WAI/tips/designing/)、[文字对比度](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)、[非文字对比度](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)、[目标尺寸](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum)、[焦点不能被遮挡](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum)、[Flarum 变更记录](https://github.com/flarum/framework/blob/2.x/CHANGELOG.md)。

观察：W3C 要求不要只靠颜色传递信息；普通文字的 AA 对比度下限为 4.5:1，必要的非文字状态/组件辨识信息为 3:1。2.5.8 的目标尺寸下限是 24×24 CSS px，存在间距等例外。Flarum 官方记录有 iPad/触屏讨论列表需要双击的修复。

设计推断：Bluebell 的触屏主要操作统一目标为至少 44×44 px，这是本产品选择，不能误写成 WCAG AA 的统一强制下限。选中用填充、边线、文字与 `aria-pressed` / `aria-current`；错误用警示图标、标题、正文及字段关联；成功用勾选图标与结果文字。焦点建议 2px 实线加间距，并检查它与相邻背景的对比度。

局限：纯黑白灰不自动等于可访问；浅灰小字、浅灰输入边界和不可见焦点仍可能失败。没有从未命中的 Lobsters 主题搜索推断其配色。

对下一轮的影响：最后一轮直接读取关键 UI 源码/官方列表，核对信息顺序、按钮语义和加载状态，避免用规范代替产品观察。

### 第 6 轮：源码与官方列表交叉核验

问题：上述抽象模式是否真的出现在列表、按钮、阅读流的实现中？

实际查询：

```text
site:github.com/flarum/framework "DiscussionListItem.tsx"
site:github.com/lobsters/lobsters "media" "max-width"
site:docs.flarum.org "DiscussionList" "PostStream"
site:github.com/LemmyNet/lemmy-ui "vote-buttons.tsx"
```

随后直接打开并核验：[Flarum DiscussionListItem 源码](https://raw.githubusercontent.com/flarum/framework/2.x/framework/core/js/src/forum/components/DiscussionListItem.tsx)、[Flarum 组件 API](https://api.docs.flarum.org/js/v1.1.0/identifiers)、[Lemmy VoteButtons 源码](https://raw.githubusercontent.com/LemmyNet/lemmy-ui/main/src/shared/components/common/vote-buttons.tsx)、[Lobsters 官方首页](https://lobste.rs/)。

观察：Flarum 列表项把标题作为 `h2` 和链接，另有信息行和回复统计；Lemmy 投票是原生按钮，有可访问名称、`aria-pressed`，并在 loading 时禁用；Lobsters 首页文本结构重复呈现标题、标签/域名、作者时间与评论入口，并有下一页链接。

局限：Flarum API 链接明确是旧版文档，仅用于核对组件职责，不作为当前发布状态依据；当前列表细节以本轮读取的 `2.x` 源码为准。Lemmy 和 Flarum 源码链接为动态分支，今后可能变化。Lobsters `_story.html.erb` 原始地址此次读取失败，改用其官方首页可见文本结构，不声称读取到了该模板。源码和文本提取不能证明实际像素密度、移动折行、颜色或动画效果。

对规划的影响：使用独立可点击的标题、稳定元信息区域和有名称的投票按钮；列表保持紧凑，但尺寸由 Bluebell 自己的中文内容与移动端验证决定。

## 最终比较矩阵：观察与设计推断分开

| 项目 / 可追溯实现 | 本次可确认的事实观察 | 对 Bluebell 的设计推断 | 不迁移的能力 / 局限 |
| --- | --- | --- | --- |
| [Discourse](https://github.com/discourse/discourse) | 官方指南描述列表筛选、侧栏分类、按时间阅读和回复目标链接。[指南](https://meta.discourse.org/t/understanding-discourse-for-new-users/96331) | 社区导航与排序分开；详情沿一条阅读轴排列，回复保留对象说明 | 不引入未读追踪、无限流、通知、标签及目标内容自动展开；这些需要对应数据能力 |
| [Flarum](https://github.com/flarum/framework) | 列表源码有标题链接、信息行与统计；触屏双击问题有官方修复记录。[源码](https://raw.githubusercontent.com/flarum/framework/2.x/framework/core/js/src/forum/components/DiscussionListItem.tsx) / [记录](https://github.com/flarum/framework/blob/2.x/CHANGELOG.md) | 两级文字层次、横向列表、稳定元信息；必要操作在触屏可见且一触即达 | 不引入双栏同步浏览、滑动手势、回复数/未读数等后端未提供的字段；不声称其密度已经适合中文 |
| [Lemmy UI](https://github.com/LemmyNet/lemmy-ui) | 投票有方向、状态语义与加载禁用；评论文档区分树形和 Chat 平铺。[按钮源码](https://raw.githubusercontent.com/LemmyNet/lemmy-ui/main/src/shared/components/common/vote-buttons.tsx) / [文档](https://join-lemmy.org/docs/users/03-votes-and-ranking.html) | 投票按钮组要表达当前方向、操作中、不可用和未知状态；平铺必须补充回复目标 | 不把其净分当成 Bluebell 赞成票数；不迁移多种热门算法、评论投票、订阅与联邦 |
| [Lobsters](https://github.com/lobsters/lobsters) | 官方首页以重复列表结构展示题名与元信息，并提供下一页；关于页面说明标签聚合模式。[首页](https://lobste.rs/) / [关于](https://lobste.rs/about) | 首页直接进入可读内容；避免每条帖子成为大卡片，也不堆叠无来源统计 | 不照搬标签、外链聚合、karma、邀请制和举报；不复制其样式或断言其移动密度更优 |

## 提交给产品规划的具体建议

以下是研究推断，最终数值由 PRD/DESIGN 确定，功能由后端审计约束。

1. **特色放在排版和结构上。** 采用彩色品牌与操作、稳定正文阅读层次的内容方向：明确的标题字重、较细的元信息、少量粗分隔、窄幅栏目说明。用有秩序的留白与阅读节奏建立识别，主色、关联色与语义色各司其职，不用颜色替代内容层次。此风格是本项目选择，不是竞品背书。
2. **首页先提供可扫读的讨论。** 标题占主要视觉面积，社区/作者/时间紧邻标题，真正提供的票数有稳定位置。不要为了对齐竞品增加阅读量、回复数、趋势或成员总数。
3. **社区是筛选语境。** 桌面允许固定宽度导航；移动端用明确的社区选择入口/抽屉。社区介绍是文本说明，不是需要被填满的仪表盘。当前项同时有文字、形状或填充提示。
4. **详情以阅读轴为中心。** 正文、评论、回复编辑沿同一列；小屏减少横向层级。长内容自然增长，文字放大后仍可阅读，不用固定高度裁切。
5. **平铺回复应坦诚表达上下文可得性。** 只对当前已加载目标提供定位；目标不在当前页时显示可知的回复标识和「回复目标不在当前页」之类说明，不编造被回复人、摘要、删除状态或完整树形。
6. **彩色状态也必须完整。** 成功、错误、危险操作各有明确文字和图标。普通/选中/焦点/加载/禁用不能只差一档灰度；未知投票状态更不能画成「未投」。删除按钮需要直白命名和确认对象。
7. **移动验收检查操作，不只缩放截图。** 触屏不能依赖 hover；主要按钮目标至少 44×44 px；弹层关闭后焦点回到入口；手机键盘出现时编辑区和提交状态可达。

## 与后端事实的最小映射

已只读核验 [router.go](../../../bluebell_backend/internal/router/router.go) 的实际路由、[Post 模型](../../../bluebell_backend/internal/model/post.go)、[Community 模型](../../../bluebell_backend/internal/model/community.go)、[Comment 模型](../../../bluebell_backend/internal/model/comment.go) 和 [评论仓库](../../../bluebell_backend/internal/repository/comment.go)。完整字段/接口限制由项目的后端事实清单承担，本节只负责约束借鉴范围。

| 可借鉴的交互 | 后端事实 | 规划约束 |
| --- | --- | --- |
| 讨论列表与社区导航 | 有社区列表/详情和帖子列表/详情路由 | 不根据竞品添加标签、订阅、站内搜索入口 |
| 投票控件 | 有帖子投票读/写路由 | 读写是否可用、当前状态恢复策略必须服从 handler/middleware 审计，不能仅看路由名字假定成功 |
| 平铺评论回复 | 模型有 `ReplyToCommentID`；仓库按 `created_at ASC, id ASC` 分页 | 不按树排序，不宣称当前页完整覆盖一个回复子树 |
| 回复目标定位 | 当前路由没有单条评论详情读取 | 页面外的目标不能通过一个不存在的接口加载；不得推断其已删除 |
| 用户头像/个人页/编辑 | 所查路由没有对应读写入口 | 不因竞品有入口就制造可交付功能 |

## 交付验收建议与未验证项

- 用后端真实字段构造长标题、长用户名、空列表、评论分页和请求失败等案例。视觉样例若用虚构内容，必须标注示例，不当作后端数据。
- 当前彩色主题检查普通文字 4.5:1、必要控件/状态辨识信息 3:1；背景分隔装饰线无需冒充控件边界。
- 用键盘完成浏览→登录→发帖→回复→删除确认路径；投票动作与普通链接分别可达。
- 桌面与手机检查标题折行、长连续字符、触摸目标、200% 文字放大、焦点可见、页面返回与分页定位。
- 本轮尚未做竞品浏览器截图测量、可用性访谈、真实接口联调或 Bluebell 成品视觉验收。这些不能被「完成调研」替代。
