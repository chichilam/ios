# Japan Opportunity Report Example

## Purpose

本 example 展示 Japan Opportunity Report 如何评估日本上市股票机会。

它的目标，是说明日本机会进入 IOS 后，必须同时接受日本特定约束、企业质量、新 NISA 适配性、治理与资本配置，以及与现有日本持仓和全球核心持仓的比较。

本 example 不新增投资原则。

## Input

以下内容是示例输入，不是实时市场数据，也不是投资建议。

```text
示例输入：

- 日期或周期：2026-07-08
- 投资者背景：生活在日本，使用新 NISA，十年以上投资期限，集中组合，质量优先。
- 当前问题：是否存在明显优于加仓现有持仓的日本上市机会？
- 当前日本持仓：
  - Sakura Automation：日本工业自动化持仓，长期受益于工厂自动化，但利润率质量仍需验证。
- 当前全球核心持仓：
  - Orion Compute：AI Infrastructure 核心持仓，竞争优势强，权重较高。
  - Northstar Software：企业软件核心持仓，自由现金流质量高。
- 日本观察名单：
  - Kumo Factory Systems：工厂软件和传感器集成公司。
  - Mirai Trading Group：商社型资本配置公司。
  - Hikari Materials：先进材料供应商。
- 日本市场背景：
  - 日本企业治理改善仍在推进。
  - 部分工业企业提高分红和回购。
  - 日元波动增加海外收入折算不确定性。
- 待评估候选：
  - Kumo Factory Systems：订单增长稳定，开始披露工业软件订阅收入。
  - Mirai Trading Group：提高回购计划，但资产组合透明度一般。
  - Hikari Materials：受益于半导体材料需求，但资本开支周期较强。
- 日本特定约束：
  - 新 NISA 剩余额度有限。
  - Kumo Factory Systems 交易单位导致单笔最低买入金额偏高。
  - Mirai Trading Group 流动性较好，但利润受商品周期影响。
  - Hikari Materials 受日元和半导体周期影响较大。
- 信息缺口：
  - Kumo Factory Systems 软件收入留存率和毛利率。
  - Mirai Trading Group 回购是否在合理估值下执行。
  - Hikari Materials 新产能资本回报率。
```

## Prompt Used

本 example 使用已经存在的 prompt：

```text
Prompt:

prompts/japan-opportunity-report.md
```

不得在 example 中改写该 prompt 的规则、输出结构或责任边界。

## Expected Output

预期输出应符合 Japan Opportunity Report 的结构。

```text
预期输出应包括：

- 结论：暂无足够证据证明日本候选明显优于现有日本持仓或全球核心持仓。
- 关键判断：Kumo Factory Systems 可启动研究；Mirai Trading Group 加入日本观察名单；Hikari Materials 因周期和资本开支证据不足延后。
- 信息缺口：软件留存率、回购纪律、资本回报率、交易单位影响。
- 后续事项：与 Sakura Automation 和全球核心持仓比较，等待更多证据。
```

### 示例输出结构

```text
# Japan Opportunity Report

## 1. 日本机会结论

- 暂无足够证据证明该日本机会值得优先占用研究时间或新 NISA 额度。
- Kumo Factory Systems 可以启动研究，但需验证软件收入质量和交易单位影响。
- Mirai Trading Group 可以加入日本观察名单，但回购和资产组合质量仍需验证。
- Hikari Materials 因证据不足延后，半导体材料需求不能单独构成长期机会。
- 继续关注当前持仓，并与全球核心持仓比较资本机会成本。

## 2. 候选机会

- Kumo Factory Systems
  - 股票代码：示例代码 1001。
  - 所属市场：日本上市市场。
  - 所属行业：工厂软件与传感器集成。
  - 所处价值链位置：工业自动化数据层。
  - 机会来源：工业软件订阅收入披露。
  - 触发关注的事实：订单增长稳定。
  - 初步判断：可能值得研究。
  - 当前状态：启动研究。

- Mirai Trading Group
  - 股票代码：示例代码 2002。
  - 所属市场：日本上市市场。
  - 所属行业：商社型资本配置。
  - 所处价值链位置：贸易、投资和资产配置。
  - 机会来源：提高回购计划。
  - 触发关注的事实：股东回报改善。
  - 初步判断：治理改善是加分项，但不是充分条件。
  - 当前状态：观察。

- Hikari Materials
  - 股票代码：示例代码 3003。
  - 所属市场：日本上市市场。
  - 所属行业：半导体材料。
  - 所处价值链位置：先进材料供应。
  - 机会来源：半导体材料需求增长。
  - 触发关注的事实：新产能建设。
  - 初步判断：周期和资本开支风险仍需验证。
  - 当前状态：延后。

## 3. 日本特定约束

| 约束 | 需要回答的问题 |
| --- | --- |
| 新 NISA | 三个候选都尚未证明值得占用长期免税额度 |
| 交易单位 | Kumo Factory Systems 单笔最低买入金额偏高，可能影响仓位管理 |
| 流动性 | Mirai Trading Group 流动性较好，其他候选需继续检查 |
| 汇率 | 日元波动会影响海外收入和材料周期公司利润 |
| 利率与通胀 | 工资和投入成本可能影响工业企业利润率 |
| 公司治理 | Mirai Trading Group 的治理改善需要验证持续性 |
| 股东回报 | 回购和分红必须由自由现金流支持 |
| 产业政策 | 工业升级和供应链安全是背景，不是投资结论 |
| 供应链位置 | Hikari Materials 需要证明材料环节具备全球竞争力 |

## 4. 企业质量评估

- Kumo Factory Systems
  - 已知事实：订单增长稳定，开始披露软件订阅收入。
  - 初步判断：如果软件收入具备留存和定价权，企业质量可能改善。
  - 与全球优秀企业相比：仍缺少留存率、毛利率和自由现金流证据。
  - 仍需验证：软件收入质量、交易单位导致的仓位约束。

- Mirai Trading Group
  - 已知事实：提高回购计划。
  - 初步判断：股东回报改善值得记录，但资产组合透明度一般。
  - 与全球优秀企业相比：资本配置记录需要更长周期验证。
  - 仍需验证：回购价格、资产组合质量、ROIC 改善持续性。

- Hikari Materials
  - 已知事实：受益于半导体材料需求和新产能建设。
  - 初步判断：价值链位置可能重要，但周期性强。
  - 与全球优秀企业相比：资本开支回报率和定价权证据不足。
  - 仍需验证：新产能利用率、客户集中度、自由现金流。

## 5. 治理与资本配置

- Kumo Factory Systems：需要确认管理层是否把软件收入转化为更高资本效率。
- Mirai Trading Group：治理改善和回购是加分项，但必须验证是否在合理估值下执行。
- Hikari Materials：资本开支较重，需要验证是否能带来高质量回报。

治理改善不能替代企业质量。

## 6. 与现有持仓比较

| 维度 | 日本候选 | 现有日本持仓 | 全球核心持仓 | 初步结论 |
| --- | --- | --- | --- | --- |
| 企业质量 | Kumo 可能改善 | Sakura 自动化基础更清楚 | Northstar 现金流质量更高 | Kumo 值得研究但未胜出 |
| 竞争优势 | Hikari 需证明材料优势 | Sakura 客户基础较清楚 | Orion 优势更明确 | Hikari 信息不足 |
| 管理层 | Mirai 需验证资本配置 | Sakura 执行记录可跟踪 | 全球核心更成熟 | Mirai 先观察 |
| 资本配置 | 回购和资本开支需验证 | Sakura 仍需验证利润率质量 | Orion 和 Northstar 记录更完整 | 全球核心仍更清楚 |
| 自由现金流 | 候选证据不足 | Sakura 需继续跟踪 | Northstar 更强 | 不应优先占用资本 |
| 长期成长 | 日本工业升级支持主题 | Sakura 已表达该主题 | 全球核心成长路径更清楚 | 候选未明显更优 |
| 估值 | 需建立估值区间 | Sakura 已在研究框架内 | 全球核心已有假设 | 信息不足 |
| 新 NISA 适配性 | 交易单位和证据不足 | Sakura 已在跟踪 | 全球核心机会成本高 | 暂不占用额度 |
| 理解深度 | 新候选理解较浅 | Sakura 理解更深 | 全球核心更成熟 | 先研究 |
| 组合角色 | 未定义 | Sakura 是日本工业持仓 | 全球核心是核心复利资产 | 候选暂不替代 |

比较结论：

- Kumo Factory Systems 值得启动研究，但尚未优于 Sakura Automation 或全球核心持仓。
- Mirai Trading Group 的股东回报改善值得观察，但不能替代企业质量。
- Hikari Materials 需要更多资本回报和周期风险证据。

## 7. 新 NISA 适配性

- 新 NISA 是长期免税复利账户，不适合承接证据不足的候选。
- Kumo Factory Systems 的交易单位可能导致单笔仓位过大，需要先评估执行约束。
- Mirai Trading Group 不能因为回购和分红提高就直接进入新 NISA。
- Hikari Materials 的周期和资本开支风险需要先验证。
- 当前结论是先研究和观察，不直接进入行动阶段。

## 8. 风险与排除理由

- Kumo Factory Systems
  - 风险：软件收入质量、交易单位、自由现金流证据不足。
  - 延后理由：尚未证明优于 Sakura Automation。

- Mirai Trading Group
  - 风险：资产组合透明度、回购纪律、商品周期。
  - 延后理由：治理改善不能替代企业质量。

- Hikari Materials
  - 风险：周期、资本开支、客户集中度。
  - 延后理由：证据不足，且与全球核心持仓相比没有明显优势。

## 9. 下一步

- Kumo Factory Systems：启动研究。
- Mirai Trading Group：加入日本观察名单。
- Hikari Materials：因证据不足延后。
- 与 Sakura Automation 继续比较。
- 与全球核心持仓比较资本机会成本。
- 等待更多证据。
```

## IOS Principles Applied

- 企业质量高于价格；
- 日本机会必须接受全球标准；
- 治理改善是加分项，不是充分条件；
- 资本配置比选股更重要；
- 新 NISA 应服务长期免税复利；
- 日本投资必须服务整体组合；
- 估值必须建立在企业质量之后。

## Why

该输入适合使用 Japan Opportunity Report，因为它面对的是日本上市候选公司，并且需要同时处理新 NISA、交易单位、治理改善、股东回报、日元和日本市场结构。

该输出不构成交易建议，因为它只使用 Japan Opportunity Report 允许的判断语言：启动研究、加入日本观察名单、因证据不足延后、继续比较。

该 example 没有新增投资规则。它只展示已有 Japan Opportunity Report 如何让日本机会接受 IOS 顺序、全球标准和组合比较。

该 example 没有扩大 prompt 责任范围。它不生成一般 Market Opportunity Report，不做 Weekly Portfolio Report，不进行组合健康审计，也不提供短期交易信号。

## Related Documents

```text
Book:

- book/04_资本配置.md
- book/05_组合管理.md
- book/08_研究体系.md
- book/13_日本投资.md

Prompt:

- prompts/japan-opportunity-report.md

Template:

- 无
```
