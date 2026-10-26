// Issue #352 (#342 P5): the Dashboard's read-only external fair value
// portfolio comparison. Code.gs ports read_published_portfolio and
// portfolio_line from tests/external_fair_value_portfolio_spec.py; the golden
// file below is generated from that Python reference by
// tests/test_external_fair_value_portfolio_p5.py, so the two cannot drift
// apart without a suite failing. The rest checks the wiring: only the frozen
// aggregate is shown, it is replayed against the generation's own snapshot
// rows, Daily and Weekly stay separate and the page renders it apart from
// every IOS conclusion.
//
// Run: node --test integrations/google-apps-script/ios-dashboard/test/external-fair-value-portfolio-reader.test.js

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { createFakeDocument, createGoogleScriptRunStub } = require('./fake-dom');

const logic = require(path.join(__dirname, '..', 'Code.gs'));
const GOLDEN = JSON.parse(fs.readFileSync(path.join(__dirname, 'external-fair-value-portfolio-golden.json'), 'utf8'));
const SCRIPT_HTML_SRC = fs.readFileSync(path.join(__dirname, '..', 'Script.html'), 'utf8');

const SNAPSHOT = '外部公允价值快照';
const NOTE = '第三方参考，不改变购买计划或今日行动';

function goldenCase(name) {
  const found = GOLDEN.cases.find((c) => c.name === name);
  assert.ok(found, name);
  return JSON.parse(JSON.stringify(found));
}

function tabOf(c) {
  return c.snapshot_tab === 'READ_FAILURE' ? null : c.snapshot_tab;
}

function itemsOf(view) {
  return view.body ? view.body['明细'].map((i) => [i['代码'], i['上市市场'], i['结果'], i['原因'], i['模型新鲜度'], logic.pfItemLine_(i)]) : [];
}

// -- Parity with the Python reference ---------------------------------------

test('every golden case reads to the same state, line and items as the Python reference', () => {
  assert.ok(GOLDEN.cases.length >= 70);
  GOLDEN.cases.forEach((c) => {
    const view = logic.pfReadPublishedPortfolio_(c.summary, () => tabOf(c));
    assert.equal(view.state, c.expected.state, c.name);
    assert.equal(logic.pfPortfolioLine_(view), c.expected.line, c.name);
    assert.deepEqual(itemsOf(view), c.expected.items, c.name);
  });
});

test('every tampered aggregate is rejected as a whole, never partly shown', () => {
  const tampered = GOLDEN.cases.filter((c) => c.name.startsWith('tampered:'));
  assert.ok(tampered.length >= 20);
  tampered.forEach((c) => {
    assert.equal(c.expected.state, '批次不一致', c.name);
    assert.deepEqual(c.expected.items, [], c.name);
  });
});

test('every exclusion, count or frozen input rewritten in the body is rejected, never re-derived from the claim', () => {
  const excluded = GOLDEN.cases.filter((c) => c.name.startsWith('excluded:'));
  assert.ok(excluded.length >= 20);
  excluded.forEach((c) => {
    assert.ok(['批次不一致', '批次标记无效'].includes(c.expected.state), c.name);
    assert.deepEqual(c.expected.items, [], c.name);
  });
  ['excluded:legal reason swapped (价格缺失 -> 持仓重复)', 'excluded:fund count rewritten', 'excluded:non-positive count rewritten',
    'excluded:holding row of an excluded listing dropped', 'excluded:out-of-scope holding added'].forEach((name) => {
    assert.equal(goldenCase(name).expected.state, '批次不一致', name);
  });
});

// -- Line length: one limit, counted in code points ------------------------

const MISSING_BODY = { 批次状态: '未写入', 计算版本: '1', 报告币种: 'JPY', 来源标识: 'example_source',
  读取截止时间: '2026-10-24T09:00:00+09:00', 原因: '批次过长', 说明: '' };

function missingLine(length, filler, tail) {
  const base = logic.pfLineLength_('外部公允价值组合批次：' + JSON.stringify(MISSING_BODY));
  const pad = length - base - logic.pfLineLength_(tail);
  return '外部公允价值组合批次：' + JSON.stringify(Object.assign({}, MISSING_BODY, { 说明: filler.repeat(pad) + tail }));
}

test('the reader bounds the line at 40000 code points, as the Python reference does', () => {
  assert.equal(logic.PF_MAX_LINE_CHARS_, 40000);
  for (const [filler, tail] of [['x', ''], ['说', ''], ['x', '\u{2000B}'.repeat(100)]]) {
    for (const [length, state] of [[39999, '未写入'], [40000, '未写入'], [40001, '批次标记无效']]) {
      const line = missingLine(length, filler, tail);
      assert.equal(logic.pfLineLength_(line), length);
      const view = logic.pfReadPublishedPortfolio_({ 备注: line }, () => null);
      assert.equal(view.state, state, filler + ' ' + tail.length + ' ' + length);
    }
  }
  const supplementary = missingLine(40000, 'x', '\u{2000B}'.repeat(100));
  assert.ok(supplementary.length > 40000, 'UTF-16 units are not the measure');
  assert.equal(logic.pfReadPublishedPortfolio_({ 备注: supplementary }, () => null).state, '未写入');
});

test('a replayable 已写入 line injected past the writer over the limit is rejected', () => {
  const c = goldenCase('length:written over the limit');
  const line = c.summary['备注'].split('\n').find((l) => l.startsWith('外部公允价值组合批次：'));
  assert.ok(logic.pfLineLength_(line) > 40000);
  assert.equal(c.expected.state, '批次标记无效');
  const body = JSON.parse(line.slice('外部公允价值组合批次：'.length));
  const rows = logic.efvReadPublishedBatch_(c.summary, () => c.snapshot_tab).rows;
  assert.equal(logic.pfReplayFails_(body, rows), false, 'consistent in every other way');
  assert.equal(logic.pfReadPublishedPortfolio_(c.summary, () => c.snapshot_tab).state, '批次标记无效');
});

test('partial coverage is labelled as partial and never as whole-portfolio fair value', () => {
  const partial = goldenCase('scenario:partial_coverage');
  assert.ok(partial.expected.line.includes('仅覆盖部分，不是组合整体公允价值'));
  const zero = goldenCase('scenario:zero_coverage');
  assert.ok(zero.expected.line.includes('不显示合计'));
  GOLDEN.cases.filter((c) => c.expected.state === '已写入').forEach((c) => {
    const labels = ['（范围内全部证券）', '（仅覆盖部分，不是组合整体公允价值）', '不显示合计'].filter((l) => c.expected.line.includes(l));
    assert.equal(labels.length, 1, c.name);
  });
});

test('decimal helpers match the reference text exactly', () => {
  const d = (n, sc) => ({ n: BigInt(n), s: sc });
  assert.equal(logic.pfFixedText_(d(2345, 3), 2), '2.34');
  assert.equal(logic.pfFixedText_(d(2355, 3), 2), '2.36');
  assert.equal(logic.pfFixedText_(d(-5, 3), 2), '0.00');
  assert.equal(logic.pfFixedText_(d(15, 0), 2), '15.00');
  assert.equal(logic.pfRatioText_(d(1, 0), d(3, 0), 4), '0.3333');
  assert.equal(logic.pfDecimalText_(d(28005, 1)), '2800.5');
  assert.equal(logic.pfDecimalText_(d(-12000, 3)), '-12');
});

// -- Wiring ------------------------------------------------------------------

function countingReader(tab) {
  const calls = { count: 0 };
  return { calls, inputs: { readTab: () => { calls.count += 1; return tab; } } };
}

test('module off: nothing shown and the snapshot tab is never read for the aggregate', () => {
  for (const name of ['scenario:off_blank', 'scenario:off_absent', 'scenario:off_without_fair_value']) {
    const c = goldenCase(name);
    const reader = countingReader(tabOf(c));
    assert.equal(logic.buildExternalFairValuePortfolioView_(c.summary, reader.inputs), null, name);
    assert.equal(reader.calls.count, 0, name);
  }
  assert.equal(logic.buildExternalFairValuePortfolioView_({ 报告ID: 'daily-2026-08-15' }, undefined), null);
});

test('未写入 shows only its reason and never reads the snapshot tab', () => {
  const c = goldenCase('scenario:currency_invalid');
  const reader = countingReader(tabOf(c));
  const view = logic.buildExternalFairValuePortfolioView_(c.summary, reader.inputs);
  assert.deepEqual([view.state, view.items], ['未写入', []]);
  assert.equal(view.line, c.expected.line);
  assert.equal(reader.calls.count, 0);
});

test('the view model carries the frozen line and items for 已写入', () => {
  const c = goldenCase('scenario:partial_coverage');
  const view = logic.buildExternalFairValuePortfolioView_(c.summary, { readTab: () => c.snapshot_tab });
  assert.equal(view.state, '已写入');
  assert.equal(view.line, c.expected.line);
  assert.deepEqual(view.items.map((i) => [i.code, i.market, i.result, i.reason, i.modelFreshness, i.line]), c.expected.items);
});

test('an unknown model date is disclosed on the portfolio line and on covered items only', () => {
  const c = goldenCase('scenario:partial_coverage');
  const view = logic.buildExternalFairValuePortfolioView_(c.summary, { readTab: () => c.snapshot_tab });
  assert.ok(view.line.includes('其中 2 只模型日期未提供（模型新鲜度未知）'));
  const byCode = Object.fromEntries(view.items.map((i) => [i.code, i]));
  assert.equal(byCode.AAA.modelFreshness, '未提供');
  assert.equal(byCode.AAA.line, 'AAA · NASDAQ · 已覆盖；模型日期未提供，模型新鲜度未知');
  assert.equal(byCode.BBB.line, 'BBB · NYSE · 未覆盖（公允价值未采用）');
  assert.equal(goldenCase('tampered:unknown model date relabelled fresh').expected.state, '批次不一致');
});

test('a summary whose 报告日期 Sheets turned into a Date still replays against its own rows', () => {
  const c = goldenCase('scenario:full_coverage');
  const summary = Object.assign({}, c.summary, { 报告日期: new Date('2026-10-24T00:00:00Z') });
  assert.equal(logic.buildExternalFairValuePortfolioView_(summary, { readTab: () => c.snapshot_tab }).state, '已写入');
});

function report(c, extra) {
  return Object.assign({
    一句话结论: 'headline', 核心状态: '正常', 生成时间: '2026-10-24T09:05:00+09:00', Review状态: '未Review'
  }, c.summary, extra || {});
}

function tabsWith(daily, weekly, snapshot) {
  const tabs = { 当前持仓: [], 交易记录: [], 观察名单: [], 报告摘要: [daily, weekly], 报告持仓: [], 报告风险: [], 报告待办: [] };
  tabs[SNAPSHOT] = snapshot;
  return tabs;
}

test('Daily and Weekly read only their own generation; a weekly failure never touches the daily view', () => {
  const daily = goldenCase('scenario:full_coverage');
  const weeklySummary = { 报告ID: 'weekly-2026-10-24', 生成ID: 'gen-weekly-1', 报告类型: 'weekly', 报告日期: '2026-10-24',
    备注: daily.summary['备注'] };
  const boot = logic.buildDashboardBootstrap_(tabsWith(report(daily), report({ summary: weeklySummary }), daily.snapshot_tab));
  assert.equal(boot.daily.externalFairValuePortfolio.state, '已写入');
  assert.equal(boot.daily.externalFairValuePortfolio.line, daily.expected.line);
  assert.equal(boot.weekly.externalFairValuePortfolio.state, '批次不一致', 'weekly has no rows of its own');
});

test('later generations and other tabs never change a published page', () => {
  const c = goldenCase('scenario:full_coverage');
  const weekly = { 报告ID: 'weekly-2026-10-24', 生成ID: 'gen-weekly-1', 报告类型: 'weekly', 报告日期: '2026-10-24', 备注: '' };
  const tabs = tabsWith(report(c), report({ summary: weekly }), c.snapshot_tab);
  const before = logic.getReport_(tabs, 'daily-2026-10-24');
  const later = c.snapshot_tab.rows[0].slice();
  later[1] = 'gen-daily-2';
  tabs[SNAPSHOT].rows.push(later);
  tabs['当前持仓'] = [{ 代码: 'AAA', 上市市场: 'NASDAQ', 持仓数量: '999' }];
  tabs['_安装状态'] = [{ schema_version: 11, external_fair_value_report_currency: 'USD' }];
  tabs['报告摘要'].push(Object.assign({}, report(c), { 报告ID: 'daily-2026-10-25', 报告日期: '2026-10-25', 备注: '' }));
  assert.deepEqual(logic.getReport_(tabs, 'daily-2026-10-24').externalFairValuePortfolio, before.externalFairValuePortfolio);
  assert.equal(logic.getReport_(tabs, 'daily-2026-10-25').externalFairValuePortfolio, null);
});

test('the module never changes the core report', () => {
  const demo = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'demo', 'demo-sheet.json'), 'utf8'));
  const plain = logic.buildDashboardBootstrap_(demo);
  const withModule = JSON.parse(JSON.stringify(demo));
  const daily = withModule['报告摘要'].find((r) => r['报告ID'] === plain.daily.summary['报告ID']);
  daily['备注'] = goldenCase('scenario:currency_invalid').summary['备注'];
  const changed = logic.buildDashboardBootstrap_(withModule);
  ['holdings', 'watchlistCandidates', 'risks', 'todos', 'readerGate'].forEach((key) => {
    assert.deepEqual(changed.daily[key], plain.daily[key], key);
  });
  assert.equal(plain.daily.externalFairValuePortfolio, null);
  assert.equal(changed.daily.externalFairValuePortfolio.state, '未写入');
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

function sections(content) {
  return content.children.filter((child) => child.classList.contains('ios-external-reference'));
}

test('the page shows nothing for a report without the aggregate', () => {
  const content = render({ externalFairValue: null, externalFairValuePortfolio: null });
  assert.equal(sections(content).length, 0);
  assert.ok(!content.textContent.includes('外部公允价值组合对照'));
});

test('the aggregate is still strictly read into the view model but no longer rendered (Issue #359)', () => {
  ['scenario:partial_coverage', 'scenario:currency_invalid', 'tampered:total', 'marker:two lines'].forEach((name) => {
    const c = goldenCase(name);
    const module = logic.buildExternalFairValuePortfolioView_(c.summary, { readTab: () => tabOf(c) });
    assert.equal(module.state, c.expected.state, name);
    assert.equal(module.line, c.expected.line, name);
    const content = render({ externalFairValue: null, externalFairValuePortfolio: module });
    assert.equal(sections(content).length, 0, name);
    assert.ok(!content.textContent.includes('外部公允价值组合对照'), name);
    assert.ok(!content.textContent.includes(module.line), name);
  });
  assert.ok(!SCRIPT_HTML_SRC.includes('buildExternalFairValuePortfolioSection_'));
  assert.ok(!SCRIPT_HTML_SRC.includes('externalFairValuePortfolio'));
});
