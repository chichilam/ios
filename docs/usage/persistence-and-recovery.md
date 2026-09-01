# Persistence and Recovery

`ios/core/research_store/` ships two storage modes. Almost everything in [Quickstart](quickstart.md)
and [Workflow Guide](workflow-guide.md) uses `LocalResearchStore` — pure in-memory, gone the moment
the process exits. This guide covers the other mode: `DurableResearchStore`, its checkpoint file, and
the operator CLIs for inspecting, backing up, restoring, and migrating it.

## The checkpoint concept

`DurableResearchStore` wraps a `LocalResearchStore` and, after every call into it, atomically
snapshots the store's entire internal state to one JSON checkpoint file:

```python
from ios.core.research_store.durable_store import DurableResearchStore

store = DurableResearchStore(path="checkpoint.json")
# ... use `store` exactly like a LocalResearchStore -- every write is checkpointed automatically ...
```

A second, independent `DurableResearchStore(path="checkpoint.json")` construction — in a genuinely
different process — loads the last complete snapshot and continues exactly where the first process
left off. Nothing needs to be exported or migrated by hand; this is the mechanism that lets a
workflow survive a crash or a planned restart.

Two files live alongside every checkpoint:

- The checkpoint itself (`checkpoint.json` in the example above) — the store's full state at its
  last successfully published generation.
- A **rollback-evidence sidecar** (`.checkpoint.json.evidence`, next to it) — records the highest
  generation ever legitimately reached, consumed nonces/recovery events, and restore/migration
  history. This is what lets the system detect an old backup silently restored over the live
  checkpoint (both files individually look valid; only the sidecar proves which generation is
  actually current).

## Fail-closed by design

Every read through this layer re-verifies, never just deserializes:

- A checkpoint's own `content_digest` covers `schema_version` + `generation` + `state` together —
  a single-field tamper (even just editing `generation` to dodge a check) is caught, not silently
  accepted.
- Loading a checkpoint reconstructs a real `LocalResearchStore` and re-runs the same integrity gates
  a live in-memory store already applies on every read — never a separate, weaker "trust the file"
  path.
- A checkpoint whose generation doesn't match its own evidence sidecar's recorded high-water mark
  (`needs_recovery` / `checkpoint_ahead_of_evidence`) is refused for ordinary use — see
  `inspect` below — until it goes through authenticated recovery.

**Recovering from an inconsistent state is never a convenience bypass.** Every recovery/restore/
migration path in this codebase requires either an unambiguous "this path never had a checkpoint at
all" bootstrap case, or a live, exactly-bound, single-use authorization from a real
`ApprovalPrincipalIssuer` — see [Runtime and Approval](runtime-and-approval.md#research_store--research_session-approval-bound-writes).
There is no operator flag that skips this. If you're reaching for one, the right next step is to
`inspect` first and understand exactly what state the pair is in, not to force a write.

## Operator CLI

Three tools, all under `ios/core/research_store/`, one JSON report line per invocation:

### Inspect (`checkpoint_cli.py`) — read-only, never mutates anything

```bash
python3 -m ios.core.research_store.checkpoint_cli inspect --path checkpoint.json
```

```json
{
  "checkpoint_ahead_of_evidence": false,
  "checkpoint_exists": true,
  "evidence_exists": true,
  "generation": 1,
  "highwater": 1,
  "needs_recovery": false,
  "status": "clean",
  "unrecoverable": false
}
```

`status: "clean"` means the pair is safe for ordinary use. `needs_recovery`/
`checkpoint_ahead_of_evidence`/`unrecoverable` each name a specific inconsistency — read the report,
don't guess.

### Backup (`checkpoint_cli.py`)

```bash
python3 -m ios.core.research_store.checkpoint_cli backup --path checkpoint.json --backup-root ./backups
```

Packages the checkpoint and its evidence sidecar into one self-contained, digest-verified bundle
directory under `--backup-root`, read together under the same writer lock the checkpoint's own
publish sequence uses — the pair is provably from one consistent moment, never a torn snapshot.

### Restore (`checkpoint_cli.py`)

```bash
python3 -m ios.core.research_store.checkpoint_cli restore --path checkpoint.json --bundle-dir ./backups/<bundle-id> \
  --staging-root ./staging --reason "disaster recovery" --request-id <uuid>
```

Authorization is decided by what's actually at `--path`, and it is **not** simply "checkpoint exists
or not" — it's a three-state distinction:

1. **Neither a checkpoint nor an evidence sidecar exists** — an unauthenticated bootstrap, the same
   behavior as constructing a fresh `DurableResearchStore`. No `--recovery-issuer-entry-id` needed.
2. **An evidence sidecar exists, with or without a live checkpoint** — a live, authenticated,
   exactly-bound recovery issuance is required (`--recovery-issuer-entry-id` + `--issuer-factory` —
   see the CLI's own `--help`). This includes the evidence-only case: a surviving evidence sidecar is
   real security history (a nonzero high-water mark, a consumed-nonce/recovery-event ledger) even
   with no checkpoint to load, and restoring over it without authorization would let an attacker
   silently discard that history just by deleting the checkpoint file first.
3. **A checkpoint exists but its evidence sidecar is missing** — restore is rejected unconditionally
   (`DurableStoreRollbackDetectedError`), at *any* authorization level. There is no flag that
   bypasses this; it's the same permanently-unrecoverable condition `inspect` reports as
   `unrecoverable`.

The restore's own `--request-id` is the idempotency key: retrying the same restore with the same
parameters short-circuits to the already-applied result without re-consulting the issuer; retrying
with different parameters under the same id is rejected outright.

### Migrate (`schema_migration_cli.py`)

When the evidence sidecar's own schema needs to move to a newer version (a versioned, one-time
transformation — not the ordinary read/write path), `plan` reports whether a migration is available
and blocked-or-not, and `migrate` applies it — authorize, then a mandatory pre-migration backup,
then stage-and-validate the migrated documents through the real codec before either live file is
touched:

```bash
python3 -m ios.core.research_store.schema_migration_cli plan --path checkpoint.json
python3 -m ios.core.research_store.schema_migration_cli migrate --path checkpoint.json \
  --backup-root ./backups --staging-root ./staging --reason "formalize restore_history" \
  --request-id <uuid> --migration-issuer-entry-id <id> --issuer-factory <module:function>
```

Like restore, migration is never an unauthenticated bootstrap and is idempotent on `--request-id`.
Unlike restore, migration also advances the checkpoint's own generation and canonical audit log by
one — this is what lets a stale evidence file swapped back in after a migration be detected
(`checkpoint_ahead_of_evidence`) rather than silently treated as re-migratable.

## `--issuer-factory`: this codebase defines no production issuer

Every command above that requires authorization takes `--issuer-factory module.path:function_name`
— a caller-supplied factory returning an `ApprovalPrincipalIssuerRegistry`. This repository is a
dry-run scaffold and ships no production issuer implementation; wiring a real one (backed by
whatever actually plays Human Review in your deployment) is the integration point a real deployment
provides, mirroring the same pattern `ios/core/runtime/`'s own CLI uses for its gates.

## Next steps

- [Runtime and Approval](runtime-and-approval.md) — the approval-binding/idempotency discipline
  this layer's authorization checks are built on.
- `ios/core/research_store/README.md` and `ios/core/research_store/checkpoint_ops.py`'s own module
  docstring — the full design rationale, crash-window handling, and fault-injection test matrix
  behind every guarantee described above.
