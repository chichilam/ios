# Portfolio Health Check Example

## Purpose

本 example 展示 Portfolio Health Check 如何对当前组合做周期性健康审计。

它的目标，是说明组合健康检查不是周度行动计划，也不是寻找新机会，而是判断组合是否仍然符合 IOS、是否适合长期复利和新 NISA 纪律。

本 example 不新增投资原则。

## Input

以下内容是示例输入，不是实时市场数据，也不是投资建议。

```text
示例输入：

- 日期或周期：2026-07-08 季度组合健康检查
- 投资者背景：生活在日本，使用新 NISA，十年以上投资期限，集中组合，质量优先。
- 当前问题：当前组合是否仍然健康，并且符合 IOS？
- 当前全部持仓：
  - Orion Compute：34%，AI Infrastructure 核心持仓。
  - Northstar Software：25%，企业软件核心持仓。
  - Sakura Automation：17%，日本工业自动化持仓。
  - Helio Cloud：9%，云平台观察型持仓。
  - Atlas Cybersecurity：5%，研究型小仓位。
  - 现金：10%。
- 新 NISA 状态：
  - 核心额度主要由 Orion Compute、Northstar Software 和 Sakura Automation 占用。
  - 剩余额度有限。
- 原始持仓角色：
  - Orion Compute：长期 AI Infrastructure 核心复利资产。
  - Northstar Software：现金流质量稳定的企业软件核心资产。
  - Sakura Automation：日本工业升级和新 NISA 本土机会表达。
  - Helio Cloud：观察型云平台，不应成为核心仓位。
  - Atlas Cybersecurity：研究型仓位，用于跟踪安全软件机会。
- 假设变化：
  - Orion Compute 的资本开支强度继续上升。
  - Northstar Software 的续约率和自由现金流仍稳定。
  - Sakura Automation 的利润改善部分来自日元因素，真实效率提升仍需验证。
  - Helio Cloud 上涨后，持有理由开始从“研究观察”变成“怕错过”。
  - Atlas Cybersecurity 研究笔记尚未完成。
- 组合结构：
  - 前两大持仓合计 59%。
  - AI Infrastructure、Cloud 和 Enterprise Software 暴露合计较高。
  - 日元和美元资产同时存在。
- 行为风险信号：
  - 投资者想用剩余新 NISA 额度买入 Helio Cloud，因为近期表现较强。
  - 投资者对 Atlas Cybersecurity 的理解仍不充分，但不想错过安全软件主题。
- 信息缺口：
  - Orion Compute 资本开支回报率。
  - Sakura Automation 利润改善质量。
  - Helio Cloud 估值区间。
  - Atlas Cybersecurity 正式研究笔记。
```

## Prompt Used

本 example 使用已经存在的 prompt：

```text
Prompt:

prompts/portfolio-health-check.md
```

不得在 example 中改写该 prompt 的规则、输出结构或责任边界。

## Expected Output

预期输出应符合 Portfolio Health Check 的结构。

```text
预期输出应包括：

- 结论：组合整体仍有核心质量，但需要监控集中风险、复核部分假设，并记录行为风险。
- 关键判断：Orion Compute 和 Northstar Software 角色清晰；Helio Cloud 和 Atlas Cybersecurity 的角色需要复核；新 NISA 机会成本上升。
- 信息缺口：资本开支回报率、利润改善质量、估值区间、研究笔记。
- 后续事项：复核假设、检查风险集中、检查新 NISA 机会成本，不输出交易指令。
```

### 示例输出结构

```text
# Portfolio Health Check

## 1. 组合健康结论

- 组合仍有高质量核心资产，但集中风险需要关注。
- Orion Compute 需要监控资本开支回报率。
- Helio Cloud 出现持仓理由漂移，需要复核假设。
- Atlas Cybersecurity 持仓角色不清晰，需要后续研究。
- 新 NISA 机会成本上升，剩余额度不应被理解不足的资产占用。

## 2. 持仓角色审计

- Orion Compute
  - 当前角色：AI Infrastructure 核心持仓。
  - 原始投资假设：长期需求和竞争优势支持复利。
  - 当前实际状态：需求仍强，但资本开支强度上升。
  - 仓位是否匹配信念：基本匹配。
  - 仓位是否匹配风险边界：需要监控。
  - 是否仍符合 IOS 顺序：暂时符合，但资本配置和自由现金流需复核。
  - 健康状态：需要监控。

- Northstar Software
  - 当前角色：企业软件核心持仓。
  - 原始投资假设：续约率稳定，自由现金流质量高。
  - 当前实际状态：续约率和现金流仍稳定。
  - 仓位是否匹配信念：匹配。
  - 仓位是否匹配风险边界：匹配。
  - 是否仍符合 IOS 顺序：符合。
  - 健康状态：健康。

- Sakura Automation
  - 当前角色：日本工业自动化持仓。
  - 原始投资假设：工业升级支持长期利润改善。
  - 当前实际状态：利润改善部分可能来自日元因素。
  - 仓位是否匹配信念：基本匹配。
  - 仓位是否匹配风险边界：需要复核。
  - 是否仍符合 IOS 顺序：需要验证自由现金流和利润质量。
  - 健康状态：需要复核假设。

- Helio Cloud
  - 当前角色：云平台观察型持仓。
  - 原始投资假设：观察业务质量和估值区间。
  - 当前实际状态：持有理由开始转向“怕错过”。
  - 仓位是否匹配信念：不完全匹配。
  - 仓位是否匹配风险边界：需要复核。
  - 是否仍符合 IOS 顺序：行为纪律需要检查。
  - 健康状态：角色不清晰。

- Atlas Cybersecurity
  - 当前角色：研究型小仓位。
  - 原始投资假设：跟踪安全软件长期机会。
  - 当前实际状态：研究笔记尚未完成。
  - 仓位是否匹配信念：信念不足。
  - 仓位是否匹配风险边界：仓位小，但理解不足。
  - 是否仍符合 IOS 顺序：信息不足。
  - 健康状态：信息不足。

## 3. 组合结构审计

| 项目 | 需要回答的问题 |
| --- | --- |
| 集中度 | 前两大持仓合计 59%，集中建立在核心质量上，但 Orion Compute 风险会被放大 |
| 仓位表达 | Northstar Software 和 Orion Compute 表达清楚，Atlas 表达不清楚 |
| 现金 | 10% 现金提供选择权 |
| 行业暴露 | AI Infrastructure、Cloud 和 Enterprise Software 暴露较高 |
| 主题暴露 | 数字基础设施主题重复，需要监控 |
| 地区暴露 | 同时持有全球和日本资产，地区分散存在但需看风险来源 |
| 货币暴露 | 日元和美元资产并存，汇率会影响短期表现 |
| 重复暴露 | Orion、Helio 和 Atlas 可能都依赖企业技术支出周期 |

组合并非因为集中而不健康，但集中必须建立在理解、质量和纪律之上。

## 4. 假设漂移审计

- Orion Compute
  - 原始假设：资本开支扩大长期竞争优势。
  - 当前事实：资本开支强度继续上升。
  - 判断：假设未漂移，但资本配置效率需要复核。

- Sakura Automation
  - 原始假设：工业升级带来持续利润改善。
  - 当前事实：部分改善可能来自日元因素。
  - 判断：需要复核假设，区分经营改善和汇率影响。

- Helio Cloud
  - 原始假设：观察业务质量和估值。
  - 当前事实：持有理由变成怕错过近期表现。
  - 判断：投资假设出现漂移。

- Atlas Cybersecurity
  - 原始假设：研究安全软件机会。
  - 当前事实：研究笔记尚未完成。
  - 判断：角色不清晰，信息不足。

## 5. 风险集中审计

- 企业风险：Orion Compute 的资本开支回报率仍需验证。
- 估值风险：Helio Cloud 缺少更新后的估值区间。
- 组合风险：前两大持仓占比较高，核心判断错误会被放大。
- 行为风险：投资者可能因近期表现和剩余新 NISA 额度而急于行动。
- 系统风险：企业技术支出周期可能同时影响多个持仓。

这些风险目前不应直接转化为交易动作，因为健康检查先诊断系统问题，再安排后续研究。

## 6. 新 NISA 纪律审计

- 新 NISA 额度主要由核心资产占用，整体方向合理。
- 剩余额度有限，机会成本上升。
- Helio Cloud 和 Atlas Cybersecurity 尚未证明适合占用长期免税额度。
- 不应因为税收优势或剩余额度存在而降低研究标准。
- 新 NISA 应继续服务长期免税复利，而不是追逐近期表现。

## 7. 行为风险审计

- 因 Helio Cloud 近期表现较强而想使用新 NISA 额度，属于行为风险。
- 对 Atlas Cybersecurity 理解不足但担心错过主题，属于行为风险。
- 把观察型持仓惯性误认为长期信念，属于行为风险。
- 这些行为风险需要记录，但不能包装成市场判断。

## 8. 跟进事项

- 继续监控 Orion Compute 资本开支回报率。
- 复核 Sakura Automation 利润改善质量。
- 复核 Helio Cloud 持仓角色和估值假设。
- 为 Atlas Cybersecurity 补完研究笔记。
- 检查风险集中。
- 检查新 NISA 机会成本。
- 不输出买入、卖出、加仓或减仓指令。
```

## IOS Principles Applied

- 企业质量高于价格；
- 组合管理要让仓位和判断一致；
- 集中不是错误，但必须建立在理解和纪律之上；
- 风险管理的目标是避免破坏长期复利的错误；
- 行为风险必须被记录和控制；
- 新 NISA 应服务长期免税复利；
- 估值必须建立在企业质量之后。

## Why

该输入适合使用 Portfolio Health Check，因为它不是一周行动计划，也不是新机会筛选，而是周期性检查组合是否仍然健康、是否仍符合 IOS。

该输出不构成交易建议，因为它只使用 Portfolio Health Check 允许的诊断语言：需要监控、需要复核假设、集中风险需要关注、投资假设出现漂移、持仓角色不清晰、存在行为风险。

该 example 没有新增投资规则。它只展示已有 Portfolio Health Check 如何审计持仓角色、组合结构、假设漂移、风险集中、新 NISA 纪律和行为风险。

该 example 没有扩大 prompt 责任范围。它不生成 Weekly Portfolio Report，不寻找新机会，不生成 Market Opportunity Report，也不提供短期交易信号。

## Related Documents

```text
Book:

- book/05_组合管理.md
- book/06_风险管理.md
- book/13_日本投资.md

Prompt:

- prompts/portfolio-health-check.md

Template:

- 无
```
