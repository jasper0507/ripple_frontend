# Domain Docs

采用 single-context 布局：

- CONTEXT.md：根目录的领域术语与模型。
- docs/adr/：架构决策记录。

## 探索前读取

读取 CONTEXT.md，以及 docs/adr/ 中与当前任务相关的决策。

文件不存在时直接继续；由 domain-modeling 技能在术语或决策明确后
按需创建。

## 术语一致性

Issue、方案、假设和测试中的领域概念使用 CONTEXT.md 定义的名称。
遇到缺失术语时，先确认是否已有对应概念；确有缺口则交给
domain-modeling 补充。

## ADR 冲突

方案与现有 ADR 冲突时，明确指出 ADR 编号、冲突内容和重新讨论的理由。
