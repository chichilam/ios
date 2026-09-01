# Agent Runtime Core Specification

本文定义 Investment Operating System v2.0 Agent Runtime 的核心规格。

它是 [v2.0 Roadmap](v2.0-roadmap.md) 和 [v2.0 Architecture Overview](v2.0-architecture.md) 之后，第一份贴近实现的设计文档。它在任何 Runtime 代码或 MCP 连接器开发开始之前，先定义 Runtime 到底负责什么。

本文不实现任何代码。它只定义职责、组件、生命周期、契约、人工复核规则、错误处理和最小评估钩子。

---

## 背景

v1.0 的 Agent 文档（见 [Agent 架构](../agents/README.md)）只是规格，不可执行。

v2.0 引入可执行的 Agent Runtime，但 Runtime 必须保持有界：

- 它执行 Prompt Suite 和 Agent 规格定义的工作流；
- 它不做自主投资决策；
- 它不直接执行交易；
- 它把所有投资行动都路由给 Human Review；
- 它依赖抽象接口，而不是具体的 MCP 连接器。

Runtime 是 [Agent Architecture](../agents/README.md) 中定义的编排原则的可执行版本，不重新定义那些原则，也不改变 [Prompt Suite](../prompts/README.md) 已冻结的执行边界。

---

## 1. Runtime 职责

Agent Runtime 负责：

- 接收来自用户、定时调度或事件的触发；
- 选择正确的 Agent 工作流（参照 [Agent 架构](../agents/README.md) 中的路由表）；
- 加载正确的 Prompt Suite 工作流；
- 通过 Tool / Data Provider Interface 调用工具；
- 在需要研究支持时，把研究任务转交给 Research Engine；
- 产出结构化输出；
- 在有副作用的工具调用执行前触发 Pre-Execution Policy Gate；
- 在产出结构化输出后触发 Post-Output Human Review Gate；
- 记录执行元数据（谁触发、用了哪个 Agent、哪个 prompt、结果如何、经过了哪些 gate、是否被批准）。

---

## 2. Runtime 非职责

Agent Runtime 明确不负责：

- 自主交易；
- 直接对接券商执行下单；
- 在没有 Human Review 的情况下执行任何投资行动；
- 隐式修改 Book 中的投资原则；
- 直接依赖具体的 MCP 连接器实现；
- 承担超出执行元数据范围的长期知识建模（长期知识建模属于 Knowledge Base，见 [v2.0 Architecture Overview](v2.0-architecture.md)）。

---

## 3. 核心组件

| 组件 | 职责 |
| --- | --- |
| Planner | 解析触发内容，判断需要执行哪个（或哪些）Agent 工作流 |
| Agent Router | 依据 [Agent 架构](../agents/README.md) 的路由表，把任务路由到正确的 Agent 规格 |
| Prompt Loader | 加载 Agent 规格对应的 Prompt Suite prompt，不修改 prompt 内容 |
| Tool / Data Provider Client | 通过 Tool / Data Provider Interface 请求数据和工具能力，不关心背后的具体 MCP 实现 |
| Research Engine Client | 在工作流需要研究支持时，把研究任务转交给 Research Engine，并接收研究结论 |
| Output Normalizer | 把 prompt 执行结果整理为 Runtime 标准输出结构，不改变投资判断内容 |
| Pre-Execution Policy Gate | 在任何有外部副作用的 Tool Request 实际执行之前拦截，判断是否需要人工批准（见第 6 节） |
| Post-Output Human Review Gate | 在结构化输出产出之后拦截，判断是否命中投资行动类的人工复核规则（见第 6 节） |
| Execution Logger | 记录每次执行的输入摘要、使用的 Agent/prompt、输出、经过的 gate 类型、批准/拒绝结果和时间戳 |
| Error Handler | 按第 7 节定义的规则处理各类执行失败 |

这些组件是 Runtime 内部的执行引擎组成部分，与 [v2.0 Roadmap](v2.0-roadmap.md) Epic 1 中列出的 Planner、Research Agent、Portfolio Agent、Reviewer、Critic、Memory 等 Agent 角色不是同一层概念——本文定义的是承载这些角色运行的 Runtime 核心机制；各 Agent 角色的具体行为由它们各自对应的 Agent 规格定义。

---

## 4. 执行生命周期

Runtime 有两个人工确认点，作用于不同阶段：

- **Pre-Execution Policy Gate**：在任何有外部副作用的工具调用**实际执行之前**拦截。副作用一旦发生就不可撤销，所以这个 gate 必须在执行前，而不是在输出阶段。
- **Post-Output Human Review Gate**：在结构化输出产出之后拦截，判断是否命中投资行动类的复核规则（买卖建议、配置变化等）。

```text
Trigger
  ↓
Plan
  ↓
Route
  ↓
Load Prompt
  ↓
Prepare Tool Request
  ↓
Is side-effecting?
  ├─ No  → Execute Tool
  └─ Yes → Pre-Execution Policy Gate → Human approval
             ├─ Approved → Execute Tool
             └─ Rejected → Skip Tool, record rejection
  ↓
Fetch Research (if needed)
  ↓
Execute Workflow
  ↓
Normalize Output
  ↓
Evaluate Minimal Checks
  ↓
Post-Output Human Review Gate if needed
  ↓
Log Execution
```

说明：

- **Trigger**：Planner 接收触发（用户请求、定时调度、外部事件）。
- **Plan**：Planner 判断这是单一任务还是需要多个 Agent 顺序处理（参照 [Agent 架构](../agents/README.md) 的多 prompt 编排流程）。
- **Route**：Agent Router 选定要使用的 Agent 规格。
- **Load Prompt**：Prompt Loader 加载对应的 Prompt Suite prompt，原样使用，不修改。
- **Prepare Tool Request**：Tool / Data Provider Client 组装工具请求，并标记该请求是否具有外部副作用（见第 5 节 Tool Request 契约）。
- **Is side-effecting?**：只读请求（例如读取市场数据、读取笔记）直接执行；有外部副作用的写请求（写入 Notion、发送邮件、发送通知等）必须先经过 Pre-Execution Policy Gate。
- **Pre-Execution Policy Gate → Human approval**：在工具调用执行前等待人工批准。批准则执行，拒绝则跳过该工具调用并记录拒绝原因，不产生副作用。
- **Fetch Research (if needed)**：如果工作流需要研究支持，Research Engine Client 在此阶段把研究任务转交给 Research Engine，并等待研究结论返回——这一步是 Runtime 调度 Research Engine，Research Engine 只返回结果，不反向控制 Runtime 的执行流程（与 [v2.0 Architecture Overview](v2.0-architecture.md) 中「控制流」与「数据返回流」分离的原则一致）。
- **Execute Workflow**：按加载的 prompt 执行工作流。
- **Normalize Output**：Output Normalizer 整理为标准输出结构。
- **Evaluate Minimal Checks**：执行第 8 节定义的最小评估钩子。
- **Post-Output Human Review Gate if needed**：命中第 6 节投资行动类规则时，输出被拦截，等待人工确认；未命中则直接进入日志记录。这个 gate 不处理工具调用的副作用——副作用已经在 Pre-Execution Policy Gate 阶段被处理过。
- **Log Execution**：Execution Logger 记录本次执行的完整元数据，包括经过的 gate 类型、批准/拒绝结果，以及每个有副作用的工具调用是否实际执行。

---

## 5. 输入 / 输出契约

以下只定义高层字段，不规定具体实现语言或数据格式。

### Trigger Input

- 触发来源（用户 / 定时调度 / 事件）
- 触发时间
- 触发内容（例如用户问题、调度任务标识、事件负载）

### Agent Execution Request

- 目标 Agent 规格标识
- 输入摘要（参照 [Agent 架构](../agents/README.md) 中的标准输入字段：日期、任务类型、投资者画像、持仓、观察名单等）
- 关联的 Trigger

### Tool Request

- 请求的能力类型（读取市场数据 / 读取笔记 / 写入通知等）
- 请求参数
- 是否为具有外部副作用的写操作（用于判断是否需要经过 Pre-Execution Policy Gate，见第 4 节和第 6 节）

### Research Request

- 研究类型（个股 / 行业 / 宏观 / IPO）
- 研究范围和已知输入
- 已有研究假设（如有）

### Agent Output

- 使用的 Agent 规格和 prompt
- 输入摘要
- 关键结论
- 信息缺口
- 风险提示
- 后续事项
- 是否需要人工复核（及命中的规则）
- 下一次复查时间或触发条件

Agent Output 的结构与 [Agent 架构](../agents/README.md) 中定义的标准输出保持一致；Runtime 只在其上追加执行元数据，不改变投资判断内容。

### Pre-Execution Approval Request

- 关联的 Tool Request
- 副作用类型（写入 Notion / 发送邮件 / 发送通知 / 其他外部写操作）
- 请求批准的具体动作和参数
- 批准结果（批准 / 拒绝）及时间戳

### Post-Output Human Review Request

- 关联的 Agent Output
- 命中的人工复核规则
- 待确认的具体投资行动
- 复核截止时间（如适用）

### Execution Log Record

- 执行标识
- 触发来源和时间
- 使用的 Agent / Prompt
- 工具调用摘要，包含每个有副作用的调用是否经过 Pre-Execution Policy Gate、批准/拒绝结果、是否实际执行
- 输出摘要
- 最小评估结果
- Post-Output Human Review 状态（无需复核 / 待复核 / 已确认 / 已拒绝）
- 执行成功/失败状态

---

## 6. Human Review 规则

Runtime 有两个不同阶段的人工确认点，触发条件和拦截对象不同：

### Pre-Execution Policy Gate（执行前）

在有外部副作用的工具调用**实际执行之前**拦截，防止不可逆的副作用在未经确认时发生。以下 Tool Request 必须触发：

- 写入 Notion / GitHub / Knowledge Base；
- 发送邮件或通知；
- 修改日历或其他外部系统；
- 任何不可逆或高影响的工具调用。

只读请求（读取市场数据、读取笔记等）不触发这个 gate，直接执行。

### Post-Output Human Review Gate（输出后）

在结构化输出产出、经过最小评估之后拦截，判断是否命中投资行动类规则。以下情况必须触发：

- 任何买入 / 卖出 / 加仓 / 减仓 / 持有的行动建议；
- 任何组合配置权重变化；
- 任何高影响通知（内容层面，而非发送动作本身——发送动作已在 Pre-Execution 阶段处理）；
- 任何证据不足或不确定的结论。

这与 [Agent 架构](../agents/README.md) 中「人工复核」章节定义的规则一致，Runtime 只是把这些规则变成可执行的判断逻辑，不改变规则本身。

两个 gate 分工明确：Pre-Execution Policy Gate 拦截「是否可以执行这个有副作用的动作」，Post-Output Human Review Gate 拦截「是否可以采纳这个投资相关的结论/建议」。具体 policy 细节由后续实现 Epic 定义，本文只确立这两个边界的存在和触发时机（与 [v2.0 Architecture Overview](v2.0-architecture.md) 中 Human Review 边界的说明一致）。

---

## 7. 错误处理

| 场景 | Runtime 行为 |
| --- | --- |
| 数据缺失 | 标记信息缺口，停止生成依赖该数据的结论，记录待办 |
| 工具调用失败 | 记录失败原因，重试策略由具体 Tool / Data Provider 实现决定，Runtime 核心逻辑本身不重试超出一次的失败调用；连续失败则标记该工作流为不完整并转人工复核 |
| Prompt 不匹配（Agent Router 选择的 prompt 与任务类型不符） | 停止执行，记录路由错误，转 Planner 重新判断 |
| 输出结构不合规（Output Normalizer 无法产出合规结构） | 拒绝写入 Execution Log 的成功状态，标记为执行失败，转人工复核 |
| 路由歧义（Agent Router 无法唯一确定 Agent） | 不猜测，记录多个候选 Agent，转人工复核决定 |
| Pre-Execution Policy Gate 拒绝 | 跳过该工具调用，不产生副作用，记录拒绝原因；工作流按缺失该数据/动作的情况继续（视为信息缺口）或终止，取决于该数据是否为后续步骤的必需输入 |
| Post-Output Human Review Gate 拒绝 | 记录拒绝结果和原因，终止该次执行的后续动作，不自动重试或改写结论以规避拒绝 |

所有错误处理都遵循 [Agent 架构](../agents/README.md) 中的原则：不为了完成流程而补全事实，不把不确定性隐藏在结论里。

---

## 8. 最小评估钩子

以下是 Milestone 1 起必须交付的最小评估子集（对应 [v2.0 Architecture Overview](v2.0-architecture.md) 中 Evaluation Framework 的最小子集起步策略）：

- **输出结构校验**：Agent Output 是否包含所有必需字段。
- **必需 section 检查**：prompt 定义的必需输出 section 是否齐全。
- **工具调用完整性检查**：工作流声明需要的工具调用是否都已执行且返回有效结果。
- **Gate 触发正确性检查**：命中第 6 节规则的工具调用和输出是否都被正确拦截（Pre-Execution Policy Gate 和 Post-Output Human Review Gate 分别检查），未命中规则的是否没有被误拦截。
- **执行成功/失败状态**：每次执行是否有明确的成功或失败标记，不允许模糊状态。

这些检查在 Milestone 1 阶段是轻量、规则化的校验，不涉及研究结论质量的语义评分——语义层面的评估属于 Evaluation Framework 完整体系（Milestone 5），本文只确立最小起步集合。

---

## 非目标

本文档不包括、也不在本 Issue 范围内实现：

- Runtime 的实际代码；
- 具体 MCP 连接器实现；
- Research Engine 的内部实现；
- Portfolio Operating System 的实现；
- 新的投资哲学或投资框架；
- 对 Book、Prompt Suite、Agent v0.1 规格的任何修改。

---

## 参考文档

- [v2.0 Roadmap](v2.0-roadmap.md)：愿景、Epic 定义、优先级和里程碑规划
- [v2.0 Architecture Overview](v2.0-architecture.md)：系统分层、依赖模型、接口边界
- [Agent 架构](../agents/README.md)：Agent 规格层（v0.1，spec-only），定义 Runtime 所编排的 Agent 职责和路由原则
- [Prompt Suite](../prompts/README.md)：Runtime 加载和执行的工作流定义来源
