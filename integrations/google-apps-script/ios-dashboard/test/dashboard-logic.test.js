// Unit tests for Code.gs's pure-logic section, run with plain Node (no
// dependencies -- uses only node:test/node:assert, both built in since
// Node 18). Apps Script itself has no test runner, so this is the actual
// verification for everything that doesn't require SpreadsheetApp/HtmlService.
//
// Run: node integrations/google-apps-script/ios-dashboard/test/dashboard-logic.test.js

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const logic = require(path.join(__dirname, '..', 'Code.gs'));
const demoSheet = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'demo', 'demo-sheet.json'), 'utf8')
);

test('getCurrentHoldings_ only includes 状态=持有 with 持有数量 > 0', () => {
  const holdings = logic.getCurrentHoldings_(demoSheet['当前持仓']);
  assert.equal(holdings.length, 2);
  assert.deepEqual(holdings.map((r) => r['代码']).sort(), ['DEMO1', 'DEMO2']);
});

test('getCurrentHoldings_ excludes 已清仓 rows even with a nonzero historical quantity in other fields', () => {
  const holdings = logic.getCurrentHoldings_(demoSheet['当前持仓']);
  assert.ok(!holdings.some((r) => r['代码'] === 'DEMO3'), 'DEMO3 is 已清仓 and must be excluded');
});

test('a blank 平均成本 is preserved as-is (unknown), never defaulted', () => {
  const holdings = logic.getCurrentHoldings_(demoSheet['当前持仓']);
  const demo2 = holdings.find((r) => r['代码'] === 'DEMO2');
  assert.equal(demo2['平均成本'], '', '平均成本 must stay blank, not become 0 or any other default');
});

test('selectReportSummary_ picks the most recent report of a type when no explicit id is given', () => {
  const summary = logic.selectReportSummary_(demoSheet['报告摘要'], 'daily', null);
  assert.equal(summary['报告ID'], 'daily-2026-08-15');
});

test('selectReportSummary_ returns null (not an error) when no report of that type exists yet', () => {
  const summary = logic.selectReportSummary_([], 'daily', null);
  assert.equal(summary, null);
});

test('selectReportSummary_ honors an explicit 报告ID for history browsing', () => {
  const summary = logic.selectReportSummary_(demoSheet['报告摘要'], 'daily', 'daily-2026-08-15');
  assert.equal(summary['生成ID'], 'gen-daily-0815-b');
});

test('filterLiveDetailRows_ excludes an orphaned generation and keeps only the current one (report_write_protocol read contract)', () => {
  const live = logic.filterLiveDetailRows_(demoSheet['报告持仓'], 'daily-2026-08-15', 'gen-daily-0815-b');
  assert.equal(live.length, 3, 'exactly the 3 rows tagged with the current generation');
  assert.ok(!live.some((r) => r['生成ID'] === 'gen-daily-0815-a'), 'the orphaned generation must never appear');
});

test('buildReportViewModel_ carries the report-time price snapshot (参考买入价/区间, 当前价格, 价格位置) through for holdings and watchlist rows alike', () => {
  const vm = logic.buildReportViewModel_(demoSheet, 'daily', null);
  const demo1 = vm.holdings.find((r) => r['代码'] === 'DEMO1');
  assert.equal(demo1['参考买入价/区间'], '38-40');
  assert.equal(demo1['当前价格'], 41.2);
  assert.equal(demo1['价格位置'], '高于区间');

  const demo2 = vm.holdings.find((r) => r['代码'] === 'DEMO2');
  assert.equal(demo2['参考买入价/区间'], '', 'blank reference in the report snapshot must stay blank, not be backfilled from elsewhere');
  assert.equal(demo2['价格位置'], '未知');

  const watchlistRow = vm.watchlistCandidates.find((r) => r['代码'] === 'DEMOW1');
  assert.equal(watchlistRow['参考买入价/区间'], '20-25', 'watchlist snapshot must carry the reference derived from 观察名单.理想买入区间');
});

test('buildReportViewModel_ splits holdings from watchlist candidates and never mixes them', () => {
  const vm = logic.buildReportViewModel_(demoSheet, 'daily', null);
  assert.equal(vm.found, true);
  assert.equal(vm.holdings.length, 2);
  assert.equal(vm.watchlistCandidates.length, 1);
  assert.ok(vm.holdings.every((r) => r['资产类型'] === 'holding'));
  assert.ok(vm.watchlistCandidates.every((r) => r['资产类型'] === 'watchlist'));
});

test('buildReportViewModel_ returns found=false for a report type with no report yet, not an error', () => {
  const vm = logic.buildReportViewModel_({ 报告摘要: [], 报告持仓: [], 报告风险: [], 报告待办: [] }, 'daily', null);
  assert.equal(vm.found, false);
});

test('buildReportViewModel_: a report with zero risks/todos is a valid empty result, not Blocked (blocked_vs_empty)', () => {
  const vm = logic.buildReportViewModel_(demoSheet, 'weekly', null);
  assert.equal(vm.found, true);
  assert.deepEqual(vm.risks, [], 'weekly report has no risk rows in the demo data -- must render as an empty list');
  assert.deepEqual(vm.todos, [], 'weekly report has no todo rows in the demo data -- must render as an empty list');
  // The Dashboard must not invent a Blocked/degraded status on its own --
  // 核心状态 is whatever the Task wrote (normal, in the demo data), and
  // the Dashboard passes it through unchanged.
  assert.equal(vm.summary['核心状态'], '正常');
});

test('buildHistoryList_ is sorted most-recent-first and only has one entry per 报告ID', () => {
  const history = logic.buildHistoryList_(demoSheet['报告摘要'], 'daily');
  assert.equal(history.length, 1);
  assert.equal(history[0].reportId, 'daily-2026-08-15');
});

// -- Script-context escaping for the inline bootstrap payload (PR #251 review: --
// -- a Sheet cell containing </script> must never break out of the <script> block) --

test('escapeJsonForScriptContext_ neutralizes a </script><script> payload embedded in a JSON string value', () => {
  const payload = JSON.stringify({ headline: '</script><script>alert(1)</script>' });
  const escaped = logic.escapeJsonForScriptContext_(payload);
  assert.ok(!escaped.includes('</script>'), 'no literal </script> sequence may survive escaping');
  assert.ok(!escaped.includes('<script>'), 'no literal <script> sequence may survive escaping either');
  // The escaped string must still be valid JS/JSON once unescaped by the browser's
  // own JS parser -- i.e. it round-trips back to the exact original payload.
  // eslint-disable-next-line no-eval
  const roundTripped = eval('(' + escaped + ')');
  assert.deepEqual(roundTripped, JSON.parse(payload));
});

test('escapeJsonForScriptContext_ escapes U+2028/U+2029 (illegal unescaped line terminators inside a JS string literal)', () => {
  const payload = JSON.stringify({ note: 'line one line two line three' });
  const escaped = logic.escapeJsonForScriptContext_(payload);
  assert.ok(!escaped.includes(' ') && !escaped.includes(' '));
  assert.match(escaped, /\\u2028/);
  assert.match(escaped, /\\u2029/);
  const roundTripped = eval('(' + escaped + ')');
  assert.deepEqual(roundTripped, JSON.parse(payload));
});

test('escapeJsonForScriptContext_ leaves an ordinary payload with no dangerous characters unchanged', () => {
  const payload = JSON.stringify({ code: 'DEMO1', quantity: 100, price: 41.2 });
  assert.equal(logic.escapeJsonForScriptContext_(payload), payload);
});

test('escapeJsonForScriptContext_ applied to a full bootstrap containing a </script> in Sheet data never lets it survive', () => {
  const poisoned = JSON.parse(JSON.stringify(demoSheet));
  poisoned['报告摘要'][0]['一句话结论'] = '</script><img src=x onerror=alert(1)>';
  const bootstrap = logic.buildDashboardBootstrap_(poisoned);
  const serialized = logic.escapeJsonForScriptContext_(JSON.stringify(bootstrap));
  assert.ok(!serialized.includes('</script>'));
});

// -- SPA bootstrap/history support (Issue #250: getDashboardBootstrap/getReport) --

test('resolveReportTypeFromReportId_ maps a 报告ID prefix to its report type', () => {
  assert.equal(logic.resolveReportTypeFromReportId_('daily-2026-08-15'), 'daily');
  assert.equal(logic.resolveReportTypeFromReportId_('weekly-2026-08-15'), 'weekly');
});

test('resolveReportTypeFromReportId_ returns null for an unrecognized or non-string id', () => {
  assert.equal(logic.resolveReportTypeFromReportId_('monthly-2026-08-15'), null);
  assert.equal(logic.resolveReportTypeFromReportId_(''), null);
  assert.equal(logic.resolveReportTypeFromReportId_(null), null);
  assert.equal(logic.resolveReportTypeFromReportId_(undefined), null);
});

test('buildDashboardBootstrap_ precomputes both the latest daily and weekly viewModels plus both history lists and the allocation view in one shot', () => {
  const bootstrap = logic.buildDashboardBootstrap_(demoSheet);
  assert.equal(bootstrap.error, null);
  assert.equal(bootstrap.daily.found, true);
  assert.equal(bootstrap.daily.summary['报告ID'], 'daily-2026-08-15');
  assert.equal(bootstrap.weekly.found, true);
  assert.equal(bootstrap.weekly.summary['报告ID'], 'weekly-2026-08-15');
  assert.equal(bootstrap.dailyHistory.length, 1);
  assert.equal(bootstrap.weeklyHistory.length, 1);
  assert.equal(bootstrap.allocation.length, 2);
});

test('getReport_ resolves a specific historical report by 报告ID, matching what selectHistoryReport requests', () => {
  const report = logic.getReport_(demoSheet, 'daily-2026-08-15');
  assert.equal(report.found, true);
  assert.equal(report.summary['生成ID'], 'gen-daily-0815-b');
  assert.ok(!report.holdings.some((r) => r === undefined));
});

test('getReport_ returns found=false with a null reportType for an unresolvable 报告ID, never throws', () => {
  const report = logic.getReport_(demoSheet, 'not-a-real-id');
  assert.equal(report.found, false);
  assert.equal(report.reportType, null);
});

test('buildAllocationView_ reports quantity/avg-cost but never fabricates a percentage weight', () => {
  const allocation = logic.buildAllocationView_(demoSheet['当前持仓']);
  assert.equal(allocation.length, 2);
  for (const entry of allocation) {
    assert.ok(!('weightPct' in entry) && !('percentage' in entry), 'must never invent a market-value-based weight this schema cannot support');
  }
  const demo2 = allocation.find((r) => r.code === 'DEMO2');
  assert.equal(demo2.avgCost, null, 'unknown 平均成本 must surface as null, not 0');
});

test('buildAllocationView_ carries 参考买入价/区间 straight from 当前持仓', () => {
  const allocation = logic.buildAllocationView_(demoSheet['当前持仓']);
  const demo1 = allocation.find((r) => r.code === 'DEMO1');
  assert.equal(demo1.referenceRange, '38-40', 'must be read directly off 当前持仓.参考买入价/区间');
});

test('buildAllocationView_: a blank 参考买入价/区间 surfaces as null, never fabricated -- and is independent of 平均成本', () => {
  // Two rows where avgCost and referenceRange are set independently of
  // each other, to prove neither field is ever derived from the other.
  const rows = [
    { '代码': 'A', '名称': 'A Co.', '持有数量': 10, '平均成本': 100, '参考买入价/区间': '', '币种': 'USD', '状态': '持有' },
    { '代码': 'B', '名称': 'B Co.', '持有数量': 10, '平均成本': '', '参考买入价/区间': '80-90', '币种': 'USD', '状态': '持有' }
  ];
  const allocation = logic.buildAllocationView_(rows);
  const a = allocation.find((r) => r.code === 'A');
  const b = allocation.find((r) => r.code === 'B');
  assert.equal(a.avgCost, 100);
  assert.equal(a.referenceRange, null, 'A has a known avgCost but no reference set -- must not fabricate one from avgCost');
  assert.equal(b.avgCost, null);
  assert.equal(b.referenceRange, '80-90', 'B has a reference set despite an unknown avgCost -- the two fields are independent');
});

// -- Account/capital facts and fund-sleeve reconciliation (Issue #259, schema_version 2+) --

test('getAccountFacts_ normalizes 账户状态 rows with blank-is-null semantics throughout, never defaulting to 0', () => {
  const facts = logic.getAccountFacts_(demoSheet['账户状态']);
  assert.equal(facts.length, 2);
  const brokerA = facts.find((f) => f.account === 'Demo Broker A');
  const brokerB = facts.find((f) => f.account === 'Demo Broker B');
  assert.equal(brokerA.currency, 'JPY');
  assert.equal(brokerA.availableCash, 500000);
  assert.equal(brokerA.nisaGrowthRemaining, 2400000);
  assert.equal(brokerA.nisaTsumitateRemaining, 400000);
  assert.equal(brokerA.plannedAdditionalCapital, 1000000);
  assert.match(brokerA.recurringTsumitate, /每月自动扣款/);
  assert.equal(brokerA.asOf, '2026-08-20');
  // Broker B (multi-currency: USD) has every numeric fact blank -- must
  // surface as null, never a fabricated 0, and independently of Broker A.
  assert.equal(brokerB.currency, 'USD');
  assert.equal(brokerB.availableCash, null);
  assert.equal(brokerB.nisaGrowthRemaining, null);
  assert.equal(brokerB.nisaTsumitateRemaining, null);
  assert.equal(brokerB.plannedAdditionalCapital, null);
  assert.equal(brokerB.recurringTsumitate, null);
});

test('getAccountFacts_ returns an empty array for a missing/absent 账户状态 tab (schema_version 1 installation) rather than throwing', () => {
  assert.deepEqual(logic.getAccountFacts_(undefined), []);
  assert.deepEqual(logic.getAccountFacts_([]), []);
});

test('hasSuppliedCashFacts_ is true when at least one row has a non-blank 可用现金 -- satisfies the required "当前现金或资金状态" input', () => {
  assert.equal(logic.hasSuppliedCashFacts_(demoSheet['账户状态']), true, 'Broker A alone supplies 可用现金');
});

test('hasSuppliedCashFacts_ is false when the tab is absent, empty, or every row has a blank 可用现金 -- equivalent to the legacy "未提供" state', () => {
  assert.equal(logic.hasSuppliedCashFacts_(undefined), false, 'absent tab');
  assert.equal(logic.hasSuppliedCashFacts_([]), false, 'empty tab');
  const allBlank = [
    { '账户': 'X', '币种': 'USD', '可用现金': '', '数据时间': '2026-08-20' },
    { '账户': 'Y', '币种': 'JPY', '可用现金': null, '数据时间': '2026-08-20' }
  ];
  assert.equal(logic.hasSuppliedCashFacts_(allBlank), false, 'every row blank is still "not provided", not a silent pass');
});

test('getFundSleeveDetail_ normalizes 投资信托明细 rows, never fabricating 代码/未实现盈亏 when the brokerage view omits them', () => {
  const detail = logic.getFundSleeveDetail_(demoSheet['投资信托明细']);
  assert.equal(detail.length, 2);
  const withCode = detail.find((f) => f.fundName === 'Demo All Country Index Fund');
  const withoutCode = detail.find((f) => f.fundName === 'Demo S&P 500 Index Fund');
  assert.equal(withCode.code, 'DEMOFUND1');
  assert.equal(withCode.nisaBucket, '积立投资枠');
  assert.equal(withCode.marketValue, 1200000);
  assert.equal(withCode.unrealizedPnl, 150000);
  assert.equal(withoutCode.code, null, '未提供代码 -- must stay null, never a synthesized identifier');
  assert.equal(withoutCode.unrealizedPnl, null, '未提供未实现盈亏 -- must stay null, never computed from 当前市值');
  assert.equal(withoutCode.nisaBucket, '成长投资枠');
});

test('reconcileFundSleeveValue_ returns hasFundSleeveRow=false with no reconciliation attempted when 当前持仓 has no FUND-SLEEVE row', () => {
  const result = logic.reconcileFundSleeveValue_(demoSheet['当前持仓'], demoSheet['投资信托明细']);
  assert.deepEqual(result, { hasFundSleeveRow: false, reconciledValue: null, constituentCount: 0 });
});

test('reconcileFundSleeveValue_ sums 投资信托明细.当前市值 for a FUND-SLEEVE row scoped to its own 账户, never double-counting against the row\'s own 持有数量/平均成本', () => {
  const currentHoldings = [
    { '代码': 'FUND-SLEEVE', '名称': 'Fund sleeve aggregate', '市场': 'N/A', '持有数量': 1, '平均成本': 999999, '参考买入价/区间': '', '币种': 'JPY', '账户': 'Demo Broker A', '状态': '持有' }
  ];
  const result = logic.reconcileFundSleeveValue_(currentHoldings, demoSheet['投资信托明细']);
  assert.equal(result.hasFundSleeveRow, true);
  assert.equal(result.constituentCount, 2);
  // 1,200,000 + 800,000 -- the sum of the two Demo Broker A fund rows,
  // completely independent of the aggregate row's own nonsensical
  // 持有数量=1/平均成本=999999 (proving those are never consulted).
  assert.equal(result.reconciledValue, 2000000);
});

test('reconcileFundSleeveValue_ only sums constituents matching the FUND-SLEEVE row\'s own 账户, excluding other accounts\' funds', () => {
  const currentHoldings = [
    { '代码': 'FUND-SLEEVE', '名称': 'Fund sleeve aggregate', '市场': 'N/A', '持有数量': 1, '平均成本': '', '参考买入价/区间': '', '币种': 'JPY', '账户': 'Demo Broker A', '状态': '持有' }
  ];
  const otherAccountFund = [
    { '基金名称': 'Unrelated fund', '代码': '', '账户': 'Some Other Broker', '币种': 'JPY', 'NISA分类': '', '当前市值': 999999999, '未实现盈亏': '', '数据时间': '2026-08-20', '备注': '' }
  ];
  const result = logic.reconcileFundSleeveValue_(currentHoldings, demoSheet['投资信托明细'].concat(otherAccountFund));
  assert.equal(result.constituentCount, 2, 'only the 2 Demo Broker A rows -- the unrelated-account fund must be excluded');
  assert.equal(result.reconciledValue, 2000000, 'the unrelated account\'s huge market value must never leak into this total');
});

test('reconcileFundSleeveValue_ sums every 投资信托明细 row when the FUND-SLEEVE aggregate row leaves 账户 blank (a whole-portfolio sleeve)', () => {
  const currentHoldings = [
    { '代码': 'FUND-SLEEVE', '名称': 'Fund sleeve aggregate', '市场': 'N/A', '持有数量': 1, '平均成本': '', '参考买入价/区间': '', '币种': 'JPY', '账户': '', '状态': '持有' }
  ];
  const multiAccountFunds = demoSheet['投资信托明细'].concat([
    { '基金名称': 'Broker B fund', '代码': '', '账户': 'Demo Broker B', '币种': 'USD', 'NISA分类': '', '当前市值': 500, '未实现盈亏': '', '数据时间': '2026-08-20', '备注': '' }
  ]);
  const result = logic.reconcileFundSleeveValue_(currentHoldings, multiAccountFunds);
  assert.equal(result.constituentCount, 3);
  assert.equal(result.reconciledValue, 2000500);
});

test('reconcileFundSleeveValue_ never returns a silently-partial total: one constituent with a blank 当前市值 makes the whole reconciled value null', () => {
  const currentHoldings = [
    { '代码': 'FUND-SLEEVE', '名称': 'Fund sleeve aggregate', '市场': 'N/A', '持有数量': 1, '平均成本': '', '参考买入价/区间': '', '币种': 'JPY', '账户': 'Demo Broker A', '状态': '持有' }
  ];
  const fundsWithOneBlankValue = [
    { '基金名称': 'Fund with a value', '代码': '', '账户': 'Demo Broker A', '币种': 'JPY', 'NISA分类': '', '当前市值': 1000, '未实现盈亏': '', '数据时间': '2026-08-20', '备注': '' },
    { '基金名称': 'Fund missing its value', '代码': '', '账户': 'Demo Broker A', '币种': 'JPY', 'NISA分类': '', '当前市值': '', '未实现盈亏': '', '数据时间': '2026-08-20', '备注': '' }
  ];
  const result = logic.reconcileFundSleeveValue_(currentHoldings, fundsWithOneBlankValue);
  assert.equal(result.constituentCount, 2);
  assert.equal(result.reconciledValue, null, 'must never silently sum only the rows that happen to have a value');
});

test('reconcileFundSleeveValue_ returns reconciledValue=null (not 0) when the FUND-SLEEVE row exists but no matching 投资信托明细 rows do', () => {
  const currentHoldings = [
    { '代码': 'FUND-SLEEVE', '名称': 'Fund sleeve aggregate', '市场': 'N/A', '持有数量': 1, '平均成本': '', '参考买入价/区间': '', '币种': 'JPY', '账户': 'An Account With No Detail Rows Yet', '状态': '持有' }
  ];
  const result = logic.reconcileFundSleeveValue_(currentHoldings, demoSheet['投资信托明细']);
  assert.equal(result.hasFundSleeveRow, true);
  assert.equal(result.constituentCount, 0);
  assert.equal(result.reconciledValue, null, 'zero constituents means unreconciled, not a fabricated 0 total');
});

test('sortByOrder_ places blank/missing 排序 values last, deterministically', () => {
  const rows = [
    { name: 'c', '排序': '' },
    { name: 'a', '排序': 1 },
    { name: 'b', '排序': 2 }
  ];
  const sorted = logic.sortByOrder_(rows).map((r) => r.name);
  assert.deepEqual(sorted, ['a', 'b', 'c']);
});

// -- Required-header validation (blocked_vs_empty correctness boundary) --

test('REQUIRED_HEADERS_ exactly matches setup/schema/sheet-schema.json\'s own required fields, for every tab the Dashboard reads (drift guard)', () => {
  // Scoped to logic.SHEET_TABS_ (the seven user-facing tabs the Dashboard actually
  // reads via readAllTabs_) rather than every key in schema.tabs -- the schema also
  // defines an installer-owned internal tab (_安装状态, Issue #242 Phase C review)
  // that the Dashboard never reads or renders, so it has no REQUIRED_HEADERS_ entry.
  const schema = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', 'setup', 'schema', 'sheet-schema.json'), 'utf8')
  );
  for (const tabName of logic.SHEET_TABS_) {
    const expected = schema.tabs[tabName].fields.filter((f) => f.required).map((f) => f.name).sort();
    const actual = (logic.REQUIRED_HEADERS_[tabName] || []).slice().sort();
    assert.deepEqual(actual, expected, `REQUIRED_HEADERS_['${tabName}'] must mirror sheet-schema.json exactly`);
  }
  assert.deepEqual(
    Object.keys(logic.REQUIRED_HEADERS_).sort(),
    logic.SHEET_TABS_.slice().sort(),
    'REQUIRED_HEADERS_ must cover exactly the tabs the Dashboard reads, no more, no fewer'
  );
});

test('findMissingRequiredHeaders_ reports nothing missing for a header-only empty tab (valid empty, not Blocked)', () => {
  const missing = logic.findMissingRequiredHeaders_(
    ['代码', '名称', '市场', '持有数量', '币种', '账户', '状态', '备注', '最后更新'],
    '当前持仓'
  );
  assert.deepEqual(missing, [], 'every required column is present -- zero data rows below it is a valid empty tab');
});

test('findMissingRequiredHeaders_ names a missing required column instead of treating it as empty', () => {
  const missing = logic.findMissingRequiredHeaders_(
    ['代码', '名称', '市场', '币种', '账户', '备注'], // 持有数量 and 状态 are missing
    '当前持仓'
  );
  assert.deepEqual(missing.sort(), ['持有数量', '状态'], 'must name exactly the missing required columns');
});

test('findMissingRequiredHeaders_ catches a misspelled required column the same way as an absent one', () => {
  const missing = logic.findMissingRequiredHeaders_(['报告ID', '生成ID', '报告類型', '报告日期', '资产类型', '代码', '名称'], '报告持仓');
  assert.deepEqual(missing, ['报告类型'], '报告類型 (misspelled) does not satisfy the required 报告类型 column');
});

test('findMissingRequiredHeaders_ reports every required column missing for a tab with no header row at all', () => {
  const missing = logic.findMissingRequiredHeaders_([], '报告风险');
  assert.deepEqual(missing.sort(), logic.REQUIRED_HEADERS_['报告风险'].slice().sort());
});

// -- Spreadsheet-id setup guard (Phase B review: the manual setup step must be runnable) --

test('isUnconfiguredSpreadsheetId_ rejects blank and the unedited placeholder', () => {
  assert.equal(logic.isUnconfiguredSpreadsheetId_(''), true);
  assert.equal(logic.isUnconfiguredSpreadsheetId_(undefined), true);
  assert.equal(logic.isUnconfiguredSpreadsheetId_(logic.SPREADSHEET_ID_PLACEHOLDER_), true);
});

test('isUnconfiguredSpreadsheetId_ accepts anything else as configured', () => {
  assert.equal(logic.isUnconfiguredSpreadsheetId_('1AbCDeFGhijklmnop_a_real_looking_id'), false);
});
