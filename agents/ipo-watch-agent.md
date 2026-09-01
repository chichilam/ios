# IPO Watch Agent

## 目的

本文定义 Investment Operating System 的 IPO Watch Agent。

IPO Watch Agent 的目标，是在不改变 IPO Watch prompt 的前提下，完成独立的单 prompt 编排流程。

它负责识别 IPO 观察任务、选择既有 prompt、校验输入、记录信息缺口、保存 prompt 输出，并在输出之外添加 Agent 元数据。

本文是规格说明。

它不实现调度器。

它不实现记忆系统。

它不实现工作流引擎。

它不调用其他 Agent。

它不改变 prompt 行为。

它不生成交易执行。

---

## 架构位置

IPO Watch Agent 位于 Agent 层。

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
IPO Watch Agent
```

IPO Watch Agent 的唯一主 prompt 是：

```text
prompts/ipo-watch.md
```

IPO Watch Agent 独立运行。

IPO Watch Agent 不依赖 Daily Agent。

IPO Watch Agent 不依赖 Weekly Agent。

IPO Watch Agent 不依赖 Market Opportunity Agent。

IPO Watch Agent 不依赖 Portfolio Health Agent。

IPO Watch Agent 不调用第二个 prompt。

IPO Watch Agent 不把 IPO 观察扩展为认购策略、上市首日交易策略、当前可投资机会比较或组合维护。

---

## 核心问题

IPO Watch Agent 只回答一个问题：

> 这家 IPO 前公司是否已经适合进入研究跟踪，还是仍然只是传闻或噪音？

这个问题包含三个约束：

- 区分传闻、公开证据、官方申报文件和研究准备度；
- 没有官方申报文件或招股书时，不形成估值或投资结论；
- 输出研究准备和跟踪状态，不输出认购、买入或交易指令。

IPO Watch Agent 不判断是否应该参与 IPO。

它也不判断上市首日应该如何交易。

---

## 适用任务

适用输入包括：

- 报告日期或报告周期；
- IPO 候选公司；
- 预计上市时间或当前状态；
- 公司类别和商业模式；
- 所属行业；
- 所处价值链位置；
- 私募融资历史；
- 已披露或被报道的收入、增长、盈利能力和现金消耗；
- 管理层和治理信息；
- 竞争地位；
- 战略伙伴和主要客户；
- 可获得的财务披露；
- 可比较的上市公司；
- 传闻估值或私募融资估值；
- 预计上市市场或交易所；
- 锁定期、流动性、配售和可获得性约束；
- 新 NISA 适配性考虑；
- 证据缺口；
- 主要风险。

不适用任务包括：

- IPO 认购策略；
- 上市首日交易策略；
- 短期投机；
- 每日信息过滤；
- 周度组合行动计划；
- 当前可投资机会比较；
- 日本市场专项机会筛选；
- 组合健康审计；
- 交易执行。

如果输入任务超出 IPO Watch Agent 范围，IPO Watch Agent 只记录边界不匹配，并把事项列入后续处理。

---

## 单 prompt 边界

IPO Watch Agent 必须遵守以下边界：

| 项目 | 规则 |
| --- | --- |
| 主 prompt | 只能使用 IPO Watch |
| prompt 数量 | 只能使用一个主 prompt |
| Agent 数量 | 只能运行 IPO Watch Agent 本身 |
| 输出结构 | 保留 IPO Watch 原始输出结构 |
| 输出性质 | 输出研究准备和证据跟踪，不输出投资结论 |
| IPO 行动 | 不生成认购、买入、卖出或上市首日交易指令 |
| 信息不足 | 明确记录信息缺口，不补全事实 |
| 人工复核 | 对研究准备、官方文件等待、上市替代方案比较或排除事项标记人工复核状态 |

IPO Watch Agent 可以在 prompt 输出之外增加元数据。

IPO Watch Agent 不得改写 prompt 输出本身。

---

## 输入要求

IPO Watch Agent 的输入分为三类。

### 1. 必要输入

| 字段 | 说明 |
| --- | --- |
| 报告日期或周期 | IPO 观察对应时间范围 |
| 任务类型 | 必须为 IPO 观察或 IPO Watch |
| IPO 候选公司 | 用于确定观察对象 |
| 当前状态 | 用于区分传闻、报道、官方文件或上市准备阶段 |
| 信息来源 | 用于判断证据可靠性 |
| 已有证据 | 用于判断是否适合进入研究跟踪 |

如果必要输入缺失，IPO Watch Agent 不应继续生成完整报告。

### 2. 建议输入

| 字段 | 说明 |
| --- | --- |
| 所属行业和价值链位置 | 判断是否值得长期跟踪 |
| 商业模式 | 判断是否具备研究基础 |
| 管理层和治理信息 | 判断治理风险是否可识别 |
| 财务披露或报道数据 | 判断是否具备研究准备度 |
| 可比较上市公司 | 判断是否存在更清晰的替代研究对象 |
| 预计上市市场或交易所 | 判断可获得性和流动性约束 |
| 锁定期、配售和可获得性信息 | 判断执行和行为风险 |
| 新 NISA 约束 | 判断未来是否可能适合长期税收账户 |

建议输入缺失时，IPO Watch Agent 可以继续运行，但必须在信息缺口中记录。

### 3. 禁止输入处理

IPO Watch Agent 不得：

- 虚构融资历史；
- 虚构收入、利润或现金消耗；
- 虚构客户；
- 虚构上市时间；
- 虚构估值；
- 虚构交易所；
- 虚构锁定期；
- 虚构招股书或官方申报文件；
- 把传闻当作事实；
- 把私募估值当作公开市场合理价值；
- 把品牌热度、用户热度或媒体热度当作企业质量。

---

## 任务识别

IPO Watch Agent 首先识别任务类型。

```text
接收输入
↓
是否为 IPO 观察或研究准备？
↓
是
↓
进入 IPO Watch
```

如果任务不是 IPO 观察：

```text
接收输入
↓
不是 IPO 观察
↓
标记边界不匹配
↓
记录建议后续 prompt
↓
交给人工确认
```

IPO Watch Agent 只做路由识别，不执行其他 prompt。

IPO Watch Agent 不调用 Daily Agent、Weekly Agent、Market Opportunity Agent、Portfolio Health Agent 或任何其他 Agent。

---

## Prompt 选择

IPO Watch Agent 的 prompt 选择规则固定。

| 识别结果 | 选择 |
| --- | --- |
| IPO 观察 | IPO Watch |
| IPO 前公司研究准备 | IPO Watch |
| 判断传闻是否值得跟踪 | IPO Watch |
| 判断是否等待官方申报文件 | IPO Watch |
| IPO 认购策略 | 不处理，记录后续事项 |
| 上市首日交易策略 | 不处理，记录后续事项 |
| 当前可投资机会比较 | 不处理，记录后续事项 |
| 周度组合维护 | 不处理，记录后续事项 |
| 组合健康审计 | 不处理，记录后续事项 |
| 日本专项机会筛选 | 不处理，记录后续事项 |

IPO Watch Agent 不根据输入内容临时切换 prompt。

IPO Watch Agent 不使用多个 prompt 共同生成一个混合结论。

---

## 输入校验

IPO Watch Agent 在调用 prompt 前完成输入校验。

校验顺序如下：

```text
任务类型
↓
报告日期或周期
↓
IPO 候选公司
↓
当前状态
↓
信息来源
↓
已有证据
↓
行业、商业模式、财务披露、上市替代方案和可投资性约束
↓
信息缺口
```

校验结果分为三类：

| 状态 | 含义 | 处理方式 |
| --- | --- | --- |
| 可执行 | 必要输入完整 | 调用 IPO Watch |
| 可执行但有缺口 | 必要输入完整，建议输入不足 | 调用 prompt，并记录缺口 |
| 不可执行 | 必要输入缺失 | 不生成完整报告，只输出缺口 |

IPO Watch Agent 不为了完成报告而补全事实。

---

## 证据状态

IPO Watch Agent 必须区分证据状态。

| 状态 | 含义 | 处理方式 |
| --- | --- | --- |
| 传闻 | 来源不清、无法验证或只有市场讨论 | 仅记录，不形成研究结论 |
| 媒体报道 | 有公开报道，但缺少官方文件 | 标记未验证，等待更多证据 |
| 可靠公开资料 | 有可信公开资料，但关键财务或治理信息不足 | 可进入观察或研究准备 |
| 官方申报文件 | 有招股书或官方申报文件 | 可进行正式研究准备 |
| 信息不足 | 无法判断来源或内容 | 输出缺口，避免结论 |

证据状态不得被省略。

传闻和媒体报道不得被写成事实。

---

## 信息缺口记录

IPO Watch Agent 必须显式记录信息缺口。

常见信息缺口包括：

- 缺少报告日期或周期；
- 缺少信息来源；
- 缺少候选公司当前状态；
- 缺少官方申报文件或招股书；
- 缺少收入结构；
- 缺少毛利率或经营利润率；
- 缺少自由现金流或现金消耗信息；
- 缺少客户集中度；
- 缺少股权结构；
- 缺少管理层和治理安排；
- 缺少发行价格或估值区间；
- 缺少流通股比例；
- 缺少锁定期；
- 缺少配售和可获得性安排；
- 缺少上市替代方案比较对象。

信息缺口只用于安排后续跟踪。

信息缺口不得被写成 IPO 投资结论。

---

## 执行流程

IPO Watch Agent 使用以下单 prompt 流程：

```text
接收输入
↓
识别任务类型
↓
确认属于 IPO 观察
↓
选择 IPO Watch
↓
校验必要输入
↓
识别证据状态
↓
记录信息缺口
↓
调用 IPO Watch
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

IPO Watch Agent 的输出由两部分组成。

第一部分是 IPO Watch 原始输出。

第二部分是 Agent 元数据。

IPO Watch Agent 不得修改第一部分。

### 1. Prompt 输出

Prompt 输出必须保持以下结构：

```text
# IPO Watch

## 1. IPO 观察结论

## 2. 候选公司状态

## 3. 研究准备度

## 4. IOS 初筛

## 5. 官方证据与信息缺口

## 6. 与上市替代方案比较

## 7. 可投资性与新 NISA 约束

## 8. 风险与排除理由

## 9. 下一步
```

### 2. Agent 元数据

Agent 元数据附加在 prompt 输出之后。

```text
---

## Agent Metadata

### Run Context

### Input Summary

### Prompt Used

### Evidence Status

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
| Input Summary | 概括本次输入范围、IPO 候选和来源 |
| Prompt Used | 固定记录 IPO Watch |
| Evidence Status | 记录传闻、报道、可靠公开资料、官方申报文件或信息不足 |
| Information Gaps | 记录输入不足、证据不足或边界不清之处 |
| Follow-up Items | 记录需要继续监控、等待官方文件或准备研究的事项 |
| Review Status | 标记是否需要人工确认 |

Review Status 使用以下状态：

| 状态 | 含义 |
| --- | --- |
| Not Required | 仅监控或因证据不足延后，无需立即人工复核 |
| Required | 存在加入观察名单、启动 IPO 前研究、等待官方文件或与上市替代方案比较事项，需要人工确认 |
| Blocked | 必要输入不足，无法生成完整报告 |

---

## 独立运行边界

IPO Watch Agent 的独立运行含义是：

- 可以直接接收 IPO 观察输入；
- 可以独立选择 IPO Watch；
- 可以独立校验输入；
- 可以独立识别证据状态；
- 可以独立记录信息缺口；
- 可以独立附加 Agent 元数据；
- 不需要 Daily Agent 的输出作为前置条件；
- 不需要 Weekly Agent 的输出作为前置条件；
- 不需要 Market Opportunity Agent 的输出作为前置条件；
- 不需要 Portfolio Health Agent 的输出作为前置条件；
- 不需要其他 Agent 的状态作为前置条件。

IPO Watch Agent 可以接收人工提供的候选公司、来源、官方文件、报道和上市替代方案材料。

IPO Watch Agent 不得自动读取、合并或调用其他 Agent 的输出。

---

## 示例流程

### 示例一：候选公司有官方申报文件

```text
输入：IPO 候选公司、官方申报文件、业务和财务披露、上市替代方案
↓
识别：IPO 观察
↓
证据状态：官方申报文件
↓
Prompt：IPO Watch
↓
输出：观察结论、研究准备度、IOS 初筛、官方证据与信息缺口
↓
Agent 元数据：记录运行上下文、证据状态、后续事项、复核状态
```

IPO Watch Agent 不生成认购建议。

IPO Watch Agent 不生成上市首日交易策略。

### 示例二：只有市场传闻

```text
输入：某公司可能上市的市场传闻
↓
识别：IPO 观察
↓
证据状态：传闻
↓
Prompt：IPO Watch
↓
输出：仅监控或因证据不足延后
↓
Agent 元数据：记录缺少官方申报文件、财务披露和上市安排
```

IPO Watch Agent 不把传闻写成事实。

IPO Watch Agent 不形成估值或投资结论。

### 示例三：输入要求认购 IPO

```text
输入：要求判断是否认购某 IPO
↓
识别：超出 IPO Watch Agent 边界
↓
处理：不调用其他 prompt
↓
输出：边界不匹配、信息缺口、复核状态
```

IPO Watch Agent 只记录该请求不属于 IPO 研究准备范围。

---

## 禁止事项

IPO Watch Agent 不得：

- 修改 Book；
- 修改 Prompt Suite；
- 修改 Examples；
- 修改 IPO Watch prompt；
- 新增 prompt；
- 调用多个 prompt；
- 调用其他 Agent；
- 混合多个 prompt 的职责；
- 生成 IPO 认购策略；
- 生成上市首日交易策略；
- 生成买入建议；
- 生成卖出建议；
- 生成加仓或减仓建议；
- 改变组合权重；
- 执行新 NISA 资金投入；
- 生成每日信息过滤；
- 生成周度组合维护报告；
- 生成当前可投资机会报告；
- 生成日本市场专项机会报告；
- 生成组合健康审计；
- 生成当前市场观点；
- 实现调度器、记忆系统或工作流引擎；
- 虚构缺失信息。

---

## Review Checklist

IPO Watch Agent 规格变更必须检查：

- 是否只使用 IPO Watch 一个主 prompt；
- 是否没有调用其他 Agent；
- 是否没有修改 prompt 文件；
- 是否没有改变 IPO Watch 输出结构；
- 是否没有新增投资逻辑；
- 是否没有生成认购、买入、卖出或上市首日交易指令；
- 是否显式区分传闻、证据、官方申报文件和研究准备度；
- 是否显式记录信息缺口；
- 是否没有生成当前可投资机会结论；
- 是否只在 prompt 输出之外添加 Agent 元数据；
- 是否保留人工复核状态；
- 是否没有修改 Book；
- 是否没有修改 Examples；
- 是否没有实现调度器、记忆系统或工作流引擎。

---

## 版本策略

IPO Watch Agent 跟随 Agent 层独立版本策略。

| 版本类型 | 使用场景 |
| --- | --- |
| Patch | 修正文案、格式、错别字或说明不清 |
| Minor | 增加非执行性的元数据字段或边界说明 |
| Major | 改变 IPO Watch Agent 职责、主 prompt 或人工复核规则 |

IPO Watch Agent 的版本变化不得自动改变 IPO Watch prompt。

如果 IPO Watch Agent 需要新的 prompt 行为，必须先通过 Prompt Suite issue 处理。
