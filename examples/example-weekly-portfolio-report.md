# Weekly Portfolio Report Example

## Purpose

本 example 展示 Weekly Portfolio Report 如何处理一周组合复盘。

它的目标，是说明一周内的企业、估值、现金和风险变化进入 IOS 后，应如何形成未来 3-12 个月的组合维护判断。

本 example 不新增投资原则。

## Input

以下内容是示例输入，不是实时市场数据，也不是投资建议。

```text
示例输入：

- 日期或周期：2026-07-08 当周
- 投资者背景：生活在日本，使用新 NISA，十年以上投资期限，集中组合，质量优先。
- 当前问题：当前组合在未来 3-12 个月应该如何维护？
- 当前组合持仓：
  - Orion Compute：32%，AI Infrastructure 核心持仓。
  - Northstar Software：24%，企业软件核心持仓。
  - Sakura Automation：18%，日本工业自动化持仓。
  - Helio Cloud：11%，云平台观察型持仓。
  - 现金：15%。
- 新 NISA 状态：
  - 本年度仍有部分可用额度。
  - 投资者希望避免为了使用额度而降低研究标准。
- 本周主要变化：
  - Orion Compute 管理层确认未来两年资本开支继续上升，但长期客户需求仍强。
  - Northstar Software 公布续约率稳定，管理层维持自由现金流指引。
  - Sakura Automation 上调全年营业利润指引，但日元波动增加短期利润不确定性。
  - Helio Cloud 股价一周内上涨明显，但没有新的经营披露。
  - 现金比例因本月收入结余上升。
- 信息缺口：
  - Orion Compute 资本开支回报率仍需验证。
  - Sakura Automation 的利润率改善是否来自持续效率提升仍不清楚。
  - Helio Cloud 当前估值是否仍支持合理长期回报，需要重新检查。
```

## Prompt Used

本 example 使用已经存在的 prompt：

```text
Prompt:

prompts/weekly-portfolio-report.md
```

不得在 example 中改写该 prompt 的规则、输出结构或责任边界。

## Expected Output

预期输出应符合 Weekly Portfolio Report 的结构。

```text
预期输出应包括：

- 结论：组合整体仍可维护，但需要监控 Orion Compute 的资本开支回报率，并重新检查 Helio Cloud 估值。
- 关键判断：新资金不应自动分散到新机会，应优先比较现有高质量持仓；现金提供选择权；新 NISA 额度不应降低标准。
- 信息缺口：资本开支回报率、Sakura Automation 利润率质量、Helio Cloud 估值假设。
- 后续事项：更新研究笔记，检查估值假设，等待更多证据。
```

### 示例输出结构

```text
# Weekly Portfolio Report

## 1. 本周组合结论

- Orion Compute：继续持有，监控资本开支回报率。
- Northstar Software：继续持有，当前信息支持原有长期假设。
- Sakura Automation：更新假设，验证利润率改善质量。
- Helio Cloud：等待，重新检查估值假设。
- 现金与新 NISA：延后动作，保留选择权，不因额度存在而降低标准。

## 2. 持仓状态

- Orion Compute
  - 本周变化：资本开支继续上升，长期客户需求仍强。
  - 是否影响长期逻辑：暂不改变，但资本配置效率需要监控。
  - 是否影响估值假设：可能影响自由现金流节奏。
  - 是否影响组合角色：仍是 AI Infrastructure 核心持仓。
  - 建议状态：继续持有，监控风险。

- Northstar Software
  - 本周变化：续约率稳定，自由现金流指引维持。
  - 是否影响长期逻辑：支持原有企业质量判断。
  - 是否影响估值假设：暂不影响。
  - 是否影响组合角色：仍是企业软件核心持仓。
  - 建议状态：继续持有。

- Sakura Automation
  - 本周变化：上调全年营业利润指引。
  - 是否影响长期逻辑：可能改善盈利质量判断，但需要验证。
  - 是否影响估值假设：可能需要更新利润率假设。
  - 是否影响组合角色：仍是日本工业自动化持仓。
  - 建议状态：更新假设。

- Helio Cloud
  - 本周变化：价格上涨明显，但没有新的经营披露。
  - 是否影响长期逻辑：不影响。
  - 是否影响估值假设：需要重新检查长期回报空间。
  - 是否影响组合角色：仍是观察型持仓。
  - 建议状态：等待。

## 3. 资本配置判断

- 新资金不应自动投入新机会，应先比较已有高质量持仓。
- Orion Compute 权重较高，任何进一步投入都需要更清楚的资本开支回报证据。
- Northstar Software 的稳定性较好，但是否提高权重仍需要估值检查。
- Helio Cloud 缺少新经营事实，不应因为价格上涨而提高优先级。
- 现金仍提供选择权，适合延后动作。

## 4. 假设更新

- Orion Compute
  - 原假设：高资本开支可以扩大长期竞争优势。
  - 本周新信息：资本开支继续上升。
  - 是否需要修改：暂不修改，但需要提高监控优先级。
  - 下一步验证方式：跟踪资本开支回报率和客户需求持续性。

- Sakura Automation
  - 原假设：工业自动化需求支持长期利润改善。
  - 本周新信息：全年营业利润指引上调。
  - 是否需要修改：可能需要更新利润率假设。
  - 下一步验证方式：拆分汇率、成本控制和真实效率提升。

- Helio Cloud
  - 原假设：云平台仍处于观察阶段。
  - 本周新信息：价格上涨但无新经营披露。
  - 是否需要修改：不修改企业假设，重新检查估值假设。
  - 下一步验证方式：更新估值区间。

## 5. 风险监控

- 组合风险：Orion Compute 权重较高，资本开支判断错误会被仓位放大。
- 估值风险：Helio Cloud 价格变化可能降低未来回报空间。
- 行为风险：不要因为一周价格上涨而提高信心。
- 系统风险：日元波动可能影响 Sakura Automation 的短期利润表现。

## 6. 新 NISA 与现金

- 新 NISA 额度仍应服务长期免税复利。
- 不应为了使用额度而降低研究标准。
- 现金比例上升提供选择权。
- 当前更合理的处理方式是等待更多证据，而不是急于行动。

## 7. 延后动作

- 延后新增投入 Orion Compute。
  - 原因：资本开支回报率仍需验证。
  - 需要证据：客户需求持续性和自由现金流恢复路径。
  - 重新检查时间：下次财报或管理层更新后。

- 延后提高 Helio Cloud 优先级。
  - 原因：价格上涨没有对应的新经营事实。
  - 需要证据：收入质量、自由现金流和估值区间。
  - 重新检查时间：估值假设更新后。

## 8. 下周待办

- 更新 Orion Compute 资本开支监控项。
- 重新检查 Helio Cloud 估值假设。
- 拆分 Sakura Automation 利润率改善来源。
- 保留现金选择权。
- 等待更多证据。
```

## IOS Principles Applied

- 企业质量高于价格；
- 资本配置比选股更重要；
- 优秀企业优先加仓，但必须通过估值和风险边界检查；
- 新 NISA 应服务长期免税复利；
- 现金提供选择权；
- 短期价格变化不应替代长期判断。

## Why

该输入适合使用 Weekly Portfolio Report，因为它不是单日新闻过滤，而是一组会影响未来 3-12 个月组合维护的持仓、现金、估值和风险变化。

该输出不构成交易建议，因为它只使用 Weekly Portfolio Report 允许的动作语言：继续持有、等待、更新假设、监控风险和延后动作。

该 example 没有新增投资规则。它只展示已有 Weekly Portfolio Report 如何把组合状态、资本配置、风险监控和新 NISA 纪律放在一起。

该 example 没有扩大 prompt 责任范围。它不寻找新机会，不生成 Daily Investment Report，不进行完整 Portfolio Health Check，也不提供短期交易信号。

## Related Documents

```text
Book:

- book/04_资本配置.md
- book/05_组合管理.md
- book/06_风险管理.md
- book/07_执行与复盘.md

Prompt:

- prompts/weekly-portfolio-report.md

Template:

- 无
```
