# Workflow Guide

`ios/workflows/` contains 28 workflow packages. Every one of them follows the same shape — a
`Workflow` class that drives a `ios.core.research_session`, evidence bound to a `ios.core.research_store` artifact or
a provider-produced `SourceSpec`, and a deterministic, rule-table judgment as its output — but they
differ in how deep into the dependency chain they sit and what they consume as evidence. This guide
explains the families, how to call a representative one, and how to read the result.

## Two workflow families

**The company-research / financial-facts spine** — everything here eventually traces back to
`ios/workflows/company_research_workflow` (evidence about a company: business summary, competitive
position, risks) and `ios/providers/financial_facts` (audited SEC XBRL metrics). Roughly, evidence
gets composed in layers:

```text
company_research_workflow  (base company evidence)
financial_facts             (audited XBRL metrics, provider)
        |
        v
single-metric snapshots     valuation_update / revenue_growth / operating_margin /
                             balance_sheet_leverage / free_cash_flow_conversion /
                             earnings_change_indicator / shareholder_return_cash_outflow
        |
        v
composite comparisons       expected_return  (pins valuation_update)
                             competitive_position  (pins up to 7 snapshot artifacts, peer comparison)
        |
        v
industry / value-chain      industry_structure -> value_chain_map -> profit_pool_snapshot ->
                             bottleneck_control_point / value_migration_signal
        |
        v
AI infrastructure layer     ai_infrastructure_value_chain_workflow -> ai_layer_durability_workflow
                             -> ai_capex_revenue_verification_workflow

investment_thesis_workflow composes company_research / valuation_update / expected_return /
other approved artifacts into a single strengthened/weakened/mixed/unchanged/insufficient_evidence
classification.
```

**The Japan / EDINET spine** — everything here traces back to `ios/providers/edinet_filings`
(EDINET XBRL filing evidence, Japan market):

```text
edinet_filings  (raw EDINET fact extraction, provider)
        |
        v
shareholder_return_persistence_workflow / treasury_share_treatment_workflow / dilution_treatment_workflow
        |
        v
shareholder_return_funding_sustainability_workflow  (also pins balance_sheet_leverage,
                                                       free_cash_flow_conversion,
                                                       shareholder_return_cash_outflow —
                                                       bridges into the other spine)
        |
        v
currency_and_shareholder_return_review_workflow  (pins shareholder_return_persistence,
                                                    shareholder_return_funding_sustainability,
                                                    treasury_share_treatment)
```

`ios.workflows.new_nisa_investment_checklist_workflow` and `ios.workflows.japan_company_quality_checklist_workflow` sit outside
both spines — they pin no other workflow's artifact at all. Every checklist fact is declared
directly by the caller, bound to real, independently-checkable evidence provenance; these two
packages only aggregate and detect conflicts, never derive a fact from raw numbers themselves.

`ios/workflows/citation_adoption_batch_workflow` is not a research workflow — it's an operational
tool for migrating a batch of artifact citations from one extraction to another (see its own
README); it pins `ios.workflows.shareholder_return_persistence_workflow`/`ios.workflows.treasury_share_treatment_workflow`
artifact shapes specifically.

Every package's own `README.md` documents its exact request contract, evidence sources, and rule
table — this guide is the map, not a substitute for reading the package you're actually calling.

## Calling a representative workflow

Every workflow constructor takes the same core arguments: a `ios.core.research_store`, a `session_store`,
`workflow_id`/`execution_id`/`actor` for audit attribution, and a request object (or a `provider`,
for the base `ios.workflows.company_research_workflow`). See [Quickstart](quickstart.md) for a fully worked,
verified example using `ios.workflows.company_research_workflow`.

For a workflow further down the chain, the shape looks like this (illustrative — see the target
package's own README for its exact request fields):

```python
from ios.core.research_session.local_store import LocalResearchSessionStore
from ios.core.research_store.local_store import LocalResearchStore
from ios.workflows.operating_margin_workflow import OperatingMarginEvidenceProvider, OperatingMarginRequest, OperatingMarginWorkflow

research_store = LocalResearchStore()
session_store = LocalResearchSessionStore(research_store)

request = OperatingMarginRequest(
    subject_id="AAPL",
    as_of="2026-01-15T12:00:00+00:00",
    accession_number="0000320193-24-000006",  # required input: which filing to pin
)
workflow = OperatingMarginWorkflow(
    research_store=research_store, session_store=session_store,
    workflow_id="wf-operating-margin", execution_id="exec-1", actor="agent-research-1",
    request=request, evidence_provider=OperatingMarginEvidenceProvider(...),  # see the package README
)
session = workflow.run()
```

## Required inputs vs. derived inputs

A request's fields fall into two categories, and every workflow's own README documents which is
which for its specific request type:

- **Required, caller-declared inputs** — the things only the caller can know: which subject, which
  filing/accession/reporting period to pin, which upstream artifact (by id) to consume, which
  threshold policy to apply. These are never invented or defaulted by the workflow.
- **Derived/resolved fields** — values the workflow computes deterministically from the pinned
  evidence (a margin, a growth rate, a classification) and then persists on the artifact alongside
  a citation back to the exact source fact that produced them. A caller never supplies these
  directly; supplying a caller-declared "conclusion" where a derived one belongs is exactly the
  kind of self-graded input this system's fail-closed request validation rejects.

## How upstream artifact binding ("pinning") works

A workflow that consumes another workflow's output does not trust a caller's summary of that
artifact — it **pins** the artifact by id and independently re-verifies it before using anything
from it:

1. The pinned artifact must be `APPROVED` (or whatever review status the consuming workflow
   requires) — a `draft` artifact is not usable evidence.
2. The consuming workflow reads the pinned artifact's own content and re-derives its
   `request_identity` (via that upstream package's own `recompute_request_identity_from_content`),
   comparing it against what the artifact claims — this catches tampering or a caller substituting
   a different artifact than the one actually referenced.
3. Only fields the upstream artifact *itself* already computed and persisted are ever reused —
   never re-aggregated or recombined across a different classification boundary than the one the
   upstream package already applied.

This is why the dependency chains above matter operationally: an artifact three layers deep in the
AI-infrastructure spine, when re-verified, transitively re-verifies everything under it too.

## Reading `insufficient_evidence`

Every workflow's overall judgment includes `insufficient_evidence` as an explicit possible outcome
— it is not an error, and it is not the same as "no". It means: the evidence provided does not
meet the fixed bar this workflow requires to output a directional conclusion at all. Common causes:

- A required evidence dimension was never supplied, or was supplied as `MISSING` by the upstream
  provider (e.g. EDINET taxonomy elements that a given filing simply never tagged).
- Two evidence sources conflict and the workflow has no rule to prefer one over the other
  (`conflicting`, which several workflows treat as strictly worse than `insufficient_evidence` and
  as unconditionally overriding every other signal).
- A structural precondition wasn't met — e.g. `ios.workflows.dilution_treatment_workflow` requires both a
  decisive share-count fact *and* both split-ratio facts for every period in the evaluation window;
  missing any one collapses that period to `insufficient_evidence` rather than guessing.

The correct response to `insufficient_evidence` is to supply the missing/conflicting evidence
explicitly (or accept that this codebase's current provider surface cannot establish it — several
package READMEs document exactly this, e.g. `ios.workflows.currency_and_shareholder_return_review_workflow`'s
`currency_exposure_completeness`/`hedge_policy_consistency` dimensions, which are permanently
retired rather than pending). **Never** treat `insufficient_evidence` as equivalent to a negative
or neutral conclusion — every workflow's own README states explicitly what `insufficient_evidence`
means for that workflow's specific rule table.

## Next steps

- [Runtime and Approval](runtime-and-approval.md) — what happens between `waiting_for_review` and
  a usable, `APPROVED` artifact.
- [Persistence and Recovery](persistence-and-recovery.md) — running workflows against a durable,
  restart-surviving `ios.core.research_store` instead of the in-memory default.
- Each workflow's own `README.md` under `ios/workflows/<name>/` — the authoritative reference for
  its request contract, rule table, and non-goals.
