# Prompt Suite

## 目录目标

本目录保存 Investment Operating System 的 Prompt Suite。

Book 定义投资哲学、原则和决策标准。

Prompt Suite 定义这些原则如何被转化为结构化 AI 工作流。

Agent 层定义这些工作流的编排方式。

本目录只保存 prompt 层资产。

## 架构

Prompt Suite 遵循以下架构文档：

- [Prompt Suite Architecture](../docs/prompt-suite-architecture.md)

## 开发流程

prompt 变更应遵循：

```text
Architecture
↓
Issue
↓
Codex
↓
Pull Request
↓
Review
↓
Merge
↓
Release
```

不允许直接修改 `main`。

## 版本策略

Prompt Suite 使用独立版本策略：

- Patch：文案、格式、错别字或小型输出结构修正。
- Minor：新增 prompt、增加可选字段或扩展工作流。
- Major：改变架构、分类、标准模板或执行边界。

## Prompt 清单

- [daily-investment-report.md](daily-investment-report.md)
- [weekly-portfolio-report.md](weekly-portfolio-report.md)
- [market-opportunity-report.md](market-opportunity-report.md)
- [japan-opportunity-report.md](japan-opportunity-report.md)
- [portfolio-health-check.md](portfolio-health-check.md)
- [ipo-watch.md](ipo-watch.md)
