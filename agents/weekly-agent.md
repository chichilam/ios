# Weekly Agent

## 目的

本文定义 Investment Operating System 的 Weekly Agent。

Weekly Agent 的目标，是在不改变 Weekly Portfolio Report prompt 的前提下，完成独立的单 prompt 编排流程。

它负责识别周度组合维护任务、选择既有 prompt、校验输入、记录信息缺口、保存 prompt 输出，并在输出之外添加 Agent 元数据。

本文是规格说明。

它不实现调度器。

它不实现记忆系统。

它不实现工作流引擎。

它不调用其他 Agent。

它不改变 prompt 行为。

它不生成交易决策。

---

## 架构位置

Weekly Agent 位于 Agent 层。

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
Weekly Agent
```

Weekly Agent 的唯一主 prompt 是：

```text
prompts/weekly-portfolio-report.md
```

Weekly Agent 独立运行。

Weekly Agent 不依赖 Daily Agent。

Weekly Agent 不调用第二个 prompt。

Weekly Agent 不把周度组合维护扩展为每日信息过滤、新机会报告、完整组合健康审计或 IPO 监控。

---

## 适用任务

Weekly Agent 只处理一种任务：

> 当前组合在未来 3-12 个月应该如何维护？

适用输入包括：

- 报告周；
- 当前组合持仓；
- 各持仓权重；
- 当前现金比例；
- 可用现金或计划投入资金；
- 新 NISA 相关约束；
- 本周主要市场变化；
- 本周公司特定更新；
- 财报、指引或管理层发言；
- 估值变化；
- 利率、汇率、流动性等市场环境变化；
- 已有研究假设变化；
- 风险集中或相关性问题；
- 上周遗留待办事项。

不适用任务包括：

- 每日信息过滤；
- 寻找全新市场机会；
- 完整企业分析；
- 完整估值；
- 完整组合健康审计；
- IPO 前研究；
- 日本机会筛选；
- 短期价格预测；
- 交易执行。

如果输入任务超出 Weekly Agent 范围，Weekly Agent 只记录边界不匹配，并把事项列入后续处理。

---

## 单 prompt 边界

Weekly Agent 必须遵守以下边界：

| 项目 | 规则 |
| --- | --- |
| 主 prompt | 只能使用 Weekly Portfolio Report |
| prompt 数量 | 只能使用一个主 prompt |
| Agent 数量 | 只能运行 Weekly Agent 本身 |
| 输出结构 | 保留 Weekly Portfolio Report 原始输出结构 |
| 投资判断 | 不新增 prompt 之外的投资判断 |
| 交易动作 | 不生成买入、卖出、加仓、减仓指令 |
| 信息不足 | 明确记录信息缺口，不补全事实 |
| 人工复核 | 对组合相关事项标记人工复核状态 |

Weekly Agent 可以在 prompt 输出之外增加元数据。

Weekly Agent 不得改写 prompt 输出本身。

---

## 输入要求

Weekly Agent 的输入分为三类。

### 1. 必要输入

| 字段 | 说明 |
| --- | --- |
| 报告周 | 周度组合报告对应周期 |
| 任务类型 | 必须为周度组合维护或 Weekly Portfolio Report |
| 当前组合持仓 | 用于判断组合维护对象 |
| 当前现金或资金状态 | 用于判断资本配置约束 |
| 本周组合相关信息 | 市场、企业、估值、现金或风险变化 |
| 信息来源 | 输入材料来自哪里 |

如果必要输入缺失，Weekly Agent 不应继续生成完整报告。

### 2. 建议输入

| 字段 | 说明 |
| --- | --- |
| 各持仓权重 | 判断组合角色和风险边界 |
| 可用现金或计划投入资金 | 判断现金选择权和资金安排 |
| 新 NISA 状态 | 判断税收账户纪律是否受影响 |
| 已有研究假设 | 判断本周信息是否改变原假设 |
| 上周遗留待办事项 | 判断是否需要延续跟踪 |
| 风险集中或相关性信息 | 判断组合层面风险是否需要监控 |

建议输入缺失时，Weekly Agent 可以继续运行，但必须在信息缺口中记录。

### 3. 禁止输入处理

Weekly Agent 不得：

- 虚构持仓；
- 虚构权重；
- 虚构现金；
- 虚构估值数据；
- 把每日新闻自动解释为组合行动；
- 把价格变化自动解释为长期逻辑变化；
- 把新 NISA 额度存在自动解释为应该投入资金。

---

## 任务识别

Weekly Agent 首先识别任务类型。

```text
接收输入
↓
是否为周度组合维护？
↓
是
↓
进入 Weekly Portfolio Report
```

如果任务不是周度组合维护：

```text
接收输入
↓
不是周度组合维护
↓
标记边界不匹配
↓
记录建议后续 prompt
↓
交给人工确认
```

Weekly Agent 只做路由识别，不执行其他 prompt。

Weekly Agent 不调用 Daily Agent、Portfolio Health Check 或任何其他 Agent。

---

## Prompt 选择

Weekly Agent 的 prompt 选择规则固定。

| 识别结果 | 选择 |
| --- | --- |
| 周度组合维护 | Weekly Portfolio Report |
| 当前组合未来 3-12 个月维护 | Weekly Portfolio Report |
| 持仓状态和资本配置复盘 | Weekly Portfolio Report |
| 新 NISA 与现金周度检查 | Weekly Portfolio Report |
| 每日信息过滤 | 不处理，记录后续事项 |
| 新投资机会比较 | 不处理，记录后续事项 |
| 完整企业分析 | 不处理，记录后续事项 |
| 完整组合健康审计 | 不处理，记录后续事项 |

Weekly Agent 不根据输入内容临时切换 prompt。

Weekly Agent 不使用多个 prompt 共同生成一个混合结论。

---

## 输入校验

Weekly Agent 在调用 prompt 前完成输入校验。

校验顺序如下：

```text
任务类型
↓
报告周
↓
当前组合持仓
↓
当前现金或资金状态
↓
本周组合相关信息
↓
信息来源
↓
权重、新 NISA、研究假设和上周待办
↓
信息缺口
```

校验结果分为三类：

| 状态 | 含义 | 处理方式 |
| --- | --- | --- |
| 可执行 | 必要输入完整 | 调用 Weekly Portfolio Report |
| 可执行但有缺口 | 必要输入完整，建议输入不足 | 调用 prompt，并记录缺口 |
| 不可执行 | 必要输入缺失 | 不生成完整报告，只输出缺口 |

Weekly Agent 不为了完成报告而补全事实。

---

## 信息缺口记录

Weekly Agent 必须显式记录信息缺口。

常见信息缺口包括：

- 缺少报告周；
- 缺少信息来源；
- 缺少当前组合持仓；
- 缺少持仓权重；
- 缺少现金或计划投入资金；
- 缺少新 NISA 状态；
- 缺少本周公司特定更新；
- 缺少估值变化依据；
- 缺少已有研究假设；
- 缺少上周遗留待办事项；
- 缺少风险集中或相关性信息。

信息缺口只用于安排后续跟踪。

信息缺口不得被写成组合行动结论。

---

## 执行流程

Weekly Agent 使用以下单 prompt 流程：

```text
接收输入
↓
识别任务类型
↓
确认属于周度组合维护
↓
选择 Weekly Portfolio Report
↓
校验必要输入
↓
记录信息缺口
↓
调用 Weekly Portfolio Report
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

Weekly Agent 的输出由两部分组成。

第一部分是 Weekly Portfolio Report 原始输出。

第二部分是 Agent 元数据。

Weekly Agent 不得修改第一部分。

### 1. Prompt 输出

Prompt 输出必须保持以下结构：

```text
# Weekly Portfolio Report

## 1. 本周组合结论

## 2. 持仓状态

## 3. 资本配置判断

## 4. 假设更新

## 5. 风险监控

## 6. 新 NISA 与现金

## 7. 延后动作

## 8. 下周待办
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
| Run Context | 记录报告周、任务类型和运行边界 |
| Input Summary | 概括本次输入范围、组合对象和来源 |
| Prompt Used | 固定记录 Weekly Portfolio Report |
| Information Gaps | 记录输入不足、证据不足或边界不清之处 |
| Follow-up Items | 记录需要后续研究、复核或等待的信息 |
| Review Status | 标记是否需要人工确认 |

Review Status 使用以下状态：

| 状态 | 含义 |
| --- | --- |
| Not Required | 仅记录常规维护事项，无需立即人工复核 |
| Required | 存在组合、现金、新 NISA、风险或假设更新事项，需要人工确认 |
| Blocked | 必要输入不足，无法生成完整报告 |

---

## 独立运行边界

Weekly Agent 的独立运行含义是：

- 可以直接接收周度组合输入；
- 可以独立选择 Weekly Portfolio Report；
- 可以独立校验输入；
- 可以独立记录信息缺口；
- 可以独立附加 Agent 元数据；
- 不需要 Daily Agent 的输出作为前置条件；
- 不需要其他 Agent 的状态作为前置条件。

Weekly Agent 可以接收人工提供的上周待办事项。

Weekly Agent 不得自动读取、合并或调用其他 Agent 的输出。

---

## 示例流程

### 示例一：周度组合维护

```text
输入：本周持仓、现金、新 NISA 状态和组合相关事件
↓
识别：周度组合维护
↓
Prompt：Weekly Portfolio Report
↓
输出：本周组合结论、持仓状态、资本配置判断、风险监控
↓
Agent 元数据：记录运行上下文、信息缺口、后续事项、复核状态
```

Weekly Agent 不执行加仓。

Weekly Agent 不改变组合权重。

### 示例二：缺少持仓权重

```text
输入：本周组合事件完整，但缺少持仓权重
↓
识别：周度组合维护
↓
Prompt：Weekly Portfolio Report
↓
输出：保留可判断内容
↓
Agent 元数据：记录持仓权重缺口
```

Weekly Agent 不虚构权重。

Weekly Agent 不基于缺失权重生成仓位结论。

### 示例三：输入要求寻找全新机会

```text
输入：要求寻找新的市场机会
↓
识别：超出 Weekly Agent 边界
↓
处理：不调用其他 prompt
↓
输出：边界不匹配、信息缺口、复核状态
```

Weekly Agent 只记录该请求不属于周度组合维护范围。

---

## 禁止事项

Weekly Agent 不得：

- 修改 Book；
- 修改 Prompt Suite；
- 修改 Examples；
- 修改 Weekly Portfolio Report prompt；
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
- 生成新机会报告；
- 生成完整组合健康审计；
- 生成 IPO 报告；
- 生成当前市场观点；
- 实现调度器、记忆系统或工作流引擎；
- 虚构缺失信息。

---

## Review Checklist

Weekly Agent 规格变更必须检查：

- 是否只使用 Weekly Portfolio Report 一个主 prompt；
- 是否没有调用其他 Agent；
- 是否没有修改 prompt 文件；
- 是否没有改变 Weekly Portfolio Report 输出结构；
- 是否没有新增投资逻辑；
- 是否没有生成交易指令；
- 是否显式记录信息缺口；
- 是否只在 prompt 输出之外添加 Agent 元数据；
- 是否保留人工复核状态；
- 是否没有修改 Book；
- 是否没有修改 Examples；
- 是否没有实现调度器、记忆系统或工作流引擎。

---

## 版本策略

Weekly Agent 跟随 Agent 层独立版本策略。

| 版本类型 | 使用场景 |
| --- | --- |
| Patch | 修正文案、格式、错别字或说明不清 |
| Minor | 增加非执行性的元数据字段或边界说明 |
| Major | 改变 Weekly Agent 职责、主 prompt 或人工复核规则 |

Weekly Agent 的版本变化不得自动改变 Weekly Portfolio Report prompt。

如果 Weekly Agent 需要新的 prompt 行为，必须先通过 Prompt Suite issue 处理。
