# Issue tracker: GitHub

Issue 和规格存放在 https://github.com/jasper0507/ripple_frontend/issues。

## 操作约定

使用 gh CLI。所有 gh issue / gh pr 命令显式指定
`--repo jasper0507/ripple_frontend`；
gh api 路径使用 `repos/jasper0507/ripple_frontend/`。

- 创建：gh issue create，提供 --title 和 --body-file。
- 读取：gh issue view <number> --comments；需要结构化数据时使用 --json。
- 列举：gh issue list --state open，按需指定 --label 和 --json。
- 评论：gh issue comment <number> --body-file <file>。
- 标签：gh issue edit <number> --add-label / --remove-label。
- 关闭：gh issue close <number>。

多行正文先写入临时文件，再通过 --body-file 提交。
标签映射见 `triage-labels.md`。

## Pull requests as a triage surface

**PRs as a request surface: no.**

GitHub 的 Issue 与 PR 共用编号空间。引用类型不明确时，
先确认类型，再使用对应命令。

## 技能用语

- “publish to the issue tracker”：创建 GitHub Issue。
- “fetch the relevant ticket”：读取对应 Issue 及其评论。

## Wayfinding operations

- Map：使用带有 wayfinder:map 标签的 Issue，记录 Notes、
  Decisions-so-far 和 Fog。
- Child ticket：使用 GitHub 子 Issue；不可用时，在 Map 正文维护任务列表，
  并在子 Issue 正文开头注明 Part of #<map>。
- 类型：使用 wayfinder:research、wayfinder:prototype、
  wayfinder:grilling 或 wayfinder:task 标签。
- 阻塞关系：使用 GitHub 原生 Issue 依赖；不可用时，在正文开头记录
  Blocked by: #<number>。所有阻塞项关闭后才可开始。
- Frontier：按 Map 顺序选择尚未关闭、无未解决阻塞且无人认领的子 Issue。
- Claim：开始工作前，将 Issue 指派给执行者。
- Resolve：评论回答并关闭 Issue，再将摘要和链接补充到 Map 的 Decisions-so-far。
