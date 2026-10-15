# Ripple UI 与 UX 设计交付

本目录记录当前前端的帖子流与阅读布局。用户已确认实施，列表评论数先省略；后端未修改。运行应用与静态视觉稿的验证范围不同，先读[发布入口验证](verification/publish-entry.md)及[界面与交互验证](verification/ux-polish.md)。

品牌采用最终通过验证的 C 偏弧字标与抽象标签页图标，保留当前配色、布局和留白。[品牌验证](verification/brand-c.md)记录检查范围及结果。

| 读者 | 先读 | 用途 |
| --- | --- | --- |
| 产品与设计 | [视觉评审稿](visual-preview.html)、[PRD](PRD.md) | 查看帖子流与单列阅读页面、状态和产品取舍 |
| 前端开发 | [DESIGN](DESIGN.md)、[改造计划](IMPLEMENTATION-PLAN.md) | 对照现有文件、尺寸、token和任务执行 |
| 评审与测试 | [界面与交互验证](verification/ux-polish.md)、[历史交付核验](reviews/DELIVERY-REVIEW.md)、[设计终审](reviews/FINAL-AUDIT.md)、[实现审计](reviews/IMPLEMENTATION-AUDIT.md) | 检查已验证范围及剩余门槛 |
| 追溯依据 | [历史基线](research/CURRENT-BASELINE.md)、[后端事实](research/BACKEND-FACTS.md) | 追溯前期研究版本；当前实现与后端状态见帖子流验证 |
| 调研过程 | [六轮竞品研究](research/COMPETITORS.md)、[六轮工程与视觉研究](research/ENGINEERING.md) | 查看问题、原始搜索、第一方来源和取舍 |

`visual-preview.html` 自包含，可直接用浏览器打开，不需安装依赖。上方页签可切换首页、社区、帖子与回复、发帖、登录注册和状态。所有内容都是排版示例，业务按钮不可提交；评审导航可操作。评审稿由当前 React 组件与构建 CSS 生成静态页面，手机菜单需运行应用验证；运行应用使用原生 dialog 模态抽屉，真实 Chromium 的菜单与模拟 API 交互已验收，真实后端与触屏软键盘仍需验收。

`*-INITIAL.md` 与首轮审计是历史材料：彼时尚不知道现有前端，后端也未取消投票窗口。当前实施以 PRD、DESIGN、界面与交互验证为准，不从历史稿恢复已撤销的无彩色限制、页码导航或七日投票期限。
