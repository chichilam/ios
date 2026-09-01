/**
 * IOS Personal Dashboard -- Google Apps Script Web App (Issue #242 Phase B).
 *
 * Presentation only: reads structured rows out of the user's own Sheet
 * (schema: ../../../setup/schema/sheet-schema.json) and renders them. No
 * research logic, no investment judgment, no writes -- the Daily/Weekly
 * Scheduled Task (Phase C) is the only writer.
 *
 * File is split into two sections:
 *   1. Pure logic (no SpreadsheetApp/HtmlService calls) -- unit-tested from
 *      plain Node via test/dashboard-logic.test.js against demo/demo-sheet.json.
 *   2. Apps Script glue (doGet, Sheet reads, HTML rendering) -- cannot run
 *      outside Apps Script itself; kept as thin as possible so most of the
 *      real logic lives in section 1 where it's actually testable.
 */

// ---------------------------------------------------------------------------
// Section 1: pure logic (testable outside Apps Script)
// ---------------------------------------------------------------------------

/**
 * The seven user-facing tab names the Dashboard reads, in the order
 * setup/schema/sheet-schema.json defines them. Deliberately excludes the
 * schema's installer-owned internal tab (_安装状态) -- the Dashboard has no
 * reason to read or render installer/Task bookkeeping state.
 */
var SHEET_TABS_ = [
  '当前持仓', '交易记录', '观察名单', '报告摘要', '报告持仓', '报告风险', '报告待办'
];

var REPORT_TABS_ = ['报告摘要', '报告持仓', '报告风险', '报告待办'];

/** 状态=持有 AND 持有数量 > 0 -- see sheet-schema.json's 当前持仓 rules. */
function isCurrentHolding_(row) {
  return row['状态'] === '持有' && Number(row['持有数量']) > 0;
}

function getCurrentHoldings_(currentHoldingsRows) {
  return (currentHoldingsRows || []).filter(isCurrentHolding_);
}

/**
 * Picks the most recent 报告摘要 row for a report type, or an explicit
 * 报告ID if one is requested (e.g. from the history selector). Returns
 * null if none exists -- a legitimate "no report generated yet" state,
 * not an error.
 */
function selectReportSummary_(summaryRows, reportType, explicitReportId) {
  var rows = summaryRows || [];
  if (explicitReportId) {
    for (var i = 0; i < rows.length; i++) {
      if (rows[i]['报告ID'] === explicitReportId) return rows[i];
    }
    return null;
  }
  var candidates = rows.filter(function (row) { return row['报告类型'] === reportType; });
  if (candidates.length === 0) return null;
  // 报告日期 is YYYY-MM-DD -- lexicographic order is chronological order.
  candidates.sort(function (a, b) { return String(b['报告日期']).localeCompare(String(a['报告日期'])); });
  return candidates[0];
}

/**
 * The report_write_protocol read contract (setup/schema/sheet-schema.json):
 * a detail row is live only if its 生成ID matches the 生成ID the report's
 * own 报告摘要 row currently references. Everything else -- an orphaned
 * generation from a superseded or failed write -- is filtered out here,
 * unconditionally, regardless of what a stray row might otherwise look like.
 */
function filterLiveDetailRows_(detailRows, reportId, generationId) {
  return (detailRows || []).filter(function (row) {
    return row['报告ID'] === reportId && row['生成ID'] === generationId;
  });
}

/**
 * Builds the full view model for one Daily/Weekly view. Never fabricates
 * data: a report that doesn't exist yet renders as an explicit empty
 * state; a report whose detail tabs have zero live rows for this
 * generation renders as a valid empty section (see blocked_vs_empty in
 * setup/schema/sheet-schema.json) -- never as an error.
 */
function buildReportViewModel_(tabs, reportType, explicitReportId) {
  var summary = selectReportSummary_(tabs['报告摘要'], reportType, explicitReportId);
  if (!summary) {
    return { found: false, reportType: reportType };
  }

  var reportId = summary['报告ID'];
  var generationId = summary['生成ID'];
  var liveAssets = filterLiveDetailRows_(tabs['报告持仓'], reportId, generationId);
  var holdings = liveAssets.filter(function (row) { return row['资产类型'] === 'holding'; });
  var watchlistCandidates = liveAssets.filter(function (row) { return row['资产类型'] === 'watchlist'; });
  var risks = filterLiveDetailRows_(tabs['报告风险'], reportId, generationId);
  var todos = filterLiveDetailRows_(tabs['报告待办'], reportId, generationId);

  return {
    found: true,
    reportType: reportType,
    summary: summary,
    holdings: sortByOrder_(holdings),
    watchlistCandidates: sortByOrder_(watchlistCandidates),
    risks: sortByOrder_(risks),
    todos: sortByOrder_(todos)
  };
}

function sortByOrder_(rows) {
  return (rows || []).slice().sort(function (a, b) {
    var orderA = a['排序'] === '' || a['排序'] == null ? Number.MAX_SAFE_INTEGER : Number(a['排序']);
    var orderB = b['排序'] === '' || b['排序'] == null ? Number.MAX_SAFE_INTEGER : Number(b['排序']);
    return orderA - orderB;
  });
}

/** History selector data: every report of a type, most recent first. Never includes orphaned generations -- one row per 报告ID (报告摘要 itself never has more than one live row per 报告ID). */
function buildHistoryList_(summaryRows, reportType) {
  return (summaryRows || [])
    .filter(function (row) { return row['报告类型'] === reportType; })
    .slice()
    .sort(function (a, b) { return String(b['报告日期']).localeCompare(String(a['报告日期'])); })
    .map(function (row) {
      return { reportId: row['报告ID'], reportDate: row['报告日期'], headline: row['一句话结论'] };
    });
}

/**
 * Derives 'daily'/'weekly' from a 报告ID's own stable prefix (报告ID is
 * always `daily-YYYY-MM-DD` or `weekly-YYYY-MM-DD` -- see
 * report_write_protocol in setup/schema/sheet-schema.json). Returns null
 * for anything else, so a caller can distinguish "this isn't a real
 * report id at all" from "a real id whose report doesn't exist" (the
 * latter is buildReportViewModel_'s found:false, not this function's job).
 */
function resolveReportTypeFromReportId_(reportId) {
  if (typeof reportId !== 'string') return null;
  if (reportId.indexOf('daily-') === 0) return 'daily';
  if (reportId.indexOf('weekly-') === 0) return 'weekly';
  return null;
}

/**
 * Everything the Dashboard's client-side view needs for its FIRST paint,
 * in one read: both Daily and Weekly's latest report already resolved (so
 * switching between them in-page is instant -- no second server round
 * trip for the common toggle action, only for picking a specific
 * historical entry via getReport_ below), both history lists, and the
 * live current-holdings allocation view (schema-independent of any report
 * generation). Never invents a Blocked status of its own -- a genuine
 * read failure is caught by this function's caller (buildBootstrapSafe_ in
 * the Apps Script glue section), not here; this function assumes tabs was
 * already read successfully.
 */
function buildDashboardBootstrap_(tabs) {
  return {
    error: null,
    daily: buildReportViewModel_(tabs, 'daily', null),
    weekly: buildReportViewModel_(tabs, 'weekly', null),
    dailyHistory: buildHistoryList_(tabs['报告摘要'], 'daily'),
    weeklyHistory: buildHistoryList_(tabs['报告摘要'], 'weekly'),
    allocation: buildAllocationView_(tabs['当前持仓'])
  };
}

/**
 * Resolves one specific historical report by its exact 报告ID (the
 * in-page history selector's own data fetch -- distinct from the two
 * "latest" viewModels buildDashboardBootstrap_ already cached). An id
 * whose prefix isn't a real report type is a not-found result, not an
 * error -- e.g. a stale/tampered client-side link is not the same failure
 * class as a genuine Sheet read problem.
 */
function getReport_(tabs, reportId) {
  var reportType = resolveReportTypeFromReportId_(reportId);
  if (!reportType) {
    return { found: false, reportType: null };
  }
  return buildReportViewModel_(tabs, reportType, reportId);
}

/**
 * Required columns per tab, mirroring setup/schema/sheet-schema.json's own
 * `required: true` fields exactly (cross-checked against that file by
 * test/dashboard-logic.test.js so the two can't silently drift apart). A
 * tab missing one of these is Blocked -- a genuine schema problem, never
 * treated as a valid empty result (see blocked_vs_empty).
 */
var REQUIRED_HEADERS_ = {
  '当前持仓': ['代码', '名称', '市场', '持有数量', '币种', '状态'],
  '交易记录': ['日期', '代码', '操作', '数量', '成交价格', '币种'],
  '观察名单': ['代码', '名称', '市场'],
  '报告摘要': ['报告ID', '生成ID', '报告类型', '报告日期', '一句话结论', '核心状态', '生成时间'],
  '报告持仓': ['报告ID', '生成ID', '报告类型', '报告日期', '资产类型', '代码', '名称'],
  '报告风险': ['报告ID', '生成ID', '报告类型', '报告日期', '风险'],
  '报告待办': ['报告ID', '生成ID', '报告类型', '报告日期', '待办']
};

/**
 * Returns the required column names absent from a tab's own header row.
 * Empty array means the header row satisfies the schema -- including the
 * case of zero data rows below it, which is a valid empty tab, not
 * Blocked. A tab with no header row at all (headers === []) reports every
 * required column as missing, which is correct: there is nothing to
 * validate data against.
 */
function findMissingRequiredHeaders_(headers, tabName) {
  var required = REQUIRED_HEADERS_[tabName] || [];
  var present = {};
  (headers || []).forEach(function (header) { present[header] = true; });
  return required.filter(function (name) { return !present[name]; });
}

var SPREADSHEET_ID_PLACEHOLDER_ = 'PASTE_YOUR_SPREADSHEET_ID_HERE';

/** True for a blank id or the still-unedited placeholder -- either means setup was never completed. */
function isUnconfiguredSpreadsheetId_(spreadsheetId) {
  return !spreadsheetId || spreadsheetId === SPREADSHEET_ID_PLACEHOLDER_;
}

/**
 * A capital-allocation view built only from what this schema actually
 * contains (quantity, average cost, and the user's own reference buy
 * price/range, where known) -- it never computes a percentage-of-portfolio
 * weight, since that needs a live market value this schema does not carry.
 * Inventing one would violate the "never invent a missing fact" boundary
 * (docs/v2.1-architecture.md). referenceRange is read directly from
 * 当前持仓's own 参考买入价/区间 column -- never derived from avgCost, and
 * independently blank/null when the user hasn't set one, regardless of
 * whether avgCost itself is known.
 */
function buildAllocationView_(currentHoldingsRows) {
  return getCurrentHoldings_(currentHoldingsRows).map(function (row) {
    return {
      code: row['代码'],
      name: row['名称'],
      quantity: Number(row['持有数量']),
      avgCost: row['平均成本'] === '' || row['平均成本'] == null ? null : Number(row['平均成本']),
      referenceRange: row['参考买入价/区间'] === '' || row['参考买入价/区间'] == null ? null : row['参考买入价/区间'],
      currency: row['币种']
    };
  });
}

// -- Account/capital facts and fund-sleeve reconciliation (Issue #259,
// schema_version 2+). Both tabs are optional and entirely absent on a
// schema_version 1 installation -- these functions are pure normalization/
// reconciliation over whatever rows they're given and never assume the
// tabs exist. Not yet wired into readAllTabs_/SHEET_TABS_/doGet: the
// Dashboard's existing fail-closed required-tab gate must stay unaffected
// by these being optional, and no Dashboard UI renders them yet -- these
// exist now, tested now, as a small, correct wiring change for whenever
// that UI lands (Issue #259's own Dashboard scope frames it as "if
// account/capital facts are shown", not a requirement of this change).
// The Weekly Task itself (a ChatGPT Scheduled Task, not this Web App)
// reads 账户状态/投资信托明细 directly per setup/weekly-task-prompt.md;
// these functions mirror that same read/reconcile logic in pure,
// Node-testable form rather than duplicating it only in prose.

/**
 * Normalizes 账户状态 rows (Issue #259). Blank-is-null throughout -- a
 * writer/reader must never default 可用现金 or NISA capacity to zero.
 */
function getAccountFacts_(accountStatusRows) {
  return (accountStatusRows || []).map(function (row) {
    return {
      account: row['账户'],
      currency: row['币种'],
      availableCash: row['可用现金'] === '' || row['可用现金'] == null ? null : Number(row['可用现金']),
      nisaGrowthRemaining: row['NISA成长投资额度剩余'] === '' || row['NISA成长投资额度剩余'] == null ? null : Number(row['NISA成长投资额度剩余']),
      nisaTsumitateRemaining: row['NISA积立额度剩余'] === '' || row['NISA积立额度剩余'] == null ? null : Number(row['NISA积立额度剩余']),
      plannedAdditionalCapital: row['本年计划追加资金'] === '' || row['本年计划追加资金'] == null ? null : Number(row['本年计划追加资金']),
      recurringTsumitate: row['定期定额扣款'] === '' || row['定期定额扣款'] == null ? null : row['定期定额扣款'],
      asOf: row['数据时间'],
      source: row['来源'] === '' || row['来源'] == null ? null : row['来源'],
      note: row['备注'] === '' || row['备注'] == null ? null : row['备注']
    };
  });
}

/**
 * True only when at least one 账户状态 row has a non-blank 可用现金 -- the
 * exact fact that satisfies agents/weekly-agent.md's required "当前现金或
 * 资金状态" input, per sheet-schema.json's own 账户状态 rules. A tab that's
 * absent entirely, or present with every row's 可用现金 blank, both return
 * false -- the caller (a Weekly Task, per setup/weekly-task-prompt.md)
 * distinguishes "absent" (fall back to legacy weekly_cash_context) from
 * "present but empty" (equivalent to the legacy mechanism's "未提供") by
 * checking tab presence itself, not this function alone.
 */
function hasSuppliedCashFacts_(accountStatusRows) {
  return getAccountFacts_(accountStatusRows).filter(function (facts) {
    return facts.availableCash !== null;
  }).length > 0;
}

/** Normalizes 投资信托明细 rows (Issue #259). 代码/units/cost basis stay null rather than fabricated when the brokerage view didn't supply them. */
function getFundSleeveDetail_(fundSleeveRows) {
  return (fundSleeveRows || []).map(function (row) {
    return {
      fundName: row['基金名称'],
      code: row['代码'] === '' || row['代码'] == null ? null : row['代码'],
      account: row['账户'] === '' || row['账户'] == null ? null : row['账户'],
      currency: row['币种'],
      nisaBucket: row['NISA分类'] === '' || row['NISA分类'] == null ? null : row['NISA分类'],
      marketValue: row['当前市值'] === '' || row['当前市值'] == null ? null : Number(row['当前市值']),
      unrealizedPnl: row['未实现盈亏'] === '' || row['未实现盈亏'] == null ? null : Number(row['未实现盈亏']),
      asOf: row['数据时间'],
      note: row['备注'] === '' || row['备注'] == null ? null : row['备注']
    };
  });
}

/**
 * Reconciles a 当前持仓 FUND-SLEEVE aggregate row against its 投资信托明细
 * detail rows (Issue #259), so a caller has exactly one figure for the
 * sleeve's current total value and never adds the aggregate row and the
 * detail sum together as two separate portfolio components (sheet-
 * schema.json's own double-counting rule for both tabs). When the
 * FUND-SLEEVE row sets its own 账户, only detail rows for that same 账户
 * are summed; otherwise every detail row counts as one whole-portfolio
 * sleeve. Never fabricates a partial total: any matching detail row with a
 * blank 当前市值 makes the whole reconciled value null rather than silently
 * summing only the rows that happen to have one.
 */
function reconcileFundSleeveValue_(currentHoldingsRows, fundSleeveRows) {
  var fundSleeveHoldingRows = (currentHoldingsRows || []).filter(function (row) { return row['代码'] === 'FUND-SLEEVE'; });
  if (fundSleeveHoldingRows.length === 0) {
    return { hasFundSleeveRow: false, reconciledValue: null, constituentCount: 0 };
  }
  var account = fundSleeveHoldingRows[0]['账户'];
  var constituents = getFundSleeveDetail_(fundSleeveRows).filter(function (fund) {
    return !account || fund.account === account;
  });
  var hasBlankValue = constituents.filter(function (fund) { return fund.marketValue === null; }).length > 0;
  var reconciledValue = constituents.length === 0 || hasBlankValue
    ? null
    : constituents.reduce(function (total, fund) { return total + fund.marketValue; }, 0);
  return {
    hasFundSleeveRow: true,
    reconciledValue: reconciledValue,
    constituentCount: constituents.length
  };
}

// ---------------------------------------------------------------------------
// Section 2: Apps Script glue (requires the Apps Script runtime)
// ---------------------------------------------------------------------------

var SCRIPT_PROPERTY_SPREADSHEET_ID_ = 'IOS_SPREADSHEET_ID';

/**
 * EDIT THIS, then run configureSpreadsheetId() once from the Apps Script
 * editor's function dropdown (select it, click Run -- the editor cannot
 * pass arguments to a function you run manually, which is why this is a
 * constant to edit rather than a parameter). Paste your own Sheet's id,
 * found in its URL: https://docs.google.com/spreadsheets/d/<THIS PART>/edit.
 * Never commit a real id back to this repository -- this placeholder is
 * the only value that belongs here in source control.
 */
var SPREADSHEET_ID_TO_CONFIGURE_ = SPREADSHEET_ID_PLACEHOLDER_;

/**
 * One-time setup entry point -- see SPREADSHEET_ID_TO_CONFIGURE_ above.
 * Run this (not setSpreadsheetId_ directly) from the editor.
 */
function configureSpreadsheetId() {
  setSpreadsheetId_(SPREADSHEET_ID_TO_CONFIGURE_);
  Logger.log('Configured. Reload the Web App URL to use this spreadsheet.');
}

function setSpreadsheetId_(spreadsheetId) {
  if (isUnconfiguredSpreadsheetId_(spreadsheetId)) {
    throw new Error(
      'Edit SPREADSHEET_ID_TO_CONFIGURE_ at the top of Code.gs to your own Sheet id, then run configureSpreadsheetId() again -- see README.md.'
    );
  }
  PropertiesService.getScriptProperties().setProperty(SCRIPT_PROPERTY_SPREADSHEET_ID_, spreadsheetId);
}

function getConfiguredSpreadsheet_() {
  var id = PropertiesService.getScriptProperties().getProperty(SCRIPT_PROPERTY_SPREADSHEET_ID_);
  if (!id) {
    throw new Error(
      'No spreadsheet configured. Edit SPREADSHEET_ID_TO_CONFIGURE_ at the top of Code.gs and run configureSpreadsheetId() once from the Apps Script editor first -- see README.md.'
    );
  }
  return SpreadsheetApp.openById(id);
}

function readTab_(spreadsheet, tabName) {
  var sheet = spreadsheet.getSheetByName(tabName);
  if (!sheet) {
    // Missing tab is a genuine Blocked condition for whatever view needs
    // it -- surfaced to the caller, never silently treated as an empty
    // result (see blocked_vs_empty in setup/schema/sheet-schema.json).
    throw new Error('Sheet tab not found: ' + tabName + ' -- check the spreadsheet against setup/schema/sheet-schema.json.');
  }
  var values = sheet.getDataRange().getValues();
  var headers = values.length > 0 ? values[0] : [];
  var missingHeaders = findMissingRequiredHeaders_(headers, tabName);
  if (missingHeaders.length > 0) {
    // A required column that's absent or misspelled is schema corruption,
    // not an empty tab -- fail closed rather than silently rendering an
    // empty section (see blocked_vs_empty in setup/schema/sheet-schema.json).
    throw new Error(
      'Sheet tab "' + tabName + '" is missing required column(s): ' + missingHeaders.join(', ') +
      ' -- check its header row against setup/schema/sheet-schema.json.'
    );
  }
  if (values.length === 0) return [];
  return values.slice(1).map(function (row) {
    var record = {};
    headers.forEach(function (header, index) { record[header] = row[index]; });
    return record;
  });
}

function readAllTabs_(spreadsheet) {
  var tabs = {};
  SHEET_TABS_.forEach(function (tabName) { tabs[tabName] = readTab_(spreadsheet, tabName); });
  return tabs;
}

function include_(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Shared read-and-catch path for the two ways a bootstrap gets produced
 * (doGet's own inline first-paint embed, and a later client-side
 * getDashboardBootstrap() call for a manual refresh) -- one place decides
 * what a Blocked bootstrap looks like, so the two call sites can never
 * drift into representing "Sheet unreadable" differently. Never throws:
 * a read failure becomes an explicit {error: ...} result, matching this
 * Dashboard's fail-closed-but-visible convention (see blocked_vs_empty in
 * setup/schema/sheet-schema.json) rather than an uncaught exception that
 * would surface only as a bare error to whichever caller hit it.
 */
/**
 * Escapes a JSON string so it can be embedded verbatim inside an HTML
 * `<script>` block via a force-print template scriptlet (`<?!= ?>`).
 * `<?!= ?>` performs no contextual escaping at all -- it exists precisely
 * so a JSON payload's own quotes/braces reach the page unmangled -- but
 * that also means a Sheet-derived string containing a literal `</script>`
 * sequence would otherwise terminate the script element early and let
 * whatever HTML/script follows it in that cell execute, before any of
 * this file's textContent-only DOM construction ever runs. `<`/`>`/`&`
 * cover that (and any other tag-like sequence); U+2028/U+2029 are escaped
 * too since they are valid JSON string characters but illegal unescaped
 * line terminators inside a JS string literal, which would otherwise
 * produce a syntax error on some engines for an otherwise-valid payload.
 */
function escapeJsonForScriptContext_(jsonString) {
  var LINE_SEPARATOR = '\u2028';
  var PARAGRAPH_SEPARATOR = '\u2029';
  var pattern = new RegExp('[<>&' + LINE_SEPARATOR + PARAGRAPH_SEPARATOR + ']', 'g');
  return jsonString.replace(pattern, function (ch) {
    switch (ch) {
      case '<': return '\\u003C';
      case '>': return '\\u003E';
      case '&': return '\\u0026';
      case LINE_SEPARATOR: return '\\u2028';
      case PARAGRAPH_SEPARATOR: return '\\u2029';
      default: return ch;
    }
  });
}

function buildBootstrapSafe_() {
  try {
    var spreadsheet = getConfiguredSpreadsheet_();
    var tabs = readAllTabs_(spreadsheet);
    return buildDashboardBootstrap_(tabs);
  } catch (err) {
    return {
      error: String(err && err.message ? err.message : err),
      daily: { found: false, reportType: 'daily' },
      weekly: { found: false, reportType: 'weekly' },
      dailyHistory: [],
      weeklyHistory: [],
      allocation: []
    };
  }
}

/**
 * google.script.run entry point: re-reads the Sheet and returns a fresh
 * bootstrap (both latest Daily/Weekly viewModels, both history lists, the
 * live allocation view). The client calls this once via doGet's inline
 * embed (no round trip needed for first paint) and again only on an
 * explicit manual refresh -- Daily/Weekly toggling itself never calls
 * this, since both viewModels are already cached client-side after the
 * first load.
 */
function getDashboardBootstrap() {
  return buildBootstrapSafe_();
}

/**
 * google.script.run entry point: the in-page history selector's own data
 * fetch for one specific past report, by its exact 报告ID. Never throws
 * across the google.script.run boundary -- a read failure becomes
 * {error: ..., found: false} so the client can render it the same way it
 * renders any other Blocked state, rather than needing a second,
 * differently-shaped error-handling path just for this call.
 */
function getReport(reportId) {
  try {
    var spreadsheet = getConfiguredSpreadsheet_();
    var tabs = readAllTabs_(spreadsheet);
    var result = getReport_(tabs, reportId);
    result.error = null;
    return result;
  } catch (err) {
    return { error: String(err && err.message ? err.message : err), found: false, reportType: null };
  }
}

/**
 * Web App entry point. ?view=daily | weekly (default: daily) selects which
 * of the two already-fetched viewModels the FIRST paint shows -- this is
 * the page's own initial request (e.g. a Daily/Weekly Task notification
 * link), never a link generated inside the rendered page itself. All
 * in-page navigation after this (Daily/Weekly toggling, history
 * selection) happens client-side via google.script.run, deliberately never
 * through another relative ?view=/&report= link: Apps Script Web Apps
 * serve /exec through an internal userCodeAppPanel iframe, so a plain
 * <a href="?view=weekly"> clicked from inside the rendered page navigates
 * that iframe instead of the top-level document and produces a blank
 * panel -- the exact regression Issue #250 exists to fix.
 */
function doGet(e) {
  var params = (e && e.parameter) || {};
  var view = params.view === 'weekly' ? 'weekly' : 'daily';

  var template = HtmlService.createTemplateFromFile('Index');
  template.include = include_;
  template.bootstrapJson = escapeJsonForScriptContext_(JSON.stringify(buildBootstrapSafe_()));
  template.activeView = view;

  return template.evaluate()
    .setTitle('IOS Personal Dashboard')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// Exposes the pure-logic section to a plain Node test runner. Apps Script
// itself has no `module` global, so this is inert there.
if (typeof module !== 'undefined') {
  module.exports = {
    isCurrentHolding_: isCurrentHolding_,
    getCurrentHoldings_: getCurrentHoldings_,
    selectReportSummary_: selectReportSummary_,
    filterLiveDetailRows_: filterLiveDetailRows_,
    buildReportViewModel_: buildReportViewModel_,
    buildHistoryList_: buildHistoryList_,
    buildAllocationView_: buildAllocationView_,
    getAccountFacts_: getAccountFacts_,
    hasSuppliedCashFacts_: hasSuppliedCashFacts_,
    getFundSleeveDetail_: getFundSleeveDetail_,
    reconcileFundSleeveValue_: reconcileFundSleeveValue_,
    resolveReportTypeFromReportId_: resolveReportTypeFromReportId_,
    buildDashboardBootstrap_: buildDashboardBootstrap_,
    getReport_: getReport_,
    escapeJsonForScriptContext_: escapeJsonForScriptContext_,
    sortByOrder_: sortByOrder_,
    findMissingRequiredHeaders_: findMissingRequiredHeaders_,
    isUnconfiguredSpreadsheetId_: isUnconfiguredSpreadsheetId_,
    SHEET_TABS_: SHEET_TABS_,
    REPORT_TABS_: REPORT_TABS_,
    REQUIRED_HEADERS_: REQUIRED_HEADERS_,
    SPREADSHEET_ID_PLACEHOLDER_: SPREADSHEET_ID_PLACEHOLDER_
  };
}
