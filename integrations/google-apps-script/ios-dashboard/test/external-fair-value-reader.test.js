// Issue #348 (#342 P3): the Dashboard's read-only external fair value view.
// Code.gs ports read_published_batch, batch_line and display_line from
// tests/external_fair_value_spec.py; the golden file below is generated from
// that Python reference by tests/test_external_fair_value_dashboard_p3.py,
// so the two cannot drift apart without a suite failing. The rest checks the
// wiring: only the generation's own batch line and snapshot rows are read,
// Daily and Weekly stay separate, history never changes and the page renders
// the module apart from every IOS conclusion.
//
// Run: node --test integrations/google-apps-script/ios-dashboard/test/external-fair-value-reader.test.js

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { createFakeDocument, createGoogleScriptRunStub } = require('./fake-dom');

const logic = require(path.join(__dirname, '..', 'Code.gs'));
const ROOT = path.join(__dirname, '..', '..', '..', '..');
const GOLDEN = JSON.parse(fs.readFileSync(path.join(__dirname, 'external-fair-value-golden.json'), 'utf8'));
const SCHEMA = JSON.parse(fs.readFileSync(path.join(ROOT, 'setup', 'schema', 'sheet-schema.json'), 'utf8'));
const SCRIPT_HTML_SRC = fs.readFileSync(path.join(__dirname, '..', 'Script.html'), 'utf8');

const SNAPSHOT = '外部公允价值快照';
const RECORDS = '外部公允价值记录';
const NOTE = '第三方参考，不改变购买计划或今日行动';

function goldenCase(name) {
  const found = GOLDEN.cases.find((c) => c.name === name);
  assert.ok(found, name);
  return JSON.parse(JSON.stringify(found));
}

function tabOf(c) {
  return c.snapshot_tab === 'READ_FAILURE' ? null : c.snapshot_tab;
}

// -- Parity with the Python reference ----------------------------------------

test('snapshot fields equal the schema, in order', () => {
  const fields = SCHEMA.optional_modules.external_fair_value.tabs[SNAPSHOT].fields.map((f) => f.name);
  assert.deepEqual(logic.EFV_SNAPSHOT_FIELDS_, fields);
});

test('primitive parsers match Python: strip, ISO times, dates, plain decimals, listing keys, batch lines', () => {
  const p = GOLDEN.primitives;
  p.text.forEach(([input, expected]) => assert.equal(logic.efvText_(input), expected, JSON.stringify(input)));
  p.time.forEach(([input, expected]) => assert.deepEqual(logic.efvParseTime_(input), expected, JSON.stringify(input)));
  p.date.forEach(([input, expected]) => assert.equal(logic.efvParseDate_(input), expected, JSON.stringify(input)));
  p.decimal.forEach(([input, expected]) => assert.deepEqual(logic.efvParsePositive_(input), expected, JSON.stringify(input)));
  p.listing_key.forEach(([input, expected]) => assert.deepEqual(logic.efvListingKey_(...input), expected, JSON.stringify(input)));
  p.marker.forEach(([input, expected]) => {
    const actual = logic.efvParseBatchMarker_(input);
    assert.deepEqual(actual === logic.EFV_MARKER_INVALID_ ? 'INVALID' : actual, expected, JSON.stringify(input));
  });
});

test('every golden generation reads exactly as the Python reference reads it', () => {
  assert.ok(GOLDEN.cases.length > 150);
  GOLDEN.cases.forEach((c) => {
    const view = logic.efvReadPublishedBatch_(c.summary, () => tabOf(c));
    const expected = c.expected;
    assert.equal(view.state, expected.state, c.name);
    assert.deepEqual(view.rows, expected.rows, c.name);
    assert.equal(view.reason, expected.reason, c.name);
    assert.equal(view.detail, expected.detail, c.name);
    assert.equal(logic.efvBatchLine_(view), expected.batch_line, c.name);
    assert.deepEqual(view.rows.map(logic.efvDisplayLine_), expected.display_lines, c.name);
  });
});

test('every golden row that is shown as selected passes the snapshot checks; a tampered one never does', () => {
  GOLDEN.cases.forEach((c) => {
    c.expected.rows.forEach((row) => {
      if (row['记录状态'] !== '快照校验失败') assert.deepEqual(logic.efvSnapshotErrors_(row), [], c.name);
    });
  });
  const tampered = GOLDEN.cases.filter((c) => c.name.startsWith('tampered:'));
  assert.ok(tampered.length >= 9);
  tampered.forEach((c) => {
    assert.equal(c.expected.state, '已写入', c.name);
    assert.equal(c.expected.rows.filter((r) => r['记录状态'] === '快照校验失败').length, 1, c.name);
  });
});

// -- Reading only what the generation published -----------------------------

function countingReader(tab) {
  const calls = { count: 0 };
  return { calls, inputs: { readTab: () => { calls.count += 1; return tab; } } };
}

test('no batch line (module off or a report from before #346): nothing shown and the snapshot tab is never read', () => {
  for (const name of ['off:no_note', 'off:free_text_note', 'off:switch_blank']) {
    const c = goldenCase(name);
    const reader = countingReader(tabOf(c));
    assert.equal(logic.buildExternalFairValueView_(c.summary, reader.inputs), null, name);
    assert.equal(reader.calls.count, 0, name);
  }
  assert.equal(logic.buildExternalFairValueView_({ 报告ID: 'daily-2026-08-15' }, undefined), null);
});

test('未写入 shows only its reason and detail and never reads rows, even when rows exist under its 生成ID', () => {
  const c = goldenCase('missing:verify_fails_rows_present');
  assert.ok(c.snapshot_tab.rows.length > 0);
  const reader = countingReader(c.snapshot_tab);
  const view = logic.buildExternalFairValueView_(c.summary, reader.inputs);
  assert.equal(view.state, '未写入');
  assert.deepEqual(view.rows, []);
  assert.equal(view.batchLine, '外部公允价值：本次快照未写入（快照校验未通过：读回的批次与规划不符或同键冲突），未采用；' + NOTE);
  assert.equal(reader.calls.count, 0);
});

test('a legal 已写入 0 batch is distinct from a missing, incomplete or invalid batch', () => {
  const zero = logic.buildExternalFairValueView_(goldenCase('written:zero_holdings').summary, countingReader(null).inputs);
  assert.deepEqual([zero.state, zero.rows, zero.batchLine], ['批次不完整', [], '外部公允价值：本次快照批次不完整，未采用；' + NOTE],
    'a 0-row batch still needs a readable snapshot tab');
  const c = goldenCase('written:zero_holdings');
  const shown = logic.buildExternalFairValueView_(c.summary, countingReader(c.snapshot_tab).inputs);
  assert.deepEqual([shown.state, shown.rows, shown.batchLine], ['已写入', [], '']);
  const states = ['missing:append_fails', 'incomplete:zero_count_but_rows', 'marker_invalid:count_negative'].map((name) => {
    const m = goldenCase(name);
    return logic.buildExternalFairValueView_(m.summary, countingReader(tabOf(m)).inputs).state;
  });
  assert.deepEqual(states, ['未写入', '批次不完整', '批次标记无效']);
});

test('已写入 shows each row with value and latest-attempt evidence from one snapshot row, never mixed', () => {
  const c = goldenCase('written:mixed_with_other_note_text');
  const view = logic.buildExternalFairValueView_(c.summary, countingReader(c.snapshot_tab).inputs);
  assert.equal(view.state, '已写入');
  assert.equal(view.note, NOTE);
  assert.equal(view.rows.length, 3);
  view.rows.forEach((row) => {
    const staged = c.snapshot_tab.rows.map((cells) => Object.fromEntries(c.snapshot_tab.header.map((h, i) => [h, cells[i]])))
      .find((r) => r['代码'] === row['代码']);
    logic.EFV_SNAPSHOT_FIELDS_.forEach((name) => assert.equal(row[name], staged[name], row['代码'] + ' ' + name));
    assert.equal(row.displayLine, logic.efvDisplayLine_(staged));
    assert.ok(row.displayLine.endsWith(NOTE));
  });
});

// -- Wiring: Daily/Weekly isolation, history, compatibility -----------------

function report(type, extra) {
  const c = goldenCase(type === 'daily' ? 'written:mixed_with_other_note_text' : 'weekly:mixed');
  return Object.assign({
    一句话结论: type + ' headline', 核心状态: '正常', 生成时间: '2026-10-24T09:05:00+09:00', Review状态: '未Review'
  }, c.summary, extra || {});
}

function tabsWith(daily, weekly, snapshotRows) {
  const header = logic.EFV_SNAPSHOT_FIELDS_.slice();
  const tabs = {
    当前持仓: [], 交易记录: [], 观察名单: [], 报告摘要: [daily, weekly], 报告持仓: [], 报告风险: [], 报告待办: []
  };
  tabs[SNAPSHOT] = { header, rows: snapshotRows };
  return tabs;
}

function snapshotRows() {
  return goldenCase('written:mixed_with_other_note_text').snapshot_tab.rows.concat(goldenCase('weekly:mixed').snapshot_tab.rows);
}

test('Daily and Weekly each read their own generation; one failing never repairs or pollutes the other', () => {
  const ok = logic.buildDashboardBootstrap_(tabsWith(report('daily'), report('weekly'), snapshotRows()));
  assert.equal(ok.daily.externalFairValue.state, '已写入');
  assert.equal(ok.weekly.externalFairValue.state, '已写入');
  assert.ok(ok.daily.externalFairValue.rows.every((r) => r['报告ID'] === 'daily-2026-10-24'));
  assert.ok(ok.weekly.externalFairValue.rows.every((r) => r['报告ID'] === 'weekly-2026-10-24'));

  const weeklyOnly = snapshotRows().filter((cells) => cells[0] === 'weekly-2026-10-24');
  const dailyBroken = logic.buildDashboardBootstrap_(tabsWith(report('daily'), report('weekly'), weeklyOnly));
  assert.equal(dailyBroken.daily.externalFairValue.state, '批次不完整');
  assert.equal(dailyBroken.weekly.externalFairValue.state, '已写入');

  const both = logic.buildDashboardBootstrap_(tabsWith(
    report('daily', { 备注: ' ' + report('daily')['备注'] }),
    report('weekly', { 快照行数: 1 }),
    weeklyOnly.slice(1)));
  assert.equal(both.daily.externalFairValue.state, '批次标记无效');
  assert.equal(both.weekly.externalFairValue.state, '批次不完整');
  assert.deepEqual([both.daily.externalFairValue.rows, both.weekly.externalFairValue.rows], [[], []]);
});

test('records, the switch and later generations never change a published page; history reads its own 生成ID', () => {
  const tabs = tabsWith(report('daily'), report('weekly'), snapshotRows());
  const before = logic.getReport_(tabs, 'daily-2026-10-24');
  tabs[RECORDS] = { header: ['记录ID'], rows: [['ext-new']] };
  tabs['_安装状态'] = [{ schema_version: 10, external_fair_value_source_id: 'other_source' }];
  const later = JSON.parse(JSON.stringify(snapshotRows()[0]));
  later[1] = 'gen-daily-2';
  later[logic.EFV_SNAPSHOT_FIELDS_.indexOf('外部公允价值')] = '1';
  tabs[SNAPSHOT].rows.push(later);
  tabs['报告摘要'].push(Object.assign({}, report('daily'), { 报告ID: 'daily-2026-10-25', 报告日期: '2026-10-25', 备注: '' }));
  const after = logic.getReport_(tabs, 'daily-2026-10-24');
  assert.deepEqual(after.externalFairValue, before.externalFairValue);
  assert.equal(logic.getReport_(tabs, 'daily-2026-10-25').externalFairValue, null);
});

test('the module never changes the core report: holdings, risks, todos and reader gate are as without it', () => {
  const demo = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'demo', 'demo-sheet.json'), 'utf8'));
  const plain = logic.buildDashboardBootstrap_(demo);
  const withModule = JSON.parse(JSON.stringify(demo));
  const daily = withModule['报告摘要'].find((r) => r['报告ID'] === plain.daily.summary['报告ID']);
  daily['备注'] = '外部公允价值快照批次：{"批次状态":"未写入","来源标识":"example_source","读取截止时间":"2026-08-15T09:00:00+09:00","快照行数":2,"原因":"快照表不可用","说明":"x"}';
  const changed = logic.buildDashboardBootstrap_(withModule);
  ['holdings', 'watchlistCandidates', 'risks', 'todos', 'readerGate'].forEach((key) => {
    assert.deepEqual(changed.daily[key], plain.daily[key], key);
  });
  assert.equal(plain.daily.externalFairValue, null);
  assert.equal(changed.daily.externalFairValue.state, '未写入');
  assert.ok(!logic.SHEET_TABS_.includes(SNAPSHOT));
  assert.ok(!Object.keys(logic.REQUIRED_HEADERS_).includes(SNAPSHOT));
});

// -- Sheet cells and the Apps Script read ------------------------------------

test('cells Sheets reinterpreted read back as their written text, or fail closed', () => {
  const dateText = (d) => d.toISOString().slice(0, 19).replace('T', ' ');
  assert.equal(logic.efvCellText_(new Date('2026-10-24T00:00:00Z'), dateText), '2026-10-24');
  assert.equal(logic.efvCellText_(new Date('2026-10-24T09:00:00Z'), dateText), '2026-10-24 09:00:00');
  assert.equal(logic.efvParseTime_(logic.efvCellText_(new Date('2026-10-24T09:00:00Z'), dateText)), null);
  assert.equal(logic.efvCellText_(new Date('x'), dateText), '');
  assert.equal(logic.efvCellText_(123.4, dateText), '123.4');
  assert.equal(logic.efvCellText_(1e21, dateText), '1e+21');
  assert.equal(logic.efvParsePositive_(logic.efvCellText_(1e21, dateText)), null);
  assert.equal(logic.efvCellText_(null, dateText), '');
  assert.equal(logic.efvCellText_('  原样  ', dateText), '  原样  ');
});

test('a summary whose 报告日期 Sheets turned into a Date still matches rows written the same way', () => {
  const c = goldenCase('written:mixed_with_other_note_text');
  const summary = Object.assign({}, c.summary, { 报告日期: new Date('2026-10-24T00:00:00Z') });
  const view = logic.buildExternalFairValueView_(summary, { readTab: () => c.snapshot_tab });
  assert.equal(view.state, '已写入');
});

function fakeSpreadsheet(grid, log, throws) {
  return {
    getSpreadsheetTimeZone: () => 'Asia/Tokyo',
    getSheetByName(name) {
      log.push(name);
      if (name !== SNAPSHOT || !grid) return null;
      return { getDataRange: () => ({ getValues: () => { if (throws) throw new Error('read failed'); return grid; } }) };
    }
  };
}

test('the Apps Script read touches only the snapshot tab, once per request, and fails closed', () => {
  global.Utilities = { formatDate: (d) => d.toISOString().slice(0, 19).replace('T', ' ') };
  try {
    const log = [];
    const inputs = logic.readExternalFairValueInputs_(fakeSpreadsheet([['报告ID', '外部公允价值'], ['daily-2026-10-24', 12.5]], log));
    assert.deepEqual(log, []);
    assert.deepEqual(inputs.readTab(), { header: ['报告ID', '外部公允价值'], rows: [['daily-2026-10-24', '12.5']] });
    inputs.readTab();
    assert.deepEqual(log, [SNAPSHOT]);
    assert.equal(logic.readExternalFairValueInputs_(fakeSpreadsheet(null, [])).readTab(), null);
    assert.equal(logic.readExternalFairValueInputs_(fakeSpreadsheet([['x']], [], true)).readTab(), null);
  } finally {
    delete global.Utilities;
  }
});

// -- Rendering ---------------------------------------------------------------

function render(viewModelExtra) {
  const document = createFakeDocument();
  const daily = Object.assign({
    found: true, reportType: 'daily',
    summary: { 报告ID: 'daily-2026-10-24', 报告日期: '2026-10-24', 一句话结论: 'h', 核心状态: '正常', 当前持仓数: 0, 高优先级观察数: 0 },
    holdings: [], watchlistCandidates: [], risks: [], todos: []
  }, viewModelExtra);
  const sandbox = {
    document, window: {}, console,
    google: createGoogleScriptRunStub({}),
    IOS_BOOTSTRAP: { error: null, daily, weekly: { found: false, reportType: 'weekly' }, dailyHistory: [], weeklyHistory: [], allocation: [] },
    IOS_ACTIVE_VIEW: 'daily'
  };
  vm.createContext(sandbox);
  vm.runInContext(SCRIPT_HTML_SRC, sandbox, { filename: 'Script.html' });
  return document.getElementById('ios-tab-content');
}

function moduleSection(content) {
  return content.children.find((child) => child.classList.contains('ios-external-reference'));
}

test('the page shows nothing for a report without a batch line', () => {
  const content = render({ externalFairValue: null });
  assert.equal(moduleSection(content), undefined);
  assert.ok(!content.textContent.includes('外部公允价值'));
});

// -- Holding binding (Issue #359) -------------------------------------------

const WRITTEN = goldenCase('written:mixed_with_other_note_text');
const WRITTEN_MODULE = logic.buildExternalFairValueView_(WRITTEN.summary, { readTab: () => WRITTEN.snapshot_tab });
const SYNA = WRITTEN_MODULE.rows.find((r) => r['代码'] === 'SYNA');

function asset(code, currency) {
  return { 代码: code, 报价币种: currency };
}

function withRows(rows) {
  return Object.assign({}, WRITTEN_MODULE, { rows });
}

function bind(a, module, holdings) {
  return logic.efvHoldingRow_(a, module, holdings || [a]);
}

test('a holding binds the one frozen snapshot row of its (代码, 报价币种), which fixes the whole listing', () => {
  assert.equal(SYNA['上市市场'], 'NASDAQ');
  assert.equal(bind(asset('SYNA', 'USD'), WRITTEN_MODULE), SYNA);
  assert.equal(bind(asset(' ｓｙｎａ ', 'usd'), WRITTEN_MODULE), SYNA, 'NFKC, trimming and upper-casing, nothing else');
  assert.equal(bind(asset('SYNA', 'USD'), WRITTEN_MODULE, [asset('SYNA', 'USD'), asset('SYNA', 'JPY')]), SYNA,
    'another currency is another listing');
});

test('two frozen listings of one (代码, 报价币种) bind nothing: 报告持仓 freezes no market to choose between them', () => {
  const nyse = Object.assign({}, SYNA, { 上市市场: 'NYSE', 外部公允价值: '999' });
  assert.equal(bind(asset('SYNA', 'USD'), withRows([SYNA, nyse])), null);
  assert.equal(bind(asset('SYNA', 'USD'), withRows([nyse, SYNA])), null);
  assert.equal(bind(asset('SYNA', 'USD'), withRows([SYNA, Object.assign({}, SYNA)])), null, 'whole listing twice');
  assert.equal(bind(asset('SYNA', 'USD'), WRITTEN_MODULE, [asset('SYNA', 'USD'), asset('syna', 'USD')]), null,
    'two holdings of the generation share it');
});

test('a currency mismatch or a missing identity field never binds a row', () => {
  assert.equal(bind(asset('SYNA', 'JPY'), WRITTEN_MODULE), null);
  assert.equal(bind(asset('SYNA', 'USD'), withRows([Object.assign({}, SYNA, { 报价币种: 'JPY' })])), null);
  assert.equal(bind(asset('', 'USD'), WRITTEN_MODULE), null);
  assert.equal(bind(asset('SYNA', ''), WRITTEN_MODULE), null);
  assert.equal(bind(asset('SYNA', 'USD'), withRows([Object.assign({}, SYNA, { 上市市场: '' })])), null);
  assert.equal(bind(asset('SYNC', 'USD'), WRITTEN_MODULE), null, 'no snapshot row');
});

test('no batch, an unpublished batch and FUND-SLEEVE bind nothing', () => {
  assert.equal(bind(asset('SYNA', 'USD'), null), null);
  ['未写入', '批次不完整', '批次标记无效'].forEach((state) => {
    assert.equal(bind(asset('SYNA', 'USD'), Object.assign({}, WRITTEN_MODULE, { state })), null, state);
  });
  assert.equal(bind(asset('FUND-SLEEVE', 'USD'), withRows([Object.assign({}, SYNA, { 代码: 'FUND-SLEEVE' })])), null);
});

function reportAsset(type, code, currency) {
  const c = goldenCase(type === 'daily' ? 'written:mixed_with_other_note_text' : 'weekly:mixed');
  return { 报告ID: c.summary['报告ID'], 生成ID: c.summary['生成ID'], 报告类型: type, 报告日期: c.summary['报告日期'],
    资产类型: 'holding', 代码: code, 名称: 'Example', 报价币种: currency, 排序: 1 };
}

function cell(cells, name) {
  return cells[logic.EFV_SNAPSHOT_FIELDS_.indexOf(name)];
}

function setCell(cells, name, value) {
  cells[logic.EFV_SNAPSHOT_FIELDS_.indexOf(name)] = value;
}

function bindingTabs() {
  const rows = snapshotRows().map((cells) => cells.slice());
  const tabs = tabsWith(report('daily'), report('weekly'), rows);
  tabs['报告持仓'] = [reportAsset('daily', 'SYNA', 'USD'), reportAsset('weekly', 'SYNA', 'USD'),
    Object.assign(reportAsset('daily', 'SYNA', 'USD'), { 资产类型: 'watchlist' })];
  return { tabs, rows };
}

function bound(vm, type) {
  const fv = vm[type].holdings[0]._iosExternalFairValue;
  return fv ? [fv['报告ID'], fv['上市市场'], fv['外部公允价值']] : null;
}

test('the ledger is never read: deleting, selling, moving or adding a holding leaves every published page as it was', () => {
  const { tabs } = bindingTabs();
  const before = logic.buildDashboardBootstrap_(tabs);
  const history = logic.getReport_(tabs, 'daily-2026-10-24');
  assert.deepEqual(bound(before, 'daily'), ['daily-2026-10-24', 'NASDAQ', '123.45']);
  assert.deepEqual(bound(before, 'weekly'), ['weekly-2026-10-24', 'NASDAQ', '123.45']);
  [
    [],
    [{ 代码: 'SYNA', 名称: 'x', 市场: 'NASDAQ', 持有数量: 0, 币种: 'USD', 状态: '已卖出' }],
    [{ 代码: 'SYNA', 名称: 'x', 市场: 'NYSE', 持有数量: 5, 币种: 'USD', 状态: '持有' }],
    [{ 代码: 'SYNA', 名称: 'x', 市场: 'NASDAQ', 持有数量: 5, 币种: 'USD', 状态: '持有' },
      { 代码: 'SYNA', 名称: 'x', 市场: 'NYSE', 持有数量: 5, 币种: 'USD', 状态: '持有' }]
  ].forEach((ledgerRows, i) => {
    tabs['当前持仓'] = ledgerRows;
    const after = logic.buildDashboardBootstrap_(tabs);
    assert.deepEqual(after.daily.holdings, before.daily.holdings, i);
    assert.deepEqual(after.weekly.holdings, before.weekly.holdings, i);
    assert.deepEqual(logic.getReport_(tabs, 'daily-2026-10-24').holdings, history.holdings, i);
  });
  assert.ok(!logic.efvHoldingRow_.toString().includes('当前持仓'));
});

test('a frozen snapshot with the same 代码 and 报价币种 on two markets never binds either, whatever the ledger says now', () => {
  const { tabs, rows } = bindingTabs();
  const dailySynb = rows.find((cells) => cells[0] === 'daily-2026-10-24' && cell(cells, '代码') === 'SYNB');
  assert.equal(cell(dailySynb, '上市市场'), 'NYSE');
  setCell(dailySynb, '代码', 'SYNA');
  tabs['当前持仓'] = [{ 代码: 'SYNA', 名称: 'x', 市场: 'NYSE', 持有数量: 5, 币种: 'USD', 状态: '持有' }];
  const vm = logic.buildDashboardBootstrap_(tabs);
  assert.equal(vm.daily.externalFairValue.state, '已写入');
  assert.equal(vm.daily.externalFairValue.rows.filter((r) => r['代码'] === 'SYNA').length, 2);
  assert.equal(bound(vm, 'daily'), null);
  assert.deepEqual(bound(vm, 'weekly'), ['weekly-2026-10-24', 'NASDAQ', '123.45'], 'weekly keeps its own single listing');
});

test('each report binds its own frozen listing and value; latest and history never leak into each other', () => {
  const { tabs, rows } = bindingTabs();
  const weeklySyna = rows.find((cells) => cells[0] === 'weekly-2026-10-24' && cell(cells, '代码') === 'SYNA');
  setCell(weeklySyna, '外部公允价值', '88');
  setCell(weeklySyna, '上市市场', 'NYSE');
  const vm = logic.buildDashboardBootstrap_(tabs);
  assert.equal(vm.weekly.externalFairValue.state, '已写入');
  assert.deepEqual(bound(vm, 'daily'), ['daily-2026-10-24', 'NASDAQ', '123.45']);
  assert.deepEqual(bound(vm, 'weekly'), ['weekly-2026-10-24', 'NYSE', '88']);
  assert.deepEqual(bound({ h: logic.getReport_(tabs, 'daily-2026-10-24') }, 'h'), ['daily-2026-10-24', 'NASDAQ', '123.45']);
  assert.deepEqual(bound({ h: logic.getReport_(tabs, 'weekly-2026-10-24') }, 'h'), ['weekly-2026-10-24', 'NYSE', '88']);
  assert.equal(vm.daily.watchlistCandidates[0]._iosExternalFairValue, undefined);
});

// -- Rendering the compact line (Issue #359) ---------------------------------

function threeLayer(row) {
  return { 代码: row['代码'], 报价币种: row['报价币种'], 名称: 'Example', 当前价格: '110',
    今日行动: '等待', _iosPurchaseMode: 'three_layer', _iosThreeLayer: true, 长期合理价值: '10–20 USD',
    长期买入上限快照: '12', _iosOrderable: { ok: true, message: null }, _iosExternalFairValue: row };
}

function legacy(row) {
  return { 代码: row['代码'], 报价币种: row['报价币种'], 名称: 'Example', IOS状态: '持有', 当前价格: '110',
    '参考买入价/区间': '100-120', 价格位置: '区间内', 关键变化: '无', _iosExternalFairValue: row };
}

function cardLines(content) {
  const section = content.children[0];
  const card = section.children.find((child) => child.classList && child.classList.contains('ios-card-grid')).children[0];
  return card.children.map((line) => line.textContent);
}

function fairLine(content) {
  return cardLines(content).find((line) => line.startsWith('公允值'));
}

test('three-layer cards show one compact line between 基准估值 and 长期买入上限: value, currency, source, date', () => {
  const content = render({ holdings: [threeLayer(SYNA)], externalFairValue: WRITTEN_MODULE });
  const lines = cardLines(content);
  const at = lines.indexOf('公允值（已读取，最近一次采集失败）: 123.45 USD · Example Source · 获取 2026-10-20');
  assert.notEqual(at, -1, lines.join('\n'));
  assert.ok(lines[at - 1].startsWith('基准估值（长期合理价值）'));
  assert.ok(lines[at + 1].startsWith('长期买入上限'));
  assert.ok(!content.textContent.includes('模型'));
  assert.ok(!content.textContent.includes('example.invalid'));
});

test('legacy cards show the same line in the price area', () => {
  const lines = cardLines(render({ holdings: [legacy(SYNA)], externalFairValue: WRITTEN_MODULE }));
  const at = lines.indexOf('公允值（已读取，最近一次采集失败）: 123.45 USD · Example Source · 获取 2026-10-20');
  assert.notEqual(at, -1, lines.join('\n'));
  assert.ok(lines[at - 2].startsWith('价格'));
  assert.ok(lines[at + 1].startsWith('变化'));
});

test('a holding Code.gs did not bind, a watchlist candidate and FUND-SLEEVE show no line', () => {
  const unbound = Object.assign(threeLayer(SYNA), { _iosExternalFairValue: undefined });
  assert.equal(fairLine(render({ holdings: [unbound], externalFairValue: WRITTEN_MODULE })), undefined);
  const watch = render({ watchlistCandidates: [threeLayer(SYNA)], externalFairValue: WRITTEN_MODULE });
  assert.ok(!watch.textContent.includes('公允值'));
  const sleeve = Object.assign(threeLayer(SYNA), { 代码: 'FUND-SLEEVE' });
  assert.ok(!render({ holdings: [sleeve], externalFairValue: WRITTEN_MODULE }).textContent.includes('公允值'));
});

test('an unpublished batch shows only 未采用 and never a number, even on a bound holding', () => {
  ['未写入', '批次不完整', '批次标记无效'].forEach((state) => {
    const content = render({ holdings: [threeLayer(SYNA)], externalFairValue: { state, rows: [] } });
    assert.equal(fairLine(content), '公允值: 未采用', state);
    assert.ok(!content.textContent.includes('123.45'), state);
  });
});

test('statuses: 已读取 is plain; stale, latest-failed and latest-unsupported keep a short label; the rest never adopt a value', () => {
  const read = Object.assign({}, SYNA, { 记录状态: '已读取' });
  const line = (row) => fairLine(render({ holdings: [threeLayer(row)], externalFairValue: withRows([row]) }));
  assert.equal(line(read), '公允值: 123.45 USD · Example Source · 获取 2026-10-20');
  assert.equal(line(Object.assign({}, read, { 采集新鲜度: '过期' })), '公允值（过期）: 123.45 USD · Example Source · 获取 2026-10-20');
  assert.equal(line(Object.assign({}, SYNA, { 采集新鲜度: '过期' })),
    '公允值（已读取，最近一次采集失败，过期）: 123.45 USD · Example Source · 获取 2026-10-20');
  assert.equal(line(Object.assign({}, read, { 记录状态: '已读取，最新记录版本不支持' })),
    '公允值（已读取，最新记录版本不支持）: 123.45 USD · Example Source · 获取 2026-10-20');
  ['读取失败', '无记录', '记录异常', '快照校验失败', '消费读取失败', '协议版本不支持', '未覆盖', '币种或证券不匹配'].forEach((status) => {
    const shown = line(Object.assign({}, SYNA, { 记录状态: status }));
    assert.equal(shown, '公允值（' + status + '）: 未采用', status);
  });
});

test('a missing source name or fetch time leaves no stray separator', () => {
  const read = Object.assign({}, SYNA, { 记录状态: '已读取' });
  const line = (row) => fairLine(render({ holdings: [threeLayer(row)], externalFairValue: withRows([row]) }));
  assert.equal(line(Object.assign({}, read, { 来源名称: '', 值记录获取时间: '' })), '公允值: 123.45 USD · example_source');
  assert.equal(line(Object.assign({}, read, { 来源名称: '', 来源标识: '', 值记录获取时间: '' })), '公允值: 123.45 USD');
  assert.equal(line(Object.assign({}, SYNA, { 记录状态: '读取失败', 来源名称: '', 来源标识: '', 外部公允价值: '' })), '公允值（读取失败）: 未采用');
});

test('neither standalone fair value section is rendered any more', () => {
  const content = render({ holdings: [threeLayer(SYNA)], externalFairValue: WRITTEN_MODULE });
  assert.equal(moduleSection(content), undefined);
  assert.ok(!content.textContent.includes('外部公允价值（第三方参考）'));
  assert.ok(!SCRIPT_HTML_SRC.includes('buildExternalFairValueSection_'));
  assert.ok(!SCRIPT_HTML_SRC.includes('buildExternalFairValueCard_'));
});

test('styles wrap the compact line on narrow screens', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'Styles.html'), 'utf8');
  assert.match(css, /\.ios-inline-fair-value \{ overflow-wrap: anywhere; \}/);
  assert.ok(!css.includes('.ios-external-reference'));
});
