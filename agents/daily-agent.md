# Daily Agent

## 目的

本文定义 Investment Operating System 的第一个 Agent：Daily Agent。

Daily Agent 的目标，是在不改变 Daily Investment Report prompt 的前提下，完成最小单 prompt 编排流程。

它负责识别日常任务、选择既有 prompt、检查输入、记录信息缺口、保存 prompt 输出，并在输出之外添加 Agent 元数据。

本文是规格说明。

它不实现 Agent。

它不改变 prompt 行为。

它不生成交易决策。

---

## 架构位置

Daily Agent 位于 Agent 层。

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
Daily Agent
```

Daily Agent 的唯一主 prompt 是：

```text
prompts/daily-investment-report.md
```

Daily Agent 不调用第二个 prompt。

Daily Agent 不把日常报告扩展为周报、机会报告、组合体检或 IPO 监控。

---

## 适用任务

Daily Agent 只处理一种任务：

> 今天发生了什么，值得长期投资者记录或继续跟踪？

适用输入包括：

- 当日主要新闻或市场事件；
- 持仓公司相关信息；
- 观察名单相关信息；
- 产业链变化；
- 财报、管理层发言、监管变化或资本开支信息；
- 价格、估值、利率、汇率或流动性变化；
- 需要后续验证的研究假设。

不适用任务包括：

- 判断是否买入；
- 判断是否卖出；
- 调整组合权重；
- 完整企业分析；
- 完整估值；
- 周度组合复盘；
- 新机会优先级比较；
- IPO 前研究；
- 日本机会筛选。

如果输入任务超出 Daily Agent 范围，Daily Agent 只记录边界不匹配，并把事项列入后续处理。

---

## 单 prompt 边界

Daily Agent 必须遵守以下边界：

| 项目 | 规则 |
| --- | --- |
| 主 prompt | 只能使用 Daily Investment Report |
| prompt 数量 | 只能使用一个主 prompt |
| 输出结构 | 保留 Daily Investment Report 原始输出结构 |
| 投资判断 | 不新增 prompt 之外的投资判断 |
| 交易动作 | 不生成买入、卖出、加仓、减仓指令 |
| 信息不足 | 明确记录信息缺口，不补全事实 |
| 人工复核 | 对重要后续事项标记人工复核状态 |

Daily Agent 可以在 prompt 输出之外增加元数据。

Daily Agent 不得改写 prompt 输出本身。

当 Daily 输出写入 报告持仓 时，所有 资产类型=watchlist 行必须由 Prompt 输出的研究状态写入 canonical IOS状态：研究建仓、等待估值、等待价格、继续观察 或 降低优先级。这只是当前下一步研究动作；不构成买入、卖出、加仓、减仓、仓位大小或完整组合配置判断。优先级 与 价格位置 保持为独立字段，Daily Agent 不得以它们推导 IOS状态。

---

## 输入要求

Daily Agent 的输入分为三类。

### 1. 必要输入

| 字段 | 说明 |
| --- | --- |
| 日期 | 日常报告对应日期 |
| 任务类型 | 必须为日常信息过滤或每日投资报告 |
| 今日信息 | 当日新闻、市场事件、公司事件或产业事件 |
| 信息来源 | 输入材料来自哪里 |

如果必要输入缺失，Daily Agent 不应继续生成完整报告。

### 2. 建议输入

| 字段 | 说明 |
| --- | --- |
| 当前持仓 | 判断是否与组合已有企业相关 |
| 观察名单 | 判断是否需要更新研究事项 |
| 已有研究假设 | 判断新信息是否影响原假设 |
| 相关行业 | 判断是否属于长期产业变化 |
| 价格或估值变化 | 判断其是否只是短期噪音 |
| 上一次待办事项 | 判断是否需要延续跟踪 |

建议输入缺失时，Daily Agent 可以继续运行，但必须在信息缺口中记录。

### 3. 禁止输入处理

Daily Agent 不得：

- 虚构缺失数据；
- 把未给出的持仓当作已知事实；
- 把市场传言当作确认信息；
- 把价格变化自动解释为基本面变化；
- 把新闻热度自动解释为长期趋势。

---

## 任务识别

Daily Agent 首先识别任务类型。

```text
接收输入
↓
是否为日常信息过滤？
↓
是
↓
进入 Daily Investment Report
```

如果任务不是日常信息过滤：

```text
接收输入
↓
不是日常信息过滤
↓
标记边界不匹配
↓
记录建议后续 prompt
↓
交给人工确认
```

Daily Agent 只做路由识别，不执行其他 prompt。

---

## Prompt 选择

Daily Agent 的 prompt 选择规则固定。

| 识别结果 | 选择 |
| --- | --- |
| 日常信息过滤 | Daily Investment Report |
| 每日投资报告 | Daily Investment Report |
| 今日市场事件记录 | Daily Investment Report |
| 持仓或观察名单当日信息记录 | Daily Investment Report |
| 周度组合维护 | 不处理，记录后续事项 |
| 新投资机会比较 | 不处理，记录后续事项 |
| 完整企业分析 | 不处理，记录后续事项 |
| 完整估值 | 不处理，记录后续事项 |

Daily Agent 不根据输入内容临时切换 prompt。

Daily Agent 不使用多个 prompt 共同生成一个混合结论。

---

## 输入校验

Daily Agent 在调用 prompt 前完成输入校验。

校验顺序如下：

```text
任务类型
↓
日期
↓
今日信息
↓
信息来源
↓
持仓或观察名单相关性
↓
已有研究假设
↓
信息缺口
```

校验结果分为三类：

| 状态 | 含义 | 处理方式 |
| --- | --- | --- |
| 可执行 | 必要输入完整 | 调用 Daily Investment Report |
| 可执行但有缺口 | 必要输入完整，建议输入不足 | 调用 prompt，并记录缺口 |
| 不可执行 | 必要输入缺失 | 不生成完整报告，只输出缺口 |

Daily Agent 不为了完成报告而补全事实。

---

## 信息缺口记录

Daily Agent 必须显式记录信息缺口。

常见信息缺口包括：

- 缺少日期；
- 缺少信息来源；
- 缺少原始事件描述；
- 不知道是否与当前持仓有关；
- 不知道是否与观察名单有关；
- 缺少管理层原话或正式文件；
- 缺少财务影响；
- 缺少产业链位置；
- 缺少后续验证路径。

信息缺口只用于安排后续跟踪。

信息缺口不得被写成投资结论。

---

## 执行流程

Daily Agent 使用以下单 prompt 流程：

```text
接收输入
↓
识别任务类型
↓
确认属于日常信息过滤
↓
选择 Daily Investment Report
↓
校验必要输入
↓
记录信息缺口
↓
调用 Daily Investment Report
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

Daily Agent 的输出由两部分组成。

第一部分是 Daily Investment Report 原始输出。

第二部分是 Agent 元数据。

Daily Agent 不得修改第一部分。

### 1. Prompt 输出

Prompt 输出必须保持以下结构：

```text
# Daily Investment Report

## 1. 今日结论

## 2. 长期重要信号

## 3. 短期噪音

## 4. 需要更新的研究事项

## 5. 需要记录但不行动的事项

## 6. 风险提示

## 7. 下一步
```

### 2. Agent 元数据

Agent 元数据附加在 prompt 输出之后。

```text
---

## Agent Metadata

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
| Input Summary | 概括本次输入范围、日期和来源 |
| Prompt Used | 固定记录 Daily Investment Report |
| Information Gaps | 记录输入不足、证据不足或边界不清之处 |
| Follow-up Items | 记录需要后续研究、复核或等待的信息 |
| Review Status | 标记是否需要人工确认 |

Review Status 使用以下状态：

| 状态 | 含义 |
| --- | --- |
| Not Required | 仅记录或忽略，无需立即人工复核 |
| Required | 存在重要信号、风险或后续研究事项，需要人工确认 |
| Blocked | 必要输入不足，无法生成完整报告 |

---

## 示例流程

### 示例一：持仓公司发布财报

```text
输入：持仓公司发布季度财报
↓
识别：日常信息过滤
↓
Prompt：Daily Investment Report
↓
输出：长期重要信号、短期噪音、需要更新的研究事项
↓
Agent 元数据：记录来源、缺口、后续事项、人工复核状态
```

Daily Agent 不判断是否加仓。

Daily Agent 不更新组合权重。

### 示例二：单日股价大幅波动

```text
输入：某公司单日股价大幅上涨或下跌
↓
识别：日常信息过滤
↓
Prompt：Daily Investment Report
↓
输出：判断是否属于短期噪音
↓
Agent 元数据：记录是否缺少基本面证据
```

Daily Agent 不预测短期价格。

Daily Agent 不把价格波动写成投资结论。

### 示例三：输入要求生成买入建议

```text
输入：要求判断今天是否买入某公司
↓
识别：超出 Daily Agent 边界
↓
处理：不生成交易建议
↓
输出：边界不匹配、信息缺口、人工复核状态
```

Daily Agent 只记录该请求不属于日常报告范围。

---

## 禁止事项

Daily Agent 不得：

- 修改 Book；
- 修改 Prompt Suite；
- 修改 Examples；
- 修改 Daily Investment Report prompt；
- 新增 prompt；
- 调用多个 prompt；
- 混合多个 prompt 的职责；
- 生成买入建议；
- 生成卖出建议；
- 生成加仓或减仓建议；
- 改变组合权重；
- 生成完整企业分析；
- 生成完整估值；
- 生成周度组合报告；
- 生成 IPO 报告；
- 生成当前市场观点；
- 虚构缺失信息。

---

## Review Checklist

Daily Agent 规格变更必须检查：

- 是否只使用 Daily Investment Report 一个主 prompt；
- 是否没有修改 prompt 文件；
- 是否没有改变 Daily Investment Report 输出结构；
- 是否没有新增投资逻辑；
- 是否没有生成交易指令；
- 是否显式记录信息缺口；
- 是否只在 prompt 输出之外添加 Agent 元数据；
- 是否保留人工复核状态；
- 是否没有修改 Book；
- 是否没有修改 Examples；
- 是否没有实现可执行逻辑。

---

## 版本策略

Daily Agent 跟随 Agent 层独立版本策略。

| 版本类型 | 使用场景 |
| --- | --- |
| Patch | 修正文案、格式、错别字或说明不清 |
| Minor | 增加非执行性的元数据字段或边界说明 |
| Major | 改变 Daily Agent 职责、主 prompt 或人工复核规则 |

Daily Agent 的版本变化不得自动改变 Daily Investment Report prompt。

如果 Daily Agent 需要新的 prompt 行为，必须先通过 Prompt Suite issue 处理。
