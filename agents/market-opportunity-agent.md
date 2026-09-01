# Market Opportunity Agent

## 目的

本文定义 Investment Operating System 的 Market Opportunity Agent。

Market Opportunity Agent 的目标，是在不改变 Market Opportunity Report prompt 的前提下，完成独立的单 prompt 编排流程。

它负责识别新机会比较任务、选择既有 prompt、校验输入、记录信息缺口、保存 prompt 输出，并在输出之外添加 Agent 元数据。

本文是规格说明。

它不实现调度器。

它不实现记忆系统。

它不实现工作流引擎。

它不调用其他 Agent。

它不改变 prompt 行为。

它不生成交易执行。

---

## 架构位置

Market Opportunity Agent 位于 Agent 层。

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
Market Opportunity Agent
```

Market Opportunity Agent 的唯一主 prompt 是：

```text
prompts/market-opportunity-report.md
```

Market Opportunity Agent 独立运行。

Market Opportunity Agent 不依赖 Daily Agent。

Market Opportunity Agent 不依赖 Weekly Agent。

Market Opportunity Agent 不调用第二个 prompt。

Market Opportunity Agent 不把新机会比较扩展为周度组合维护、日本专项机会筛选、组合健康审计或 IPO 监控。

---

## 核心问题

Market Opportunity Agent 只回答一个问题：

> 是否存在明显优于加仓现有持仓的新投资机会？

这个问题包含两个约束：

- 新机会必须与现有持仓比较；
- 没有明显更优证据时，现有高质量持仓拥有资本配置优先权。

Market Opportunity Agent 不单独评价新机会是否“看起来不错”。

它必须把新机会放在资本配置比较中判断。

---

## 适用任务

适用输入包括：

- 报告日期或报告周期；
- 当前组合持仓；
- 当前组合中可继续加仓的高质量持仓；
- 当前观察名单；
- 新机会范围；
- 新机会所属行业和价值链位置；
- 最近市场变化；
- 分析师上调或下调；
- 盈利预期变化；
- 估值变化；
- 机构持仓或资金流向变化；
- 行业轮动信息；
- AI Infrastructure 与半导体趋势；
- 云、企业软件、网络安全、工业自动化、电力基础设施、数据中心相关趋势；
- 与新机会相关的企业质量证据；
- 与新机会相关的竞争优势证据；
- 与新机会相关的管理层和资本配置证据；
- 与新机会相关的自由现金流、成长和估值证据；
- 主要风险和仍需验证的事项；
- 新 NISA 约束；
- 可用现金或未来投入资金。

不适用任务包括：

- 每日信息过滤；
- 周度组合维护；
- 日本市场专项机会筛选；
- 完整企业分析；
- 完整估值；
- 完整组合健康审计；
- IPO 前研究；
- 短期价格预测；
- 交易执行。

如果输入任务超出 Market Opportunity Agent 范围，Market Opportunity Agent 只记录边界不匹配，并把事项列入后续处理。

---

## 单 prompt 边界

Market Opportunity Agent 必须遵守以下边界：

| 项目 | 规则 |
| --- | --- |
| 主 prompt | 只能使用 Market Opportunity Report |
| prompt 数量 | 只能使用一个主 prompt |
| Agent 数量 | 只能运行 Market Opportunity Agent 本身 |
| 输出结构 | 保留 Market Opportunity Report 原始输出结构 |
| 比较对象 | 新机会必须与现有持仓比较 |
| 投资判断 | 不新增 prompt 之外的投资判断 |
| 交易动作 | 不生成买入、卖出、加仓、减仓指令 |
| 信息不足 | 明确记录信息缺口，不补全事实 |
| 人工复核 | 对进入观察、研究或正式比较的事项标记人工复核状态 |

Market Opportunity Agent 可以在 prompt 输出之外增加元数据。

Market Opportunity Agent 不得改写 prompt 输出本身。

---

## 输入要求

Market Opportunity Agent 的输入分为三类。

### 1. 必要输入

| 字段 | 说明 |
| --- | --- |
| 报告日期或周期 | 新机会比较对应时间范围 |
| 任务类型 | 必须为新机会比较或 Market Opportunity Report |
| 当前组合持仓 | 用于比较新机会是否优于现有持仓 |
| 可继续加仓的高质量持仓 | 用于建立资本配置基准 |
| 新机会范围 | 用于明确被比较对象 |
| 新机会相关证据 | 企业质量、竞争优势、成长、估值或风险证据 |
| 信息来源 | 输入材料来自哪里 |

如果必要输入缺失，Market Opportunity Agent 不应继续生成完整报告。

### 2. 建议输入

| 字段 | 说明 |
| --- | --- |
| 当前观察名单 | 判断新机会是否已在研究体系中 |
| 所属行业和价值链位置 | 判断是否符合长期产业链逻辑 |
| 新 NISA 约束 | 判断是否适合长期税收账户纪律 |
| 可用现金或未来投入资金 | 判断是否存在资本配置约束 |
| 估值变化 | 判断长期回报空间是否仍存在 |
| 主要风险 | 判断风险是否可理解、可承受、可跟踪 |

建议输入缺失时，Market Opportunity Agent 可以继续运行，但必须在信息缺口中记录。

### 3. 禁止输入处理

Market Opportunity Agent 不得：

- 虚构公司事实；
- 虚构估值；
- 虚构持仓；
- 虚构权重；
- 虚构现金；
- 把题材热度当作机会质量；
- 把市场动量当作长期证据；
- 把分析师上调当作充分证据；
- 把机构买入当作充分证据；
- 把新 NISA 额度存在解释为应该建立新仓。

---

## 任务识别

Market Opportunity Agent 首先识别任务类型。

```text
接收输入
↓
是否为新机会比较？
↓
是
↓
进入 Market Opportunity Report
```

如果任务不是新机会比较：

```text
接收输入
↓
不是新机会比较
↓
标记边界不匹配
↓
记录建议后续 prompt
↓
交给人工确认
```

Market Opportunity Agent 只做路由识别，不执行其他 prompt。

Market Opportunity Agent 不调用 Daily Agent、Weekly Agent、Portfolio Health Check 或任何其他 Agent。

---

## Prompt 选择

Market Opportunity Agent 的 prompt 选择规则固定。

| 识别结果 | 选择 |
| --- | --- |
| 新机会比较 | Market Opportunity Report |
| 判断新机会是否优于现有持仓 | Market Opportunity Report |
| 比较观察名单候选与现有持仓 | Market Opportunity Report |
| 评估是否启动新机会研究 | Market Opportunity Report |
| 每日信息过滤 | 不处理，记录后续事项 |
| 周度组合维护 | 不处理，记录后续事项 |
| 日本专项机会筛选 | 不处理，记录后续事项 |
| 完整组合健康审计 | 不处理，记录后续事项 |
| IPO 前研究 | 不处理，记录后续事项 |

Market Opportunity Agent 不根据输入内容临时切换 prompt。

Market Opportunity Agent 不使用多个 prompt 共同生成一个混合结论。

---

## 输入校验

Market Opportunity Agent 在调用 prompt 前完成输入校验。

校验顺序如下：

```text
任务类型
↓
报告日期或周期
↓
当前组合持仓
↓
可继续加仓的高质量持仓
↓
新机会范围
↓
新机会相关证据
↓
信息来源
↓
观察名单、新 NISA、现金、估值和风险
↓
信息缺口
```

校验结果分为三类：

| 状态 | 含义 | 处理方式 |
| --- | --- | --- |
| 可执行 | 必要输入完整 | 调用 Market Opportunity Report |
| 可执行但有缺口 | 必要输入完整，建议输入不足 | 调用 prompt，并记录缺口 |
| 不可执行 | 必要输入缺失 | 不生成完整报告，只输出缺口 |

Market Opportunity Agent 不为了完成报告而补全事实。

---

## 信息缺口记录

Market Opportunity Agent 必须显式记录信息缺口。

常见信息缺口包括：

- 缺少报告日期或周期；
- 缺少信息来源；
- 缺少当前组合持仓；
- 缺少可继续加仓的高质量持仓；
- 缺少新机会范围；
- 缺少新机会企业质量证据；
- 缺少竞争优势证据；
- 缺少管理层或资本配置证据；
- 缺少自由现金流或成长证据；
- 缺少估值依据；
- 缺少新 NISA 约束；
- 缺少可用现金或未来投入资金；
- 缺少主要风险；
- 缺少与现有持仓比较所需信息。

信息缺口只用于安排后续跟踪。

信息缺口不得被写成新机会结论。

---

## 执行流程

Market Opportunity Agent 使用以下单 prompt 流程：

```text
接收输入
↓
识别任务类型
↓
确认属于新机会比较
↓
选择 Market Opportunity Report
↓
校验必要输入
↓
记录信息缺口
↓
调用 Market Opportunity Report
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

Market Opportunity Agent 的输出由两部分组成。

第一部分是 Market Opportunity Report 原始输出。

第二部分是 Agent 元数据。

Market Opportunity Agent 不得修改第一部分。

### 1. Prompt 输出

Prompt 输出必须保持以下结构：

```text
# Market Opportunity Report

## 1. 机会结论

## 2. 新机会候选

## 3. 与现有持仓比较

## 4. 机会质量评估

## 5. 证据与信息缺口

## 6. 新 NISA 与资本约束

## 7. 风险与排除理由

## 8. 下一步
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
| Run Context | 记录报告日期或周期、任务类型和运行边界 |
| Input Summary | 概括本次输入范围、新机会对象、现有持仓基准和来源 |
| Prompt Used | 固定记录 Market Opportunity Report |
| Information Gaps | 记录输入不足、证据不足或边界不清之处 |
| Follow-up Items | 记录需要后续研究、正式比较或等待的信息 |
| Review Status | 标记是否需要人工确认 |

Review Status 使用以下状态：

| 状态 | 含义 |
| --- | --- |
| Not Required | 没有更优新机会，或仅记录排除理由 |
| Required | 存在加入观察名单、启动研究或正式比较事项，需要人工确认 |
| Blocked | 必要输入不足，无法生成完整报告 |

---

## 独立运行边界

Market Opportunity Agent 的独立运行含义是：

- 可以直接接收新机会比较输入；
- 可以独立选择 Market Opportunity Report；
- 可以独立校验输入；
- 可以独立记录信息缺口；
- 可以独立附加 Agent 元数据；
- 不需要 Daily Agent 的输出作为前置条件；
- 不需要 Weekly Agent 的输出作为前置条件；
- 不需要其他 Agent 的状态作为前置条件。

Market Opportunity Agent 可以接收人工提供的当前持仓、观察名单和新机会材料。

Market Opportunity Agent 不得自动读取、合并或调用其他 Agent 的输出。

---

## 示例流程

### 示例一：新机会候选进入比较

```text
输入：一个新机会候选、当前持仓、可继续加仓持仓和相关证据
↓
识别：新机会比较
↓
Prompt：Market Opportunity Report
↓
输出：机会结论、新机会候选、与现有持仓比较、证据缺口
↓
Agent 元数据：记录运行上下文、信息缺口、后续事项、复核状态
```

Market Opportunity Agent 不执行建仓。

Market Opportunity Agent 不改变组合权重。

### 示例二：证据不足的新机会

```text
输入：一个热门行业候选，但缺少企业质量和估值证据
↓
识别：新机会比较
↓
Prompt：Market Opportunity Report
↓
输出：因证据不足延后
↓
Agent 元数据：记录企业质量、估值和比较证据缺口
```

Market Opportunity Agent 不把题材热度写成投资结论。

Market Opportunity Agent 不把证据不足的新机会升级为研究结论。

### 示例三：输入要求做周度组合维护

```text
输入：要求维护当前组合未来 3-12 个月行动
↓
识别：超出 Market Opportunity Agent 边界
↓
处理：不调用其他 prompt
↓
输出：边界不匹配、信息缺口、复核状态
```

Market Opportunity Agent 只记录该请求不属于新机会比较范围。

---

## 禁止事项

Market Opportunity Agent 不得：

- 修改 Book；
- 修改 Prompt Suite；
- 修改 Examples；
- 修改 Market Opportunity Report prompt；
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
- 生成日本市场专项机会报告；
- 生成完整组合健康审计；
- 生成 IPO 观察；
- 生成当前市场观点；
- 实现调度器、记忆系统或工作流引擎；
- 虚构缺失信息。

---

## Review Checklist

Market Opportunity Agent 规格变更必须检查：

- 是否只使用 Market Opportunity Report 一个主 prompt；
- 是否没有调用其他 Agent；
- 是否没有修改 prompt 文件；
- 是否没有改变 Market Opportunity Report 输出结构；
- 是否没有新增投资逻辑；
- 是否没有生成交易指令；
- 是否显式记录信息缺口；
- 是否所有新机会都保持与现有持仓比较的边界；
- 是否没有生成周度组合维护结论；
- 是否只在 prompt 输出之外添加 Agent 元数据；
- 是否保留人工复核状态；
- 是否没有修改 Book；
- 是否没有修改 Examples；
- 是否没有实现调度器、记忆系统或工作流引擎。

---

## 版本策略

Market Opportunity Agent 跟随 Agent 层独立版本策略。

| 版本类型 | 使用场景 |
| --- | --- |
| Patch | 修正文案、格式、错别字或说明不清 |
| Minor | 增加非执行性的元数据字段或边界说明 |
| Major | 改变 Market Opportunity Agent 职责、主 prompt 或人工复核规则 |

Market Opportunity Agent 的版本变化不得自动改变 Market Opportunity Report prompt。

如果 Market Opportunity Agent 需要新的 prompt 行为，必须先通过 Prompt Suite issue 处理。
