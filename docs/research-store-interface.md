# Research Store Interface Specification

本文定义 Research Engine 使用的抽象 Research Store Interface。

它防止 Research Engine 直接依赖 Notion、GitHub、某个数据库或未来的 Knowledge Base 实现，让研究工作流可以在结构化研究产出的最小存储实现和未来完整 Knowledge Base 之间无缝切换。

本文不实现任何代码，也不包含具体存储实现。它只定义研究物件（artifact）类型、身份与版本契约、读写操作、来源与引用溯源、审核生命周期、查询契约、错误模型、审计要求，以及与未来 Knowledge Base 的边界。

---

## 背景

[v2.0 Architecture Overview](v2.0-architecture.md) 已确立以下依赖方向：

```text
Research Engine
    ↓
Research Store Interface
    ↓
Knowledge Base
```

Agent Runtime 和批准生命周期已经通过 Issue #105 和 #107 有了可执行的 scaffold（见 [Agent Runtime Core Specification](agent-runtime-core-spec.md) 和 `ios/core/runtime/`）。

下一个缺失的边界是研究结果的持久化。研究工作流需要存储公司研究、财报分析、来源记录、投资论点更新和审核历史，但不能直接依赖 Notion、GitHub、数据库、本地文件，或未来的 Knowledge Base 实现。

本文就是这份规格。未来任何 Research Engine 实现 Issue，都应实现本文定义的接口，而不是重新定义存储契约的形状；未来 Knowledge Base 实现该接口时，也不需要改变 Research Engine 的调用方式。

---

## 1. 职责

Research Store 负责：

- 持久化结构化研究物件（company research、earnings analysis、investment thesis 等，见第 2 节）；
- 保留来源溯源和引用关系（见第 5 节）；
- 记录物件版本和取代（supersession）关系（见第 4 节）；
- 按稳定标识符和受支持的过滤条件检索物件（见第 9 节）；
- 记录审核状态和批准元数据（见第 8 节）；
- 支持确定性的本地测试实现（见第 12 节）；
- 提供一个未来 Knowledge Base 可以实现的抽象（见第 13 节）。

Research Store 不得：

- 做任何投资判断——判断属于 Prompt Suite 和 Research Engine 的职责；
- 生成研究内容——内容生成属于 Research Engine 调度的工作流；
- 决定组合仓位或投资行动——这属于 Portfolio Operating System 和 Human Review 的职责；
- 静默合并相互冲突的研究结论——冲突必须通过取代关系（第 4 节）或人工审核（第 8 节）显式解决，不能由存储层自行判定孰对孰错；
- 原地改写历史物件而不保留版本历史——任何更新都必须产生新的版本或新的物件记录（第 4 节）；
- 绑定单一外部供应商——保持与 [Tool / Data Provider Interface](tool-data-provider-interface.md) 一致的模型中立、工具中立原则（见 [v2.0 Architecture Overview](v2.0-architecture.md) 第 1 节）。

---

## 2. 研究物件类型

Research Store 覆盖以下初始物件类型：

| 物件类型 | 说明 |
| --- | --- |
| `company_profile` | 公司基础画像 |
| `company_research` | 个股研究结论 |
| `earnings_analysis` | 单次财报分析 |
| `sector_research` | 行业研究结论 |
| `macro_research` | 宏观研究结论 |
| `ipo_research` | IPO 研究结论 |
| `investment_thesis` | 投资论点 |
| `thesis_update` | 对既有投资论点的更新 |
| `risk_review` | 风险复核记录 |
| `watchlist_review` | 观察名单复核记录 |
| `source_record` | 来源记录（见第 5 节） |
| `decision_support_record` | 供 Human Review 参考的决策支持记录 |

物件类型集合允许未来扩展新增类型，新增类型不得改变已有类型的字段契约，也不得要求既有读取方修改代码才能兼容（向后兼容读取者）。本 Issue 不实现任何真实投资研究逻辑，上述类型只定义存储层看到的结构分类。

---

## 3. 物件契约

一个 Research Artifact（研究物件）包含以下高层字段。具体字段命名可遵循实现语言的约定，但身份、来源和版本信息必须显式存在，不能省略或隐含推断：

- **artifact id**：物件的稳定唯一标识。
- **artifact type**：取值来自第 2 节。
- **schema version**：物件结构的版本号，用于兼容未来字段变更。
- **subject type**：研究对象类型（例如公司、行业、宏观主题、IPO 标的）。
- **subject identifier**：研究对象的标识（例如 ticker、行业代码）。
- **title**：物件标题。
- **summary**：结论摘要。
- **structured content payload**：结构化研究内容本体，格式由 artifact type 各自定义，Research Store 本身不解析或校验业务语义。
- **source references**：关联的来源记录标识列表（见第 5 节）。
- **citation references**：具体引用位置，把结论片段关联到来源记录中的证据（见第 5 节）。
- **created at**：创建时间。
- **created by**：创建方标识（Agent id 或人工作者标识）。
- **workflow id**：产生该物件的工作流标识。
- **execution id**：产生该物件的 Runtime 执行标识（对应 [Agent Runtime Core Specification](agent-runtime-core-spec.md) 第 5 节的 Execution Log Record）。
- **prompt id**：产生该物件所用的 Prompt Suite prompt 标识。
- **agent id**：产生该物件的 Agent 规格标识。
- **review status**：取值来自第 8 节的审核生命周期状态。
- **reviewed by**：审核人标识（未审核时为空）。
- **reviewed at**：审核时间（未审核时为空）。
- **supersedes artifact id**：本物件取代的上一版本物件标识（如适用，见第 4 节）。
- **superseded by artifact id**：取代本物件的新版本物件标识（如适用，被取代后回填）。
- **tags**：自由标签，用于查询过滤（见第 9 节）。
- **confidence / evidence-quality metadata**：置信度或证据质量标注，由生成该物件的工作流提供，Research Store 只存储，不评分。
- **status**：物件的生命周期状态（存续 / 已取代 / 已撤回），与 review status 是两个独立维度——一个物件可以是 `approved` 且同时是 `superseded`。
- **content hash**：对 `structured content payload` 归一化后计算的哈希。仅用于内容相似性提示、审计比对和第 5 节的来源变更检测，不是物件身份或去重的权威依据——权威去重依据是 idempotency key（见第 4 节）。

字段的具体命名可遵循仓库既有惯例（参照 `ios/core/runtime/contracts.py` 中已建立的 dataclass 风格），但身份（artifact id）、来源（source references / citation references）、版本（schema version、supersedes/superseded by）三类信息在任何实现中都必须显式建模，不允许合并或省略。

---

## 4. 身份与版本

规则：

- 每个物件在创建时获得一个稳定唯一 id，该 id 在物件的整个生命周期内不变。
- 更新不得原地覆盖历史——更新必须创建一个新的物件记录（新 id），并通过 `supersedes artifact id` / `superseded by artifact id` 显式建立取代关系。
- 取代关系是显式的、单向的：新物件记录 `supersedes` 旧物件 id；写入成功后，Research Store 把旧物件的 `superseded by artifact id` 回填为新物件 id。
- 历史版本必须保持可检索——取代不等于删除，旧物件仍可通过其原 id 单独获取（见第 6 节 `get_artifact`、`get_artifact_version_history`）。
- 重复写入的权威判定依据是 **idempotency key**，不是 content hash。写请求必须携带 idempotency key；Research Store 用它区分「同一次写入的重试」与「确实是新的研究结论」：相同 idempotency key、且归一化后的写请求内容一致 → 返回原物件，不产生新记录；相同 idempotency key、但归一化后的写请求内容不一致 → 拒绝并返回 `duplicate artifact`（见第 10 节），因为无法判定调用方到底想重试哪次写入。
- **content hash 不得单独触发写入去重。** 它只用于内容相等检测、相似物件提示、第 5 节的来源内容变更检测，以及审计比对。两次独立写入即使 `structured content payload` 完全相同，只要没有携带相同的 idempotency key，就必须各自作为独立物件存储，各自保留 provenance、审核记录和审计链——这对两个不同 workflow / execution / reviewer 各自产出相同结论的场景尤其重要：内容相同不代表这是同一次写入的重试，仅凭 content hash 折叠会丢失其中一份记录的溯源。
- idempotency 比较必须覆盖归一化后的**完整写请求**，而不仅是 payload 的哈希——包括 artifact type、subject type/identifier、structured content payload、source references、citation references、以及适用时的 supersedes artifact id 等所有影响物件身份的字段。仅比较 payload hash 会把语义不同的请求（例如相同结论文字但取代了不同的旧版本）错误地当成同一次重试来处理。
- 每个物件必须记录 schema version，供未来读取方判断是否需要按旧版本契约解析。

以下场景的预期行为：

| 场景 | 预期行为 |
| --- | --- |
| 首次创建（First creation） | 分配新 artifact id，`review status` 从 `draft` 或 `pending_review` 开始（见第 8 节），`supersedes` 为空 |
| 修订（Revision） | 创建新物件，`supersedes` 指向被修订的物件 id；旧物件被回填 `superseded by` |
| 更正（Correction） | 与修订相同的机制——更正不是特殊路径，同样通过创建新物件 + 取代关系表达，保证被更正的错误结论仍可追溯 |
| 取代（Supersession） | 与修订相同，语义上强调新物件在结论上完全取代旧物件 |
| 撤回（Retraction） | 不创建新版本，而是把物件自身的 `status` 更新为 `retracted`（见第 8 节 `retract_artifact`），原记录和审计轨迹保留 |
| 重复提交（Duplicate submission） | idempotency key 命中且归一化请求内容一致 → 返回既有物件，不创建新记录，`create_artifact` 响应中标注 `duplicate_of`；idempotency key 命中但归一化请求内容不一致 → 拒绝，返回 `duplicate artifact` 错误；content hash 命中但 idempotency key 不同或未提供 → 仍创建新物件，响应中可选标注 `possible_duplicate_of` 作为提示，不阻塞写入、不影响物件独立身份 |
| 并发更新冲突（Concurrent update conflict） | 两个写入同时声明取代同一个物件 id 时，只有一个成功；后到达的写入必须收到 `version conflict` 错误（见第 10 节），不得静默覆盖或悄悄产生分叉的取代链 |

---

## 5. 来源与引用溯源

一个 Source Record（来源记录）本身也是一种物件（`source_record`，见第 2 节），至少包含：

- **source id**：来源记录的稳定唯一标识。
- **source type**：来源类型（例如 filing、news、财报电话会议记录、第三方研究）。
- **provider / publisher**：发布方或数据供应商。
- **title**：来源标题。
- **canonical reference or provider identifier**：可追溯到原始来源的规范引用或供应商标识（例如 filing accession number、URL）。
- **publication timestamp**：来源发布时间。
- **retrieval timestamp**：Research Engine 实际获取该来源的时间。
- **freshness timestamp**：该来源在被引用时的时效标记，呼应 [Tool / Data Provider Interface](tool-data-provider-interface.md) 第 4-5 节的 freshness 契约。
- **author**：作者或发布机构。
- **jurisdiction / market**：适用的司法辖区或市场（如适用）。
- **excerpt or normalized evidence note**：证据摘录或归一化的证据说明，而非来源全文。
- **content hash**：可用时提供，用于检测来源内容是否已变化。
- **reliability classification**：来源可靠性分级，由生成该记录的工作流提供，Research Store 只存储，不做可靠性判断。

Research Artifact 通过 `source references` 关联到一个或多个 `source_record`，并通过 `citation references` 把具体结论片段绑定到某条来源记录中的证据摘录。这套溯源必须足以回答：

- 这个结论的依据是什么证据？——通过 `citation references` → `source references` → 具体 `source_record`。
- 证据是什么时候获取的？——`source_record.retrieval_timestamp` / `freshness_timestamp`。
- 是哪个工作流和执行产生的？——物件自身的 `workflow id` / `execution id`（第 3 节）。
- 底层来源是否已经过期或被取代？——通过 `resolve_citation_lineage`（第 6 节）沿 `source_record` 的 freshness 信息和物件的取代链判断。

本规格不要求存储受版权保护的来源全文——`excerpt or normalized evidence note` 应为归一化摘录，而非源文档的完整复制。

---

## 6. 接口操作

以下操作定义 Research Store 的最小契约。所有操作都遵循 [Tool / Data Provider Interface](tool-data-provider-interface.md) 第 4-5 节确立的 Request/Response 契约风格：每个操作都有明确的 request 字段、response 字段、effect classification（第 7 节）、幂等性预期、错误行为，以及适用时的分页契约。

### 写操作

#### `create_artifact`

- **Request 字段**：artifact type、schema version、subject type/identifier、structured content payload、source references、citation references、workflow id、execution id、prompt id、agent id、tags、confidence/evidence-quality metadata、idempotency key（必填）。
- **Response 字段**：artifact id、review status（初始为 `draft` 或 `pending_review`）、created at、`duplicate_of`（idempotency key 命中且请求一致时填充，见第 4 节）、`possible_duplicate_of`（可选，content hash 命中但不构成 idempotency 命中时填充，仅供参考，不影响本次写入是否创建新物件）。
- **Effect classification**：`side_effecting`（见第 7 节）。
- **幂等性**：按 idempotency key 幂等——同一 key 且归一化请求内容一致的重复请求返回原物件，不产生新记录；content hash 相同但 idempotency key 不同，不构成幂等命中，仍创建新物件（见第 4 节）。
- **错误行为**：`invalid artifact schema`、`citation lineage invalid`、`duplicate artifact`（当 idempotency key 命中但归一化请求内容不一致时，见第 10 节）。

#### `create_artifacts_batch`

- **Request 字段**：多个 `create_artifact` 请求组成的列表，共享同一 workflow id/execution id 的场景下可省略重复字段。
- **Response 字段**：逐条对应的结果列表，每条独立标注成功、失败或重复；批内单条失败不得导致整批失败（部分成功必须被明确报告，不能静默丢弃失败项）。
- **Effect classification**：`side_effecting`。
- **幂等性**：批内每条独立按 `create_artifact` 的幂等规则处理。
- **错误行为**：批级错误（例如请求格式错误）导致整批拒绝；单条错误只影响该条，遵循 `create_artifact` 的错误分类。

#### `supersede_artifact`

- **Request 字段**：被取代的 artifact id、新物件的完整内容（等同 `create_artifact` 的内容字段）、取代原因。
- **Response 字段**：新 artifact id、`supersedes`/`superseded by` 回填结果、created at。
- **Effect classification**：`side_effecting`。
- **幂等性**：按 idempotency key 幂等，与 `create_artifact` 一致。
- **错误行为**：`artifact not found`（被取代物件不存在）、`version conflict`（被取代物件已被其他写入取代，见第 4 节并发冲突场景）、`invalid state transition`（例如尝试取代一个已 `retracted` 的物件）。

#### `record_review_decision`

- **Request 字段**：artifact id、审核决定（approve/reject）、reviewer、reason（reject 时必填）、approval context（见第 7 节）。
- **Response 字段**：更新后的 review status、reviewed by、reviewed at。
- **Effect classification**：`high_impact`（见第 7 节）。
- **幂等性**：对同一 artifact id 的同一决定重复提交应返回既有结果，不重复记录审计条目；对已终态（approved/rejected）的物件再次提交不同决定，必须拒绝并返回 `invalid state transition`。
- **错误行为**：`artifact not found`、`invalid state transition`、`approval required`、`approval invalid`。

#### `retract_artifact`

- **Request 字段**：artifact id、reviewer、retraction reason、approval context。
- **Response 字段**：更新后的 status（`retracted`）、retracted by、retracted at。
- **Effect classification**：`high_impact`。
- **幂等性**：对已 `retracted` 的物件重复调用返回既有状态，不重复记录。
- **错误行为**：`artifact not found`、`invalid state transition`（例如尝试撤回一个尚处于 `draft` 且从未发布的物件——具体是否允许由实现决定，但必须显式定义，不能隐式允许）、`approval required`。

### 读操作

#### `get_artifact`

- **Request 字段**：artifact id。
- **Response 字段**：完整物件（第 3 节字段）。
- **Effect classification**：`read_only`。
- **错误行为**：`artifact not found`。

#### `get_artifact_version_history`

- **Request 字段**：任一版本的 artifact id（沿取代链解析出完整版本序列）。
- **Response 字段**：按时间排序的版本列表，每项包含 artifact id、created at、review status、supersedes/superseded by。
- **Effect classification**：`read_only`。
- **分页**：适用（见第 9 节分页契约）。
- **错误行为**：`artifact not found`。

#### `find_latest_artifact`

- **Request 字段**：subject type、subject identifier、artifact type，可选 review status 过滤（例如只要 `approved`）。
- **Response 字段**：未被取代（`superseded by artifact id` 为空）且满足过滤条件的最新物件；不存在时返回空结果而非错误。
- **Effect classification**：`read_only`。
- **错误行为**：`unsupported query`（过滤条件不受支持时）。

#### `query_artifacts`

- **Request 字段**：见第 9 节查询过滤条件、分页参数、排序要求、latest-only 标记。
- **Response 字段**：物件列表（或摘要投影）、分页 token。
- **Effect classification**：`read_only`。
- **分页**：适用。
- **错误行为**：`unsupported query`、`pagination token invalid`。

#### `get_artifacts_by_execution`

- **Request 字段**：execution id，可选分页参数。
- **Response 字段**：该次 Runtime 执行产生的全部物件列表。
- **Effect classification**：`read_only`。
- **错误行为**：分页 token 无效时返回 `pagination token invalid`；execution id 未产生任何物件时返回空列表，不是错误。

#### `get_artifacts_by_subject`

- **Request 字段**：subject type、subject identifier，可选 artifact type 过滤、latest-only 标记、分页参数。
- **Response 字段**：物件列表。
- **Effect classification**：`read_only`。
- **错误行为**：同 `query_artifacts`。

#### `get_source_record`

- **Request 字段**：source id。
- **Response 字段**：完整 `source_record`（第 5 节字段）。
- **Effect classification**：`read_only`。
- **错误行为**：`source not found`。

#### `resolve_citation_lineage`

- **Request 字段**：artifact id（可选指定具体 citation reference，缺省时解析该物件全部引用）。
- **Response 字段**：该物件（或指定引用片段）关联的完整来源链：source records、各来源的 freshness 状态、是否有更新版本的来源记录。
- **Effect classification**：`read_only`。
- **错误行为**：`artifact not found`、`citation lineage invalid`（物件声明的 citation reference 指向不存在的来源记录时）。

---

## 7. 效果分类与批准

与 [Tool / Data Provider Interface](tool-data-provider-interface.md) 第 2-3 节保持一致的效果分类原则：

| 操作 | Effect class | 说明 |
| --- | --- | --- |
| `get_artifact`、`get_artifact_version_history`、`find_latest_artifact`、`query_artifacts`、`get_artifacts_by_execution`、`get_artifacts_by_subject`、`get_source_record`、`resolve_citation_lineage` | `read_only` | 不产生新记录或状态变化 |
| `create_artifact`、`create_artifacts_batch`、`supersede_artifact` | `side_effecting` | 产生新的持久化记录，但产生的是 Agent 草稿性质的研究物件，尚未构成对外部系统或已批准结论的最终改动 |
| `record_review_decision`、`retract_artifact` | `high_impact` | 改变物件的审核终态或撤回状态，直接影响该研究结论后续是否可被 Research Engine 或 Portfolio Operating System 采信 |

批准要求：

- `side_effecting` 的写操作（`create_artifact`、`create_artifacts_batch`、`supersede_artifact`）必须先经过 **Pre-Execution Policy Gate**（见 [Agent Runtime Core Specification](agent-runtime-core-spec.md) 第 4、6 节），才能实际写入 Research Store。
- `high_impact` 的操作（`record_review_decision`、`retract_artifact`）必须同时满足：写操作本身经过 Pre-Execution Policy Gate，且其审核决定内容遵循 **Post-Output Human Review Gate** 的复核规则——两者不是互斥的，一次审核决定的落库既是一次有副作用的写操作，也是一次投资相关判断的确认。
- 所有 `side_effecting`/`high_impact` 操作必须携带 request-bound **approval context**（字段与 [MCP Integration Adapter Specification](mcp-integration-adapter-spec.md) 第 5 节一致：绑定 request id、operation name、parameter hash、effect class、approved_by、approved_at、expires_at、单次消费状态），Research Store 的具体实现必须像 Adapter 一样独立校验该上下文，不能仅信任调用方或 Runtime 已完成批准。
- **没有任何物件仅因为由 Agent 创建就被标记为已获人工批准。** `create_artifact` 产生的物件，其 `review status` 只能是 `draft` 或 `pending_review`（见第 8 节），绝不能直接是 `approved`——`approved` 只能由 `record_review_decision` 显式产生。

---

## 8. 审核生命周期

Review status 状态：

- `draft`：Agent 或人工创建的草稿，尚未提交审核。
- `pending_review`：已提交，等待人工审核。
- `approved`：人工已明确批准。
- `rejected`：人工已明确拒绝。
- `superseded`：已被更新版本取代（可与 approved/rejected 共存于历史记录，取代关系见第 4 节，`status` 字段独立于 `review status`，见第 3 节）。
- `retracted`：已被撤回（`status` 字段变化，`review status` 保留其被撤回前的最后状态，不被覆盖）。

合法转移：

```text
draft ────────► pending_review ────────► approved
                        │                    │
                        └──────► rejected    └──► (superseded by later record_review_decision on the newer version)

approved ──────► retracted   (via retract_artifact, at any point after approval)
rejected ──────► retracted   (rare; only when a rejected artifact itself must be formally withdrawn from consideration)
```

规则：

- Agent 产出的研究物件起始状态必须是 `draft` 或 `pending_review`，不能是任何终态。
- 人工批准必须显式——`approved` 只通过 `record_review_decision` 产生，不存在任何隐式批准路径（例如"超时未拒绝视为批准"是被禁止的默认行为）。
- 被拒绝的物件（`rejected`）保持可审计、可检索——不得删除，只能通过后续新物件重新提交研究。
- 被取代的物件（`superseded`）保持可检索（见第 4 节、第 6 节 `get_artifact_version_history`）。
- 撤回（`retract_artifact`）必须记录 reviewer 和 reason，撤回后的物件仍可通过 `get_artifact` 获取，但 `status` 明确标记为 `retracted`，供下游读取方过滤。
- 非法转移必须 fail closed：例如对已 `retracted` 的物件调用 `record_review_decision`，或对 `draft` 状态直接调用 `retract_artifact`（未经历审核就撤回是否允许，由实现决定，但必须显式声明，未声明时默认拒绝），必须返回 `invalid state transition`（见第 10 节），不得静默接受或忽略。

---

## 9. 查询契约

支持的过滤条件：

- artifact type
- subject identifier
- ticker / company identifier（subject identifier 的常见特例）
- market
- workflow id
- execution id
- prompt id
- review status
- created date range
- source id
- tags
- latest-only flag（只返回未被取代的最新版本）

契约细节：

- **排序**：默认按 `created at` 降序，稳定排序——相同过滤条件、无新写入时，重复查询必须返回相同顺序。
- **分页**：使用 opaque pagination token（游标式），响应携带 `next_page_token`（无更多结果时为空）。调用方不得依赖 token 的内部结构。
- **空结果**：过滤条件合法但无匹配物件时，返回空列表，不是错误。
- **不支持的过滤条件**：调用方传入接口未定义的过滤字段时，返回 `unsupported query` 错误，不得静默忽略该字段后返回部分过滤的结果（避免调用方误以为过滤已生效）。
- **全文搜索**：本规格不要求全文搜索或语义检索为必须能力——这类能力属于未来 Knowledge Query Interface 的范围（见第 13 节），Research Store 的查询契约只保证按结构化字段过滤和按标识检索。

---

## 10. 错误模型

标准错误分类，与 [Tool / Data Provider Interface](tool-data-provider-interface.md) 第 9 节的错误哲学保持一致：

| 错误类型 | 说明 |
| --- | --- |
| artifact not found | 请求的 artifact id 不存在 |
| source not found | 请求的 source id 不存在 |
| duplicate artifact | idempotency key 冲突但请求内容与既有记录不一致，无法判定是重试还是新研究 |
| idempotency conflict | 同一 idempotency key 在处理中被并发使用，尚未产生最终结果 |
| version conflict | 并发写入同时声明取代同一物件，后到达的写入失败（见第 4 节） |
| invalid artifact schema | 物件内容不符合声明的 schema version 的结构要求 |
| invalid state transition | 审核状态或生命周期状态的转移不合法（见第 8 节） |
| citation lineage invalid | 物件声明的 citation reference 指向不存在或不一致的来源记录 |
| approval required | `side_effecting`/`high_impact` 操作缺少 approval context |
| approval invalid | approval context 存在但校验失败（绑定字段不匹配、已过期、已被消费——具体子场景与 [MCP Integration Adapter Specification](mcp-integration-adapter-spec.md) 第 8 节一致） |
| store unavailable | 底层存储实现不可达 |
| unsupported query | 查询携带了接口未定义的过滤条件 |
| pagination token invalid | 分页 token 不合法、已过期或不属于本次查询上下文 |

所有错误必须归入以上分类之一，不允许返回未分类的裸错误信息。`version conflict`、`invalid state transition`、`approval required`、`approval invalid` 不可重试——它们表示调用方需要先解决状态或批准问题，而不是简单重试；`store unavailable` 可重试，重试策略由具体实现决定。

---

## 11. 审计要求

每一个 `side_effecting` 或 `high_impact` 操作，Research Store 都必须记录足以审计的信息：

- **operation id**：本次操作的唯一标识。
- **artifact id**：涉及的物件标识。
- **prior version or state**：操作前的版本或状态（创建操作时为空）。
- **new version or state**：操作后的版本或状态。
- **execution id**：触发本次操作的 Runtime 执行标识。
- **request id**：对应的 Tool Request 标识。
- **workflow id**：所属工作流标识。
- **actor**：发起操作的 Agent id 或人工标识。
- **reviewer**：涉及审核决定时的审核人标识。
- **approval context reference**：本次操作使用的 approval context 标识（用于关联到 Pre-Execution Policy Gate 的批准记录）。
- **timestamp**：操作发生时间。
- **reason**：操作原因（取代原因、拒绝原因、撤回原因等，适用时必填）。
- **idempotency key**：本次操作使用的幂等键。
- **outcome**：操作最终结果（成功 / 失败 / 拒绝，及对应错误分类）。

从接口消费方的视角看，审计记录必须是**只追加（append-only）**的——没有任何操作允许修改或删除既有审计记录，包括对已撤回或已拒绝物件的后续操作，也只能追加新的审计条目，不能改写历史条目。这与 [Agent Runtime Core Specification](agent-runtime-core-spec.md) 第 5 节 Execution Log Record 的审计原则一致。

---

## 12. 最小本地实现边界

本 Issue 不实现任何本地存储代码。为未来的实现 Issue 划定边界：

未来的最小本地测试实现（例如隔离的本地文件或内存存储）只有在满足以下条件时才可被视为符合本规格：

- 完整实现本文定义的接口操作（第 6 节），不得只实现子集后声称兼容；
- 行为确定性——相同输入序列必须产生相同的可观察状态（物件内容、版本链、审计记录），不依赖真实时钟以外的不确定性来源；
- 测试隔离——不同测试运行之间不共享状态，不依赖测试执行顺序；
- 保留版本与审计语义——第 4 节的版本契约和第 11 节的审计要求同样适用于本地实现，不能因为是"最小实现"就简化掉这两类保证；
- 无网络访问——本地实现不得发起任何真实的外部网络调用；
- 不修改 v1.0 冻结内容——本地实现的存在不改变 Book、Prompt Suite、Examples 或 Agent v0.1 规格的任何已冻结内容。

---

## 13. 与 Knowledge Base 的边界

Research Store Interface 不是完整的 Knowledge Base。

Research Store 提供：

- 结构化持久化（第 3 节物件契约）；
- 来源与引用溯源（第 5 节）；
- 版本历史（第 4 节）；
- 按标识符和结构化过滤条件的检索契约（第 6、9 节）。

未来的 Knowledge Base 可能新增：

- 实体解析（entity resolution）；
- 知识图谱关系；
- 语义检索；
- 投资论点综合（thesis synthesis）；
- 长期知识老化策略；
- 跨公司、跨行业的推理能力。

这些高级能力属于 [v2.0 Architecture Overview](v2.0-architecture.md) 第 5 节定义的 **Knowledge Query Interface**（Milestone 3 新增），而不是本接口的扩展版本。Knowledge Base 落地时会同时实现 Research Store Interface（兼容 Research Engine 既有的写入路径，本文定义的所有契约保持不变）和 Knowledge Query Interface（提供上述新增能力）——这是两个独立接口，不是同一接口的两个版本。

**Research Engine 必须依赖本接口，而不能直接依赖未来 Knowledge Base 的内部实现。** 这保证了 Milestone 2 阶段的最小存储实现可以在 Milestone 3 被 Knowledge Base 替换，而 Research Engine 的调用方代码不需要任何修改——替换的是接口背后的实现，不是接口本身。

---

## 非目标

本文档不包括、也不在本 Issue 范围内实现：

- 任何生产数据库实现；
- 完整 Knowledge Base 实现；
- Embeddings 或向量检索；
- 知识图谱实现；
- Notion 或 GitHub 持久化；
- 真实 MCP connector 实现；
- 真实公司研究工作流；
- 真实市场数据接入；
- 组合决策逻辑；
- 券商集成；
- 自动化交易；
- 新的 v1.0 投资框架内容。

---

## 参考文档

- [v2.0 Roadmap](v2.0-roadmap.md)：愿景、Epic 定义、优先级和里程碑规划
- [v2.0 Architecture Overview](v2.0-architecture.md)：系统分层、依赖模型、接口边界（第 5 节定义了 Research Store Interface 和 Knowledge Query Interface 各自的职责边界）
- [Agent Runtime Core Specification](agent-runtime-core-spec.md)：Runtime 职责、执行生命周期、Pre-Execution Policy Gate 和 Post-Output Human Review Gate 的完整定义
- [Tool / Data Provider Interface Specification](tool-data-provider-interface.md)：能力分类、effect classification 机制、Request/Response 契约风格
- [MCP Integration Adapter Specification](mcp-integration-adapter-spec.md)：Approval Context Validation Contract 的绑定字段和校验流程，本文第 7 节的批准要求与其保持一致
