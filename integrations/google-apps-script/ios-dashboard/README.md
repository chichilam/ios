# IOS Personal Dashboard (Google Apps Script)

A reusable Google Apps Script Web App that reads the IOS v2.1 personal-deployment Sheet schema
([`../../../setup/schema/sheet-schema.json`](../../../setup/schema/sheet-schema.json)) and renders
Daily/Weekly reports plus a history view. See
[`docs/v2.1-architecture.md`](../../../docs/v2.1-architecture.md) for the full design — this
package is Phase B of Issue #242.

**Presentation only.** This Dashboard makes no investment judgments and performs no writes — it
only reads structured rows the Daily/Weekly Scheduled Task (Phase C) already wrote, and renders
them. It contains no reference user's spreadsheet id, email, deployment URL, holdings, or
credentials anywhere — every value in [`demo/demo-sheet.json`](demo/demo-sheet.json) is synthetic.

## Files

- `Code.gs` — all logic. Split into a pure-logic section (unit-tested from Node, no Apps Script
  APIs) and a thin Apps Script glue section (`doGet`, Sheet reads, HTML rendering) that can only
  run inside Apps Script itself. Every tab read is validated against `REQUIRED_HEADERS_` (mirroring
  `setup/schema/sheet-schema.json`'s own required fields) before use — a missing or misspelled
  required column renders as an explicit Blocked error naming the tab and column(s), never as a
  silently empty section.
- `Index.html` — a static page shell (fixed container ids, no server-templated per-report
  markup). All of it renders client-side; the only thing embedded per-request is the initial JSON
  bootstrap payload (see "In-page navigation" below).
- `Styles.html` — CSS for the shell and everything Script.html renders into it.
- `Script.html` — the client-side rendering/interaction engine (Issue #250): Daily/Weekly (日报/
  周报) view switching, a compact topbar history `<select>`, the v1.1 4-metric summary grid, a
  minimal headline card, and 组合 (portfolio) / 资本配置 (capital allocation) / 风险 (risks) /
  待办 (to-dos) tabs — all driven by `google.script.run` and local state, porting the v1.1
  Dashboard's visual structure onto the v2.1 data contract (see "Visual structure" below).
- `appsscript.json` — project manifest. `webapp.access` defaults to `MYSELF` (only the deploying
  Google account can open the URL) — the safest default for a personal portfolio Dashboard; widen
  it only if you understand the exposure (see "Access policy" below).
- `demo/demo-sheet.json` — synthetic demo dataset (one Daily report, one Weekly report, holdings,
  watchlist, one deliberately orphaned report generation) used by the test suite and safe to use to
  see the Dashboard render before connecting a real Sheet.
- `test/dashboard-logic.test.js` — Node test suite for `Code.gs`'s pure-logic section.
- `test/dashboard-script.test.js` — Node test suite for `Script.html`'s client-side interaction
  (view switching, history selection, Blocked/empty-state rendering), run against the real
  `Script.html` source in a `node:vm` sandbox.
- `test/fake-dom.js` — a minimal hand-rolled DOM stand-in used only by `dashboard-script.test.js`
  (no browser, no third-party dependency).

## Running the tests

No dependencies, no `npm install` — plain Node (18+) built-ins only:

```bash
node integrations/google-apps-script/ios-dashboard/test/dashboard-logic.test.js
node integrations/google-apps-script/ios-dashboard/test/dashboard-script.test.js
```

This is the only part of this package that can be verified without a real Google account —
`doGet`/`SpreadsheetApp`/`HtmlService` calls only run inside Apps Script itself and are not
exercised by these test suites. Manual verification against a real Sheet and a real deployment is
still required before relying on this in Phase C's installer flow.

GitHub Actions (`.github/workflows/ci.yml`, the same `CI / test` job the Python suite runs under)
runs both commands above on every PR/push to `main`, alongside `python3 -m unittest discover -s
tests` — a future regression here is caught by CI, not just by an author's local run.

## In-page navigation, and the iframe bug this fixes (Issue #250)

Every Daily/Weekly switch, history-report selection, and refresh happens client-side — a
`<button onclick="...">` calling into `Script.html`, never a relative `<a href="?...">` link.
Apps Script Web Apps serve `/exec` through an internal `userCodeAppPanel` iframe; a relative-URL
link clicked from inside the rendered page navigates that iframe instead of the top-level
document and produces a blank panel. `doGet` still reads `?view=daily`/`?view=weekly` once, for
the very first page load only — everything after that is `google.script.run.getDashboardBootstrap()`
(full refresh) or `google.script.run.getReport(reportId)` (history selection), both precomputed
into the initial bootstrap payload embedded in `Index.html` so the common Daily↔Weekly toggle
needs zero additional server round-trips.

## Visual structure (v1.1 parity, Issue #250)

The original `IOS_GAS_Dashboard_v1.1` frontend is the visual source of truth for this Dashboard's
layout, content, and control styling — not a generic utility-dashboard redesign, and not merely an
approximation of it:

- A topbar (`IOS Investment Dashboard` / `Investment Operating System` brand on the left) holds
  the 日报/周报 toggle, a compact history `<select>` (jumps straight to a past report — no
  separate history section further down the page), and the refresh control (a v2.1 addition on top
  of v1.1, since v1.1 had no live re-read action).
- A 4-metric summary grid — 当前持仓 (实时组合事实) / 观察名单 (高优先级) / 核心状态 (IOS判断) /
  Review (数据完整性) — sits above the tabs. All four are presentation-only reads straight from the
  selected report's own 报告摘要 row (`当前持仓数`/`高优先级观察数`/`核心状态`/`Review状态`) —
  never recomputed client-side from live or report-detail rows, so a historical report's summary
  always matches the writer's snapshot at generation time. These are v1.1's own metrics with their
  own explanatory subtitles, not tab-navigation shortcuts; tab switching lives only in the separate
  tab row below.
- A minimal headline card directly below the grid: an eyebrow label (`一句话结论`) plus the
  conclusion text only, with an accent left border and soft gradient background — report id/
  period/generated-time metadata lives in a small muted caption underneath it instead, not inside
  the headline card itself.
- The four tabs (组合/资本配置/风险/待办) render as ordinary rounded buttons (10px radius) with a
  dark active state, matching v1.1's `.tabs`/`.tab` control language — not blue accent pills. Nav
  buttons, tabs, the history `<select>`, and the refresh button all share this same control family.
- Compact holding/watchlist cards render two per row on desktop, one per row on narrow screens,
  with v1.1's content order: 价格 / 参考(+价格位置) / 变化 / 逻辑 (长期逻辑或估值) / 验证
  (下一验证点) — no Thesis line.
- Shell width, padding, card radius/shadow, and spacing follow the v1.1 proportions (max width
  ~1180px, 22px page padding, 16px card radius, 10px control radius).

## Mobile responsiveness and todo scannability (Issue #255)

- **资本配置 (Capital Allocation)** renders both a desktop table and a mobile card list from the
  exact same `allocation` array in one pass — a CSS breakpoint (720px, the same one the holding/
  watchlist card grid collapses to a single column at) decides which one is visible; `Script.html`
  never branches on viewport width itself. Below the breakpoint the table is `display: none`
  entirely, so the wide table can never cause horizontal page overflow — the table's own wrapper
  also has `overflow-x: auto` as a belt-and-braces fallback, not the primary fix.
- **待办 (To-dos)** render as a checklist with an at-a-glance count summary (`N 待处理` / `M 已完成`,
  plus `持续观察`/`等待证据` counts when either group is non-empty — see Issue #267 below) above the
  list. Actionable/open items render before completed ones — completed items stay visible, struck
  through, never hidden — while each group internally keeps the report's own `排序` order (no
  re-sorting within a group). Every item always shows its category (`分类`) and raw status (`状态`)
  as badges; `备注` renders as a secondary note line only when present. Completion is decided by one
  classifier (Issue #260) that every count/grouping/styling/badge decision consumes, so none of
  them can disagree: the statuses `done` and `已完成` (matched case-/whitespace-insensitively for
  `done` — `Done`, `DONE`, ` done `, ...) are the only values ever treated as completed — `已完成`
  was added after real production report data showed it in use even though it hadn't turned up in a
  static repo-wide search. A blank or genuinely unrecognized `状态` value (there's no schema-level
  enum for this field) defaults to `待处理` and stays in the open/actionable group, and its exact
  raw text is still shown rather than silently relabeled. The completed status badge carries its
  own bordered green tier class (`.ios-badge-done`) distinct from the plain neutral badge open
  items use, for fast scanning.

## Follow-up kind: actionable vs. ongoing monitoring vs. waiting for evidence (Issue #267)

`报告待办`'s optional `跟进类型` field (`schema_version 3`) distinguishes three kinds of follow-up so
recurring monitoring or an item genuinely blocked on a future event doesn't inflate the 待处理
backlog or read as unfinished work: `可执行` (actionable now), `持续观察` (an ongoing condition to
keep tracking across future reports), `等待证据` (blocked on a specific future external event).
`classifyTodoKind_(rawKind)` in `Script.html` is the single classifier every grouping/badge decision
derives from — a blank or unrecognized value (including every pre-#267 report row, which has no
`跟进类型` column at all) classifies as `可执行`, the same safe default `classifyTodoStatus_` already
uses for an unrecognized `状态`.

- Open items render actionable-first, then `持续观察`, then `等待证据`, then completed items last —
  actionable work is never buried behind non-backlog groups. A monitoring/waiting item shows its
  kind badge (`.ios-badge-monitoring` / `.ios-badge-waiting`, and a matching indicator-dot tint)
  instead of the usual `状态` badge; once completed it always shows the plain `已完成` badge
  regardless of kind, so completed items stay distinguishable from every unresolved category.
- The summary's `待处理` count reflects only the actionable-and-unresolved group; the
  `持续观察`/`等待证据` badges render only when that group is non-empty, so a Sheet that has never
  used `跟进类型` renders identically to the pre-#267 two-badge summary.
- `跟进类型` is orthogonal to `状态` — a `持续观察`/`等待证据` row normally stays `待处理` for as long
  as the condition it describes remains active, and only moves to `已完成` once the follow-up item
  itself is genuinely concluded. See `docs/v2.1-architecture.md`'s "Follow-up kind" section for the
  full schema rationale, and `setup/daily-task-prompt.md`/`setup/weekly-task-prompt.md` for how the
  Daily/Weekly Task populates this field when writing new report rows.

## Semantic badge colors for IOS状态 and 价格位置 (Issue #257)

Holding/watchlist cards color-code the `IOS状态` and `价格位置` badges by exact canonical value —
text stays the authoritative, always-visible carrier of meaning; color is purely supplementary.
`iosStatusBadgeClass(value)` / `pricePositionBadgeClass(value)` in `Script.html` are pure exact-match
lookups (never a substring/prefix heuristic), shared by every render path (Daily, Weekly, and a
pinned history report all call the same `buildAssetCard`), so there's exactly one mapping to keep
correct.

- **`IOS状态`** maps the Weekly report's own "建议状态" action language
  (`prompts/weekly-portfolio-report.md`, frozen at `prompts-v1.0.0`): `可研究加仓` → opportunity
  (green), `继续持有` → neutral (plain badge), `监控风险` → risk (red), `等待`/`更新假设` →
  caution (amber), `降低研究优先级`/`延后动作` → muted (low-emphasis gray).
- **`价格位置`** maps *both* vocabularies that actually appear in this codebase for this field:
  the wording `setup/schema/sheet-schema.json` and both Task prompts document the writer using
  (`低于区间`/`区间内`/`高于区间`/`未知`) and Issue #257's own `参考`-worded list
  (`低于参考`/`接近参考`/`高于参考`/`无参考`/`无可靠价格`) — whichever a report actually contains
  still renders with the correct color. `区间内` → appropriate (green), `低于区间`/`低于参考` →
  an explicit under-reference/opportunity treatment (teal, distinct from both the green and the
  plain-badge blue), `接近参考` → caution (amber), `高于区间`/`高于参考` → expensive (red),
  `未知`/`无参考` → neutral (plain badge), `无可靠价格` → an explicit unavailable treatment
  (muted with a dashed border, distinct from plain neutral).
- **Any other value** — including a blank one — keeps its raw text and falls back to the plain
  `.ios-badge` look. The mapping functions never infer semantics from the asset, price movement, or
  surrounding prose; an unrecognized string is never accidentally colored.

## Deployment (the unavoidable manual step)

Google requires you, not this script, to authorize and deploy the Web App. There is no way to
automate this — see [`docs/v2.1-architecture.md`](../../../docs/v2.1-architecture.md#product-boundaries-unchanged-from-v20-restated-for-this-layer)
for why this repository never claims otherwise.

1. Open [script.google.com](https://script.google.com), create a new project (or open one bound to
   your Sheet), and add the five files above (`Code.gs`, `Index.html`, `Styles.html`,
   `Script.html`, `appsscript.json`) with matching names/content.
2. In the Apps Script editor, open `Code.gs` and edit the `SPREADSHEET_ID_TO_CONFIGURE_` constant
   near the top to your own Sheet's id (found in its URL:
   `https://docs.google.com/spreadsheets/d/<THIS PART>/edit`). Then select **`configureSpreadsheetId`**
   from the function dropdown and click **Run** once — this is the function to run; it takes no
   arguments (the editor's Run button can't pass any), so it reads the constant you just edited and
   stores it via `PropertiesService`, not in any file. Nothing you paste here is ever written back
   to this repository or this script's own source. Running it with the placeholder still in place
   raises an error rather than silently configuring an unusable id.
3. **Deploy → New deployment → Web app.**
4. **Execute as:** your own account (the deployer). **Who has access:** matches `appsscript.json`'s
   `access` setting above (`MYSELF` by default).
5. Google will show an "unverified app" warning for a self-owned, non-published script — this is
   expected for a personal script and is not a deployment failure. Choose **Advanced → Go to
   (project name), unsafe** to proceed, since you are both the author and the only intended user.
6. Copy the resulting `/exec` URL. This is your Dashboard link — `?view=daily` and `?view=weekly`
   select which view loads first. Switching views, or opening a specific past report from the
   History section, happens in-page after that (see "In-page navigation" below) — there is no
   separate deep-link URL for a past report.

### After the first deployment: two IDs you'll need for automated redeploys

Before moving on, note these two values down — the automated-deployment section below needs both,
and neither is a secret by itself (they only become sensitive in combination with real credentials,
which is a separate step):

- **Script ID**: in the Apps Script editor, **Project Settings** (the gear icon) shows an
  **"IDs" → "Script ID"** field. It's also the segment between `/d/` and `/edit` in the editor's own
  URL (`https://script.google.com/home/projects/<THIS PART>/edit`) — different from your Sheet's id.
- **Deployment ID**: **Deploy → Manage deployments** lists your Web App deployment with its
  **Deployment ID** shown next to it (also visible by running `clasp list-deployments` from this
  directory once you've connected `clasp` locally, per the automated-deployment section below).

## Automated deployment via GitHub Actions (Issue #247)

Once the manual first deployment above exists, `.github/workflows/deploy-gas-dashboard.yml` can keep
it up to date automatically: every push to `main` that touches `Code.gs`/`Index.html`/`Styles.html`/
`Script.html`/`appsscript.json` pushes the new source with `clasp` and updates *that same*
deployment — the `/exec` URL from step 6 above never changes as a result of this workflow. It never
calls `clasp create-deployment`/`clasp deploy` (the commands that can mint a brand-new deployment,
and therefore a new URL) — only `clasp update-deployment` against the exact deployment ID you
configure below.

This is optional. Skipping it just means going back to the manual copy/paste-and-redeploy flow above
whenever `Code.gs` or the HTML files change — nothing about the manual path stops working.

### One-time bootstrap

1. **Install `clasp` locally** (your own machine, not CI): `npm install -g @google/clasp@3.4.0` —
   pin the same version the workflow itself pins (`CLASP_VERSION` in the workflow file), so what you
   test locally matches what CI runs. `clasp` requires Node.js 20+.
2. **Log in**: `clasp login`. This opens a real browser and uses a local `http://localhost` redirect
   — do **not** use `clasp login --no-localhost`: Google discontinued the manual-code-entry (OOB)
   OAuth flow that flag relies on in January 2023, so it no longer completes. Plain `clasp login` on
   a machine with a browser (which this one-time step assumes) sidesteps that entirely. This writes
   `~/.clasprc.json` — a working copy of your own Apps Script/Drive OAuth credentials. **Treat this
   file exactly like a password**: anyone who has it can act as you against every Apps Script project
   you can reach.
3. **Copy `~/.clasprc.json`'s exact content** — the whole file, not a summary — into a new repository
   secret named **`CLASP_CREDENTIALS`** (Settings → Secrets and variables → Actions → New repository
   secret, or scope it to the `gas-dashboard-production` environment instead — see "Recommended:
   protect the deployment environment" below).
4. **Add two more secrets**: **`GAS_SCRIPT_ID`** and **`GAS_DEPLOYMENT_ID`**, using the two IDs you
   noted above.
5. **Verify locally before trusting CI with it**: from this directory, `clasp push` should succeed
   against your project (this proves the credentials/script id combination actually works before you
   hand it to a workflow you can't step through interactively). You can undo this with `clasp pull`
   or by re-pasting the files if it pushes something you didn't intend.
6. **Trigger the workflow once**: push any change to one of the watched files (or use the **Run
   workflow** button under the Actions tab's "Deploy GAS Dashboard" workflow — it supports
   `workflow_dispatch`), then confirm the existing `/exec` URL still opens the Dashboard afterward and
   the job's summary shows the version it deployed.

### Recommended: protect the deployment environment

The workflow's deploy job runs under a GitHub **Environment** named `gas-dashboard-production`. If
you store the three secrets above under that environment (Settings → Environments → New environment)
rather than as plain repository secrets, you can add required-reviewer or wait-timer protection rules
to it — this workflow file names the environment but can't configure those rules for you, since that
requires repository-admin access this workflow deliberately doesn't have (`permissions: contents:
read` only).

### Troubleshooting

- **A deploy run fails at "Write non-interactive clasp credentials" or "Write .clasp.json"**: one of
  the three secrets isn't set. The job fails loudly and names which one, rather than silently
  skipping the deploy.
- **A deploy run fails at `clasp push`/`create-version`/`update-deployment` with an auth error**:
  your `CLASP_CREDENTIALS` refresh token was likely revoked or expired (this can happen if you
  changed your Google account password, revoked third-party app access, or the grant simply aged
  out). Re-run steps 1–3 of the bootstrap above locally and update the `CLASP_CREDENTIALS` secret
  with the fresh `~/.clasprc.json` content.
- **`clasp update-deployment` reports a deploymentId that doesn't match `GAS_DEPLOYMENT_ID`**: the
  workflow treats this as a failed deploy (not a success) precisely so this can't happen silently —
  double-check the `GAS_DEPLOYMENT_ID` secret against **Deploy → Manage deployments** in the Apps
  Script editor.
- **You want to roll back a bad deploy**: **Deploy → Manage deployments** in the Apps Script editor
  lets you pick an earlier version for the same deployment ID manually — the workflow doesn't (yet)
  automate rollback.

### Access policy

`MYSELF` means only the Google account that deployed the script can open the Dashboard URL, even
if someone else obtains the link. If you need to share it with, e.g., a spouse, Apps Script's
`ANYONE_WITH_LINK`/`ANYONE_ANONYMOUS` options exist but expose portfolio content to anyone who has
the URL — this repository does not recommend that default and does not build a login/auth layer on
top of it (see Issue #242's non-goals: no public multi-user Dashboard).

## Trying it with the demo data first

Before connecting a real Sheet, you can sanity-check the rendering logic offline with the Node test
suite above, and/or paste `demo/demo-sheet.json`'s rows into a scratch Sheet matching
[`setup/schema/sheet-schema.json`](../../../setup/schema/sheet-schema.json)'s seven tabs to see the
real `doGet` path render it end to end. Never point a real installation's `IOS_SPREADSHEET_ID` at
data you don't want a browser tab to display.
