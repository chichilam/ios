# Examples

## Purpose

本目录保存 Investment Operating System 的示例。

Examples 的目标，是展示 Book、Prompt Suite 和 Agent 层如何协同工作。

Examples 不定义新的投资原则。

Examples 不改变 prompt 行为。

Examples 不替代 Book、Prompt Suite 或任何模板。

## 使用边界

每个 example 必须只做一件事：

> 展示一个具体输入如何通过一个已存在的 prompt，形成符合 IOS 的输出。

Examples 可以展示：

- 如何准备输入；
- 使用哪个 prompt；
- 预期输出应具备什么结构；
- 输出背后应用了哪些 IOS 原则；
- 为什么该示例符合系统边界；
- 关联哪些 Book、Prompt Suite 或模板文件。

Examples 不可以：

- 新增投资哲学；
- 新增投资框架；
- 新增 prompt 功能；
- 修改 prompt 输出格式；
- 提供个股推荐；
- 形成实时市场观点；
- 替代正式研究、估值或组合决策。

## 标准结构

所有 examples 应遵循：

- [TEMPLATE.md](TEMPLATE.md)

标准 section 包括：

- Purpose；
- Input；
- Prompt Used；
- Expected Output；
- IOS Principles Applied；
- Why；
- Related Documents。

## 示例清单

- [Daily Investment Report Example](example-daily-investment-report-earnings-update.md)
- [Weekly Portfolio Report Example](example-weekly-portfolio-report.md)
- [Market Opportunity Report Example](example-market-opportunity-report.md)
- [Japan Opportunity Report Example](example-japan-opportunity-report.md)
- [Portfolio Health Check Example](example-portfolio-health-check.md)
- [IPO Watch Example](example-ipo-watch.md)

## 命名约定

文件命名应使用：

```text
example-<prompt-name>-<short-topic>.md
```

示例：

```text
example-daily-investment-report-earnings-update.md
example-weekly-portfolio-report-cash-allocation.md
example-ipo-watch-filing-review.md
```

文件名应保持英文、短横线和小写。

正文应使用简体中文。

## 写作要求

每个 example 必须：

- 明确标记输入是示例输入；
- 明确说明使用的 prompt；
- 只引用已经存在的 Book 原则和 Prompt Suite 规则；
- 保留信息不足时的处理方式；
- 避免把示例输出写成投资建议；
- 避免使用真实当下市场价格作为结论依据；
- 避免引入未被 Book 或 Prompt Suite 定义的新判断标准。

## v2.0 可执行示例

本节只是一个指路标——它不属于 `examples-v1.0.0` 冻结范围（上方所有内容是），也不改变 Examples 模块的边界；
它只是把这个目录里既有的 Prompt 层示例，和 v2.0 代码层的可执行示例区分开。

上方的示例展示的是**一个具体输入如何通过一个已存在的 prompt，形成符合 IOS 的输出**——纯文本、纯 prompt
层，不涉及任何代码执行。

v2.0（`ios/`）另有一套**可执行 Python 代码示例**，展示如何真正运行一个确定性研究 workflow、Agent
Runtime 的 dry-run CLI，或 Research Store 的持久化/备份/恢复流程——这些示例都可以从一份 fresh checkout
直接运行，不需要手工修改 import：

- [Quickstart](../docs/usage/quickstart.md)：一个最小、可直接运行的确定性 workflow 示例。
- [Workflow Guide](../docs/usage/workflow-guide.md)：更多 workflow 的调用方式。
- [Runtime and Approval](../docs/usage/runtime-and-approval.md)：Agent Runtime dry-run CLI 示例。
- [Persistence and Recovery](../docs/usage/persistence-and-recovery.md)：Research Store 持久化/备份/恢复/schema
  迁移操作 CLI 示例。

这些可执行示例本身不是投资研究结论，也不替代上方任何 Prompt 层示例——它们展示的是代码怎么跑，不是投资该怎么判断。

## Review Checklist

新增或修改 example 前，必须检查：

- 是否使用标准模板；
- 是否只展示一个 prompt 的使用；
- 是否没有改变 prompt 责任边界；
- 是否没有新增投资规则；
- 是否没有新增 prompt 功能；
- 是否没有提供短期交易建议；
- 是否正确标记示例输入和预期输出；
- 是否关联到正确的 Book、Prompt Suite 或模板文件。
