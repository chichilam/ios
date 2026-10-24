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
 * reason to read or render installer/Task bookkeeping state. The one
 * exception is the three-layer reader gate (Issue #323, #316 P4), which reads
 * exactly two _安装状态 cells and two 周计划暂停记录 columns through
 * readReaderInputs_ below, never through this list.
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
  candidates.sort(function (a, b) {
    return reportDateKey_(b).localeCompare(reportDateKey_(a));
  });
  return candidates[0];
}

/**
 * Canonical calendar key for report ordering and history labels.
 *
 * Apps Script reads a Google Sheets date cell as a native Date. String(Date)
 * starts with a weekday name, so lexical sorting it can place a Sunday report
 * ahead of a later Saturday report; JSON serialization also leaks a UTC
 * timestamp into the client. A valid report ID is the stable report contract,
 * so use its YYYY-MM-DD suffix first. The raw cell is only a legacy fallback.
 */
function reportDateKey_(row) {
  var reportId = String(row && row['报告ID'] != null ? row['报告ID'] : '');
  var idDate = /^(?:daily|weekly)-(\d{4}-\d{2}-\d{2})$/.exec(reportId);
  if (idDate) return idDate[1];

  var rawDate = row && row['报告日期'];
  if (typeof rawDate === 'string') return rawDate;
  if (Object.prototype.toString.call(rawDate) === '[object Date]' && !isNaN(rawDate.getTime())) {
    return rawDate.toISOString().slice(0, 10);
  }
  return rawDate == null ? '' : String(rawDate);
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
function buildReportViewModel_(tabs, reportType, explicitReportId, reader) {
  var summary = selectReportSummary_(tabs['报告摘要'], reportType, explicitReportId);
  if (!summary) {
    return { found: false, reportType: reportType };
  }

  var reportId = summary['报告ID'];
  var generationId = summary['生成ID'];
  // Issue #316 P4: whether this generation, and each of its rows, may be
  // shown as a current action (see applyReaderGate_). Without explicit
  // reader inputs they come from `tabs` itself.
  var gated = applyReaderGate_(summary, filterLiveDetailRows_(tabs['报告持仓'], reportId, generationId),
    reader || readerFromTabs_(tabs));
  var liveAssets = gated.rows;
  var holdings = liveAssets.filter(function (row) { return row['资产类型'] === 'holding'; });
  var watchlistCandidates = liveAssets.filter(function (row) { return row['资产类型'] === 'watchlist'; });
  var risks = filterLiveDetailRows_(tabs['报告风险'], reportId, generationId);
  var todos = filterLiveDetailRows_(tabs['报告待办'], reportId, generationId);
  // Issue #348: this generation's own batch line and snapshot rows only.
  var externalFairValue = buildExternalFairValueView_(summary,
    reader && reader.externalFairValue ? reader.externalFairValue : externalFairValueFromTabs_(tabs));

  return {
    found: true,
    reportType: reportType,
    summary: summary,
    readerGate: gated.gate,
    holdings: sortByOrder_(holdings),
    watchlistCandidates: sortByOrder_(watchlistCandidates),
    risks: sortByOrder_(risks),
    todos: sortByOrder_(todos),
    externalFairValue: externalFairValue
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
    .sort(function (a, b) {
      return reportDateKey_(b).localeCompare(reportDateKey_(a));
    })
    .map(function (row) {
      return {
        reportId: row['报告ID'],
        reportDate: reportDateKey_(row),
        headline: row['一句话结论']
      };
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
function buildDashboardBootstrap_(tabs, reader) {
  var inputs = reader || readerFromTabs_(tabs);
  return {
    error: null,
    buildMarker: DASHBOARD_BUILD_MARKER_,
    daily: buildReportViewModel_(tabs, 'daily', null, inputs),
    weekly: buildReportViewModel_(tabs, 'weekly', null, inputs),
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
function getReport_(tabs, reportId, reader) {
  var reportType = resolveReportTypeFromReportId_(reportId);
  if (!reportType) {
    return { found: false, reportType: null };
  }
  return buildReportViewModel_(tabs, reportType, reportId, reader);
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

// -- Three-layer reader gate (Issue #316 P4, #323). The contract
// (docs/purchase-plan-three-layer-contract.md, "Publishing across a mode
// change" and "Mid-week events") makes the Dashboard decide, by identity
// and never by time, whether a published row may be shown as a current
// action: its generation's 模式纪元 must equal _安装状态's epoch now, and --
// for a three_layer/three_layer_hold generation -- every 暂停记录ID that now
// exists for the row's 代码 in either carrier must be in the row's own
// 已核验暂停记录ID. For that the Dashboard reads exactly two cells of
// _安装状态 (purchase_plan_mode, purchase_plan_mode_epoch), exactly two
// columns of 周计划暂停记录 (暂停记录ID, 代码) and the 报告持仓 payload column
// 暂停事件载荷 -- no plan tab, no investment judgment: the gate is a set-
// containment check on ids. Every failure fails closed (not current /
// not orderable); nothing here ever turns a row into 适合买入.

/** Read back by the installer before it may write three_layer (contract "Enablement"); see doGet's ?view=build. */
var DASHBOARD_BUILD_MARKER_ = 'ios-dashboard-p4-three-layer-reader-1';

var PURCHASE_PLAN_MODES_ = ['legacy', 'three_layer', 'three_layer_hold'];
var THREE_LAYER_MODES_ = ['three_layer', 'three_layer_hold'];
var INSTALL_STATE_TAB_ = '_安装状态';
var SUSPENSION_RECORD_TAB_ = '周计划暂停记录';
var PAYLOAD_COLUMN_ = '暂停事件载荷';
var SEEN_SET_COLUMN_ = '已核验暂停记录ID';

var READER_TEXT_ = {
  epochChanged: '该报告生成于购买计划模式变更前，非当前行动',
  modeUnreadable: '无法核验当前购买计划模式，非当前行动',
  generationInvalid: '该报告的购买计划模式或纪元无法识别，非当前行动',
  unseenEvent: '有未纳入本报告的暂停事件，非当前行动',
  scanUnverifiable: '暂停状态无法核验',
  holdMode: '三层购买计划暂停中，非当前行动'
};

/**
 * The ?view=build attestation (Issue #323 review B4). The installer opens it
 * with a fresh nonce of its own, so a stale paste, an old deployment (which
 * prints only the first line) or a deployment bound to another Sheet cannot
 * match: line 2 is the Sheet this deployment is configured for, line 3 the
 * mode and epoch it reads live, line 4 the nonce echoed only when well-formed.
 */
var BUILD_NONCE_PATTERN_ = /^[A-Za-z0-9]{16,64}$/;

function buildAttestationText_(nonce, configuredSheetId, install) {
  var mode = install && install.readable ? install.mode + '@' + install.epoch : '无法读取';
  return [
    'IOS_DASHBOARD_BUILD=' + DASHBOARD_BUILD_MARKER_,
    'IOS_DASHBOARD_SHEET=' + (configuredSheetId ? String(configuredSheetId) : '未配置'),
    'IOS_DASHBOARD_MODE=' + mode,
    'IOS_DASHBOARD_NONCE=' + (typeof nonce === 'string' && BUILD_NONCE_PATTERN_.test(nonce) ? nonce : '无效')
  ].join('\n');
}

function isBlankCell_(value) {
  return value === '' || value == null;
}

/** A positive integer, or null -- a boolean, a fraction, 0, a negative or "2a" is never an epoch. */
function parsePositiveInt_(value) {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value > 0 ? value : null;
  }
  if (typeof value === 'string' && /^\s*[1-9]\d*\s*$/.test(value)) {
    return Number(value.trim());
  }
  return null;
}

/**
 * The installation's mode and epoch now. `read` is {status: 'ok',
 * hasModeColumns, rows: [{purchase_plan_mode, purchase_plan_mode_epoch}]},
 * {status: 'missing'} or {status: 'error'}. A tab that is missing or cannot
 * be read, a row count other than one, or a malformed value is unreadable --
 * then no generation is current-executable. A readable tab that has neither
 * column is a pre-schema_version-9 installation, which is legacy at epoch 1
 * (the epoch every installation starts at, P1); one column without the
 * other is unreadable.
 */
function resolveInstallMode_(read) {
  if (!read || read.status !== 'ok') return { readable: false };
  var rows = read.rows || [];
  if (rows.length !== 1) return { readable: false };
  if (read.hasModeColumns === false) return { readable: true, mode: 'legacy', epoch: 1 };
  if (read.hasModeColumns !== true) return { readable: false };
  var mode = rows[0]['purchase_plan_mode'];
  var epoch = parsePositiveInt_(rows[0]['purchase_plan_mode_epoch']);
  if (PURCHASE_PLAN_MODES_.indexOf(mode) === -1 || epoch === null) return { readable: false };
  return { readable: true, mode: mode, epoch: epoch };
}

/**
 * (mode, epoch) a generation was written in, from its own 报告摘要 row, or
 * null when it cannot be told. A row written before the P1 guard (both
 * blank) is legacy at epoch 1; a three-layer generation always carries its
 * epoch, so a blank one there is unidentifiable.
 */
function generationMode_(summary) {
  var rawMode = summary ? summary['购买计划模式'] : '';
  var rawEpoch = summary ? summary['模式纪元'] : '';
  var mode = isBlankCell_(rawMode) ? 'legacy' : rawMode;
  if (PURCHASE_PLAN_MODES_.indexOf(mode) === -1) return null;
  if (isBlankCell_(rawEpoch)) {
    return mode === 'legacy' ? { mode: mode, epoch: 1 } : null;
  }
  var epoch = parsePositiveInt_(rawEpoch);
  return epoch === null ? null : { mode: mode, epoch: epoch };
}

/** One 暂停事件载荷 cell: [] when blank, null when it is not a JSON array of entries that each name 暂停记录ID and 代码. */
function parsePayloadCell_(cell) {
  if (isBlankCell_(cell)) return [];
  if (typeof cell !== 'string') return null;
  var value;
  try {
    value = JSON.parse(cell);
  } catch (err) {
    return null;
  }
  if (!Array.isArray(value)) return null;
  for (var i = 0; i < value.length; i++) {
    var entry = value[i];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) ||
        typeof entry['暂停记录ID'] !== 'string' || entry['暂停记录ID'].trim() === '' ||
        typeof entry['代码'] !== 'string' || entry['代码'].trim() === '') {
      return null;
    }
  }
  return value;
}

/** 已核验暂停记录ID: the canonical JSON array of distinct ids in sorted order, or null (blank or anything else). */
function parseSeenSet_(cell) {
  if (isBlankCell_(cell) || typeof cell !== 'string') return null;
  var value;
  try {
    value = JSON.parse(cell);
  } catch (err) {
    return null;
  }
  if (!Array.isArray(value)) return null;
  for (var i = 0; i < value.length; i++) {
    if (typeof value[i] !== 'string' || value[i] === '') return null;
    if (i > 0 && !(value[i - 1] < value[i])) return null;
  }
  return value;
}

/**
 * The largest row counts any published generation recorded in
 * 报告摘要.暂停载体行数 -- the scan watermark. A malformed watermark cannot be
 * honored, so it makes the scan unverifiable ({ok: false}) rather than
 * being skipped.
 */
function scanWatermark_(summaryRows) {
  var marks = { '报告持仓': 0, '周计划暂停记录': 0 };
  var rows = summaryRows || [];
  for (var i = 0; i < rows.length; i++) {
    var raw = rows[i]['暂停载体行数'];
    if (isBlankCell_(raw)) continue;
    var value;
    try {
      value = typeof raw === 'string' ? JSON.parse(raw) : null;
    } catch (err) {
      return { ok: false };
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false };
    var keys = Object.keys(marks);
    for (var k = 0; k < keys.length; k++) {
      if (!Object.prototype.hasOwnProperty.call(value, keys[k])) continue;
      var count = value[keys[k]];
      if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) return { ok: false };
      marks[keys[k]] = Math.max(marks[keys[k]], count);
    }
  }
  return { ok: true, marks: marks };
}

/**
 * The safe scan of both carriers (contract "Safe scan"): the 报告持仓
 * payload column first, then the record tab's two columns, each complete
 * and at or above the watermark; one retry of both reads, never merging
 * two attempts. readPayload() returns {ok: true, cells: [...]} or {ok:
 * false}; readRecords() returns {ok: true, rows: [{id, code}]} or {ok:
 * false}. Result: {verifiable: true, idsByCode} or {verifiable: false}.
 * Never an empty set on failure.
 */
function runSafeScan_(readPayload, readRecords, watermark) {
  if (!watermark || !watermark.ok) return { verifiable: false };
  for (var attempt = 0; attempt < 2; attempt++) {
    var payload = readPayload();
    var records = readRecords();
    if (!payload || !payload.ok || !records || !records.ok) continue;
    if (payload.cells.length < watermark.marks['报告持仓'] ||
        records.rows.length < watermark.marks['周计划暂停记录']) continue;
    var idsByCode = {};
    var ok = true;
    var add = function (code, id) {
      if (!Object.prototype.hasOwnProperty.call(idsByCode, code)) idsByCode[code] = {};
      idsByCode[code][id] = true;
    };
    for (var i = 0; i < payload.cells.length && ok; i++) {
      var entries = parsePayloadCell_(payload.cells[i]);
      if (entries === null) { ok = false; break; }
      entries.forEach(function (entry) { add(entry['代码'], entry['暂停记录ID']); });
    }
    for (var j = 0; j < records.rows.length && ok; j++) {
      var rec = records.rows[j];
      if (typeof rec.id !== 'string' || rec.id.trim() === '' || typeof rec.code !== 'string' || rec.code.trim() === '') {
        ok = false;
        break;
      }
      add(rec.code, rec.id);
    }
    if (!ok) continue;
    var result = {};
    Object.keys(idsByCode).forEach(function (code) { result[code] = Object.keys(idsByCode[code]).sort(); });
    return { verifiable: true, idsByCode: result };
  }
  return { verifiable: false };
}

/**
 * Whether one published row passes the suspension half of the reader gate:
 * 'ok', 'unverifiable' (scan failed, or the row's seen set is blank or not
 * canonical) or 'unseen' (an id that now exists for its 代码 is missing from
 * the seen set). A released event the generation saw is in its seen set and
 * never blocks; timestamps are never consulted.
 */
function suspensionGate_(row, scan) {
  if (!scan || !scan.verifiable) return 'unverifiable';
  var seen = parseSeenSet_(row[SEEN_SET_COLUMN_]);
  if (seen === null) return 'unverifiable';
  var now = scan.idsByCode[row['代码']] || [];
  for (var i = 0; i < now.length; i++) {
    if (seen.indexOf(now[i]) === -1) return 'unseen';
  }
  return 'ok';
}

/**
 * The generation-level half of the gate plus each row's result, attached
 * to the view model: readerGate = {threeLayer, current, banner}; every
 * holding/watchlist row gets a shallow copy carrying _iosOrderable =
 * {ok, message}. A row that is not ok keeps every order/blocker fact it
 * carries -- only its status as a current action is withdrawn.
 */
function applyReaderGate_(summary, rows, reader) {
  var install = reader && reader.install ? reader.install : { readable: false };
  var generation = generationMode_(summary);
  var threeLayer = !!generation && THREE_LAYER_MODES_.indexOf(generation.mode) !== -1;
  var banner = null;
  if (!install.readable) {
    banner = READER_TEXT_.modeUnreadable;
  } else if (!generation) {
    banner = READER_TEXT_.generationInvalid;
  } else if (generation.epoch !== install.epoch || generation.mode !== install.mode) {
    banner = READER_TEXT_.epochChanged;
  }
  var gated = (rows || []).map(function (row) {
    var copy = {};
    Object.keys(row).forEach(function (key) { copy[key] = row[key]; });
    var orderable = { ok: banner === null, message: banner };
    // three_layer_hold stops every new buy whatever the row says (contract
    // "Enablement"): a writer's mistaken ready row is never orderable, while
    // its order and blocker facts stay visible (Issue #323 review B3).
    if (orderable.ok && generation.mode === 'three_layer_hold') {
      orderable = { ok: false, message: READER_TEXT_.holdMode };
    }
    if (orderable.ok && threeLayer) {
      var result = suspensionGate_(row, reader ? reader.scan : null);
      if (result === 'unverifiable') orderable = { ok: false, message: READER_TEXT_.scanUnverifiable };
      if (result === 'unseen') orderable = { ok: false, message: READER_TEXT_.unseenEvent };
    }
    copy._iosOrderable = orderable;
    copy._iosThreeLayer = threeLayer;
    copy._iosPurchaseMode = generation ? generation.mode : null;
    return copy;
  });
  return { gate: { threeLayer: threeLayer, mode: generation ? generation.mode : null, current: banner === null, banner: banner }, rows: gated };
}

/**
 * The reader inputs for a plain-data `tabs` object (Node tests, the demo
 * Sheet): tabs['_安装状态'] and tabs['周计划暂停记录'] as row objects, absent
 * when the tab is absent. The Apps Script glue builds the same result from
 * its own fresh column reads instead (readReaderInputs_).
 */
function readerFromTabs_(tabs) {
  var stateRows = tabs[INSTALL_STATE_TAB_];
  var install = resolveInstallMode_(stateRows === undefined ? { status: 'missing' } : {
    status: 'ok',
    hasModeColumns: stateRows.length > 0 && Object.prototype.hasOwnProperty.call(stateRows[0], 'purchase_plan_mode'),
    rows: stateRows
  });
  var assets = tabs['报告持仓'] || [];
  var records = tabs[SUSPENSION_RECORD_TAB_];
  var hasPayload = assets.length === 0 || Object.prototype.hasOwnProperty.call(assets[0], PAYLOAD_COLUMN_);
  var scan = runSafeScan_(
    function () { return hasPayload ? { ok: true, cells: assets.map(function (r) { return r[PAYLOAD_COLUMN_]; }) } : { ok: false }; },
    function () {
      return records === undefined ? { ok: false } : {
        ok: true,
        rows: records.map(function (r) { return { id: r['暂停记录ID'], code: r['代码'] }; })
      };
    },
    scanWatermark_(tabs['报告摘要'])
  );
  return { install: install, scan: scan, externalFairValue: externalFairValueFromTabs_(tabs) };
}

// -- External fair value snapshot reader (Issue #348, #342 P3). A strict port
// of read_published_batch and the functions it calls in
// tests/external_fair_value_spec.py (the P1/P2 executable specification):
// a published generation's third-party reference is shown only from its own
// 报告摘要.备注 batch line and its own (报告ID, 生成ID) rows of the optional
// 外部公允价值快照 tab. Nothing here reads the collector's record tab or the
// installation switch, so later collection or a changed switch never alters a
// published page. test/external-fair-value-reader.test.js holds this port to
// the Python reference through test/external-fair-value-golden.json. The
// values shown never feed any IOS field, verdict or gate on the page.

var EFV_SNAPSHOT_TAB_ = '外部公允价值快照';
var EFV_SNAPSHOT_KEYS_ = ['报告ID', '生成ID', '报告类型', '报告日期', '代码', '上市市场', '报价币种', '来源标识', '读取截止时间'];
var EFV_SNAPSHOT_FIELDS_ = EFV_SNAPSHOT_KEYS_.concat([
  '记录状态', '引用值记录ID', '引用值协议版本', '来源名称', '外部公允价值', '外部区间下沿', '外部区间上沿', '模型数据截至日',
  '值记录获取时间', '获取方式', '来源链接', '页面价格', '页面价格时间', '采集新鲜度', '模型新鲜度',
  '引用最近尝试记录ID', '引用最近尝试协议版本', '最近尝试获取时间', '最近尝试采集结果', '最近尝试失败说明'
]);
var EFV_VALUE_REQUIRED_ = ['引用值记录ID', '引用值协议版本', '来源名称', '外部公允价值', '值记录获取时间', '获取方式', '采集新鲜度', '模型新鲜度'];
var EFV_VALUE_OPTIONAL_ = ['外部区间下沿', '外部区间上沿', '模型数据截至日', '来源链接', '页面价格', '页面价格时间'];
var EFV_LATEST_GROUP_ = ['引用最近尝试记录ID', '引用最近尝试协议版本', '最近尝试获取时间'];
var EFV_SUPPORTED_VERSIONS_ = ['1'];
var EFV_METHODS_ = ['自动采集', '手工导入'];

var EFV_TAB_FAILED_ = '消费读取失败';
var EFV_ANOMALY_ = '记录异常';
var EFV_MISMATCH_ = '币种或证券不匹配';
var EFV_NO_RECORD_ = '无记录';
var EFV_READ_LATEST_UNSUPPORTED_ = '已读取，最新记录版本不支持';
var EFV_UNSUPPORTED_ = '协议版本不支持';
var EFV_READ_ = '已读取';
var EFV_READ_LATEST_FAILED_ = '已读取，最近一次采集失败';
var EFV_FAILED_ = '读取失败';
var EFV_NOT_COVERED_ = '未覆盖';
var EFV_SNAPSHOT_INVALID_ = '快照校验失败';
var EFV_STATUSES_ = [
  EFV_TAB_FAILED_, EFV_ANOMALY_, EFV_MISMATCH_, EFV_NO_RECORD_, EFV_READ_LATEST_UNSUPPORTED_, EFV_UNSUPPORTED_, EFV_READ_,
  EFV_READ_LATEST_FAILED_, EFV_FAILED_, EFV_NOT_COVERED_, EFV_SNAPSHOT_INVALID_
];
var EFV_VALUE_STATUSES_ = [EFV_READ_, EFV_READ_LATEST_FAILED_, EFV_READ_LATEST_UNSUPPORTED_];
var EFV_LATEST_STATUSES_ = [EFV_READ_LATEST_UNSUPPORTED_, EFV_UNSUPPORTED_, EFV_READ_, EFV_READ_LATEST_FAILED_, EFV_FAILED_, EFV_NOT_COVERED_];
var EFV_LATEST_RESULT_ = {};
EFV_LATEST_RESULT_[EFV_READ_] = '成功';
EFV_LATEST_RESULT_[EFV_READ_LATEST_FAILED_] = '读取失败';
EFV_LATEST_RESULT_[EFV_FAILED_] = '读取失败';
EFV_LATEST_RESULT_[EFV_NOT_COVERED_] = '未覆盖';
var EFV_THIRD_PARTY_NOTE_ = '第三方参考，不改变购买计划或今日行动';
var EFV_RECORD_THRESHOLD_SECONDS_ = 7 * 86400;
var EFV_MODEL_THRESHOLD_DAYS_ = 90;

var EFV_BATCH_PREFIX_ = '外部公允价值快照批次：';
var EFV_BATCH_WRITTEN_ = '已写入';
var EFV_BATCH_MISSING_ = '未写入';
var EFV_REASON_KEYS_ = '快照键无效';
var EFV_BATCH_REASONS_ = [EFV_REASON_KEYS_, '快照表不可用', '快照写入失败', '快照校验未通过'];
var EFV_VIEW_OFF_ = '未启用';
var EFV_VIEW_INCOMPLETE_ = '批次不完整';
var EFV_VIEW_MARKER_INVALID_ = '批次标记无效';
var EFV_MARKER_INVALID_ = { markerInvalid: true };
var EFV_ROW_KEY_ = ['报告ID', '生成ID', '代码', '上市市场', '报价币种'];

// Python's str.strip()/lstrip() whitespace and str.splitlines() boundaries,
// which differ from JavaScript's \s and line terminators.
var EFV_PY_SPACE_ = '\\t\\n\\x0b\\x0c\\r\\x1c-\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000';
var EFV_STRIP_ = new RegExp('^[' + EFV_PY_SPACE_ + ']+|[' + EFV_PY_SPACE_ + ']+$', 'g');
var EFV_LSTRIP_ = new RegExp('^[' + EFV_PY_SPACE_ + ']+');
var EFV_LINE_BREAK_ = /\r\n|[\n\r\x0b\x0c\x1c\x1d\x1e\x85\u2028\u2029]/;

var EFV_SOURCE_ID_ = /^[a-z0-9][a-z0-9_-]*$/;
var EFV_DATETIME_ = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(?:Z|([+-])(\d{2}):(\d{2}))$/;
// Python's \d and strptime's %Y/%d accept any Unicode decimal digit; %m does not.
var EFV_DATE_ = /^(\p{Nd}{4})-(1[0-2]|0[1-9])-(3[01]|[12]\p{Nd}|0[1-9])$/u;
var EFV_DECIMAL_ = /^(0|[1-9]\p{Nd}{0,14})(?:\.(\p{Nd}{1,8}))?$/u;
var EFV_ND_ = /^\p{Nd}$/u;

function efvText_(value) {
  return value == null ? '' : String(value).replace(EFV_STRIP_, '');
}

function efvSplitLines_(text) {
  if (text === '') return [];
  var lines = text.split(EFV_LINE_BREAK_);
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/** One Unicode decimal digit's value: digits come in aligned runs of ten. */
function efvDigitValue_(ch) {
  var cp = ch.codePointAt(0);
  var start = cp;
  while (start > 0 && EFV_ND_.test(String.fromCodePoint(start - 1))) start--;
  return (cp - start) % 10;
}

function efvAsciiDigits_(text) {
  return Array.from(text).map(function (ch) { return String(efvDigitValue_(ch)); }).join('');
}

/** Days since 1970-01-01 of a proleptic Gregorian date (exact for every year). */
function efvDayNumber_(y, m, d) {
  y -= m <= 2 ? 1 : 0;
  var era = Math.floor(y / 400);
  var yoe = y - era * 400;
  var doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  var doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

function efvValidDate_(y, m, d) {
  if (y < 1 || y > 9999 || m < 1 || m > 12 || d < 1) return false;
  var leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  return d <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
}

/**
 * parse_time: ISO 8601 with a zone, or null. {seconds, micros} is the instant
 * (fractions beyond microseconds truncated, as datetime does); day is the
 * calendar day in the value's own offset (datetime.date()).
 */
function efvParseTime_(value) {
  var match = EFV_DATETIME_.exec(efvText_(value));
  if (!match) return null;
  var y = Number(match[1]), mo = Number(match[2]), d = Number(match[3]);
  var h = Number(match[4]), mi = Number(match[5]), s = match[6] ? Number(match[6]) : 0;
  if (!efvValidDate_(y, mo, d) || h > 23 || mi > 59 || s > 59) return null;
  var offset = 0;
  if (match[8]) {
    offset = Number(match[9]) * 60 + Number(match[10]);
    if (offset >= 24 * 60) return null;
    if (match[8] === '-') offset = -offset;
  }
  var day = efvDayNumber_(y, mo, d);
  var micros = match[7] ? Number((match[7] + '00000').slice(0, 6)) : 0;
  return { seconds: day * 86400 + h * 3600 + mi * 60 + s - offset * 60, micros: micros, day: day };
}

function efvCompareTime_(a, b) {
  if (a.seconds !== b.seconds) return a.seconds < b.seconds ? -1 : 1;
  return a.micros === b.micros ? 0 : (a.micros < b.micros ? -1 : 1);
}

/** parse_date: YYYY-MM-DD as a day number, or null. */
function efvParseDate_(value) {
  var match = EFV_DATE_.exec(efvText_(value));
  if (!match) return null;
  var y = Number(efvAsciiDigits_(match[1])), m = Number(match[2]), d = Number(efvAsciiDigits_(match[3]));
  return efvValidDate_(y, m, d) ? efvDayNumber_(y, m, d) : null;
}

/** parse_positive: a positive plain decimal as {whole, fraction} digit strings (exact), or null. */
function efvParsePositive_(value) {
  var match = EFV_DECIMAL_.exec(efvText_(value));
  if (!match) return null;
  var whole = efvAsciiDigits_(match[1]).replace(/^0+/, '');
  var fraction = match[2] ? efvAsciiDigits_(match[2]).replace(/0+$/, '') : '';
  return whole === '' && fraction === '' ? null : { whole: whole, fraction: fraction };
}

function efvCompareDecimal_(a, b) {
  if (a.whole.length !== b.whole.length) return a.whole.length < b.whole.length ? -1 : 1;
  if (a.whole !== b.whole) return a.whole < b.whole ? -1 : 1;
  var width = Math.max(a.fraction.length, b.fraction.length);
  var fa = (a.fraction + '00000000').slice(0, width), fb = (b.fraction + '00000000').slice(0, width);
  return fa === fb ? 0 : (fa < fb ? -1 : 1);
}

function efvListingKey_(code, market, currency) {
  return [code, market, currency].map(function (part) {
    return efvText_(efvText_(part).normalize('NFKC')).toUpperCase();
  });
}

/** Python's ordering of str tuples: element by element, by code point. */
function efvCompareKeys_(a, b) {
  for (var i = 0; i < a.length; i++) {
    var x = Array.from(a[i]), y = Array.from(b[i]);
    for (var j = 0; j < Math.min(x.length, y.length); j++) {
      var cx = x[j].codePointAt(0), cy = y[j].codePointAt(0);
      if (cx !== cy) return cx < cy ? -1 : 1;
    }
    if (x.length !== y.length) return x.length < y.length ? -1 : 1;
  }
  return 0;
}

function efvRecordFreshness_(fetched, cutoff) {
  var seconds = cutoff.seconds - fetched.seconds;
  var micros = cutoff.micros - fetched.micros;
  var fresh = seconds < EFV_RECORD_THRESHOLD_SECONDS_ || (seconds === EFV_RECORD_THRESHOLD_SECONDS_ && micros <= 0);
  return fresh ? '新' : '过期';
}

function efvModelFreshness_(asOf, cutoff) {
  var day = efvParseDate_(asOf);
  if (day === null) return '未提供';
  return cutoff.day - day <= EFV_MODEL_THRESHOLD_DAYS_ ? '新' : '过期';
}

function efvKeyErrors_(row) {
  var errors = EFV_SNAPSHOT_KEYS_.filter(function (name) { return efvText_(row[name]) === ''; })
    .map(function (name) { return name + ' missing'; });
  if (['daily', 'weekly'].indexOf(efvText_(row['报告类型'])) === -1) errors.push('报告类型 invalid');
  if (efvText_(row['报告日期']) && efvParseDate_(row['报告日期']) === null) errors.push('报告日期 not YYYY-MM-DD');
  if (efvText_(row['读取截止时间']) && efvParseTime_(row['读取截止时间']) === null) errors.push('读取截止时间 not ISO 8601 with a zone');
  return errors;
}

function efvPairErrors_(get, low, high, label) {
  var lo = get(low), hi = get(high);
  if ((lo === '') !== (hi === '')) return [label + ' unpaired'];
  if (lo === '') return [];
  var a = efvParsePositive_(lo), b = efvParsePositive_(hi);
  return a === null || b === null || efvCompareDecimal_(a, b) > 0 ? [label + ' invalid'] : [];
}

function efvValueErrors_(row, cutoff) {
  var errors = [];
  var get = function (name) { return efvText_(row[name]); };
  if (EFV_SUPPORTED_VERSIONS_.indexOf(get('引用值协议版本')) === -1) errors.push('value record version unsupported');
  if (efvParsePositive_(get('外部公允价值')) === null) errors.push('外部公允价值 not a positive plain decimal');
  errors = errors.concat(efvPairErrors_(get, '外部区间下沿', '外部区间上沿', 'range'));
  var fetched = efvParseTime_(get('值记录获取时间'));
  if (fetched === null || efvCompareTime_(fetched, cutoff) > 0) errors.push('值记录获取时间 invalid or after the cut-off');
  if (EFV_METHODS_.indexOf(get('获取方式')) === -1) errors.push('获取方式 invalid');
  var price = get('页面价格'), priceTime = get('页面价格时间');
  if ((price === '') !== (priceTime === '')) {
    errors.push('page price unpaired');
  } else if (price !== '') {
    var shown = efvParseTime_(priceTime);
    if (efvParsePositive_(price) === null || shown === null || (fetched !== null && efvCompareTime_(shown, fetched) > 0)) {
      errors.push('page price invalid');
    }
  }
  var asOf = get('模型数据截至日');
  var asOfOk = asOf === '' || (efvParseDate_(asOf) !== null && efvParseDate_(asOf) <= cutoff.day);
  if (!asOfOk) errors.push('模型数据截至日 invalid or after the cut-off');
  if (['新', '过期'].indexOf(get('采集新鲜度')) === -1) {
    errors.push('采集新鲜度 invalid');
  } else if (fetched !== null && efvCompareTime_(fetched, cutoff) <= 0 && get('采集新鲜度') !== efvRecordFreshness_(fetched, cutoff)) {
    errors.push('采集新鲜度 disagrees with 值记录获取时间');
  }
  if (['新', '过期', '未提供'].indexOf(get('模型新鲜度')) === -1) {
    errors.push('模型新鲜度 invalid');
  } else if (asOfOk && get('模型新鲜度') !== efvModelFreshness_(asOf, cutoff)) {
    errors.push('模型新鲜度 disagrees with 模型数据截至日');
  }
  return errors;
}

/** snapshot_errors: the Layer 2 type, enum and consistency checks; [] means the row is shown as selected. */
function efvSnapshotErrors_(row) {
  var errors = efvKeyErrors_(row);
  var get = function (name) { return efvText_(row[name]); };
  var isSet = function (name) { return get(name) !== ''; };
  var status = get('记录状态');
  if (EFV_STATUSES_.indexOf(status) === -1) return errors.concat(['记录状态 invalid']);
  var others = EFV_SNAPSHOT_FIELDS_.filter(function (name) { return EFV_SNAPSHOT_KEYS_.indexOf(name) === -1 && name !== '记录状态'; });
  if (status === EFV_SNAPSHOT_INVALID_) {
    if (others.some(isSet)) errors.push('快照校验失败 row carries fields');
    return errors;
  }
  if (errors.length) return errors;
  var cutoff = efvParseTime_(row['读取截止时间']);
  if (status !== EFV_TAB_FAILED_ && !EFV_SOURCE_ID_.test(get('来源标识'))) errors.push('来源标识 not a valid source id');

  if (EFV_VALUE_STATUSES_.indexOf(status) !== -1) {
    if (!EFV_VALUE_REQUIRED_.every(isSet)) {
      errors.push('value group incomplete');
    } else {
      errors = errors.concat(efvValueErrors_(row, cutoff));
    }
  } else if (EFV_VALUE_REQUIRED_.concat(EFV_VALUE_OPTIONAL_).some(isSet)) {
    errors.push('value group set without a value status');
  }

  if (EFV_LATEST_STATUSES_.indexOf(status) !== -1) {
    if (!EFV_LATEST_GROUP_.every(isSet)) {
      errors.push('latest-attempt group incomplete');
    } else {
      var supported = EFV_SUPPORTED_VERSIONS_.indexOf(get('引用最近尝试协议版本')) !== -1;
      if (supported !== (status !== EFV_READ_LATEST_UNSUPPORTED_ && status !== EFV_UNSUPPORTED_)) {
        errors.push('latest-attempt version disagrees with status');
      }
      var latestTime = efvParseTime_(get('最近尝试获取时间'));
      var valueTime = efvParseTime_(get('值记录获取时间'));
      if (latestTime === null || efvCompareTime_(latestTime, cutoff) > 0) {
        errors.push('最近尝试获取时间 invalid or after the cut-off');
      } else if (valueTime !== null && efvCompareTime_(latestTime, valueTime) < 0) {
        errors.push('latest attempt earlier than the value record');
      }
    }
  } else if (EFV_LATEST_GROUP_.some(isSet)) {
    errors.push('latest-attempt group set in rows 1-4');
  }

  if (get('最近尝试采集结果') !== (EFV_LATEST_RESULT_[status] || '')) errors.push('最近尝试采集结果 disagrees with status');
  if (status === EFV_READ_ && get('引用值记录ID') !== get('引用最近尝试记录ID')) errors.push('已读取 cites two records');
  if (status === EFV_READ_LATEST_FAILED_ && isSet('引用值记录ID') && get('引用值记录ID') === get('引用最近尝试记录ID')) {
    errors.push('failed attempt cited as the value');
  }
  if (isSet('最近尝试失败说明') && [EFV_READ_LATEST_FAILED_, EFV_FAILED_, EFV_NOT_COVERED_].indexOf(status) === -1) {
    errors.push('失败说明 outside rows 8-10');
  }
  return errors;
}

/** finalize, on a row whose keys already passed: unchanged, or 快照校验失败 with only the nine keys. */
function efvFinalize_(row) {
  if (efvSnapshotErrors_(row).length === 0) return row;
  var failed = {};
  EFV_SNAPSHOT_FIELDS_.forEach(function (name) { failed[name] = ''; });
  EFV_SNAPSHOT_KEYS_.forEach(function (name) { failed[name] = efvText_(row[name]); });
  failed['记录状态'] = EFV_SNAPSHOT_INVALID_;
  return failed;
}

/** generation_key_faults for a published batch line's (来源标识, 读取截止时间) against its 报告摘要 row. */
function efvGenerationKeyFaults_(summary, label, cutoffText) {
  var probe = {
    '报告ID': efvText_(summary['报告ID']), '生成ID': efvText_(summary['生成ID']),
    '报告类型': efvText_(summary['报告类型']), '报告日期': efvText_(summary['报告日期']),
    '代码': '-', '上市市场': '-', '报价币种': '-', '来源标识': label, '读取截止时间': cutoffText
  };
  var errors = efvKeyErrors_(probe);
  if (efvText_(label) && !EFV_SOURCE_ID_.test(efvText_(label))) errors.push('来源标识 invalid');
  return errors;
}

function efvBatchLike_(line) {
  return line.replace(EFV_LSTRIP_, '').indexOf(EFV_BATCH_PREFIX_) === 0;
}

function efvSameKeys_(body, keys) {
  var actual = Object.keys(body);
  return actual.length === keys.length && actual.every(function (key, i) { return key === keys[i]; });
}

/** parse_batch_marker: null (no batch line), the parsed line, or EFV_MARKER_INVALID_. */
function efvParseBatchMarker_(note) {
  var lines = efvSplitLines_(note == null ? '' : String(note)).filter(efvBatchLike_);
  if (lines.length === 0) return null;
  if (lines.length > 1 || lines[0].indexOf(EFV_BATCH_PREFIX_) !== 0) return EFV_MARKER_INVALID_;
  var payload = lines[0].slice(EFV_BATCH_PREFIX_.length);
  var body;
  try {
    body = JSON.parse(payload);
  } catch (err) {
    return EFV_MARKER_INVALID_;
  }
  if (!body || typeof body !== 'object' || Array.isArray(body) || JSON.stringify(body) !== payload) return EFV_MARKER_INVALID_;
  var status = body['批次状态'];
  var keys = ['批次状态', '来源标识', '读取截止时间', '快照行数'].concat(status === EFV_BATCH_MISSING_ ? ['原因', '说明'] : []);
  if (!efvSameKeys_(body, keys) || (status !== EFV_BATCH_WRITTEN_ && status !== EFV_BATCH_MISSING_)) return EFV_MARKER_INVALID_;
  var count = body['快照行数'];
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) return EFV_MARKER_INVALID_;
  if (typeof body['来源标识'] !== 'string' || efvText_(body['来源标识']) === '') return EFV_MARKER_INVALID_;
  var keyFault = status === EFV_BATCH_MISSING_ && body['原因'] === EFV_REASON_KEYS_;
  if (typeof body['读取截止时间'] !== 'string' || (efvParseTime_(body['读取截止时间']) === null && !keyFault)) return EFV_MARKER_INVALID_;
  if (status === EFV_BATCH_MISSING_ && (EFV_BATCH_REASONS_.indexOf(body['原因']) === -1 ||
      typeof body['说明'] !== 'string' || efvText_(body['说明']) === '')) {
    return EFV_MARKER_INVALID_;
  }
  return body;
}

/** batch_rows: one (报告ID, 生成ID)'s rows as snapshot-field objects, or null when the tab is not usable. */
function efvBatchRows_(tab, reportId, generationId) {
  if (!tab || typeof tab !== 'object' || !Array.isArray(tab.header) || !Array.isArray(tab.rows)) return null;
  var header = tab.header.map(efvText_);
  var usable = EFV_SNAPSHOT_FIELDS_.every(function (name) {
    return header.filter(function (h) { return h === name; }).length === 1;
  });
  if (!usable) return null;
  var rows = [];
  tab.rows.forEach(function (raw) {
    var row = {};
    EFV_SNAPSHOT_FIELDS_.forEach(function (name) { row[name] = efvText_(raw[header.indexOf(name)]); });
    if (row['报告ID'] === reportId && row['生成ID'] === generationId) rows.push(row);
  });
  return rows;
}

function efvSameRow_(a, b) {
  return EFV_SNAPSHOT_FIELDS_.every(function (name) { return a[name] === b[name]; });
}

/**
 * read_published_batch: {state, rows} for one published generation, plus
 * reason/detail for 未写入. `readTab` is called only for an 已写入 batch line,
 * so a generation without one never reads the snapshot tab at all.
 */
function efvReadPublishedBatch_(summary, readTab) {
  var marker = efvParseBatchMarker_(summary['备注']);
  if (marker === null) return { state: EFV_VIEW_OFF_, rows: [] };
  if (marker === EFV_MARKER_INVALID_) return { state: EFV_VIEW_MARKER_INVALID_, rows: [] };
  if (marker['批次状态'] === EFV_BATCH_MISSING_) {
    return { state: EFV_BATCH_MISSING_, reason: marker['原因'], detail: marker['说明'], rows: [] };
  }
  var incomplete = { state: EFV_VIEW_INCOMPLETE_, rows: [] };
  if (efvGenerationKeyFaults_(summary, marker['来源标识'], marker['读取截止时间']).length) return incomplete;
  var staged = efvBatchRows_(readTab(), efvText_(summary['报告ID']), efvText_(summary['生成ID']));
  if (staged === null) return incomplete;
  var unique = [];
  for (var i = 0; i < staged.length; i++) {
    var identity = JSON.stringify(EFV_ROW_KEY_.map(function (name) { return staged[i][name]; }));
    var seen = unique.filter(function (entry) { return entry.identity === identity; })[0];
    if (!seen) {
      unique.push({ identity: identity, row: staged[i] });
    } else if (!efvSameRow_(seen.row, staged[i])) {
      return incomplete;
    }
  }
  var fixed = {
    '报告类型': efvText_(summary['报告类型']), '报告日期': efvText_(summary['报告日期']),
    '来源标识': efvText_(marker['来源标识']), '读取截止时间': efvText_(marker['读取截止时间'])
  };
  var rows = unique.map(function (entry) { return entry.row; });
  if (rows.length !== marker['快照行数'] || rows.some(function (row) {
    return efvKeyErrors_(row).length > 0 || Object.keys(fixed).some(function (name) { return row[name] !== fixed[name]; });
  })) {
    return incomplete;
  }
  rows = rows.map(function (row, index) { return { row: row, index: index }; }).sort(function (a, b) {
    var order = efvCompareKeys_(efvListingKey_(a.row['代码'], a.row['上市市场'], a.row['报价币种']),
      efvListingKey_(b.row['代码'], b.row['上市市场'], b.row['报价币种']));
    return order || a.index - b.index;
  }).map(function (entry) { return efvFinalize_(entry.row); });
  return { state: EFV_BATCH_WRITTEN_, rows: rows };
}

/** batch_line: the one generation-level line when a batch is not displayable; '' for 未启用 and 已写入. */
function efvBatchLine_(view) {
  var fixed = {};
  fixed[EFV_BATCH_MISSING_] = '外部公允价值：本次快照未写入（' + (view.reason || '') + '：' + (view.detail || '') + '），未采用';
  fixed[EFV_VIEW_INCOMPLETE_] = '外部公允价值：本次快照批次不完整，未采用';
  fixed[EFV_VIEW_MARKER_INVALID_] = '外部公允价值：本次快照批次标记无效，未采用';
  return Object.prototype.hasOwnProperty.call(fixed, view.state) ? fixed[view.state] + '；' + EFV_THIRD_PARTY_NOTE_ : '';
}

/** display_line: the holding line, from the snapshot row alone. */
function efvDisplayLine_(row) {
  var status = row['记录状态'];
  var fixed = {};
  fixed[EFV_TAB_FAILED_] = '外部公允价值：外部数据表读取失败';
  fixed[EFV_ANOMALY_] = '外部公允价值：外部记录异常（重复 ID 冲突或格式错误），未采用';
  fixed[EFV_MISMATCH_] = '外部公允价值：证券或币种不匹配';
  fixed[EFV_NO_RECORD_] = '外部公允价值：暂无记录';
  fixed[EFV_UNSUPPORTED_] = '外部公允价值：外部记录格式不受支持';
  fixed[EFV_NOT_COVERED_] = '外部公允价值：本来源未覆盖';
  fixed[EFV_SNAPSHOT_INVALID_] = '外部公允价值：快照校验失败，未采用';
  if (status === EFV_FAILED_) return '外部公允价值：读取失败（' + row['最近尝试获取时间'] + '）；' + EFV_THIRD_PARTY_NOTE_;
  if (Object.prototype.hasOwnProperty.call(fixed, status)) return fixed[status] + '；' + EFV_THIRD_PARTY_NOTE_;
  var parts = ['外部公允价值（来源：' + row['来源名称'] + '）' + row['外部公允价值'] + ' ' + row['报价币种'],
    '获取时间 ' + row['值记录获取时间']];
  if (row['获取方式'] === '手工导入') parts.push('手工导入');
  if (row['模型新鲜度'] === '未提供') {
    parts.push('模型日期未提供，模型新鲜度未知');
  } else {
    parts.push('模型日期 ' + row['模型数据截至日'] + '（' + (row['模型新鲜度'] === '新' ? '新' : '已过期') + '）');
  }
  if (row['采集新鲜度'] === '过期') parts.push('采集记录已过期');
  if (status === EFV_READ_LATEST_FAILED_) parts.push('最近一次采集失败（' + row['最近尝试获取时间'] + '）');
  if (status === EFV_READ_LATEST_UNSUPPORTED_) {
    parts.push('最新外部记录格式不受支持（' + row['引用最近尝试协议版本'] + '，' + row['最近尝试获取时间'] + '）');
  }
  parts.push(EFV_THIRD_PARTY_NOTE_);
  return parts.join('；');
}

/**
 * One Sheet cell as the text the writer put there. Sheets turns a typed
 * YYYY-MM-DD into a Date and a plain decimal into a number; `dateText` gives
 * a Date's 'yyyy-MM-dd HH:mm:ss' in the Sheet's own time zone. A whole day
 * is its date; any other Date stays an unparseable text, so a cell Sheets
 * reinterpreted never passes a time check by accident.
 */
function efvCellText_(value, dateText) {
  if (value == null) return '';
  if (Object.prototype.toString.call(value) === '[object Date]') {
    if (isNaN(value.getTime())) return '';
    var text = dateText(value);
    return /^\d{4}-\d{2}-\d{2} 00:00:00$/.test(text) ? text.slice(0, 10) : text;
  }
  return String(value);
}

function efvUtcDateText_(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * The view model's externalFairValue: null when the generation has no batch
 * line (module off, or a report from before #346: nothing is shown);
 * otherwise {state, batchLine, rowCount, rows}. `inputs` is {readTab,
 * dateText}; readTab returns {header, rows} of cell text, or null when the
 * tab is missing or unreadable.
 */
function buildExternalFairValueView_(summary, inputs) {
  var dateText = inputs && inputs.dateText ? inputs.dateText : efvUtcDateText_;
  var readTab = inputs && inputs.readTab ? inputs.readTab : function () { return null; };
  var row = {};
  ['报告ID', '生成ID', '报告类型', '报告日期', '备注'].forEach(function (name) {
    row[name] = efvCellText_(summary[name], dateText);
  });
  var view = efvReadPublishedBatch_(row, readTab);
  if (view.state === EFV_VIEW_OFF_) return null;
  return {
    state: view.state,
    batchLine: efvBatchLine_(view),
    note: EFV_THIRD_PARTY_NOTE_,
    rows: view.rows.map(function (snapshot) {
      var shown = {};
      Object.keys(snapshot).forEach(function (name) { shown[name] = snapshot[name]; });
      shown.displayLine = efvDisplayLine_(snapshot);
      return shown;
    })
  };
}

/** The reader's snapshot input for a plain-data `tabs` object: {header, rows} as tabs['外部公允价值快照'] carries it. */
function externalFairValueFromTabs_(tabs) {
  return {
    readTab: function () { return tabs[EFV_SNAPSHOT_TAB_] === undefined ? null : tabs[EFV_SNAPSHOT_TAB_]; },
    dateText: efvUtcDateText_
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

/**
 * Fresh reads of only the named columns of one tab (Issue #316 P4): the
 * header row, then each column's data cells. {ok: true, columns: {name:
 * [...]}, present: {name: bool}} or {ok: false} when the tab is missing or
 * the read throws. No cache is ever consulted -- every page load and every
 * history fetch reads again.
 */
function readColumns_(spreadsheet, tabName, names) {
  try {
    var sheet = spreadsheet.getSheetByName(tabName);
    if (!sheet) return { ok: false, missing: true };
    var lastRow = sheet.getLastRow();
    var lastColumn = sheet.getLastColumn();
    if (lastRow < 1 || lastColumn < 1) return { ok: true, columns: {}, present: {}, rowCount: 0, empty: true };
    var headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
    var columns = {};
    var present = {};
    names.forEach(function (name) {
      var index = headers.indexOf(name);
      present[name] = index !== -1;
      if (index === -1) return;
      columns[name] = lastRow < 2 ? [] : sheet.getRange(2, index + 1, lastRow - 1, 1).getValues().map(function (r) { return r[0]; });
    });
    return { ok: true, columns: columns, present: present, rowCount: Math.max(lastRow - 1, 0) };
  } catch (err) {
    return { ok: false };
  }
}

/** The installation's (mode, epoch), from a fresh read of exactly the two _安装状态 cells. */
function readInstallMode_(spreadsheet) {
  var state = readColumns_(spreadsheet, INSTALL_STATE_TAB_, ['purchase_plan_mode', 'purchase_plan_mode_epoch']);
  var installRead;
  if (!state.ok) {
    installRead = { status: state.missing ? 'missing' : 'error' };
  } else if (state.present['purchase_plan_mode'] !== state.present['purchase_plan_mode_epoch']) {
    installRead = { status: 'error' };
  } else {
    var rows = [];
    for (var i = 0; i < state.rowCount; i++) {
      rows.push({
        purchase_plan_mode: state.present['purchase_plan_mode'] ? state.columns['purchase_plan_mode'][i] : '',
        purchase_plan_mode_epoch: state.present['purchase_plan_mode_epoch'] ? state.columns['purchase_plan_mode_epoch'][i] : ''
      });
    }
    installRead = { status: 'ok', hasModeColumns: !!state.present['purchase_plan_mode'], rows: rows };
  }
  return resolveInstallMode_(installRead);
}

/** The reader inputs for applyReaderGate_, from fresh column reads (payload column first, then the record tab). */
function readReaderInputs_(spreadsheet, tabs) {
  var install = readInstallMode_(spreadsheet);
  var scan = runSafeScan_(
    function () {
      var payload = readColumns_(spreadsheet, '报告持仓', [PAYLOAD_COLUMN_]);
      return payload.ok && payload.present[PAYLOAD_COLUMN_] ? { ok: true, cells: payload.columns[PAYLOAD_COLUMN_] } : { ok: false };
    },
    function () {
      var records = readColumns_(spreadsheet, SUSPENSION_RECORD_TAB_, ['暂停记录ID', '代码']);
      if (!records.ok || !records.present['暂停记录ID'] || !records.present['代码']) return { ok: false };
      return {
        ok: true,
        rows: records.columns['暂停记录ID'].map(function (id, index) {
          return { id: String(id == null ? '' : id), code: String(records.columns['代码'][index] == null ? '' : records.columns['代码'][index]) };
        })
      };
    },
    scanWatermark_(tabs['报告摘要'])
  );
  return { install: install, scan: scan, externalFairValue: readExternalFairValueInputs_(spreadsheet) };
}

/**
 * The optional 外部公允价值快照 tab as cell text (Issue #348), read at most
 * once per request and only when a generation's batch line says 已写入.
 * Missing or unreadable is null: that batch then shows as 批次不完整.
 */
function readExternalFairValueInputs_(spreadsheet) {
  var cached;
  var dateText = function (date) {
    return Utilities.formatDate(date, spreadsheet.getSpreadsheetTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  };
  return {
    dateText: dateText,
    readTab: function () {
      if (cached !== undefined) return cached;
      try {
        var sheet = spreadsheet.getSheetByName(EFV_SNAPSHOT_TAB_);
        var values = sheet ? sheet.getDataRange().getValues() : null;
        var cell = function (value) { return efvCellText_(value, dateText); };
        cached = values ? { header: (values[0] || []).map(cell), rows: values.slice(1).map(function (row) { return row.map(cell); }) } : null;
      } catch (err) {
        cached = null;
      }
      return cached;
    }
  };
}

function include_(filename) {
  // Read the fragment as source: HTML parsing here would turn JavaScript < into &lt;.
  return HtmlService.createTemplateFromFile(filename).getRawContent();
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
    return buildDashboardBootstrap_(tabs, readReaderInputs_(spreadsheet, tabs));
  } catch (err) {
    return {
      error: String(err && err.message ? err.message : err),
      buildMarker: DASHBOARD_BUILD_MARKER_,
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
    var result = getReport_(tabs, reportId, readReaderInputs_(spreadsheet, tabs));
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
  if (params.view === 'build') {
    // Issue #316 P4: the attestation the installer reads back before it may
    // write three_layer. Reads only the two _安装状态 mode cells.
    return ContentService.createTextOutput(buildAttestationSafe_(params.nonce)).setMimeType(ContentService.MimeType.TEXT);
  }
  var view = params.view === 'weekly' ? 'weekly' : 'daily';

  var template = HtmlService.createTemplateFromFile('Index');
  template.include = include_;
  template.bootstrapJson = escapeJsonForScriptContext_(JSON.stringify(buildBootstrapSafe_()));
  template.activeView = view;

  return template.evaluate()
    .setTitle('IOS Personal Dashboard')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** The marker line alone (the first line of the attestation). */
function buildMarkerText_() {
  return 'IOS_DASHBOARD_BUILD=' + DASHBOARD_BUILD_MARKER_;
}

/** ?view=build: never throws; an unreadable Sheet reads as 无法读取 / 未配置. */
function buildAttestationSafe_(nonce) {
  var sheetId = null;
  var install = { readable: false };
  try {
    sheetId = PropertiesService.getScriptProperties().getProperty(SCRIPT_PROPERTY_SPREADSHEET_ID_);
    install = readInstallMode_(getConfiguredSpreadsheet_());
  } catch (err) {
    install = { readable: false };
  }
  return buildAttestationText_(nonce, sheetId, install);
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
    parsePositiveInt_: parsePositiveInt_,
    resolveInstallMode_: resolveInstallMode_,
    generationMode_: generationMode_,
    parsePayloadCell_: parsePayloadCell_,
    parseSeenSet_: parseSeenSet_,
    scanWatermark_: scanWatermark_,
    runSafeScan_: runSafeScan_,
    suspensionGate_: suspensionGate_,
    applyReaderGate_: applyReaderGate_,
    readerFromTabs_: readerFromTabs_,
    readColumns_: readColumns_,
    readReaderInputs_: readReaderInputs_,
    readInstallMode_: readInstallMode_,
    buildMarkerText_: buildMarkerText_,
    buildAttestationText_: buildAttestationText_,
    DASHBOARD_BUILD_MARKER_: DASHBOARD_BUILD_MARKER_,
    READER_TEXT_: READER_TEXT_,
    sortByOrder_: sortByOrder_,
    findMissingRequiredHeaders_: findMissingRequiredHeaders_,
    isUnconfiguredSpreadsheetId_: isUnconfiguredSpreadsheetId_,
    SHEET_TABS_: SHEET_TABS_,
    REPORT_TABS_: REPORT_TABS_,
    REQUIRED_HEADERS_: REQUIRED_HEADERS_,
    SPREADSHEET_ID_PLACEHOLDER_: SPREADSHEET_ID_PLACEHOLDER_,
    EFV_SNAPSHOT_TAB_: EFV_SNAPSHOT_TAB_,
    EFV_SNAPSHOT_FIELDS_: EFV_SNAPSHOT_FIELDS_,
    EFV_MARKER_INVALID_: EFV_MARKER_INVALID_,
    efvText_: efvText_,
    efvParseTime_: efvParseTime_,
    efvParseDate_: efvParseDate_,
    efvParsePositive_: efvParsePositive_,
    efvListingKey_: efvListingKey_,
    efvParseBatchMarker_: efvParseBatchMarker_,
    efvSnapshotErrors_: efvSnapshotErrors_,
    efvReadPublishedBatch_: efvReadPublishedBatch_,
    efvBatchLine_: efvBatchLine_,
    efvDisplayLine_: efvDisplayLine_,
    efvCellText_: efvCellText_,
    buildExternalFairValueView_: buildExternalFairValueView_,
    externalFairValueFromTabs_: externalFairValueFromTabs_,
    readExternalFairValueInputs_: readExternalFairValueInputs_
  };
}
