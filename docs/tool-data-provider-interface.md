# Tool / Data Provider Interface Specification

本文定义 Agent Runtime 使用的抽象 Tool / Data Provider Interface。

它防止 Agent Runtime 直接依赖具体的 MCP 连接器、市场数据 API、笔记工具或模型供应商。

本文不实现任何代码，也不包含具体 adapter 实现。它只定义接口职责、能力分类、请求/响应契约、副作用策略、adapter 职责边界和错误模型。

---

## 背景

[v2.0 Architecture Overview](v2.0-architecture.md) 和 [Agent Runtime Core Specification](agent-runtime-core-spec.md) 已确立：Agent Runtime 只能依赖抽象接口，不能直接依赖具体实现。

在 MCP Integration 或任何 Runtime 工具调用被实现之前，项目需要一份清晰的接口规格，定义 Runtime 如何请求外部数据和工具能力。

本文就是这份规格。未来的 MCP Integration Epic 应实现本文定义的接口，而不是重新定义接口形状。

---

## 1. 接口目的

Tool / Data Provider Interface：

- 让 Runtime 能够请求外部数据和工具能力，而不需要知道背后是哪个具体系统；
- 隐藏具体 adapter 实现——Runtime 只面向接口编程，MCP Adapters 只是这个接口的一种实现方式；
- 保持 Runtime 模型中立和工具中立，使更换数据源或模型供应商不影响 Runtime 核心逻辑；
- 同时支持只读操作和有副作用操作，两者共用同一套请求/响应契约，但处理路径不同；
- 与 Pre-Execution Policy Gate 协同工作：任何有副作用的请求都必须被正确路由到该 gate，其分类以 Adapter 声明的 operation metadata 为权威来源，而不仅依赖调用方在请求中的自报（见第 3 节，以及 [Agent Runtime Core Specification](agent-runtime-core-spec.md) 第 4、6 节）。

---

## 2. 能力分类

Tool / Data Provider Interface 覆盖以下能力类型：

| 能力类型 | 说明 | 默认读写属性 |
| --- | --- | --- |
| Market data read | 读取实时或历史价格、成交量等市场数据 | 只读 |
| Financial statement data read | 读取财报、财务指标数据 | 只读 |
| News / filing read | 读取新闻、公告、监管申报文件 | 只读 |
| Note / knowledge read | 读取笔记、研究记录、知识库内容 | 只读 |
| External write | 写入外部系统（例如 Notion、GitHub） | 有副作用 |
| Notification / email send | 发送通知或邮件 | 有副作用 |
| Calendar read / write | 读取日历为只读；写入或修改日历为有副作用 | 视操作而定 |
| Model provider call | 调用模型供应商进行推理 | 只读（不改变外部状态，但可能产生费用，视具体 policy 决定是否需要额外确认） |

能力分类只定义"做什么"，具体由哪个 MCP Adapter 实现某个能力，属于 MCP Integration Epic 的范围，不在本文定义。

---

## 3. Capability / Operation Metadata Contract

Tool Request 中调用方声明的 read-only/side-effecting flag，只是**调用方意图声明（caller-declared intent）**，不能作为是否触发 Pre-Execution Policy Gate 的最终依据。如果 Planner 或某段实现错误地把 `write_note`、`send_notification`、`calendar_update` 这类 operation 标成 read-only，仅靠调用方声明就会导致 Gate 被跳过。

因此，每个 Adapter 暴露的 operation 必须预先注册以下 metadata，作为效果分类的权威来源：

- **capability type**：能力类型，取值来自第 2 节。
- **operation name**：操作名称。
- **effect class**：`read-only` / `side-effecting` / `high-impact`，由 Adapter 声明，反映该 operation 的固有属性。
- **required permission scopes**：执行该操作所需的权限范围。
- **approval policy**：该操作固有的批准策略（例如是否总是需要人工批准，或在特定条件下可豁免）。
- **idempotency**：该操作是否幂等。
- **retry safety**：失败后是否可以安全自动重试。
- **cost / quota impact**：适用于模型调用或收费 API，标注调用成本或配额影响。

### Effective Classification

Runtime 组装请求时不能只信任调用方填写的 flag，必须结合 Adapter 声明的 metadata 得出最终分类：

```text
Request flag（caller-declared intent） + Adapter operation metadata（权威来源）
                ↓
       Effective policy classification
                ↓
     Pre-Execution Policy Gate if required
```

规则：

- 调用方不能把 Adapter 声明为 `side-effecting` 或 `high-impact` 的 operation 降级为 `read-only`。Effective classification 取两者中更严格的一方。
- 当 Request 中的 flag 与 Adapter metadata 出现冲突（例如调用方标记 read-only，但 Adapter metadata 显示该 operation 是 side-effecting），Runtime 必须 **fail closed**：停止执行，返回标准错误 `policy classification mismatch`（见第 9 节），不得静默采信任一方继续执行。
- Adapter 必须在执行任何 `side-effecting` 或 `high-impact` operation 前，独立校验请求是否携带有效的 approval token / approval context（见第 4 节），而不是仅信任 Runtime 已经完成批准。缺失或无效的批准上下文，Adapter 必须拒绝执行并返回 `approval missing/invalid`（见第 9 节）。

---

## 4. Request 契约

一个 Tool Request 包含以下高层字段：

- **request id**：唯一标识本次请求，用于关联响应、日志和 Pre-Execution Approval Request（如适用）。
- **capability type**：请求的能力类型，取值来自第 2 节的能力分类。
- **operation name**：具体操作名称（例如 `read_price`、`write_note`、`send_notification`）。
- **input parameters**：操作所需的输入参数。
- **read-only vs side-effecting flag（caller-declared intent）**：调用方对本次请求效果的声明。这只是意图声明，不是最终依据——最终是否触发 Pre-Execution Policy Gate 由这个 flag 与第 3 节的 Adapter operation metadata 共同决定（取更严格者），并在两者冲突时 fail closed。
- **expected output shape**：调用方期望的返回结构，用于响应校验。
- **timeout / freshness requirement**：请求的超时时限，以及对数据新鲜度的要求（例如"不早于 15 分钟前"）。
- **permission requirement**：执行该请求所需的权限范围。
- **human approval requirement**：该请求是否已知需要人工批准（对于 side-effecting 请求，这个字段应与 Pre-Execution Policy Gate 的判断一致；对于只读请求，通常为否，除非另有 policy 配置）。
- **approval context**：若该请求已经过 Pre-Execution Policy Gate 批准，携带的批准凭证（approval token、批准人、批准时间），供 Adapter 在执行前独立校验。只读请求或尚未批准的请求此字段为空。

---

## 5. Response 契约

一个 Tool Response 包含以下高层字段：

- **request id**：对应发起的 Tool Request。
- **status**：执行状态（成功 / 失败 / 待批准 / 已拒绝）。
- **normalized result**：标准化后的返回结果，格式与 expected output shape 一致，与具体数据源实现无关。
- **source metadata**：数据来源信息（例如具体的 MCP Adapter 标识、原始提供商名称）。
- **freshness timestamp**：返回数据的实际时效标记。
- **error information**：如果失败，包含第 9 节定义的标准错误分类和详细说明。
- **retryable flag**：标记该失败是否适合重试。
- **side-effect execution status**：对于 side-effecting 请求，标记副作用是否实际发生（未触发 / 已批准并执行 / 被拒绝未执行）；对于只读请求，此字段恒为不适用。

---

## 6. 副作用策略

Tool / Data Provider Interface 对有副作用操作的处理策略：

- 有副作用的操作必须在**执行之前**被识别，识别依据是第 3 节 Adapter 声明的 operation metadata（effect class），而不仅是调用方在 Request 中填写的 flag。
- 当 caller-declared flag 与 Adapter metadata 不一致时，Runtime 必须 fail closed，停止执行并返回 `policy classification mismatch`（见第 9 节），不得执行。
- Runtime 必须把 effective classification 为 `side-effecting` 或 `high-impact` 的请求路由到 Pre-Execution Policy Gate（见 [Agent Runtime Core Specification](agent-runtime-core-spec.md) 第 4、6 节），而不是直接执行。
- 被拒绝的请求不得执行。Adapter 在执行任何 side-effecting/high-impact 操作前，必须自行校验请求携带的 approval token / approval context 是否存在且有效（见第 3、4 节），不能仅因为 Runtime 声称"已批准"就信任并执行。
- 批准或拒绝的结果必须被记录（对应 Execution Log Record 中的 gate 记录，见 [Agent Runtime Core Specification](agent-runtime-core-spec.md) 第 5 节）。
- 只读请求（经 effective classification 确认为 read-only）可以在没有预先批准的情况下执行，除非项目另行配置了更严格的 policy（例如对某些高敏感只读数据源也要求确认）。

这一节是 Tool / Data Provider Interface 与 Agent Runtime 的 Pre-Execution Policy Gate 之间的契约边界：接口负责正确分类、路由和校验批准凭证，Runtime 的 Gate 负责实际的批准判断逻辑。二者是独立的两道防线，缺一不可——即使 Runtime 的 Gate 逻辑有误放行，Adapter 自身的 approval token 校验仍应作为最后一道防线拒绝执行。

---

## 7. Adapter 职责

实现本接口的 Adapter（例如未来的 MCP Adapters）负责：

- 声明每个 operation 的固有 metadata（第 3 节：effect class、required permission scopes、approval policy、idempotency、retry safety、cost/quota impact），作为该操作效果分类的权威来源；
- 对外部系统进行身份认证；
- 把 Runtime 的抽象 Tool Request 翻译成具体供应商的 API 调用；
- 在执行任何 side-effecting 或 high-impact operation 前，独立校验请求携带的 approval token / approval context 是否有效；
- 把供应商返回的原始数据标准化为 Response 契约定义的格式；
- 返回准确的 source metadata，标明数据实际来自哪个供应商；
- 以一致的方式上报错误，映射到第 9 节定义的标准错误分类。

---

## 8. Adapter 非职责

Adapter 明确不得：

- 做任何投资判断——判断属于 Prompt Suite 和 Research Engine 的职责；
- 修改 Book 或 Prompt Suite 的逻辑；
- 绕过 Human Review gates（包括 Pre-Execution Policy Gate 和 Post-Output Human Review Gate）；
- 仅凭调用方在 Request 中填写的 flag 就信任某操作是 read-only——必须以自身声明的 operation metadata（第 3 节）为准；
- 在未独立验证 approval token / approval context 有效的情况下执行 side-effecting 或 high-impact 操作，即使 Runtime 声称该请求已经批准；
- 隐藏数据缺失或过期——如果数据缺失或不新鲜，必须如实通过 Response 契约中的 error information 或 freshness timestamp 反映，不得静默补全或伪造。

---

## 9. 错误模型

标准错误分类：

| 错误类型 | 说明 |
| --- | --- |
| unavailable provider | 目标数据源或服务不可达 |
| authentication failure | 身份认证失败 |
| permission denied | 已认证但权限不足 |
| rate limited | 触发供应商的速率限制 |
| stale data | 返回的数据早于 freshness requirement 要求的时效 |
| missing data | 请求的数据不存在 |
| invalid response | 供应商返回的数据无法被标准化为 expected output shape |
| side-effect rejected | Pre-Execution Policy Gate 拒绝了该有副作用的请求 |
| policy classification mismatch | 调用方在 Request 中声明的 read-only/side-effecting flag 与 Adapter 声明的 operation metadata 不一致，Runtime fail closed 停止执行 |
| approval missing/invalid | Adapter 在执行 side-effecting/high-impact 操作前，未能校验到有效的 approval token / approval context |
| unknown error | 未归类的其他错误，必须附带尽可能详细的说明 |

所有错误都应归入以上分类之一，不允许返回未分类的裸错误信息。这与 [Agent Runtime Core Specification](agent-runtime-core-spec.md) 第 7 节的错误处理机制衔接：Runtime 依据这些分类决定标记信息缺口、重试、还是转人工复核。`policy classification mismatch` 和 `approval missing/invalid` 都不可重试——它们表示配置或调用错误，必须先修正调用方或 Adapter 的声明，而不是简单重试。

---

## 10. 最小示例

以下示例只展示 schema 层面的请求/响应结构，不是具体实现代码。

### 读取市场价格（只读）

```text
Adapter operation metadata (read_price):
  effect class: read-only
  approval policy: none required

Request:
  capability type: Market data read
  operation name: read_price
  input parameters: { ticker, as_of }
  read-only vs side-effecting flag (caller-declared intent): read-only
  freshness requirement: within 15 minutes

Effective classification: read-only (caller flag matches Adapter metadata) → no gate required

Response:
  status: success
  normalized result: { ticker, price, currency, as_of }
  source metadata: { provider: "market-data-adapter" }
  side-effect execution status: not applicable
```

### 读取公司申报文件（只读）

```text
Adapter operation metadata (read_filing):
  effect class: read-only
  approval policy: none required

Request:
  capability type: News / filing read
  operation name: read_filing
  input parameters: { ticker, filing_type, date_range }
  read-only vs side-effecting flag (caller-declared intent): read-only

Effective classification: read-only → no gate required

Response:
  status: success
  normalized result: { filing_id, title, url, summary }
  source metadata: { provider: "filing-adapter" }
  side-effect execution status: not applicable
```

### 写入研究笔记（有副作用）

Adapter 在收到请求前已注册 `write_note` 的固有 metadata。Runtime 依据 Adapter metadata（而非仅调用方的 flag）判断需要走 Pre-Execution Policy Gate；pending 状态由 Runtime 的 approval workflow 记录，Adapter 在批准前不会被调用。

```text
Adapter operation metadata (write_note):
  effect class: side-effecting
  approval policy: always require human approval
  idempotency: not idempotent
  retry safety: not safe to auto-retry

Step 1 — Request assembled by Runtime:
  capability type: External write
  operation name: write_note
  input parameters: { destination: "notion", content, tags }
  read-only vs side-effecting flag (caller-declared intent): side-effecting
  human approval requirement: yes

Step 2 — Effective classification check:
  caller flag (side-effecting) matches Adapter metadata (side-effecting) → no mismatch
  routed to Pre-Execution Policy Gate

Step 3 — Pending state (tracked by Runtime's approval workflow; Adapter not yet called):
  Runtime-side status: pending approval

Step 4 — After human approval, Runtime calls Adapter with approval context:
  approval context: { token, approved_by, approved_at }
  Adapter validates approval token before executing.

Response:
  status: success
  normalized result: { note_id, url }
  side-effect execution status: approved and executed
```

### 发送通知（有副作用，被拒绝）

```text
Adapter operation metadata (send_notification):
  effect class: side-effecting
  approval policy: always require human approval

Request:
  capability type: Notification / email send
  operation name: send_notification
  input parameters: { channel, recipient, message }
  read-only vs side-effecting flag (caller-declared intent): side-effecting
  human approval requirement: yes

Effective classification: side-effecting → routed to Pre-Execution Policy Gate
Human decision: rejected — Adapter is never invoked.

Response (from Runtime's approval workflow, not from Adapter):
  status: rejected
  error information: { category: "side-effect rejected", detail: "Human declined at Pre-Execution Policy Gate" }
  retryable flag: false
  side-effect execution status: rejected, not executed
```

### 调用方误标记为只读（fail-closed 校验）

展示 Adapter metadata 与调用方声明不一致时的 fail-closed 行为。

```text
Adapter operation metadata (write_note):
  effect class: side-effecting
  approval policy: always require human approval

Request (caller mistakenly marks it read-only):
  capability type: External write
  operation name: write_note
  input parameters: { destination: "notion", content, tags }
  read-only vs side-effecting flag (caller-declared intent): read-only

Effective classification check:
  caller flag (read-only) conflicts with Adapter metadata (side-effecting) → mismatch detected
  Runtime fails closed, does not execute, does not route around the gate

Response:
  status: failed
  error information: { category: "policy classification mismatch", detail: "write_note is declared side-effecting by Adapter metadata but Request marked it read-only" }
  retryable flag: false
  side-effect execution status: not triggered
```

---

## 非目标

本文档不包括、也不在本 Issue 范围内实现：

- Runtime 的实际代码；
- 任何具体 MCP Adapter 的实现；
- 具体数据供应商的选型或接入细节；
- Pre-Execution Policy Gate / Post-Output Human Review Gate 的具体批准逻辑实现（本文只定义接口如何与这些 gate 协同，详细规则见 [Agent Runtime Core Specification](agent-runtime-core-spec.md)）；
- 对 Book、Prompt Suite、Agent v0.1 规格的任何修改。

---

## 参考文档

- [v2.0 Roadmap](v2.0-roadmap.md)：愿景、Epic 定义、优先级和里程碑规划
- [v2.0 Architecture Overview](v2.0-architecture.md)：系统分层、依赖模型、接口边界
- [Agent Runtime Core Specification](agent-runtime-core-spec.md)：Runtime 职责、执行生命周期、Pre-Execution Policy Gate 和 Post-Output Human Review Gate 的完整定义
