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

test('已写入 renders one card per holding in a separate third-party section, after the IOS holdings', () => {
  const c = goldenCase('written:mixed_with_other_note_text');
  const module = logic.buildExternalFairValueView_(c.summary, { readTab: () => c.snapshot_tab });
  const content = render({ externalFairValue: module });
  const section = moduleSection(content);
  assert.equal(content.children.indexOf(section), 1, 'after 当前持仓, before 本期观察候选');
  assert.ok(section.textContent.startsWith('外部公允价值（第三方参考）' + NOTE));
  const cards = section.children[2].children;
  assert.equal(cards.length, module.rows.length);
  cards.forEach((card, i) => {
    assert.ok(card.classList.contains('ios-external-card'));
    assert.ok(!card.classList.contains('ios-watchlist-card'));
    assert.ok(card.textContent.includes(module.rows[i].displayLine));
    assert.ok(card.textContent.includes(module.rows[i]['记录状态']));
    assert.ok(card.textContent.includes('来源 ' + module.rows[i]['来源标识']));
  });
});

test('a range and a latest-attempt failure note are shown only when the snapshot row carries them', () => {
  const ranged = GOLDEN.cases.flatMap((c) => c.expected.rows).find((r) => r['外部区间下沿'] !== '');
  const failed = GOLDEN.cases.flatMap((c) => c.expected.rows).find((r) => r['最近尝试失败说明'] !== '');
  const rows = [ranged, failed].map((r) => Object.assign({}, r, { displayLine: logic.efvDisplayLine_(r) }));
  const section = moduleSection(render({ externalFairValue: { state: '已写入', batchLine: '', note: NOTE, rows } }));
  const [rangeCard, failedCard] = section.children[2].children;
  assert.ok(rangeCard.textContent.includes('外部区间 ' + ranged['外部区间下沿'] + ' – ' + ranged['外部区间上沿']));
  assert.ok(failedCard.textContent.includes('最近尝试说明：' + failed['最近尝试失败说明']));
  assert.ok(!failedCard.textContent.includes('外部区间'));
});

test('未写入, 批次不完整, 批次标记无效 and 已写入 0 each render one module-local line and no card', () => {
  const cases = {
    'missing:append_fails': '外部公允价值：本次快照未写入（快照写入失败：追加写入失败或写入工具不支持原子追加），未采用；' + NOTE,
    'incomplete:row_missing': '外部公允价值：本次快照批次不完整，未采用；' + NOTE,
    'marker_invalid:two_lines': '外部公允价值：本次快照批次标记无效，未采用；' + NOTE,
    'written:zero_holdings': '本次快照已写入 0 行：生成时没有适用持仓。'
  };
  Object.entries(cases).forEach(([name, line]) => {
    const c = goldenCase(name);
    const module = logic.buildExternalFairValueView_(c.summary, { readTab: () => tabOf(c) });
    const section = moduleSection(render({ externalFairValue: module }));
    assert.equal(section.children.length, 3, name);
    assert.equal(section.children[2].textContent, line, name);
  });
});

test('styles keep the module visually apart and wrap long values on narrow screens', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'Styles.html'), 'utf8');
  assert.match(css, /\.ios-external-reference \{ border-style: dashed;/);
  assert.match(css, /\.ios-external-card \.ios-asset-line, \.ios-external-card \.ios-asset-name, \.ios-external-batch \{ overflow-wrap: anywhere; \}/);
  assert.match(css, /@media \(max-width: 720px\) \{\n  \.ios-card-grid \{ grid-template-columns: minmax\(0, 1fr\); \}/);
});
