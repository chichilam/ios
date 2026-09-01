# Quickstart

This is the fastest path from a fresh checkout to a running, deterministic research workflow. It
assumes no prior familiarity with the codebase.

## Prerequisites

- Python 3.12+ (the version this repository's CI pins — see [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)).
- Nothing else. `ios/` is standard-library only — there is no `requirements.txt`, no `pyproject.toml`,
  and no package to `pip install`. There is also no packaging/install step: every command below runs
  directly against a checkout, from the repository root.

## Clone and verify

```bash
git clone <this repository>
cd investment-operating-system
python3 -m unittest discover -s tests
```

The full suite (3798+ tests as of this writing) is deterministic and network-independent — every
provider (SEC, EDINET, financial facts) is exercised against checked-in replay fixtures under
`fixtures/`, never a live network call. It should pass unmodified on a fresh checkout; if it
doesn't, something is broken (see [`CI / test`](../../.github/workflows/ci.yml), which runs this
exact command on every pull request).

All commands in this guide assume you're running from the repository root — `ios` is not an
installed package, so `python3 -m ios.core.runtime ...` and any `python3 -c "import ios..."` /
script must be invoked from the directory containing `ios/`.

## A minimal deterministic workflow, end to end

`ios/workflows/company_research_workflow` is the root of the workflow dependency chain — nearly
every other workflow eventually consumes an artifact it produces. `FixtureCompanyResearchProvider`
reads checked-in, real-shaped (but synthetic) document fixtures under `fixtures/company_research/` —
no network, no credentials, no external state:

```python
from ios.core.research_session.local_store import LocalResearchSessionStore
from ios.core.research_store.local_store import LocalResearchStore
from ios.workflows.company_research_workflow import CompanyResearchWorkflow, FixtureCompanyResearchProvider

research_store = LocalResearchStore()
session_store = LocalResearchSessionStore(research_store)

workflow = CompanyResearchWorkflow(
    research_store=research_store,
    session_store=session_store,
    workflow_id="wf-company-research",
    execution_id="exec-1",
    subject_id="AAPL",
    actor="agent-research-1",
    provider=FixtureCompanyResearchProvider(),
)
session = workflow.run()  # initialize -> collect_sources -> generate_artifacts -> request_review, then stops
assert session.status.value == "waiting_for_review"

for artifact_id in session.artifact_ids:
    artifact = research_store.get_artifact(artifact_id)
    print(artifact.artifact_type.value, "-", artifact.title, "-", artifact.review_status.value)
```

This prints five `draft` artifacts (a company profile, a business summary, a competitive-position
note, a risk review, and a references artifact), each with real source/citation references back to
the fixture documents that back it — every field is traceable to a specific fixture excerpt, never
invented. `workflow.run()` deliberately stops at `waiting_for_review`: no artifact this system
produces becomes usable downstream without an explicit review decision — see
[Runtime and Approval](runtime-and-approval.md) for what happens next (`record_review_decision`,
then `workflow.complete()`).

## Using a real filing/provider path (network required)

`ios.workflows.company_research_workflow` also ships `SecCompanyResearchProvider`, which fetches real filings from
SEC EDGAR over HTTPS — the same provider contract, different data source, no code changes to the
workflow itself:

```python
from ios.workflows.company_research_workflow.sec import (
    SecClientConfig, SecCompanyResearchProvider, StaticCikResolver, UrllibHttpTransport,
)

config = SecClientConfig(user_agent="My Research Tool contact@example.com")  # SEC requires a real, identifying user agent
provider = SecCompanyResearchProvider(
    transport=UrllibHttpTransport(config=config),
    config=config,
    cik_resolver=StaticCikResolver(mapping={"AAPL": "320193"}),
)
workflow = CompanyResearchWorkflow(
    research_store=research_store, session_store=session_store,
    workflow_id="wf-sec", execution_id="exec-1", subject_id="AAPL",
    actor="agent-research-1", provider=provider,
)
session = workflow.run()  # fetches SEC EDGAR over HTTPS
```

This requires outbound network access and a real, identifying `user_agent` string (SEC EDGAR
enforces this). It is not exercised by the test suite or by CI — those stay fully offline by
design — and is not something this quickstart runs for you. See
[`ios/workflows/company_research_workflow/README.md`](../../ios/workflows/company_research_workflow/README.md#the-sec-filing-provider-adapter)
for the transport/safety boundary this provider enforces (URL allowlisting, response size limits,
no redirect-following past the configured host).

## Where things are stored

- `LocalResearchStore`/`LocalResearchSessionStore` (used above) are **in-memory only** — nothing
  is written to disk, and every process restart starts empty. This is the default for workflow
  development and testing.
- `ios.core.research_store.durable_store.DurableResearchStore` wraps a `LocalResearchStore` and
  persists a checkpoint to a file you name after every call — the same store survives a real
  process restart. See [Persistence and Recovery](persistence-and-recovery.md) for the full
  lifecycle (checkpoint, evidence sidecar, backup, restore, schema migration).
- `ios.core.runtime`'s dry-run CLI writes paused execution state under `./runtime_state/` and
  execution logs under `./runtime_logs/` (both overridable, both local files — never a database or
  external service). See [Runtime and Approval](runtime-and-approval.md).
- Test fixtures (`fixtures/`) are read-only, checked-in, synthetic sample data — no test run writes
  back to them.

## Next steps

- [Workflow Guide](workflow-guide.md) — how the 28 workflows in `ios/workflows/` relate to each
  other, and how to read `insufficient_evidence`.
- [Runtime and Approval](runtime-and-approval.md) — the approval/review boundary every
  side-effecting or human-reviewed operation in this codebase goes through.
- [Persistence and Recovery](persistence-and-recovery.md) — durable checkpoints, backup/restore,
  and schema migration for `ios.core.research_store`.
