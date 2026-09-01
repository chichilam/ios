# Portfolio Health Agent

## 目的

本文定义 Investment Operating System 的 Portfolio Health Agent。

Portfolio Health Agent 的目标，是在不改变 Portfolio Health Check prompt 的前提下，完成独立的单 prompt 编排流程。

它负责识别组合健康审计任务、选择既有 prompt、校验输入、记录信息缺口、保存 prompt 输出，并在输出之外添加 Agent 元数据。

本文是规格说明。

它不实现调度器。

它不实现记忆系统。

它不实现工作流引擎。

它不调用其他 Agent。

它不改变 prompt 行为。

它不生成交易执行。

---

## 架构位置

Portfolio Health Agent 位于 Agent 层。

它只编排既有 Prompt Suite，不拥有新的投资原则。

```text
Book
↓
Prompt Suite
↓
Examples
↓
Agent
↓
Portfolio Health Agent
```

Portfolio Health Agent 的唯一主 prompt 是：

```text
prompts/portfolio-health-check.md
```

Portfolio Health Agent 独立运行。

Portfolio Health Agent 不依赖 Daily Agent。

Portfolio Health Agent 不依赖 Weekly Agent。

Portfolio Health Agent 不依赖 Market Opportunity Agent。

Portfolio Health Agent 不调用第二个 prompt。

Portfolio Health Agent 不把组合健康审计扩展为周度组合维护、新机会比较、日本专项机会筛选或 IPO 监控。

---

## 核心问题

Portfolio Health Agent 只回答一个问题：

> 当前组合是否仍然健康，并且符合 Investment Operating System？

这个问题包含三个约束：

- 先诊断组合健康，再记录跟进事项；
- 关注系统一致性，而不是下一周行动计划；
- 输出组合诊断，不输出交易执行。

Portfolio Health Agent 不判断本周应该如何维护组合。

它也不寻找新的投资机会。

---

## 适用任务

适用输入包括：

- 检查日期或检查周期；
- 当前全部持仓；
- 每个持仓的目标角色；
- 每个持仓的实际仓位和权重；
- 当前现金比例；
- 新 NISA 已使用额度和剩余额度；
- 最近新增、加仓、减仓或清仓记录；
- 组合集中度；
- 行业和主题暴露；
- 地区暴露；
- 货币暴露；
- 相关性或重复风险暴露；
- 每个持仓的投资假设；
- 投资假设变化；
- 估值变化；
- 企业质量恶化信号；
- 风险集中情况；
- 行为风险信号；
- 上一次组合健康检查记录；
- 上一次遗留待办事项。

不适用任务包括：

- 每日信息过滤；
- 周度组合行动计划；
- 新投资机会比较；
- 日本市场专项机会筛选；
- IPO 前研究；
- 短期价格预测；
- 交易执行。

如果输入任务超出 Portfolio Health Agent 范围，Portfolio Health Agent 只记录边界不匹配，并把事项列入后续处理。

---

## 单 prompt 边界

Portfolio Health Agent 必须遵守以下边界：

| 项目 | 规则 |
| --- | --- |
| 主 prompt | 只能使用 Portfolio Health Check |
| prompt 数量 | 只能使用一个主 prompt |
| Agent 数量 | 只能运行 Portfolio Health Agent 本身 |
| 输出结构 | 保留 Portfolio Health Check 原始输出结构 |
| 输出性质 | 输出组合诊断，而不是行动计划 |
| 投资判断 | 不新增 prompt 之外的投资判断 |
| 交易动作 | 不生成买入、卖出、加仓、减仓指令 |
| 信息不足 | 明确记录信息缺口，不补全事实 |
| 人工复核 | 对假设漂移、角色不清、风险集中或行为风险标记人工复核状态 |

Portfolio Health Agent 可以在 prompt 输出之外增加元数据。

Portfolio Health Agent 不得改写 prompt 输出本身。

---

## 输入要求

Portfolio Health Agent 的输入分为三类。

### 1. 必要输入

| 字段 | 说明 |
| --- | --- |
| 检查日期或周期 | 组合健康审计对应时间范围 |
| 任务类型 | 必须为组合健康审计或 Portfolio Health Check |
| 当前全部持仓 | 用于审计组合整体状态 |
| 持仓角色 | 用于判断每个持仓是否仍有清晰位置 |
| 实际仓位或权重 | 用于判断集中度和风险边界 |
| 当前现金状态 | 用于判断现金选择权和组合结构 |
| 信息来源 | 输入材料来自哪里 |

如果必要输入缺失，Portfolio Health Agent 不应继续生成完整报告。

### 2. 建议输入

| 字段 | 说明 |
| --- | --- |
| 新 NISA 额度状态 | 判断长期免税复利纪律是否仍被遵守 |
| 投资假设 | 判断是否出现假设漂移 |
| 估值变化 | 判断长期回报空间是否变化 |
| 行业、主题、地区和货币暴露 | 判断组合结构是否出现风险集中 |
| 相关性或重复风险暴露 | 判断不同持仓是否依赖同一风险来源 |
| 行为风险信号 | 判断投资者是否偏离系统 |
| 上一次健康检查记录 | 判断问题是否延续或恶化 |

建议输入缺失时，Portfolio Health Agent 可以继续运行，但必须在信息缺口中记录。

### 3. 禁止输入处理

Portfolio Health Agent 不得：

- 虚构持仓；
- 虚构权重；
- 虚构现金；
- 虚构新 NISA 额度；
- 虚构估值；
- 虚构风险数据；
- 把集中组合自动判定为不健康；
- 把持仓数量多自动判定为安全；
- 把短期波动写成组合健康结论；
- 把已使用新 NISA 额度自动解释为配置合理。

---

## 任务识别

Portfolio Health Agent 首先识别任务类型。

```text
接收输入
↓
是否为组合健康审计？
↓
是
↓
进入 Portfolio Health Check
```

如果任务不是组合健康审计：

```text
接收输入
↓
不是组合健康审计
↓
标记边界不匹配
↓
记录建议后续 prompt
↓
交给人工确认
```

Portfolio Health Agent 只做路由识别，不执行其他 prompt。

Portfolio Health Agent 不调用 Daily Agent、Weekly Agent、Market Opportunity Agent 或任何其他 Agent。

---

## Prompt 选择

Portfolio Health Agent 的 prompt 选择规则固定。

| 识别结果 | 选择 |
| --- | --- |
| 组合健康审计 | Portfolio Health Check |
| 判断组合是否仍然健康 | Portfolio Health Check |
| 审计持仓角色、假设漂移和风险集中 | Portfolio Health Check |
| 审计新 NISA 纪律和行为风险 | Portfolio Health Check |
| 每日信息过滤 | 不处理，记录后续事项 |
| 周度组合维护 | 不处理，记录后续事项 |
| 新投资机会比较 | 不处理，记录后续事项 |
| 日本专项机会筛选 | 不处理，记录后续事项 |
| IPO 前研究 | 不处理，记录后续事项 |

Portfolio Health Agent 不根据输入内容临时切换 prompt。

Portfolio Health Agent 不使用多个 prompt 共同生成一个混合结论。

---

## 输入校验

Portfolio Health Agent 在调用 prompt 前完成输入校验。

校验顺序如下：

```text
任务类型
↓
检查日期或周期
↓
当前全部持仓
↓
持仓角色
↓
实际仓位或权重
↓
当前现金状态
↓
信息来源
↓
新 NISA、投资假设、估值、风险暴露和行为风险
↓
信息缺口
```

校验结果分为三类：

| 状态 | 含义 | 处理方式 |
| --- | --- | --- |
| 可执行 | 必要输入完整 | 调用 Portfolio Health Check |
| 可执行但有缺口 | 必要输入完整，建议输入不足 | 调用 prompt，并记录缺口 |
| 不可执行 | 必要输入缺失 | 不生成完整报告，只输出缺口 |

Portfolio Health Agent 不为了完成报告而补全事实。

---

## 信息缺口记录

Portfolio Health Agent 必须显式记录信息缺口。

常见信息缺口包括：

- 缺少检查日期或周期；
- 缺少信息来源；
- 缺少当前全部持仓；
- 缺少持仓目标角色；
- 缺少实际仓位或权重；
- 缺少当前现金比例；
- 缺少新 NISA 已使用额度或剩余额度；
- 缺少投资假设；
- 缺少估值变化依据；
- 缺少行业、主题、地区或货币暴露；
- 缺少相关性或重复风险暴露；
- 缺少行为风险信号；
- 缺少上一次组合健康检查记录。

信息缺口只用于安排后续跟踪。

信息缺口不得被写成组合健康结论。

---

## 执行流程

Portfolio Health Agent 使用以下单 prompt 流程：

```text
接收输入
↓
识别任务类型
↓
确认属于组合健康审计
↓
选择 Portfolio Health Check
↓
校验必要输入
↓
记录信息缺口
↓
调用 Portfolio Health Check
↓
保留 prompt 原始输出
↓
添加 Agent 元数据
↓
标记后续事项
↓
标记人工复核状态
```

如果必要输入不足：

```text
接收输入
↓
校验失败
↓
不调用完整报告流程
↓
输出信息缺口
↓
等待补充输入
```

---

## 输出结构

Portfolio Health Agent 的输出由两部分组成。

第一部分是 Portfolio Health Check 原始输出。

第二部分是 Agent 元数据。

Portfolio Health Agent 不得修改第一部分。

### 1. Prompt 输出

Prompt 输出必须保持以下结构：

```text
# Portfolio Health Check

## 1. 组合健康结论

## 2. 持仓角色审计

## 3. 组合结构审计

## 4. 假设漂移审计

## 5. 风险集中审计

## 6. 新 NISA 纪律审计

## 7. 行为风险审计

## 8. 跟进事项
```

### 2. Agent 元数据

Agent 元数据附加在 prompt 输出之后。

```text
---

## Agent Metadata

### Run Context

### Input Summary

### Prompt Used

### Information Gaps

### Follow-up Items

### Review Status
```

元数据只记录执行状态。

元数据不新增投资结论。

---

## Agent 元数据字段

| 字段 | 作用 |
| --- | --- |
| Run Context | 记录检查日期或周期、任务类型和运行边界 |
| Input Summary | 概括本次输入范围、组合对象和来源 |
| Prompt Used | 固定记录 Portfolio Health Check |
| Information Gaps | 记录输入不足、证据不足或边界不清之处 |
| Follow-up Items | 记录需要继续监控、复核假设或安排研究的事项 |
| Review Status | 标记是否需要人工确认 |

Review Status 使用以下状态：

| 状态 | 含义 |
| --- | --- |
| Not Required | 组合健康，或仅存在常规跟踪事项 |
| Required | 存在假设漂移、角色不清、风险集中、新 NISA 纪律或行为风险事项，需要人工确认 |
| Blocked | 必要输入不足，无法生成完整报告 |

---

## 独立运行边界

Portfolio Health Agent 的独立运行含义是：

- 可以直接接收组合健康审计输入；
- 可以独立选择 Portfolio Health Check；
- 可以独立校验输入；
- 可以独立记录信息缺口；
- 可以独立附加 Agent 元数据；
- 不需要 Daily Agent 的输出作为前置条件；
- 不需要 Weekly Agent 的输出作为前置条件；
- 不需要 Market Opportunity Agent 的输出作为前置条件；
- 不需要其他 Agent 的状态作为前置条件。

Portfolio Health Agent 可以接收人工提供的持仓、权重、现金、新 NISA、风险和上次健康检查记录。

Portfolio Health Agent 不得自动读取、合并或调用其他 Agent 的输出。

---

## 示例流程

### 示例一：周期性组合健康审计

```text
输入：全部持仓、权重、现金、新 NISA 状态、投资假设和风险暴露
↓
识别：组合健康审计
↓
Prompt：Portfolio Health Check
↓
输出：组合健康结论、持仓角色审计、结构审计、假设漂移审计
↓
Agent 元数据：记录运行上下文、信息缺口、后续事项、复核状态
```

Portfolio Health Agent 不生成周度行动计划。

Portfolio Health Agent 不执行交易。

### 示例二：缺少持仓角色

```text
输入：持仓和权重完整，但缺少每个持仓的目标角色
↓
识别：组合健康审计
↓
校验：必要输入缺失
↓
处理：不调用完整 Portfolio Health Check
↓
输出：记录持仓角色缺口
↓
Review Status：Blocked
```

Portfolio Health Agent 不虚构持仓角色。

Portfolio Health Agent 不在缺少必要输入时生成完整组合健康诊断。

### 示例三：输入要求制定下周行动

```text
输入：要求判断下周应该如何维护组合
↓
识别：超出 Portfolio Health Agent 边界
↓
处理：不调用其他 prompt
↓
输出：边界不匹配、信息缺口、复核状态
```

Portfolio Health Agent 只记录该请求不属于组合健康审计范围。

---

## 禁止事项

Portfolio Health Agent 不得：

- 修改 Book；
- 修改 Prompt Suite；
- 修改 Examples；
- 修改 Portfolio Health Check prompt；
- 新增 prompt；
- 调用多个 prompt；
- 调用其他 Agent；
- 混合多个 prompt 的职责；
- 生成买入建议；
- 生成卖出建议；
- 生成加仓或减仓建议；
- 改变组合权重；
- 执行新 NISA 资金投入；
- 生成每日信息过滤；
- 生成周度组合维护报告；
- 生成新机会报告；
- 生成日本市场专项机会报告；
- 生成 IPO 观察；
- 生成当前市场观点；
- 实现调度器、记忆系统或工作流引擎；
- 虚构缺失信息。

---

## Review Checklist

Portfolio Health Agent 规格变更必须检查：

- 是否只使用 Portfolio Health Check 一个主 prompt；
- 是否没有调用其他 Agent；
- 是否没有修改 prompt 文件；
- 是否没有改变 Portfolio Health Check 输出结构；
- 是否没有新增投资逻辑；
- 是否没有生成交易指令；
- 是否显式记录信息缺口；
- 是否输出组合诊断而不是行动计划；
- 是否没有生成周度组合维护结论；
- 是否只在 prompt 输出之外添加 Agent 元数据；
- 是否保留人工复核状态；
- 是否没有修改 Book；
- 是否没有修改 Examples；
- 是否没有实现调度器、记忆系统或工作流引擎。

---

## 版本策略

Portfolio Health Agent 跟随 Agent 层独立版本策略。

| 版本类型 | 使用场景 |
| --- | --- |
| Patch | 修正文案、格式、错别字或说明不清 |
| Minor | 增加非执行性的元数据字段或边界说明 |
| Major | 改变 Portfolio Health Agent 职责、主 prompt 或人工复核规则 |

Portfolio Health Agent 的版本变化不得自动改变 Portfolio Health Check prompt。

如果 Portfolio Health Agent 需要新的 prompt 行为，必须先通过 Prompt Suite issue 处理。
