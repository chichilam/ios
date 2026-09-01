# Runtime and Approval

This codebase has two independent places where "approval" shows up, and they're easy to conflate:
the **Agent Runtime**'s own dry-run execution gates (`ios/core/runtime/`), and the
**`ios.core.research_store`/`ios.core.research_session`** approval-context pattern that every side-effecting write in a
workflow goes through. Both exist for the same reason — nothing that matters gets to happen without
an explicit, bound, non-replayable authorization — but they're separate mechanisms with separate
code.

## Agent Runtime: planning vs. execution

`ios/core/runtime/` is an explicit state machine (`state_machine.py`) with one validated transition
table:

```text
created -> planning -> routed -> prompt_loaded -> tool_request_prepared
    -> [Pre-Execution Policy Gate] -> tool_executed -> output_normalized
    -> evaluation_passed -> [Post-Output Human Review Gate] -> completed
```

`completed`/`rejected`/`failed` are terminal — nothing transitions out of them. Every transition is
recorded with a timestamp and reason in the execution's own audit trail.

**Planning** (`created` through `tool_request_prepared`) picks a prompt, routes to an agent, and
prepares a tool request — no adapter code runs yet, and nothing external happens. **Execution**
(`tool_executed` onward) is where an adapter actually runs — this is the only point where a dry-run
Runtime does anything observable at all, and even that is gated:

- **Pre-Execution Policy Gate** (`policy_gate.py`): any adapter operation whose metadata declares
  `side_effecting`/`high_impact` pauses *before* the adapter runs. The pending execution is
  persisted (`state_store.py`, `./runtime_state/<execution-id>.json` by default) so a separate
  `approve`/`reject` CLI invocation — a different process, at a different time — can resume it.
- **Post-Output Human Review Gate** (`review_gate.py`): pauses *after* evaluation when the Agent
  Output's `human_review_status` is `pending` — even for a read-only operation, if its output is
  marked as needing human review before being treated as final.

Both gates are fail-closed by design: if the gate can't determine an operation is safe, it pauses
rather than proceeding.

### CLI

```bash
# Read-only, completes immediately -- no gate is triggered
python3 -m ios.core.runtime run --input "Analyze MSFT"

# Side-effecting: pauses at the Pre-Execution Policy Gate
python3 -m ios.core.runtime run --input "please write a mock research note"
python3 -m ios.core.runtime approve --execution-id <id> --reviewer local-user
# or
python3 -m ios.core.runtime reject --execution-id <id> --reviewer local-user --reason "Not approved"

# Read-only output that still requires review: pauses at the Post-Output Human Review Gate
python3 -m ios.core.runtime run --input "recommend a portfolio action"
python3 -m ios.core.runtime approve --execution-id <id> --reviewer local-user
```

Exit codes: `0` completed, `1` failed/rejected, `2` awaiting approval/review (not an error — a
caller scripting against this CLI should treat `2` as "come back later with `approve`/`reject`",
not as a failure).

### Approval Context

`approval.py`/`contracts.ApprovalContext` binds an approval to execution id, request id, adapter
id, capability type, operation name, a hash of the *normalized* parameters, and effect class, plus
an expiry and a single-use nonce. Every adapter (e.g. `ios/core/runtime/adapters/mock_note_write.py`)
**independently re-validates every one of these fields** and keeps its own consumed-nonce ledger
before treating a request as approved — it never trusts that the Runtime already approved it. A
captured-but-unconsumed approval context can't be replayed against a different request, and a
caller can't mislabel an operation's effect class to dodge the gate that would otherwise apply to
it.

### What this means for a caller

`ios/core/runtime/` is **dry-run only** — there is no real trading and no real external write
capability in this repository. Building a real adapter on top of this framework means:

- Declaring the adapter's own `side_effecting`/`high_impact` metadata honestly — the gate trusts
  the adapter's own declaration, and the adapter itself is where actual re-validation happens.
- Never trusting that "the Runtime approved this" is sufficient inside the adapter itself —
  re-validate the exact same fields the Runtime's own gate already checked.
- Persisting whatever `state_store.py`/`execution.py` already persist for you (paused-execution
  state, the audit trail) rather than inventing a parallel record of what happened.

## research_store / research_session: approval-bound writes

Independently of the Runtime, every side-effecting or high-impact write into a `ios.core.research_store` or
`ios.core.research_session` — registering an approval-principal issuer, recording a review decision,
superseding an artifact, migrating a schema — requires a `contracts.ApprovalContext` bound to that
*exact* request. `build_approval_context` (used throughout this codebase's own tests) is the
convenience constructor:

```python
from ios.core.research_store import build_approval_context
from ios.core.research_store.contracts import EffectClass

approval = build_approval_context(
    request_id=request_id,                      # must match the request this approval authorizes
    operation_name="register_approval_principal_issuer",
    effect_class=EffectClass.HIGH_IMPACT,
    parameter_payload=binding_payload,           # a package-specific "build_*_binding_payload" helper
    approved_by="human",
)
```

`build_approval_context` is a **test/caller convenience** — in a real deployment, this comes from
whatever plays the Human Review Gate role in front of the write, not from the caller minting its
own approval. The binding payload is operation-specific (each package exposes its own
`build_*_binding_payload` helper) and always covers every field that determines *what* is being
authorized, not just an opaque token — an approval minted for one request can never be replayed
against a different one, even one that looks superficially similar.

### Idempotency and replay resistance

Every request that mutates state carries a `request_id` (or `idempotency_key`, depending on the
package) that this codebase treats as the authoritative retry key — **not** a content hash:

- The same `request_id` submitted again with the *same* normalized request content returns the
  original result — no new write, no re-consulted approval.
- The same `request_id` submitted again with *different* content is rejected
  (`IdempotencyConflictError`/`DuplicateArtifactError`, depending on the package) — never silently
  overwritten, never treated as "the caller meant to retry."
- A captured approval/issuance can't be consumed twice, and can't be replayed against a request it
  wasn't exactly bound to — every approval-consuming operation checks a consumed-nonce/consumed-event
  ledger before treating an approval as valid.

This same discipline extends into `ios.core.research_store`'s durable checkpoint layer — see
[Persistence and Recovery](persistence-and-recovery.md) for how a crash mid-write and a later
retry interact with this same idempotency machinery.

## Next steps

- [Persistence and Recovery](persistence-and-recovery.md) — the durable checkpoint layer this
  approval discipline extends into once a `ios.core.research_store` needs to survive a process restart.
- [Workflow Guide](workflow-guide.md) — how a workflow's own `waiting_for_review` state connects to
  `record_review_decision` and `workflow.complete()`.
