# Agent Architecture

## 目的

本文定义 Investment Operating System Agent 层的架构原则、职责边界和编排方式。

Agent 的目标，是在不改变 Book、Prompt Suite 和 Examples 的前提下，调度已经定义好的 prompt，形成可记录、可复核、可维护的投资工作流。

本文是 Agent 层的架构文档。

它不实现 Agent。

它不定义新的投资原则。

它不修改任何 prompt 行为。

## Index

- [Daily Agent](daily-agent.md)
- [Weekly Agent](weekly-agent.md)
- [Market Opportunity Agent](market-opportunity-agent.md)
- [Portfolio Health Agent](portfolio-health-agent.md)
- [IPO Watch Agent](ipo-watch-agent.md)

---

## 四层关系

Investment Operating System 分为四个逻辑层级：

```text
Book
↓
Prompt Suite
↓
Examples
↓
Agent
```

Book 负责定义知识、原则和投资判断标准。

Prompt Suite 负责把这些原则转化为稳定、可执行的 AI 任务。

Examples 负责展示具体输入如何通过已存在的 prompt 形成符合 IOS 的输出。

Agent 负责调度已有 prompt、管理输入输出、记录状态和安排后续任务。

Agent 不拥有新的投资哲学。

Agent 不改变 prompt 的责任边界。

---

## Agent 的职责

Agent 的职责是编排，而不是判断规则创新。

Agent 可以负责：

- 收集输入；
- 判断使用哪个已有 prompt；
- 调用单个 prompt；
- 按顺序调用多个 prompt；
- 保存输出记录；
- 维护待办事项；
- 标记信息缺口；
- 安排后续复查；
- 把结果交给人工复核；
- 保持工作流可追踪。

Agent 不可以负责：

- 新增投资哲学；
- 新增投资框架；
- 改写 Book；
- 改写 Prompt Suite；
- 改写 Examples；
- 修改 prompt 输出结构；
- 混合多个 prompt 的职责；
- 生成 prompt 中禁止的结论；
- 在缺少证据时形成投资结论；
- 绕过人工复核执行投资动作。

---

## 与 Book 的关系

Book 是唯一知识来源。

Agent 只能执行 Book 中已经确立的原则。

如果 Agent 在执行过程中发现现有原则不足，正确处理方式不是即时新增规则，而是：

```text
发现规则缺口
↓
记录问题
↓
创建独立 issue
↓
回到 Book 或架构层讨论
↓
经过 review 后再更新系统
```

Agent 不得在运行过程中临时发明新的投资标准。

---

## 与 Prompt Suite 的关系

Prompt Suite 定义可执行任务。

Agent 调用 Prompt Suite，但不改变 Prompt Suite。

每次调用 prompt 前，Agent 必须明确：

- 使用哪个 prompt；
- 为什么使用该 prompt；
- 输入来自哪里；
- 输出将如何记录；
- 后续是否需要人工复核。

Agent 不得把一个 prompt 扩展成另一个 prompt。

例如：

- Daily Investment Report 不得被 Agent 扩展成 Weekly Portfolio Report；
- Weekly Portfolio Report 不得被 Agent 扩展成 Market Opportunity Report；
- Market Opportunity Report 不得被 Agent 扩展成交易建议；
- IPO Watch 不得被 Agent 扩展成 IPO 交易策略。

---

## 与 Examples 的关系

Examples 是参考样本，不是执行规则。

Agent 可以使用 Examples 来理解：

- 输入应如何准备；
- 输出应如何组织；
- 边界应如何保持；
- 信息缺口应如何标记；
- 哪些结论不应被生成。

Agent 不得把 Examples 当成新的 prompt。

Agent 不得把 Examples 中的虚构输入当成真实市场数据。

---

## 标准输入

Agent 的输入应尽量结构化。

基础输入包括：

- 日期或周期；
- 任务类型；
- 投资者画像；
- 当前持仓；
- 当前观察名单；
- 可用现金；
- 新 NISA 状态；
- 市场或企业信息；
- 已有研究假设；
- 信息来源；
- 信息缺口；
- 上一次输出；
- 上一次待办事项。

如果输入不足，Agent 必须先标记信息缺口。

Agent 不得虚构缺失数据。

---

## 标准输出

Agent 的输出必须稳定、可记录、可复核。

基础输出包括：

- 调用的 prompt；
- 输入摘要；
- 关键结论；
- 信息缺口；
- 风险提示；
- 后续事项；
- 是否需要人工复核；
- 下一次复查时间或触发条件。

Agent 输出不得覆盖原 prompt 的输出结构。

Agent 输出可以在 prompt 输出之外增加执行元数据，但不得改变投资判断内容。

---

## Prompt 编排原则

Agent 编排 prompt 时遵循以下原则：

| 原则 | 含义 |
| --- | --- |
| One task, one primary prompt | 每个任务必须有一个主要 prompt |
| Prompt boundaries first | prompt 边界优先于流程便利 |
| No hidden synthesis | 不在后台混合多个 prompt 的结论 |
| Evidence before action | 证据不足时只记录缺口和待办 |
| Human review before decision | 投资动作前必须保留人工复核 |
| State is explicit | 记录输入、输出、缺口和待办 |

Agent 可以组合多个 prompt，但必须显式说明顺序和原因。

---

## 单 prompt 执行流程

当一个任务只需要一个 prompt 时，Agent 使用以下流程：

```text
接收任务
↓
识别任务类型
↓
选择主要 prompt
↓
检查输入是否足够
↓
标记信息缺口
↓
调用 prompt
↓
保存输出
↓
生成待办事项
↓
标记是否需要人工复核
```

示例：

```text
日常市场信息
↓
Daily Investment Report
↓
记录长期信号、短期噪音和后续事项
```

---

## 多 prompt 编排流程

当一个任务需要多个 prompt 时，Agent 必须保持顺序清楚。

典型流程如下：

```text
Daily Investment Report
↓
发现长期重要信号
↓
进入研究或观察事项
↓
Weekly Portfolio Report
↓
判断是否影响 3-12 个月组合维护
↓
Portfolio Health Check
↓
周期性审计组合是否仍健康
```

另一个典型流程：

```text
IPO Watch
↓
等待官方申报文件
↓
信息充分后进入 Market Opportunity Report
↓
与现有持仓比较
↓
必要时进入 Weekly Portfolio Report
```

多 prompt 编排不代表多个 prompt 同时生成一个混合结论。

每个 prompt 的输出必须独立保存。

---

## Prompt 路由表

Agent 可使用以下路由表选择 prompt：

| 输入问题 | 主要 prompt |
| --- | --- |
| 今天发生了什么，值得长期投资者记录？ | Daily Investment Report |
| 当前组合未来 3-12 个月应该如何维护？ | Weekly Portfolio Report |
| 是否有新机会明显优于加仓现有持仓？ | Market Opportunity Report |
| 是否有值得研究的日本上市机会？ | Japan Opportunity Report |
| 当前组合是否仍然健康？ | Portfolio Health Check |
| 哪些未来可投资公司值得 IPO 前监控？ | IPO Watch |

注：Japan Opportunity Report 的 Agent 规格未包含在 v0.1 中。上表中的 Japan Opportunity Report 一行仅标注 prompt，对应 Agent 将在后续版本定义。

如果输入问题跨越多个 prompt，Agent 应先选择最接近当前任务的主要 prompt，再把其他事项记录为后续待办。

---

## 状态管理

Agent 必须显式管理状态。

状态类型包括：

- 输入状态；
- 研究状态；
- 组合状态；
- 风险状态；
- 新 NISA 状态；
- 待办状态；
- 信息缺口状态；
- 人工复核状态。

状态记录必须回答：

- 这条状态来自哪个 prompt；
- 它基于哪些输入；
- 它何时产生；
- 它何时需要复查；
- 它是否已经被人工确认。

---

## 人工复核

Agent 不直接执行投资动作。

以下事项必须人工复核：

- 买入；
- 卖出；
- 加仓；
- 减仓；
- 新 NISA 额度使用；
- 组合权重变化；
- 投资假设重大修改；
- 风险边界调整；
- 新 prompt 或新工作流提案。

Agent 可以提出待办事项。

Agent 不可以把待办事项伪装成执行决定。

---

## 错误处理

当输入不足、信息冲突或任务边界不清时，Agent 应使用以下处理方式：

```text
发现问题
↓
标记信息不足或边界不清
↓
停止生成投资结论
↓
列出需要补充的信息
↓
安排人工复核或后续任务
```

Agent 不得为了完成流程而补全事实。

Agent 不得把不确定性隐藏在结论里。

---

## 非目标

Agent Architecture 不负责：

- 实现 Agent；
- 创建自动化脚本；
- 调用真实券商账户；
- 生成交易指令；
- 改写 Book；
- 改写 Prompt Suite；
- 改写 Examples；
- 新增 prompt；
- 新增投资框架；
- 处理实时市场数据接口；
- 定义模型供应商；
- 定义部署方式。

---

## Review Checklist

任何 Agent 层变更都必须检查：

- 是否没有改变 Book 原则；
- 是否没有改变 Prompt Suite 行为；
- 是否没有改变 Examples 内容；
- 是否没有新增投资框架；
- 是否没有生成交易执行逻辑；
- 是否保持 prompt 职责边界；
- 是否显式记录输入、输出和信息缺口；
- 是否保留人工复核；
- 是否可以被未来实现稳定调用。

---

## 版本策略

Agent 层使用独立版本策略。

| 版本类型 | 使用场景 |
| --- | --- |
| Patch | 修正文案、格式、错别字或说明不清 |
| Minor | 新增编排说明、状态字段或非执行性流程 |
| Major | 改变 Agent 职责、边界、路由原则或人工复核规则 |

Agent 版本不得自动改变 Book、Prompt Suite 或 Examples 版本。

如果 Agent 层需要新的 prompt 行为，必须先通过 Prompt Suite issue 处理。

---

## 设计冻结策略

本文在 review 后进入 Agent Architecture Design Freeze。

Design Freeze 之后，允许的变更包括：

- 错别字修正；
- 格式修正；
- 术语一致性修正；
- 与已冻结架构一致的澄清。

Design Freeze 之后，不允许直接改变：

- 四层关系；
- Agent 职责；
- prompt 编排原则；
- 路由表；
- 人工复核规则；
- 非目标边界。

如需改变上述内容，必须创建新的架构变更 issue，并单独 review。
