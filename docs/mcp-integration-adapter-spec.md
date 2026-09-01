# MCP Integration Adapter Specification

本文定义 MCP Integration Adapter 的规格：具体 adapter 如何实现 [Tool / Data Provider Interface](tool-data-provider-interface.md)，把真实工具和数据源接入 Agent Runtime，同时不让 Runtime 与具体供应商细节耦合。

本文不实现任何 adapter 代码。它只定义 adapter 职责、注册元数据、请求/响应流程、归一化规则、错误映射、安全基线和示例。

---

## 背景

以下 v2.0 设计文档已经就位：

- [v2.0 Roadmap](v2.0-roadmap.md)
- [v2.0 Architecture Overview](v2.0-architecture.md)
- [Agent Runtime Core Specification](agent-runtime-core-spec.md)
- [Tool / Data Provider Interface Specification](tool-data-provider-interface.md)

Tool / Data Provider Interface 已经定义了 Runtime 如何请求外部数据和工具能力，以及 Adapter operation metadata 作为效果分类权威来源的机制（见该文档第 3 节）。

下一步是定义 adapter 层本身：真实的 MCP 连接器如何实现这个已批准的接口。本文就是这份规格。未来任何具体 adapter 的实现 Issue，都应实现本文定义的规格，而不是重新定义 adapter 的职责边界。

---

## 1. Adapter 目的

MCP Adapter：

- 实现 [Tool / Data Provider Interface](tool-data-provider-interface.md)，是该接口的具体实现方式之一；
- 向 Agent Runtime 隐藏具体供应商的 API 细节——Runtime 只面向接口调用，不知道背后是 GitHub API、Notion API 还是某个市场数据供应商；
- 把供应商返回的原始数据归一化为 Tool / Data Provider Interface 定义的 Response 契约格式；
- 声明每个 operation 的固有 metadata（effect class、权限范围、approval policy 等），作为该操作效果分类的权威来源；
- 对有副作用的操作强制执行 approval-context 校验——在执行前独立验证请求携带的批准凭证是否有效，不依赖 Runtime 单方面的判断。

---

## 2. Adapter 类型

v2.0 的候选 adapter 类别：

| Adapter | 典型能力 |
| --- | --- |
| GitHub adapter | 读取 Issue、PR、研究笔记；（未来视 policy 决定是否支持写入） |
| Notion adapter | 读写投资笔记、研究数据库、决策日志 |
| Gmail / notification adapter | 读取公司公告邮件；发送通知或邮件 |
| Google Calendar adapter | 读取财报日历、会议安排；写入或修改日历事件 |
| Market data adapter | 读取实时/历史价格、成交量等市场数据 |
| Filing / news adapter | 读取监管申报文件、新闻 |
| Model provider adapter | 调用模型供应商进行推理 |

具体接入哪些供应商、以什么顺序实现，由后续实现 Issue 决定；本文只定义类别和它们各自应遵循的规格。

---

## 3. Adapter 注册元数据

每个 adapter 在被 Runtime 使用前，必须声明以下注册元数据：

- **adapter id**：唯一标识该 adapter。
- **provider name**：背后连接的具体供应商（例如 "notion"、"github"）。
- **supported capability types**：该 adapter 支持的能力类型，取值来自 [Tool / Data Provider Interface](tool-data-provider-interface.md) 第 2 节的能力分类。
- **supported operations**：该 adapter 暴露的具体操作列表（例如 `read_price`、`write_note`）。
- **operation metadata for each operation**：每个操作的固有 metadata，字段与 [Tool / Data Provider Interface](tool-data-provider-interface.md) 第 3 节一致：effect class、required permission scopes、approval policy、idempotency、retry safety、cost/quota impact。
- **required permissions / scopes**：adapter 本身连接供应商所需的权限范围（区别于单个 operation 的 permission scopes，这是 adapter 级别的整体授权）。
- **read-only vs side-effecting / high-impact classifications**：adapter 支持的所有操作，按 effect class 汇总分类，便于 Runtime 在注册阶段做整体审计。
- **authentication requirements**：该 adapter 连接供应商所需的认证方式（例如 API key、OAuth token），不在本文规定具体凭证如何存储或轮换。
- **rate limit and quota behavior**：供应商侧的速率限制和配额规则，adapter 应声明自己已知的限制，供 Runtime 在调度时参考。
- **approval context validation obligation**：adapter 是否暴露 side-effecting/high-impact 操作；若是，必须在注册时声明自己会执行第 5 节定义的 Approval Context Validation Contract，不能只依赖 Runtime 已经批准这一假设。

这些注册元数据在 adapter 接入时一次性声明，是后续所有请求的 effective classification 判断依据（见第 4 节）。

---

## 4. Operation Metadata 强制执行

延续 [Tool / Data Provider Interface](tool-data-provider-interface.md) 第 3 节已确立的原则：

- Runtime 可以在 Tool Request 中提供 caller-declared intent（调用方对本次请求效果的声明）；
- **Adapter 声明的 operation metadata 才是该操作实际行为的权威定义**，不是调用方的声明；
- 当 caller-declared intent 与 adapter metadata 冲突时，必须 **fail closed**：拒绝执行，返回 `policy classification mismatch`，不得由 Runtime 或 Adapter 任一方单方面裁决继续执行；
- 任何被 adapter metadata 标记为 `side-effecting` 或 `high-impact` 的操作，执行前必须携带有效的 approval context；
- Adapter 必须拒绝缺失或无效 approval context 的 side-effecting/high-impact 请求，返回 `approval missing/invalid`，而不是信任 Runtime 已经完成批准这一假设。

这一节不重新定义规则，只是把 [Tool / Data Provider Interface](tool-data-provider-interface.md) 中对 Adapter 的要求，落到具体 adapter 规格的执行义务上：每个 adapter 在实现时都必须满足这些强制条件，不能因为是"某个具体 adapter"而放松。

---

## 5. Approval Context Validation Contract

第 4 节要求 side-effecting/high-impact 操作携带"有效"的 approval context，但"有效"不能只理解为"这个用户曾经批准过"。如果 approval context 是一个孤立的批准标记，不绑定具体请求内容，就可能出现：

- 同一个 approval token 被重复使用（replay）；
- 批准 `write_note(A)` 的 token 被挪用到 `write_note(B)`；
- 批准某个 operation 的 token 被用于另一个 operation；
- 请求参数在批准之后被修改，但仍沿用原来的批准；
- 已过期的批准仍被 adapter 接受。

因此，approval context 必须绑定以下字段，而不是仅携带一个批准标记：

- **request id**：对应发起批准的具体 Tool Request。
- **adapter id**：批准所针对的 adapter。
- **operation name**：批准所针对的具体操作。
- **capability type**：批准所针对的能力类型。
- **normalized input hash / parameter hash**：对请求参数归一化后计算的哈希，防止参数在批准后被篡改而不被察觉。
- **effect class**：批准时确认的效果分类，防止批准后被降级利用（例如先以 read-only 名义获得宽松批准，再执行实际是 side-effecting 的操作）。
- **approved_by**：批准人标识。
- **approved_at**：批准时间。
- **expires_at**：批准的有效截止时间。
- **single-use / nonce / consumed status**：标记该批准是否为一次性使用，以及是否已被消费。

Adapter 在执行任何 side-effecting/high-impact 操作前，必须完成以下校验，全部通过才能执行：

```text
approval context
  matches request id
  matches adapter + operation
  matches parameter hash
  not expired
  not previously consumed
  effect class is not downgraded
```

任意一项不匹配，Adapter 必须 fail closed：拒绝执行，并将此结果映射到第 8 节定义的标准错误分类（`approval missing/invalid` 及其子场景）。校验通过并执行后，adapter 必须将该 approval context 标记为已消费（consumed），防止同一批准被重放用于后续任何请求——包括参数完全相同的重复请求。

这个校验契约是第 4 节"approval context 有效性"要求的具体化：有效不等于存在，而是**绑定到本次具体请求、在有效期内、且尚未被使用过**。

---

## 6. 请求 / 响应流程

单次工具调用在 adapter 层的完整流程：

```text
Agent Runtime
  ↓
Tool / Data Provider Interface
  ↓
Adapter metadata lookup
  ↓
Effective policy classification
  ↓
Pre-Execution Policy Gate if required
  ↓
Approval Context Validation (side-effecting / high-impact only)
  ↓
Adapter execution
  ↓
Normalized Tool Response
```

说明：

- **Agent Runtime**：Tool / Data Provider Client 组装 Tool Request（见 [Agent Runtime Core Specification](agent-runtime-core-spec.md) 第 5 节）。
- **Tool / Data Provider Interface**：请求经过统一接口，不指向任何具体 adapter 的私有 API。
- **Adapter metadata lookup**：根据 Tool Request 中的 capability type 和 operation name，查找对应 adapter 声明的 operation metadata（第 3 节）。
- **Effective policy classification**：结合 caller-declared intent 和 adapter metadata 得出最终分类（取更严格者），冲突则 fail closed（第 4 节）。
- **Pre-Execution Policy Gate if required**：分类为 side-effecting 或 high-impact 时，路由到 Runtime 的 Pre-Execution Policy Gate，等待人工批准；批准前 adapter 不会被调用（见 [Agent Runtime Core Specification](agent-runtime-core-spec.md) 第 4 节的执行生命周期）。
- **Approval Context Validation**：仅适用于 side-effecting/high-impact 操作。批准后，adapter 在实际调用供应商 API 之前，必须按第 5 节的绑定规则独立校验 approval context——不因为已经通过 Pre-Execution Policy Gate 就跳过这一步。只读操作没有这一步，直接进入执行。
- **Adapter execution**：只读操作直接执行；side-effecting/high-impact 操作在 approval context 校验通过后才执行，并在执行后立即标记该 approval context 为已消费。
- **Normalized Tool Response**：adapter 把供应商原始响应转换为标准 Response 契约格式（第 7 节归一化规则），返回给 Runtime。

---

## 7. 归一化规则

Adapter 必须把供应商特定的原始数据，转换为以下统一结构。字段为高层描述，不规定具体数据格式。

| 数据类型 | 归一化后应包含 |
| --- | --- |
| Market data | 标的标识、价格、货币单位、时间戳、数据来源 |
| Financial data | 标的标识、报告期、指标名称与数值、货币单位、数据来源 |
| Filing / news data | 文档标识、标题、发布时间、来源链接、摘要 |
| Notes / knowledge records | 记录标识、内容、标签、创建/更新时间、来源系统 |
| Calendar events | 事件标识、标题、时间范围、参与方、来源日历 |
| Notifications | 通知标识、渠道、接收方、内容摘要、发送状态 |
| Model responses | 请求标识、模型标识、输出内容、token/成本用量（如适用） |

无论背后是哪个供应商，同一数据类型的归一化结构必须一致，使 Research Engine、Knowledge Base 等下游组件不需要感知数据的原始来源（呼应 [v2.0 Architecture Overview](v2.0-architecture.md) 中「MCP Adapters 只返回标准化数据，不参与业务编排」的原则）。

---

## 8. 错误映射

Adapter 必须把供应商特定的错误，映射到 [Tool / Data Provider Interface](tool-data-provider-interface.md) 第 9 节定义的标准错误分类，不得直接透传供应商原始错误信息作为最终响应：

- unavailable provider
- authentication failure
- permission denied
- rate limited
- stale data
- missing data
- invalid response
- side-effect rejected
- policy classification mismatch
- approval missing/invalid
- unknown error

例如：GitHub API 返回 403 应映射为 `permission denied`；市场数据供应商超时应映射为 `unavailable provider`；供应商返回的字段无法归一化时应映射为 `invalid response`。无法归入以上任何分类的错误，映射为 `unknown error`，但必须附带尽可能详细的原始信息，供后续排查。

第 5 节 Approval Context Validation Contract 中定义的校验失败场景，全部归入 `approval missing/invalid`，具体子场景通过 error information 的 detail 字段区分：

- **approval context mismatch**：approval context 绑定的 request id / adapter id / operation name / parameter hash 与本次实际请求不一致。
- **approval expired**：approval context 已超过 `expires_at`。
- **approval replay detected**：approval context 已被标记为 consumed，本次是重复使用。

这三类子场景与「approval context 完全缺失」共用同一顶层错误分类 `approval missing/invalid`，但都不可重试——原请求必须重新走一次 Pre-Execution Policy Gate 获得新的 approval context，而不是用旧的批准重试。

---

## 9. 安全与权限

所有 adapter 必须遵循以下安全基线：

- **最小权限范围**：adapter 请求的权限范围应仅覆盖其声明支持的操作，不得申请超出实际需要的权限。
- **不允许隐藏写操作**：任何会产生外部副作用的调用，必须在 operation metadata 中如实声明为 side-effecting 或 high-impact，不得伪装成只读操作。
- **不允许在无 metadata 时静默切换供应商**：如果某个 adapter 不可用，Runtime 或 adapter 层不得静默切换到另一个未声明 metadata 的供应商执行同一操作。
- **不允许缓存敏感数据，除非明确允许**：adapter 不得默认缓存持仓、账户、个人身份等敏感数据；如需缓存，必须在 adapter 注册元数据中明确声明缓存范围和有效期。
- **不允许绕过 Human Review gates**：包括 Pre-Execution Policy Gate 和 Post-Output Human Review Gate，adapter 不得提供任何绕过这两个 gate 的调用路径。
- **side-effecting 操作必须要求 approval context**：这是第 4 节强制执行规则在安全层面的重申——没有例外。
- **批准凭证不可跨请求、跨 operation、跨参数复用**：approval context 必须按第 5 节的绑定字段一次性使用；同一批准不得用于不同的 request id、不同的 operation，或参数已变化的同一 operation。

---

## 10. 最小 Adapter 示例

以下示例只展示 schema 层面的注册元数据和请求/响应结构，不是具体实现代码。

### Market data read adapter

```text
Adapter registration:
  adapter id: market-data-adapter
  provider name: (示例供应商，具体选型由实现 Issue 决定)
  supported capability types: [Market data read]
  supported operations: [read_price]
  operation metadata (read_price):
    effect class: read-only
    approval policy: none required
    rate limit: provider-specific, adapter reports current quota

Request → Response: 见 Tool / Data Provider Interface Specification 第 10 节「读取市场价格」示例。
```

### GitHub issue read adapter

```text
Adapter registration:
  adapter id: github-adapter
  provider name: github
  supported capability types: [News / filing read, Note / knowledge read]
  supported operations: [read_issue, read_pr]
  operation metadata (read_issue):
    effect class: read-only
    approval policy: none required
    required permission scopes: [repo:read]

Request:
  capability type: Note / knowledge read
  operation name: read_issue
  input parameters: { repo, issue_number }
  read-only vs side-effecting flag (caller-declared intent): read-only

Effective classification: read-only → no gate required

Response:
  status: success
  normalized result: { issue_id, title, body, state, updated_at }
  source metadata: { provider: "github" }
  side-effect execution status: not applicable
```

### Notion research note write adapter

展示 approval context 如何绑定到具体请求，以及 adapter 执行前的完整校验（第 5 节 Approval Context Validation Contract）。

```text
Adapter registration:
  adapter id: notion-adapter
  provider name: notion
  supported capability types: [External write, Note / knowledge read]
  supported operations: [read_note, write_note]
  operation metadata (write_note):
    effect class: side-effecting
    approval policy: always require human approval
    required permission scopes: [notion:write]
    idempotency: not idempotent
    retry safety: not safe to auto-retry
  approval context validation obligation: yes

Step 1 — Request assembled by Runtime:
  request id: req-8891
  capability type: External write
  operation name: write_note
  input parameters: { destination: "notion", content, tags }
  read-only vs side-effecting flag (caller-declared intent): side-effecting
  parameter hash: sha256(normalized input parameters)

Step 2 — Effective classification: side-effecting → routed to Pre-Execution Policy Gate

Step 3 — Human approves; Runtime issues a request-bound approval context:
  approval context:
    request id: req-8891
    adapter id: notion-adapter
    operation name: write_note
    capability type: External write
    parameter hash: (matches Step 1)
    effect class: side-effecting
    approved_by: <human reviewer>
    approved_at: <timestamp>
    expires_at: approved_at + 10 minutes
    consumed: false

Step 4 — Adapter validates approval context before calling the Notion API:
  matches request id? yes
  matches adapter id + operation name? yes
  matches parameter hash? yes
  not expired? yes
  not previously consumed? yes
  effect class not downgraded? yes
  → validation passed, adapter executes, then marks approval context as consumed: true

Response:
  status: success
  normalized result: { note_id, url }
  side-effect execution status: approved and executed
```

### Notion write adapter — approval replay rejected

展示同一 approval context 被重复用于第二次请求时的 fail-closed 行为。

```text
Step 1 — Attacker or misbehaving caller reuses the approval context from req-8891
  on a new request req-8892 with identical parameters.

Step 2 — Adapter validates:
  matches request id? no (approval context bound to req-8891, this is req-8892)
  → validation failed

Response:
  status: failed
  error information: { category: "approval missing/invalid", detail: "approval replay detected: context already consumed for req-8891" }
  retryable flag: false
  side-effect execution status: rejected, not executed
```

### Notification send adapter

```text
Adapter registration:
  adapter id: notification-adapter
  provider name: (示例供应商，具体选型由实现 Issue 决定)
  supported capability types: [Notification / email send]
  supported operations: [send_notification]
  operation metadata (send_notification):
    effect class: side-effecting
    approval policy: always require human approval
    required permission scopes: [notification:send]

Request → Response（被拒绝场景）：
见 Tool / Data Provider Interface Specification 第 10 节「发送通知」示例。
```

---

## 非目标

本文档不包括、也不在本 Issue 范围内实现：

- 任何具体 adapter 的实现代码；
- 具体供应商的选型决策（例如选用哪个市场数据供应商）；
- 认证凭证的存储、轮换或密钥管理机制；
- Pre-Execution Policy Gate / Post-Output Human Review Gate 的具体批准逻辑实现（详细规则见 [Agent Runtime Core Specification](agent-runtime-core-spec.md)）；
- 对 Book、Prompt Suite、Agent v0.1 规格的任何修改。

---

## 参考文档

- [v2.0 Roadmap](v2.0-roadmap.md)：愿景、Epic 定义、优先级和里程碑规划
- [v2.0 Architecture Overview](v2.0-architecture.md)：系统分层、依赖模型、接口边界
- [Agent Runtime Core Specification](agent-runtime-core-spec.md)：Runtime 职责、执行生命周期、Pre-Execution Policy Gate 和 Post-Output Human Review Gate 的完整定义
- [Tool / Data Provider Interface Specification](tool-data-provider-interface.md)：Adapter 必须实现的抽象接口、operation metadata 契约、错误模型
