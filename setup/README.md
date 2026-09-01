# setup/

Deployment artifacts for the IOS v2.1 personal deployment layer (Issue #242) — a prompt-first
install path on top of Google Sheets, ChatGPT Scheduled Tasks, and a Google Apps Script Dashboard.
See [`docs/v2.1-architecture.md`](../docs/v2.1-architecture.md) for the full design.

## What's here today

- `schema/sheet-schema.json` — the canonical, versioned Google Sheets schema (currently
  `schema_version 3`: nine user-facing tabs — the seven original tabs plus the additive
  `账户状态`/`投资信托明细` tabs from `schema_version 2`, and `报告待办`'s additive `跟进类型`
  column from `schema_version 3` — plus an installer-owned internal `_安装状态` tab, field names,
  types, and rules) that every later piece of this deployment layer reads and writes against.
- `schema/installation-state.json` — the schema for tracking a single installation (spreadsheet id,
  Dashboard URL, Task schedules, timezone) so an installer run can detect and upgrade an existing
  installation instead of duplicating it. No real installation's state is ever committed here.
- `chatgpt-install-prompt.md` — the canonical one-prompt installer (Phase C). Copy its
  paste-ready block into a new ChatGPT conversation to set up an installation end to end, stopping
  only at the one manual Google authorization/deployment step.
- `daily-task-prompt.md` / `weekly-task-prompt.md` — the Daily/Weekly Scheduled Tasks' own
  instructions (Phase C), the canonical source the installer prompt creates those two Tasks from.
  Also useful standalone if you want to inspect, edit, or manually recreate a Task later.
- `onboarding-prompt.md` — the post-install portfolio onboarding conversation (Issue #273) the
  installer hands off to once setup finishes: a low-friction, confirm-before-write path to either
  record an existing portfolio or start from zero with a guided research candidate pool. Optional
  and reusable any time — writes only against the existing `当前持仓`/`观察名单`/`账户状态` schema,
  no new tab or field.

The reusable GAS Dashboard package (Phase B) reads this schema and lives under
[`integrations/google-apps-script/ios-dashboard/`](../integrations/google-apps-script/ios-dashboard/),
not in this directory. `tests/test_setup_installer_prompt_schema_sync.py` keeps
`chatgpt-install-prompt.md`'s embedded schema table in sync with `schema/sheet-schema.json`
automatically.

## Related, elsewhere

- [`docs/usage/personal-ios-dashboard.md`](../docs/usage/personal-ios-dashboard.md) — end-to-end
  user documentation (Phase D): Quick install, normal usage, troubleshooting.

## Release status

- The `v2.1.0` release tag and GitHub Release (Phase E) have been published. The verification
  background remains documented in `CHANGELOG.md` and
  [`docs/releases/v2.1.0-verification-checklist.md`](../docs/releases/v2.1.0-verification-checklist.md);
  this directory contains the setup artifacts that shipped in that release, not any user's real
  installation state.
- Since `v2.1.0`, `schema_version 3` (Issue #267 — `报告待办.跟进类型`, distinguishing actionable
  todos from ongoing monitoring/waiting-for-evidence items) has been added additively; see
  `CHANGELOG.md`'s `v2.1.1` entry.

This directory contains schema/templates/prompts only — no user's real spreadsheet id, email
address, GAS deployment URL, holdings, or credentials belong here at any phase.
