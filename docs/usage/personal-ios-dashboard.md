# Personal IOS Dashboard (v2.1)

A practical guide to installing and running the v2.1 personal deployment layer — Google Sheets +
ChatGPT Scheduled Tasks + a Google Apps Script Dashboard — on top of the frozen IOS investment
methodology. See [`docs/v2.1-architecture.md`](../v2.1-architecture.md) for the full design
rationale; this guide only covers what a user actually does.

**Status**: the install path below shipped as part of `v2.1.0` (tagged and published after a real
end-to-end verification pass against a live Google Sheet, ChatGPT Scheduled Task, and GAS
deployment — see
[`docs/releases/v2.1.0-verification-checklist.md`](../releases/v2.1.0-verification-checklist.md))
and has since picked up additive `schema_version 3` changes in `v2.1.1`. If something below doesn't
match what you see, please file it as a new issue rather than silently working around it.

## Quick install

1. Open a new ChatGPT conversation. If your ChatGPT session can connect to Google Drive/Sheets,
   connect it first — the installer uses that connection automatically when available, and falls
   back to a guided manual mode when it isn't (this is a normal degraded path, not a failure).
2. Copy everything between the `PASTE-READY START`/`PASTE-READY END` markers in
   [`setup/chatgpt-install-prompt.md`](../../setup/chatgpt-install-prompt.md) and paste it as your
   first message, verbatim.
3. Follow the conversation. ChatGPT creates or upgrades your Google Sheet, generates the GAS
   Dashboard files, and creates your Daily/Weekly Scheduled Tasks — asking you questions where it
   needs them (which Sheet to use, your timezone, whether you want to supply a current cash/funding
   figure for Weekly reports).
4. When it reaches Google's own authorization/deployment step, it stops and hands you a short
   checklist — this is the one step nothing can automate, since Google requires the account owner
   to approve it in a browser. See "The one manual step" below.
5. Paste the resulting `/exec` URL back into the conversation.
6. ChatGPT patches your two Scheduled Tasks with that URL and shows you a final verification
   checklist. Once every item is checked, you're done — the next scheduled Daily/Weekly run
   produces your first report.

This repository is currently private, so a plain URL fetch from ChatGPT will usually fail unless
your session has this specific repository connected. The installer prompt is written for that:
expect to paste referenced file contents (the Task prompts, the four `agents/*.md`/`prompts/*.md`
files it embeds into your Tasks) yourself as the common case, not a rare fallback.

## After install: recording your portfolio

A fresh installation's `当前持仓`/`观察名单` are intentionally empty — the installer never invents
a holding. Right after the final verification checklist, the installer prompt hands off to
[`setup/onboarding-prompt.md`](../../setup/onboarding-prompt.md) (Issue #273), which offers two
routes:

- **Already have a portfolio?** Describe your holdings in plain language, or (if your ChatGPT
  session supports it) upload a screenshot or a CSV/Excel export. Every extracted field goes
  through a preview you confirm before anything is written — nothing is written silently, and any
  field it can't determine stays blank rather than guessed.
- **Starting from zero?** A short, progressive interview (horizon, capital, risk tolerance,
  markets/exclusions, and similar) produces a confirmed "investment starting profile," then a
  small, explainable research candidate pool — never an auto-generated buy list. Candidates only
  reach `观察名单` after you've selected them for further research and explicitly confirmed.

This step is entirely optional and can be deferred indefinitely — a legitimate zero-holdings
installation is a supported state, and the Dashboard's empty-state card reflects that rather than
treating it as an error. Paste `setup/onboarding-prompt.md` into a new conversation any time you
want to (re)run it, e.g. to add more holdings later.

## The one manual step

Google requires the Google Apps Script Web App's authorization and deployment to be done by the
account owner, in a browser — no automation, including this installer, can do it for you. The
installer walks you through it (script.google.com → paste the five files → configure your
spreadsheet id → Deploy → New deployment → Web app), and it will look like this:

- You'll see **"Google hasn't verified this app"** — this is expected for a script you wrote
  yourself for personal use, not a sign anything went wrong. Choose **Advanced** →
  **Go to (your project name) (unsafe)** to continue.
- Deploy with **Execute as: Me** and access restricted to yourself (`MYSELF` in
  `appsscript.json`'s default) — this is a single-user personal Dashboard, not a shared app.
- The URL you copy back ends in `/exec`. That's the one piece of information ChatGPT needs from
  you to finish.

## Normal usage after install

Day to day, you only maintain:

- **`当前持仓`** (Current Holdings) — add/update rows as your positions change. `平均成本` and
  `参考买入价/区间` are independent fields; leave either blank if you don't have a value, never
  guess one to fill the cell.
- **`交易记录`** (Transactions) — optional, background context only; it never overrides
  `当前持仓`.
- **`观察名单`** (Watchlist) — candidates you're researching, never counted as holdings anywhere.

You do **not** need to edit the four `报告*` tabs (`报告摘要`/`报告持仓`/`报告风险`/`报告待办`) —
the Daily/Weekly Scheduled Tasks generate them, and the Dashboard reads them. You also don't need
to touch the `_安装状态` tab — it's the installer's own internal bookkeeping (exact Task
name/schedule/timezone, the Dashboard URL, and so on), not a place for portfolio data.

If you want the Weekly report's capital-allocation judgment to run at all, you need to have supplied
a current cash/funding description at install time (recorded in your Weekly Task in place of the
`WEEKLY_CASH_CONTEXT_PLACEHOLDER`). If you declined, every Weekly run treats this as a genuinely
missing required input and skips the entire research flow for that run — not just the
capital-allocation section — writing only a gap explanation to `报告摘要`. See
[`setup/weekly-task-prompt.md`](../../setup/weekly-task-prompt.md) for the exact rule.

## Troubleshooting

**"Google hasn't verified this app" during deployment.** Expected — see "The one manual step"
above. This is not a deployment failure.

**Dashboard opens but shows "no report yet."** Normal immediately after install — no Daily/Weekly
Task has run yet. It clears itself after the first scheduled run. If it persists past your first
expected run time, check the Task's own run history for errors before assuming the Dashboard is
broken.

**A Scheduled Task ran but the Sheet wasn't updated.** Check the Task's run notification/history
first — the write path (`report_write_protocol`, described in
[`setup/schema/sheet-schema.json`](../../setup/schema/sheet-schema.json)) is designed to fail
safely: if verification of the staged write fails, `报告摘要` is left untouched and the run reports
itself as failed rather than silently publishing something incomplete. A "no update" outcome
usually means the run reported Blocked or failed — read that message rather than re-running blind.

**A Task run reports "Blocked."** This is not a bug — it means a required tab/column couldn't be
read, the Sheet/timezone binding placeholder in the Task wasn't actually replaced, or (for Weekly)
the required cash/funding input was never supplied. The Blocked message names the specific reason;
resolve that, don't just retry.

**Suspected duplicate installation (two Sheets, or two Daily/Weekly Tasks).** The installer detects
an existing installation via the `_安装状态` tab and matches Scheduled Tasks by the *exact* name
recorded there — never by guessing from a similar-looking name. If you already have an
installation, always start a ChatGPT conversation by pointing it at your existing Sheet rather than
letting it assume a fresh install; if it can't find the Task name `_安装状态` has recorded, it will
ask you to confirm before creating anything new rather than silently duplicating.

**Sheet permissions error.** Your Sheet must be readable/writable by the Google account
ChatGPT/your Scheduled Tasks run as, and by the account you used to deploy the GAS Web App. A
permission error during install or a Task run is treated as **Blocked**, never as "must be a new
install" — reinstalling won't fix a permissions problem; check sharing settings on the Sheet
itself.

**You redeployed the GAS Web App and got a new URL.** Paste the new `/exec` URL back into a
ChatGPT conversation and ask it to update your two Scheduled Tasks and the `_安装状态.dashboard_url`
field with it — same flow as the original install's URL handback step.

**Schema version mismatch / you see fields this guide doesn't mention.** `_安装状态.schema_version`
records which version of [`setup/schema/sheet-schema.json`](../../setup/schema/sheet-schema.json)
your installation was built against. A future schema version may add fields additively (existing
data is never deleted or reordered without your explicit approval); if you're on an older version,
ask the installer prompt to upgrade your Sheet — it detects and applies only the additive changes.

## What this deployment layer deliberately does not do

Same boundaries as the rest of IOS, restated for this layer specifically:

- No autonomous trading — every install script and every Task only ever writes structured research
  output, never places an order.
- No fabricated portfolio facts — a blank cell means unknown, never zero or "assume unchanged."
- Report tab names and the timezone are fixed to what the installer records at install time;
  `schema_version: 1` does not support renaming the report tabs, since nothing that reads them
  (the Task templates, the GAS Dashboard) honors a custom name yet.

## See also

- [`docs/v2.1-architecture.md`](../v2.1-architecture.md) — full design: the Sheet schema, the
  `report_write_protocol`, the installation-state model, product boundaries.
- [`setup/README.md`](../../setup/README.md) — what's in `setup/` and how the pieces fit together.
- [`setup/onboarding-prompt.md`](../../setup/onboarding-prompt.md) — the post-install onboarding
  conversation described above.
- [`integrations/google-apps-script/ios-dashboard/README.md`](../../integrations/google-apps-script/ios-dashboard/README.md)
  — the Dashboard package's own deployment steps and its Node test suite.
