# Market Opportunity Report Example

## Purpose

本 example 展示 Market Opportunity Report 如何比较新机会与现有持仓。

它的目标，是说明新机会进入 IOS 后，不能因为题材新、市场关注度高或估值看起来便宜就直接进入组合，而必须先回答：

> 是否明显优于继续加仓现有持仓？

本 example 不新增投资原则。

## Input

以下内容是示例输入，不是实时市场数据，也不是投资建议。

```text
示例输入：

- 日期或周期：2026-07-08
- 投资者背景：生活在日本，使用新 NISA，十年以上投资期限，集中组合，质量优先。
- 当前问题：是否存在明显优于加仓现有持仓的新投资机会？
- 当前组合中可继续加仓的高质量持仓：
  - Orion Compute：AI Infrastructure 核心持仓，竞争优势强，权重较高，估值需要持续检查。
  - Northstar Software：企业软件核心持仓，续约率稳定，自由现金流质量高。
  - Sakura Automation：日本工业自动化持仓，受益于长期工业升级，但利润率质量仍需验证。
- 当前观察名单：
  - Helio Cloud：云平台观察型公司，估值假设需要更新。
- 新机会范围：
  - Vector Robotics：工业机器人零部件供应商，受益于工厂自动化主题。
  - Atlas Cybersecurity：企业安全软件公司，近期客户增长较快。
  - QuantumGrid Power：数据中心电力基础设施公司，市场关注度快速上升。
- 已知事实：
  - Vector Robotics 的订单增长较快，但客户集中度高，尚未披露自由现金流质量。
  - Atlas Cybersecurity 收入增长稳定，留存率较高，但估值已经反映较乐观成长预期。
  - QuantumGrid Power 获得大型数据中心客户意向订单，但订单是否具有约束力不清楚。
- 信息缺口：
  - Vector Robotics 的自由现金流和客户续约质量。
  - Atlas Cybersecurity 的长期利润率和估值安全边际。
  - QuantumGrid Power 的订单条款、资本开支需求和竞争优势来源。
- 新 NISA 约束：
  - 剩余额度有限，不应为了增加新主题而降低标准。
```

## Prompt Used

本 example 使用已经存在的 prompt：

```text
Prompt:

prompts/market-opportunity-report.md
```

不得在 example 中改写该 prompt 的规则、输出结构或责任边界。

## Expected Output

预期输出应符合 Market Opportunity Report 的结构。

```text
预期输出应包括：

- 结论：暂无足够证据证明新机会明显优于继续加仓现有持仓。
- 关键判断：Atlas Cybersecurity 可启动研究；Vector Robotics 加入观察名单；QuantumGrid Power 因证据不足延后。
- 信息缺口：自由现金流、订单约束力、估值安全边际、客户集中度。
- 后续事项：与现有持仓比较，等待更多证据，不形成交易指令。
```

### 示例输出结构

```text
# Market Opportunity Report

## 1. 机会结论

- 暂无足够证据证明新机会优于继续加仓现有持仓。
- Atlas Cybersecurity 可以启动研究，但还不能判断明显优于 Northstar Software。
- Vector Robotics 可以加入观察名单，但客户集中度和自由现金流证据不足。
- QuantumGrid Power 因证据不足延后，意向订单不能替代长期竞争优势。
- 继续优先比较现有高质量持仓，不因新主题扩散资本。

## 2. 新机会候选

- Vector Robotics
  - 所属行业：工业机器人零部件。
  - 所处价值链位置：自动化硬件供应链。
  - 机会来源：工厂自动化需求增长。
  - 触发关注的事实：订单增长较快。
  - 初步判断：有长期主题相关性，但证据不足。
  - 当前状态：加入观察名单。

- Atlas Cybersecurity
  - 所属行业：企业安全软件。
  - 所处价值链位置：企业软件与安全基础设施。
  - 机会来源：客户增长和留存率改善。
  - 触发关注的事实：收入增长稳定，留存率较高。
  - 初步判断：质量可能较高，值得研究。
  - 当前状态：启动研究。

- QuantumGrid Power
  - 所属行业：数据中心电力基础设施。
  - 所处价值链位置：AI Infrastructure 配套电力层。
  - 机会来源：大型数据中心客户意向订单。
  - 触发关注的事实：市场关注度快速上升。
  - 初步判断：意向订单不等于长期竞争优势。
  - 当前状态：延后。

## 3. 与现有持仓比较

| 维度 | 新机会 | 现有持仓 | 初步结论 |
| --- | --- | --- | --- |
| 企业质量 | Atlas Cybersecurity 留存率较高 | Northstar Software 自由现金流质量更清楚 | Atlas 值得研究，但未明显更优 |
| 竞争优势 | Vector Robotics 客户集中度高 | Sakura Automation 工业客户基础更清楚 | Vector 不足以替代 Sakura |
| 管理层 | QuantumGrid Power 管理层资料不足 | Orion Compute 资本配置记录更完整 | QuantumGrid 信息不足 |
| 资本配置 | 新机会均缺少完整资本配置证据 | 现有持仓已有可复盘记录 | 现有持仓优先 |
| 自由现金流 | Vector 和 QuantumGrid 信息不足 | Northstar Software 现金流质量高 | 新机会未胜出 |
| 长期成长 | 三个候选均有主题支持 | Orion 和 Northstar 的成长路径更清楚 | 需要更多证据 |
| 估值 | Atlas 估值较乐观 | 现有持仓估值假设已建立 | Atlas 需建立估值区间 |
| 理解深度 | 新机会理解仍浅 | 现有持仓研究更完整 | 不应分散资本 |
| 组合角色 | 新机会角色未定义 | 现有持仓角色明确 | 新机会先留在研究管线 |
| 风险边界 | 多个关键风险未验证 | 现有持仓风险更可跟踪 | 暂不升级 |

比较结论：

- 新机会尚未明显优于继续加仓已有持仓。
- 如果没有明显更优证据，扩大组合复杂度没有必要。
- Atlas Cybersecurity 需要补充估值、安全边际和自由现金流证据。
- Vector Robotics 和 QuantumGrid Power 需要更多企业质量证据。

## 4. 机会质量评估

- Vector Robotics
  - 已知事实：订单增长较快。
  - 初步判断：产业趋势存在，但客户集中度和现金流质量不足。
  - 仍需验证：客户续约、毛利率、自由现金流。

- Atlas Cybersecurity
  - 已知事实：收入增长稳定，留存率较高。
  - 初步判断：可能具备较好企业质量。
  - 仍需验证：长期利润率、估值区间、竞争优势持续性。

- QuantumGrid Power
  - 已知事实：获得大型客户意向订单。
  - 初步判断：价值链位置可能重要，但证据不充分。
  - 仍需验证：订单约束力、资本开支需求、竞争优势来源。

## 5. 证据与信息缺口

- Vector Robotics：自由现金流是否可持续，客户集中度是否可承受。
- Atlas Cybersecurity：当前估值是否保留长期回报空间。
- QuantumGrid Power：意向订单是否具有约束力，资本开支是否会压低长期回报。
- 所有候选：是否比现有高质量持仓具备明显优势。

信息不足，不能进入投资结论。

## 6. 新 NISA 与资本约束

- 新 NISA 剩余额度有限，不应被证据不足的新机会占用。
- Atlas Cybersecurity 即使启动研究，也应先建立估值区间和竞争优势证据。
- Vector Robotics 和 QuantumGrid Power 应先停留在观察或延后状态。
- 当前更合理的资本约束判断，是继续优先比较现有高质量持仓。

## 7. 风险与排除理由

- Vector Robotics
  - 风险：客户集中度、自由现金流质量不足。
  - 排除或延后理由：与 Sakura Automation 相比没有明显优势。

- Atlas Cybersecurity
  - 风险：估值已经反映乐观成长预期。
  - 排除或延后理由：尚未证明优于 Northstar Software。

- QuantumGrid Power
  - 风险：意向订单、资本开支和竞争优势均未验证。
  - 排除或延后理由：证据不足。

## 8. 下一步

- Atlas Cybersecurity：启动研究。
- Vector Robotics：加入观察名单。
- QuantumGrid Power：因证据不足延后。
- 继续优先比较现有持仓。
- 等待更多证据。
```

## IOS Principles Applied

- 企业质量高于价格；
- 产业决定公司，公司决定股价；
- 资本配置比选股更重要；
- 新机会不天然优于老持仓；
- 观察名单不等于组合；
- 新 NISA 应服务长期免税复利；
- 估值必须建立在企业质量之后。

## Why

该输入适合使用 Market Opportunity Report，因为它面对的是多个新机会候选，核心问题不是维护当前组合，而是判断它们是否明显优于继续加仓现有持仓。

该输出不构成交易建议，因为它只使用 Market Opportunity Report 允许的判断语言：加入观察名单、启动研究、因证据不足延后、继续优先比较现有持仓。

该 example 没有新增投资规则。它只展示已有 Market Opportunity Report 如何把新机会放入 IOS 顺序中，并与现有持仓比较。

该 example 没有扩大 prompt 责任范围。它不生成 Weekly Portfolio Report，不做日本专项筛选，不进行组合健康审计，也不提供短期交易信号。

## Related Documents

```text
Book:

- book/04_资本配置.md
- book/05_组合管理.md
- book/08_研究体系.md
- book/10_估值框架.md

Prompt:

- prompts/market-opportunity-report.md

Template:

- 无
```
