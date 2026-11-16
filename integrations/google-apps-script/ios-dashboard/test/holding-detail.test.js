// Tests for the 持仓明细 tab (Issue #388 PR A): buildHoldingDetailView_ in
// Code.gs (估值约束 / 本周执行 / 第三方公允值 from the report's own snapshot,
// same-currency-only distance, 未提供/未比较 fallbacks, filters) and its
// rendering in Script.html (three separate groups, the cap never next to the
// weekly range, filters, history reports). Same plain node:test discipline.
//
// Run: node integrations/google-apps-script/ios-dashboard/test/holding-detail.test.js

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { createFakeDocument, createGoogleScriptRunStub } = require('./fake-dom');

const logic = require(path.join(__dirname, '..', 'Code.gs'));
const SCRIPT_HTML_SRC = fs.readFileSync(path.join(__dirname, '..', 'Script.html'), 'utf8');
const demoSheet = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'demo', 'demo-sheet.json'), 'utf8'));
const T = logic.HOLDING_DETAIL_TEXT_;

function assetRow(overrides) {
  return Object.assign({
    报告ID: 'weekly-2026-11-09', 生成ID: 'g-current', 报告类型: 'weekly', 报告日期: '2026-11-09',
    资产类型: 'holding', 代码: 'AAA', 名称: 'Alpha Co.', 排序: 1,
    入场计划ID: 'ep-aaa-v3', 入场计划版本: 3, 当前价格: 365, 报价币种: 'USD',
    计划买入下限: '350 USD（区间1，本周购买计划）', 计划买入上限: '380 USD（区间1，本周购买计划）',
    周计划ID: 'wp-aaa-7', 周计划版本: 7, 周计划状态: '有效', 周计划结论: '有购买区间',
    周计划适用周: '2026-11-10–2026-11-14 NYSE', 长期合理价值: '420–480 USD', 长期买入上限快照: 400,
    估值研究日期快照: '2026-09-30', 暂停事件载荷: '', 已核验暂停记录ID: '[]'
  }, overrides || {});
}

const EFV_ROW = {
  记录状态: '已读取', 采集新鲜度: '新鲜', 外部公允价值: '410.5', 报价币种: 'USD',
  来源名称: 'external-source', 值记录获取时间: '2026-11-08T09:00:00+09:00'
};

function detail(overrides, module) {
  return logic.buildHoldingDetailRow_(assetRow(overrides), module === undefined ? null : module);
}

test('a three-layer row fills all three groups from its own snapshot', () => {
  const row = detail({ _iosExternalFairValue: EFV_ROW }, { state: '已写入' });
  assert.equal(row.kind, 'holding');
  assert.equal(row.valuation.cap, '400 USD');
  assert.equal(row.valuation.fairValue, '420–480 USD');
  assert.equal(row.valuation.source, '入场计划 v3');
  assert.equal(row.valuation.researchDate, '2026-09-30');
  assert.deepEqual(row.valuation.distance, { compared: true, percent: -8.8, text: '现价 365 USD，低于上限 8.8%' });
  assert.equal(row.weekly.week, '2026-11-10–2026-11-14 NYSE');
  assert.equal(row.weekly.status, '有效');
  assert.equal(row.weekly.range, '350 USD（区间1，本周购买计划） – 380 USD（区间1，本周购买计划）');
  assert.deepEqual(row.efv, { shown: true, value: '410.5 USD', source: 'external-source', fetched: '2026-11-08', states: [] });
  assert.deepEqual(row.filters, { hasRange: true, suspended: false, valuationMissing: false });
});

test('the distance is computed only for numbers in the same currency', () => {
  assert.equal(detail({ 当前价格: 420 }).valuation.distance.text, '现价 420 USD，高于上限 5%');
  assert.equal(detail({ 当前价格: 400 }).valuation.distance.text, '现价 400 USD，与上限持平');
  assert.deepEqual(detail({ 报价币种: 'JPY' }).valuation.distance, { compared: false, text: T.currencyDiffers });
  assert.deepEqual(detail({ 当前价格: '' , 报价币种: '' }).valuation.distance, { compared: false, text: T.noPrice });
  assert.deepEqual(detail({ 长期买入上限快照: '' }).valuation.distance, { compared: false, text: T.noCap });
});

test('the cap currency comes only from the exact 长期合理价值 snapshot shape, else 未比较', () => {
  ['', '约 420 美元', '420–480', '420–480 usd', '合理价值 420–480 USD'].forEach((fairValue) => {
    const row = detail({ 长期合理价值: fairValue });
    assert.deepEqual(row.valuation.distance, { compared: false, text: T.capCurrencyUnknown }, fairValue);
    assert.equal(row.valuation.cap, '400 （币种未提供）', fairValue);
  });
  assert.equal(detail({ 长期合理价值: '1,200.5-1,500 JPY', 报价币种: 'JPY', 当前价格: 1100, 长期买入上限快照: 1230 }).valuation.cap, '1230 JPY');
});

test('no range: suspended, valuation missing, waiting, expired and incomplete each say why', () => {
  const payload = JSON.stringify([{ 暂停记录ID: 'AAA|业绩或指引|x', 代码: 'AAA' }]);
  const cases = [
    [{ 周计划状态: '事件暂停' }, '暂停中', { hasRange: false, suspended: true, valuationMissing: false }],
    [{ 暂停事件载荷: payload }, '暂停中', { hasRange: false, suspended: true, valuationMissing: false }],
    [{ 暂停事件载荷: 'not json' }, '未比较（暂停载荷不可读）', { hasRange: false, suspended: false, valuationMissing: false }],
    [{ 周计划结论: '长期估值缺失或失效', 长期买入上限快照: '' }, '估值缺失', { hasRange: false, suspended: false, valuationMissing: true }],
    [{ 周计划状态: '已过期' }, '周计划已过期', { hasRange: false, suspended: false, valuationMissing: false }],
    [{ 周计划结论: '本周无可靠区间', 计划买入下限: '', 计划买入上限: '' }, '等待区间（本周无可靠区间）', { hasRange: false, suspended: false, valuationMissing: false }],
    [{ 周计划结论: '无购买计划', 计划买入下限: '', 计划买入上限: '' }, '无购买计划', { hasRange: false, suspended: false, valuationMissing: false }],
    [{ 计划买入上限: '需补全：区间2 反馈未确认' }, '区间需补全（上限：需补全：区间2 反馈未确认）', { hasRange: false, suspended: false, valuationMissing: false }],
    // Maintainer review on e42bbf1: an incomplete lower end or a missing cap is never an actionable range.
    [{ 计划买入下限: '需补全：计划只规定最高出价 380 USD，未规定最低价' }, '区间需补全（下限：需补全：计划只规定最高出价 380 USD，未规定最低价）', { hasRange: false, suspended: false, valuationMissing: false }],
    [{ 计划买入下限: '' }, '区间需补全（下限未提供）', { hasRange: false, suspended: false, valuationMissing: false }],
    [{ 长期买入上限快照: '' }, '估值缺失', { hasRange: false, suspended: false, valuationMissing: true }],
    // Maintainer re-review on 4a26e89: a cap that is not a finite positive number is no valid cap.
    [{ 长期买入上限快照: 0 }, '估值缺失', { hasRange: false, suspended: false, valuationMissing: true }],
    [{ 长期买入上限快照: '0' }, '估值缺失', { hasRange: false, suspended: false, valuationMissing: true }],
    [{ 长期买入上限快照: -1 }, '估值缺失', { hasRange: false, suspended: false, valuationMissing: true }],
    [{ 长期买入上限快照: '约 400' }, '估值缺失', { hasRange: false, suspended: false, valuationMissing: true }],
    [{ 长期买入上限快照: 'Infinity' }, '估值缺失', { hasRange: false, suspended: false, valuationMissing: true }]
  ];
  cases.forEach(([overrides, reason, filters]) => {
    const row = detail(overrides);
    assert.equal(row.weekly.range, '', reason);
    assert.equal(row.weekly.noRange, reason);
    assert.deepEqual(row.filters, filters, reason);
  });
});

test('an invalid cap is labelled 无效 and never compared; a valid positive cap still is', () => {
  [0, '0', -1, '-1', '约 400', 'Infinity', 'NaN'].forEach((value) => {
    const row = detail({ 长期买入上限快照: value });
    assert.equal(row.valuation.cap, T.invalidCap, String(value));
    assert.deepEqual(row.valuation.distance, { compared: false, text: T.noCap }, String(value));
    assert.equal(row.filters.hasRange, false, String(value));
  });
  const valid = detail({ 长期买入上限快照: '400.5' });
  assert.equal(valid.valuation.cap, '400.5 USD');
  assert.equal(valid.valuation.distance.compared, true);
  assert.equal(valid.filters.hasRange, true);
});

test('a single-price batch (下限 = 上限) shows one price and stays a range, never a fabricated two-sided range', () => {
  const price = '380 USD（区间1，本周购买计划）';
  const row = detail({ 计划买入下限: price, 计划买入上限: price });
  assert.equal(row.weekly.range, price);
  assert.equal(row.filters.hasRange, true);
});

test('a pre-#318 row shows 未提供 everywhere and joins no derived filter', () => {
  const legacy = {
    报告ID: 'daily-2026-08-20', 生成ID: 'g-old', 资产类型: 'watchlist', 代码: 'OLD', 名称: 'Old Co.',
    当前价格: 100, 报价币种: 'USD', '参考买入价/区间': '90-95'
  };
  const row = logic.buildHoldingDetailRow_(legacy, null);
  assert.equal(row.kind, 'watchlist');
  assert.equal(row.threeLayer, false);
  [row.valuation.cap, row.valuation.distance.text, row.valuation.fairValue, row.valuation.source,
    row.valuation.researchDate, row.weekly.week, row.weekly.status, row.weekly.noRange].forEach((value) => assert.equal(value, T.oldRow));
  assert.deepEqual(row.filters, { hasRange: false, suspended: false, valuationMissing: false });
  assert.deepEqual(row.efv, { shown: false, text: T.missing });
});

test('EFV: not adopted, unbound, stale, unusable and FUND-SLEEVE are labelled, never a cap', () => {
  assert.deepEqual(detail({}, null).efv, { shown: false, text: T.missing });
  assert.deepEqual(detail({}, { state: '未写入' }).efv, { shown: false, text: T.efvNotAdopted });
  assert.deepEqual(detail({}, { state: '已写入' }).efv, { shown: false, text: T.missing });
  assert.deepEqual(detail({ 代码: 'FUND-SLEEVE', _iosExternalFairValue: EFV_ROW }, { state: '已写入' }).efv, { shown: false, text: T.efvNotApplicable });
  const stale = detail({ _iosExternalFairValue: Object.assign({}, EFV_ROW, { 记录状态: '已读取，最近一次采集失败', 采集新鲜度: '过期' }) }, { state: '已写入' });
  assert.deepEqual(stale.efv.states, ['已读取，最近一次采集失败', '过期']);
  const unusable = detail({ _iosExternalFairValue: Object.assign({}, EFV_ROW, { 记录状态: '记录无效' }) }, { state: '已写入' });
  assert.deepEqual(unusable.efv, { shown: false, text: T.efvNotAdopted, states: ['记录无效'] });
  assert.equal(detail({ _iosExternalFairValue: EFV_ROW }, { state: '已写入' }).valuation.cap, '400 USD');
});

test('the view model carries holdingDetail for holdings then watchlist, from this generation only', () => {
  const tabs = {
    当前持仓: [], 交易记录: [], 观察名单: [], 报告风险: [], 报告待办: [],
    报告摘要: [{
      报告ID: 'weekly-2026-11-09', 生成ID: 'g-current', 报告类型: 'weekly', 报告日期: '2026-11-09',
      一句话结论: 'x', 核心状态: '正常', Review状态: '已检查', 当前持仓数: 1, 高优先级观察数: 1, 生成时间: '2026-11-09T09:00:00+09:00'
    }],
    报告持仓: [
      assetRow({ 代码: 'WWW', 资产类型: 'watchlist', 排序: 1 }),
      assetRow({ 代码: 'AAA', 排序: 2 }),
      assetRow({ 代码: 'GONE', 生成ID: 'g-superseded' })
    ]
  };
  const view = logic.buildReportViewModel_(tabs, 'weekly', null);
  assert.deepEqual(view.holdingDetail.map((row) => [row.code, row.kind]), [['AAA', 'holding'], ['WWW', 'watchlist']]);
});

test('demo reports (no three-layer snapshot) still build a 持仓明细 of 未提供 rows', () => {
  const boot = logic.buildDashboardBootstrap_(demoSheet);
  [boot.daily, boot.weekly].filter((v) => v.found).forEach((view) => {
    assert.equal(view.holdingDetail.length, view.holdings.length + view.watchlistCandidates.length);
  });
});

// -- Rendering --

function descendants(node) {
  return (node.children || []).reduce((all, child) => all.concat([child], descendants(child)), []);
}

function byClass(node, cls) {
  return descendants(node).filter((c) => c.classList && c.classList.contains(cls));
}

function bootstrapWith(rows, extra) {
  const weekly = Object.assign({
    found: true, reportType: 'weekly',
    summary: { 报告ID: 'weekly-2026-11-09', 报告日期: '2026-11-09', 一句话结论: 'x', 核心状态: '正常', Review状态: '已检查', 当前持仓数: 1, 高优先级观察数: 0 },
    holdings: [], watchlistCandidates: [], risks: [], todos: [], holdingDetail: rows
  }, extra || {});
  return { error: null, daily: { found: false, reportType: 'daily' }, weekly: weekly, dailyHistory: [], weeklyHistory: [], allocation: [] };
}

function load(bootstrap, handlers) {
  const document = createFakeDocument();
  const sandbox = { document, window: {}, google: createGoogleScriptRunStub(handlers || {}), IOS_BOOTSTRAP: bootstrap, IOS_ACTIVE_VIEW: 'weekly', console };
  vm.createContext(sandbox);
  vm.runInContext(SCRIPT_HTML_SRC, sandbox, { filename: 'Script.html' });
  sandbox.window.selectTab('holdingDetail');
  return { document, window: sandbox.window, content: document.getElementById('ios-tab-content') };
}

const ROWS = [
  detail({ _iosExternalFairValue: EFV_ROW }, { state: '已写入' }),
  detail({ 代码: 'PPP', 名称: 'Paused Co.', 周计划状态: '事件暂停' }),
  detail({ 代码: 'VVV', 名称: 'No Cap Co.', 资产类型: 'watchlist', 周计划结论: '长期估值缺失或失效', 长期买入上限快照: '', 报价币种: 'JPY' })
];

const GROUP_HEADS = (table) => descendants(table).filter((n) => n.tagName === 'TR')[0].children.map((c) => c.textContent);
const LABELS = (table) => descendants(table).filter((n) => n.tagName === 'TR')[1].children.map((c) => c.textContent);
const CAP = '长期买入上限（非本周区间）';
const RANGE = '本周执行区间';

test('#409 P2: 标的 is a view of its own, reads the latest reports and names its source', () => {
  const { document, content } = load(bootstrapWith(ROWS));
  assert.ok(document.getElementById('ios-tab-holdingDetail').classList.contains('active'));
  assert.equal(document.getElementById('ios-page-title').textContent, '标的');
  assert.match(content.children[0].textContent, /^来源：最新周报 11\/09 · 每个标的读列出它的最新一份报告/);
  assert.match(content.textContent, /第三方公允值仅供参考，不能替代长期买入上限/);
  assert.match(content.textContent, /估值研究日期早于该报告日期超过 90 天标「需更新」/);
});

test('#409 P2 table: every group heading names its source and time; 长期买入上限 and 本周执行区间 carry full names and are never adjacent', () => {
  const { content } = load(bootstrapWith(ROWS));
  const table = byClass(content, 'ios-holding-detail-table')[0];
  const heads = GROUP_HEADS(table);
  assert.deepEqual(heads.slice(0, 4), ['标的', '本周执行区间 · 周报 11/09', '长期估值约束 · 入场计划快照（周报 11/09 读取）',
    '外部公允值（仅供参考）· 按获取日期']);
  assert.match(heads[4], /^台账 · 实时 \d+\/\d+ \d{2}:\d{2}（当前台账，非本报告快照）$/);
  const labels = LABELS(table);
  const cap = labels.indexOf(CAP);
  const range = labels.indexOf(RANGE);
  assert.ok(cap !== -1 && range !== -1);
  assert.ok(Math.abs(range - cap) > 1, 'cap and weekly range are not adjacent');
  assert.equal(labels.indexOf('长期买入上限'), -1, 'the cap never appears under a short name');
  assert.ok(labelRowCell(table, CAP).classList.contains('ios-detail-group-start'));
  assert.ok(labelRowCell(table, RANGE).classList.contains('ios-detail-group-start'));
  assert.ok(labelRowCell(table, '代码 / 名称').classList.contains('ios-sticky-col'), '代码 / 名称 stays fixed');
  const cells = rowCells(table, 'AAA');
  assert.equal(cells[0], 'AAAAlpha Co.');
  assert.equal(cells[labels.indexOf('快照来源')], '周报 11/09');
  assert.equal(cells[cap], '400 USD');
  assert.equal(cells[range], '350 USD（区间1，本周购买计划） – 380 USD（区间1，本周购买计划）');
  assert.equal(cells[labels.indexOf('公允值')], '410.5 USD');
});

function labelRowCell(table, label) {
  const row = descendants(table).filter((n) => n.tagName === 'TR')[1];
  return row.children[row.children.map((c) => c.textContent).indexOf(label)];
}

function rowCells(table, code) {
  return descendants(table).filter((n) => n.tagName === 'TR' && n.getAttribute('data-code') === code)[0].children.map((c) => c.textContent);
}

test('#409 P2 cards: the groups are separate blocks with their source, the EFV block says 仅供参考, state is text', () => {
  const { content } = load(bootstrapWith(ROWS));
  const cards = byClass(content, 'ios-holding-detail-cards')[0];
  const card = cards.children[0];
  const groups = card.children.filter((c) => c.classList.contains('ios-detail-group'));
  assert.deepEqual(groups.map((g) => g.children[0].textContent).slice(0, 3), ['本周执行区间 · 周报 11/09',
    '长期估值约束 · 入场计划快照（周报 11/09 读取）', '外部公允值（仅供参考）']);
  assert.match(groups[3].children[0].textContent, /^台账 · 实时 /);
  assert.match(groups[0].textContent, /本周执行区间: 350 USD/);
  assert.doesNotMatch(groups[0].textContent, /长期买入上限/);
  assert.match(groups[1].textContent, /长期买入上限（非本周区间）: 400 USD/);
  assert.doesNotMatch(groups[1].textContent, /本周执行区间/);
  assert.match(groups[2].textContent, /来源: external-source · 获取日期: 2026-11-08/);
  assert.match(groups[2].textContent, /仅供参考，不能替代长期买入上限/);
  assert.match(cards.children[1].textContent, /本周执行区间: 无区间：暂停中/);
  assert.match(cards.children[1].children[0].textContent, /暂停中/, 'a paused card says so in its head, in words');
  assert.match(cards.children[2].textContent, /长期买入上限（非本周区间）: 未提供/);
  assert.match(cards.children[2].textContent, /现价距上限: 未比较（无长期买入上限）/);
});

test('#409 P2 filters: 全部 / 持仓 / 观察 / 本周有区间 / 暂停中 / 需更新 / 估值缺失 count and narrow the rows', () => {
  const { content, window } = load(bootstrapWith(ROWS.concat([detail({ 代码: 'OLDV', 估值研究日期快照: '2026-05-01' })])));
  const labels = byClass(content, 'ios-detail-filter-btn').map((b) => b.textContent);
  assert.deepEqual(labels, ['全部 (4)', '持仓 (3)', '观察 (1)', '本周有区间 (2)', '暂停中 (1)', '需更新 (1)', '估值缺失 (1)']);
  const codes = () => byClass(content, 'ios-holding-detail-cards')[0].children.map((c) => c.getAttribute('data-code'));
  const click = (filter) => byClass(content, 'ios-detail-filter-btn').find((b) => b.getAttribute('data-filter') === filter).click();
  click('suspended');
  assert.deepEqual(codes(), ['PPP']);
  click('watchlist');
  assert.deepEqual(codes(), ['VVV']);
  click('researchStale');
  assert.deepEqual(codes(), ['OLDV']);
  click('hasRange');
  assert.deepEqual(codes(), ['AAA', 'OLDV']);
  const one = load(bootstrapWith([ROWS[0]]));
  byClass(one.content, 'ios-detail-filter-btn').find((b) => b.getAttribute('data-filter') === 'suspended').click();
  assert.match(one.content.textContent, /没有符合「暂停中」的标的。/);
  assert.equal(typeof window.selectTab, 'function');
});

test('#409 P2: an empty report and a view model without holdingDetail render safely', () => {
  assert.match(load(bootstrapWith([])).content.textContent, /最新报告没有持仓或观察行/);
  const missing = bootstrapWith(undefined);
  delete missing.weekly.holdingDetail;
  assert.match(load(missing).content.textContent, /最新报告没有持仓或观察行/);
});

test('#409 P2: a history selection under 周报 does not change 标的; it keeps the latest report', () => {
  const latest = bootstrapWith(ROWS);
  latest.weeklyHistory = [{ reportId: 'weekly-2026-11-02', reportDate: '2026-11-02' }];
  const legacy = logic.buildHoldingDetailRow_({ 代码: 'OLD', 名称: 'Old Co.', 资产类型: 'holding' }, null);
  const historical = bootstrapWith([legacy]).weekly;
  const { content, window } = load(latest, { getReport: () => historical });
  window.selectHistoryReport('weekly-2026-11-02');
  window.selectTab('holdingDetail');
  assert.match(content.textContent, /AAA/);
  assert.doesNotMatch(content.textContent, /Old Co\./);
});

// -- Issue #388 PR B: 估值研究日期 需更新 at more than 90 days (maintainer decision, 2026-11-11 JST) --

test('research date: 89/90 days only show the date, 91 shows 需更新, against the report’s own date', () => {
  assert.equal(logic.VALUATION_RESEARCH_STALE_DAYS, 90);
  const at = (date, extra) => detail(Object.assign({ 估值研究日期快照: date }, extra || {})).valuation;
  assert.deepEqual([at('2026-08-12').researchDate, at('2026-08-12').researchStale], ['2026-08-12', false], '89 days');
  assert.deepEqual([at('2026-08-11').researchDate, at('2026-08-11').researchStale], ['2026-08-11', false], '90 days');
  assert.deepEqual([at('2026-08-10').researchDate, at('2026-08-10').researchStale], ['2026-08-10（需更新，距报告 91 天）', true], '91 days');
  assert.equal(at('2026-12-01').researchStale, false, 'a date after the report is not stale');
});

test('research date: missing or unreadable is 未比较, never 需更新', () => {
  const at = (overrides) => detail(overrides).valuation;
  assert.deepEqual([at({ 估值研究日期快照: '' }).researchDate, at({ 估值研究日期快照: '' }).researchStale], [T.researchDateMissing, false]);
  assert.equal(T.researchDateMissing, '未比较（研究日期未提供）');
  for (const bad of ['2026-02-30', '2026/08/01', '约三个月前', '2026-8-1']) {
    const v = at({ 估值研究日期快照: bad });
    assert.equal(v.researchDate, bad + ' · ' + T.researchDateUnreadable, bad);
    assert.equal(v.researchStale, false, bad);
  }
  const noReportDate = at({ 报告ID: 'custom-id', 报告日期: '', 估值研究日期快照: '2026-01-01' });
  assert.equal(noReportDate.researchDate, '2026-01-01 · ' + T.reportDateUnreadable);
  assert.equal(noReportDate.researchStale, false);
  assert.equal(detail({ 周计划ID: '', 周计划状态: '', 估值研究日期快照: '2020-01-01' }).valuation.researchStale, false, 'a pre-#318 row is not compared');
});

test('research date: a history report is judged by its own date, never today', () => {
  const old = detail({ 报告ID: 'weekly-2026-05-04', 报告日期: '2026-05-04', 估值研究日期快照: '2026-03-01' }).valuation;
  assert.equal(old.researchStale, false, '64 days before its own report date');
  const fallback = detail({ 报告ID: 'manual', 报告日期: '2026-11-09', 估值研究日期快照: '2026-08-10' }).valuation;
  assert.equal(fallback.researchStale, true, '报告日期 is used when the 报告ID has no date');
});

test('research date: a Sheet date cell is its day in the Sheet time zone', () => {
  // 2026-08-11 00:00 JST is 2026-08-10T15:00Z; as a UTC day it would wrongly read 91 days.
  const jst = (date) => {
    const shifted = new Date(date.getTime() + 9 * 3600 * 1000);
    return shifted.toISOString().slice(0, 19).replace('T', ' ');
  };
  const row = logic.buildHoldingDetailRow_(assetRow({ 估值研究日期快照: new Date('2026-08-10T15:00:00Z') }), null, jst);
  assert.equal(row.valuation.researchDate, '2026-08-11');
  assert.equal(row.valuation.researchStale, false);
  const view = logic.buildHoldingDetailView_([assetRow({ 估值研究日期快照: new Date('2026-08-09T15:00:00Z') })], [], null, jst);
  assert.equal(view[0].valuation.researchStale, true);
});

test('research date: the tab marks a stale row on table and phone card', () => {
  const rows = [detail({ 估值研究日期快照: '2026-05-01' }), detail({ 代码: 'BBB', 估值研究日期快照: '2026-10-01' })];
  const { content } = load(bootstrapWith(rows));
  const table = byClass(content, 'ios-holding-detail-table')[0];
  assert.match(table.textContent, /2026-05-01（需更新，距报告 192 天）/);
  const cards = byClass(content, 'ios-holding-detail-cards')[0].children;
  assert.match(cards[0].children[0].textContent, /估值需更新/);
  assert.doesNotMatch(cards[1].children[0].textContent, /估值需更新/);
});

test('PR E: the third-party source shows its readable name, without the export-format suffix', () => {
  const name = (source) => detail({ _iosExternalFairValue: Object.assign({}, EFV_ROW, { 来源名称: source }) }, { state: '已写入' }).efv.source;
  assert.equal(name('InvestingPro Premium Export'), 'InvestingPro');
  assert.equal(name('Some Vendor export'), 'Some Vendor');
  assert.equal(name('external-source'), 'external-source');
  assert.equal(name('Export'), 'Export', 'a name that is only the suffix stays as written');
});

test('PR E (#388 acceptance item 3): a history report builds 持仓明细 and its filter counts from its own generation only', () => {
  const tabs = JSON.parse(fs.readFileSync(path.join(__dirname, 'report-layering-fixture.json'), 'utf8'));
  Object.keys(tabs).forEach((key) => { if (key.startsWith('_') && key !== '_安装状态') delete tabs[key]; });
  tabs['报告持仓'].push({ 报告ID: 'weekly-2026-10-31', 生成ID: 'gen-w1', 报告类型: 'weekly', 报告日期: '2026-10-31', 资产类型: 'holding',
    代码: 'OLD', 名称: 'Old Co.', 排序: 1, 今日行动: '本周无购买区间', 周计划状态: '事件暂停', 长期买入上限快照: 90, 报价币种: 'USD' });
  const latest = logic.buildDashboardBootstrap_(tabs).weekly;
  const old = logic.getReport_(tabs, 'weekly-2026-10-31');
  assert.equal(old.summary['报告ID'], 'weekly-2026-10-31');
  assert.deepEqual(old.holdingDetail.map((r) => r.code), ['OLD']);
  assert.deepEqual(latest.holdingDetail.map((r) => r.code).sort(), ['AAA', 'BBB', 'CCC']);
  const count = (rows, key) => rows.filter((r) => r.filters[key]).length;
  assert.equal(count(old.holdingDetail, 'suspended'), 1);
  assert.equal(count(latest.holdingDetail, 'suspended'), 0, 'the latest generation is not counted into the old one, nor the reverse');
});

// -- Issue #388 PR F: the former 资本配置 view lives in 持仓明细 as a live 当前台账 group. --

const LEDGER = [
  { code: 'AAA', name: 'Alpha Co.', quantity: 12, avgCost: 310.25, referenceRange: '340-360', currency: 'USD' },
  { code: 'PPP', name: 'Paused Co.', quantity: 5, avgCost: null, referenceRange: null, currency: 'USD' },
  { code: 'NEWB', name: 'Bought Later Co.', quantity: 3, avgCost: 99, referenceRange: null, currency: 'JPY' }
];

function ledgerBootstrap(rows, extra) {
  return Object.assign(bootstrapWith(rows), { allocation: LEDGER,
    accountStatus: { state: 'ok', rows: [{ account: 'Broker A', currency: 'JPY', availableCash: 500000 }, { account: 'Broker B', currency: 'USD', availableCash: null }] } }, extra || {});
}

test('PR F, #409 P2: 配置概况 follows the 标的 list with only existing facts, labelled as the current ledger', () => {
  const { content } = load(ledgerBootstrap(ROWS));
  const overview = byClass(content, 'ios-allocation-overview')[0];
  assert.ok(overview, '配置概况 is rendered');
  assert.match(content.children[0].textContent, /^来源：最新周报 11\/09/, 'the view names the reports it reads');
  assert.ok(content.children[1].classList.contains('ios-holding-detail'), 'the 标的 list comes first');
  assert.equal(content.children[2], overview, '配置概况 follows the list');
  assert.match(overview.textContent, /当前台账，非本报告快照/);
  assert.match(overview.textContent, /配置比例: 未提供（Sheet 没有市值和汇率字段/);
  assert.match(overview.textContent, /可用现金: Broker A 500000 JPY/);
  const cashLine = overview.children.find((c) => /^可用现金: /.test(c.textContent));
  assert.doesNotMatch(cashLine.textContent, /Broker B/, 'a blank cash cell is never shown as 0');
  const accounts = byClass(overview, 'ios-account-detail')[0];
  assert.equal(accounts.getAttribute('open'), null, '#396 PR A: the former 组合 account list is folded into 配置概况');
  assert.match(accounts.textContent, /Broker B · USD可用现金 未提供/);
  assert.doesNotMatch(accounts.textContent, /undefined|额度剩余/, 'absent NISA facts are left out, not printed');
  assert.match(overview.textContent, /当前台账持仓: 3 只/);
  const none = load(Object.assign(bootstrapWith(ROWS), { accountStatus: { state: 'absent', rows: [] } })).content;
  assert.match(byClass(none, 'ios-allocation-overview')[0].textContent, /可用现金: 未提供（Sheet 没有「账户状态」表）/);
});

test('PR F: table adds a 台账 · 实时 group read as-is from 当前持仓; watchlist is 未持有; four price kinds stay separate columns', () => {
  const { content } = load(ledgerBootstrap(ROWS));
  const table = byClass(content, 'ios-holding-detail-table')[0];
  const labels = LABELS(table);
  [CAP, RANGE, '参考买入价（台账）', '公允值'].forEach((label) => {
    assert.equal(labels.filter((l) => l === label).length, 1, label + ' is its own column');
  });
  assert.ok(labelRowCell(table, '持有数量').classList.contains('ios-detail-group-ledger'));
  const aaa = rowCells(table, 'AAA');
  assert.equal(aaa[labels.indexOf('持有数量')], '12');
  assert.equal(aaa[labels.indexOf('平均成本')], '310.25 USD');
  assert.equal(aaa[labels.indexOf('参考买入价（台账）')], '340-360');
  assert.equal(aaa[labels.indexOf(RANGE)], '350 USD（区间1，本周购买计划） – 380 USD（区间1，本周购买计划）', 'the weekly range is never merged with the ledger price');
  const ppp = rowCells(table, 'PPP');
  assert.equal(ppp[labels.indexOf('平均成本')], '未提供');
  assert.equal(ppp[labels.indexOf('参考买入价（台账）')], '未提供');
  const vvv = rowCells(table, 'VVV');
  assert.deepEqual([vvv[labels.indexOf('持有数量')], vvv[labels.indexOf('平均成本')], vvv[labels.indexOf('参考买入价（台账）')]], ['未持有', '—', '—']);
});

test('PR F: phone cards carry the 台账 · 实时 group with its label; a held row no longer in the ledger says so', () => {
  const sold = [detail({ 代码: 'GONE', 名称: 'Sold Co.' })];
  const { content } = load(ledgerBootstrap(ROWS.concat(sold)));
  const cards = byClass(content, 'ios-holding-detail-cards')[0].children;
  const ledgerOf = (card) => card.children.find((c) => c.classList.contains('ios-detail-group-ledger'));
  assert.match(ledgerOf(cards[0]).textContent, /^台账 · 实时 \d+\/\d+ \d{2}:\d{2}当前台账，非本报告快照持有数量: 12平均成本: 310.25 USD参考买入价（台账）: 340-360$/);
  assert.match(ledgerOf(cards[2]).textContent, /未持有/);
  assert.match(ledgerOf(cards[3]).textContent, /当前台账无此持仓/);
});

test('PR F: ledger holdings no latest report lists are still shown (nothing from the old 资本配置 is lost)', () => {
  const { content } = load(ledgerBootstrap(ROWS));
  const extra = byClass(content, 'ios-ledger-only')[0];
  assert.match(extra.textContent, /当前台账中有、最新报告未列出的持仓 \(1\)/);
  assert.match(extra.textContent, /当前台账，非本报告快照/);
  assert.equal(byClass(extra, 'ios-allocation-table')[0].children[0].children[1].children.length, 1);
  assert.match(byClass(extra, 'ios-allocation-cards')[0].textContent, /NEWB.*持有数量: 3平均成本: 99参考买入价（台账）: 未提供/);
  const all = load(ledgerBootstrap(ROWS.concat([detail({ 代码: 'NEWB' })]))).content;
  assert.equal(byClass(all, 'ios-ledger-only').length, 0, 'no extra block when every ledger holding is listed');
});

test('PR F: with no report, 标的 still shows the live ledger after the empty-state card', () => {
  const boot = ledgerBootstrap([]);
  boot.weekly = { found: false, reportType: 'weekly' };
  const { content } = load(boot);
  assert.match(content.textContent, /配置概况/);
  assert.match(byClass(content, 'ios-ledger-only')[0].textContent, /当前台账持仓（实时） \(3\)/);
});

test('PR F: no share-of-portfolio numbers and no add/trim conclusions anywhere in 标的', () => {
  const { content } = load(ledgerBootstrap(ROWS));
  const text = content.textContent;
  assert.doesNotMatch(text, /当前占比\s*[:：]?\s*\d|目标占比\s*[:：]?\s*\d|\d+(\.\d+)?%\s*(占比|权重)/);
  assert.doesNotMatch(text, /该加仓|该减仓|建议加仓|建议减仓|应加仓|应减仓/);
});

test('PR F review 2: a 持有 row with a blank/0/invalid quantity is not counted or listed, and its code is not called absent from the ledger', () => {
  const tabs = [
    { 代码: 'AAA', 名称: 'Alpha Co.', 持有数量: '', 平均成本: 310, '参考买入价/区间': '', 币种: 'USD', 状态: '持有' },
    { 代码: 'ZERO', 名称: 'Zero Co.', 持有数量: 0, 平均成本: '', '参考买入价/区间': '', 币种: 'JPY', 状态: '持有' },
    { 代码: 'BAD', 名称: 'Bad Co.', 持有数量: 'abc', 平均成本: '', '参考买入价/区间': '', 币种: 'JPY', 状态: '持有' },
    { 代码: 'OK', 名称: 'Ok Co.', 持有数量: '7', 平均成本: '', '参考买入价/区间': '', 币种: 'JPY', 状态: '持有' }
  ];
  const { content } = load(Object.assign(bootstrapWith(ROWS), {
    allocation: logic.buildAllocationView_(tabs), allocationExcluded: logic.buildAllocationExcluded_(tabs) }));
  const overview = byClass(content, 'ios-allocation-overview')[0].textContent;
  assert.match(overview, /当前台账持仓: 1 只/, 'only OK counts');
  assert.match(overview, /另有 3 行状态为持有，但持有数量未提供或无效（不计入当前持仓）：AAA、ZERO、BAD/);
  const table = byClass(content, 'ios-holding-detail-table')[0];
  const labels = descendants(table).filter((n) => n.tagName === 'TR')[1].children.map((c) => c.textContent);
  const aaa = descendants(table).filter((n) => n.tagName === 'TR' && n.getAttribute('data-code') === 'AAA')[0].children.map((c) => c.textContent);
  assert.deepEqual([aaa[labels.indexOf('持有数量')], aaa[labels.indexOf('平均成本')], aaa[labels.indexOf('参考买入价（台账）')]],
    ['状态为持有，但持有数量未提供或无效（不计入当前持仓）', '—', '—']);
  assert.match(byClass(content, 'ios-holding-detail-cards')[0].children[0].textContent, /状态为持有，但持有数量未提供或无效/);
  const ppp = descendants(table).filter((n) => n.tagName === 'TR' && n.getAttribute('data-code') === 'PPP')[0].children.map((c) => c.textContent);
  assert.equal(ppp[labels.indexOf('持有数量')], '当前台账无此持仓', 'a code with no 持有 row at all keeps the plain wording');
  const extra = byClass(content, 'ios-ledger-only')[0].textContent;
  assert.match(extra, /\(1\)/);
  assert.match(extra, /OK/);
  assert.doesNotMatch(extra, /ZERO|BAD/, 'excluded rows are never listed as ledger-only current holdings');
  assert.doesNotMatch(content.textContent, /NaN|持有数量: 0/);
});

// -- Issue #407: 上限口径 and 危机机会价 are shown as stored; the cap stays the only constraint.

test('#407: a regular-tier row shows the tier and the crisis reference, the cap and range are unchanged', () => {
  const row = detail({ 上限口径快照: '常规安全边际买价', 危机机会价快照: 320 });
  assert.equal(row.valuation.tier, '常规安全边际买价');
  assert.equal(row.valuation.crisis, '320 USD（仅参考，不约束周计划）');
  assert.equal(row.valuation.cap, '400 USD');
  assert.deepEqual(row.valuation.distance, detail({}).valuation.distance, 'distance is still measured against the cap');
  assert.deepEqual(row.filters, detail({}).filters);
  assert.equal(row.weekly.range, detail({}).weekly.range);
});

test('#407: a pre-#407 row (no tier columns) keeps its cap and labels the tier as not labelled', () => {
  const row = detail({});
  assert.equal(row.valuation.tier, T.tierUnlabelled);
  assert.equal(row.valuation.crisis, T.missing);
  assert.equal(row.valuation.cap, '400 USD');
  assert.equal(detail({ 上限口径快照: '危机机会价' }).valuation.tier, T.tierUnlabelled, 'an unknown label is not a tier');
  const legacy = logic.buildHoldingDetailRow_({ 代码: 'OLD', 名称: 'Old Co.', 资产类型: 'holding' }, null);
  assert.equal(legacy.valuation.tier, T.oldRow);
  assert.equal(legacy.valuation.crisis, T.oldRow);
});

test('#407: a blank crisis price under the regular tier is 未核定; one that breaks the write invariant is never shown as a price', () => {
  assert.equal(detail({ 上限口径快照: '常规安全边际买价' }).valuation.crisis, T.crisisNotEstablished);
  assert.equal(detail({ 上限口径快照: '常规安全边际买价', 危机机会价快照: 450 }).valuation.crisis, T.crisisInvalid, 'above the cap');
  assert.equal(detail({ 危机机会价快照: 300 }).valuation.crisis, T.crisisInvalid, 'without the regular tier');
  assert.equal(detail({ 上限口径快照: '常规安全边际买价', 危机机会价快照: 300, 长期买入上限快照: '' }).valuation.crisis, T.crisisInvalid, 'without a cap');
  assert.equal(detail({ 上限口径快照: '常规安全边际买价', 危机机会价快照: 'abc' }).valuation.crisis, T.invalidCap);
  assert.equal(detail({ 上限口径快照: '常规安全边际买价', 危机机会价快照: 400 }).valuation.crisis, '400 USD（仅参考，不约束周计划）', 'equal to the cap is allowed');
});

test('#407: table and cards show 上限口径 and 危机机会价 inside the valuation group only', () => {
  const rows = [detail({ 上限口径快照: '常规安全边际买价', 危机机会价快照: 320 })];
  const { content } = load(bootstrapWith(rows));
  const table = byClass(content, 'ios-holding-detail-table')[0];
  const labels = LABELS(table);
  assert.deepEqual(labels.slice(labels.indexOf(CAP), labels.indexOf('公允值')),
    [CAP, '上限口径', '现价距上限', '长期合理价值', '危机机会价', '来源', '估值研究日期']);
  const cells = rowCells(table, 'AAA');
  assert.equal(cells[labels.indexOf('上限口径')], '常规安全边际买价');
  assert.equal(cells[labels.indexOf('危机机会价')], '320 USD（仅参考，不约束周计划）');
  const groups = byClass(byClass(content, 'ios-holding-detail-cards')[0], 'ios-detail-group');
  assert.match(groups[1].textContent, /上限口径: 常规安全边际买价/);
  assert.match(groups[1].textContent, /危机机会价: 320 USD（仅参考，不约束周计划）/);
  assert.doesNotMatch(groups[0].textContent, /危机机会价/);
});

test('#407 round trip: only a writer-validated crisis price is shown as a price (fixture from the writer spec)', () => {
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', 'fixtures', 'valuation-tiers', 'snapshots.json'), 'utf8'));
  assert.ok(fixture.cases.length >= 8);
  fixture.cases.forEach((c) => {
    const overrides = Object.assign({ 上限口径快照: undefined, 危机机会价快照: undefined }, c.report_row);
    const row = detail(overrides);
    assert.equal(row.valuation.crisis, c.dashboard_crisis, c.case);
    if (!['valid', 'equal_to_cap'].includes(c.case)) assert.doesNotMatch(row.valuation.crisis, /仅参考/, c.case);
  });
});

// -- Issue #409 P2: report-ID bound asset snapshots, the merged 标的 list, its detail and 判断历史 --

function snapshotTabs() {
  const summary = (id, gen, date) => ({ 报告ID: id, 生成ID: gen, 报告类型: 'weekly', 报告日期: date, 一句话结论: 'x ' + id,
    核心状态: '正常', Review状态: '已检查', 当前持仓数: 1, 高优先级观察数: 0, 生成时间: date + 'T09:00:00+09:00' });
  const own = (id, gen, date) => ({ 报告ID: id, 生成ID: gen, 报告类型: 'weekly', 报告日期: date });
  return {
    当前持仓: [], 交易记录: [], 观察名单: [],
    报告摘要: [summary('weekly-2026-11-09', 'g-current', '2026-11-09'), summary('weekly-2026-11-02', 'g-old', '2026-11-02')],
    报告持仓: [
      assetRow({ 关键变化: '新：订单加速', 今日行动: '本周无购买区间', 阻塞待办ID: 't1、t9', 价格参考确认条件: '站稳 360', 价格参考否定条件: '跌破 340',
        停止条件说明: '指引下修则暂停', 下一验证点: '11/20 财报' }),
      assetRow({ 代码: 'BBB', 名称: 'Beta Co.', 排序: 2 }),
      Object.assign({ 代码: 'AAA', 名称: 'Alpha Co.', 资产类型: 'holding', 关键变化: '旧：订单平稳', Thesis状态: '维持', 今日行动: '等待价格' }, own('weekly-2026-11-02', 'g-old', '2026-11-02')),
      assetRow({ 代码: 'AAA', 生成ID: 'g-superseded', 关键变化: '被取代的生成' })
    ],
    报告风险: [
      Object.assign({ 风险: '客户集中', 严重度: '高', 风险对象: 'AAA', 风险评估: '触发', 风险键: 'k1' }, own('weekly-2026-11-09', 'g-current', '2026-11-09')),
      Object.assign({ 风险: '行业周期', 严重度: '中', 影响资产: 'AAA、BBB', 风险评估: '触发' }, own('weekly-2026-11-09', 'g-current', '2026-11-09')),
      Object.assign({ 风险: '名字相近', 严重度: '低', 影响资产: 'AAAX', 风险评估: '触发' }, own('weekly-2026-11-09', 'g-current', '2026-11-09')),
      Object.assign({ 风险: '对象是 BBB', 严重度: '低', 风险对象: 'BBB', 影响资产: 'AAA', 风险评估: '触发' }, own('weekly-2026-11-09', 'g-current', '2026-11-09')),
      Object.assign({ 风险: '旧风险', 严重度: '中', 影响资产: 'AAA' }, own('weekly-2026-11-02', 'g-old', '2026-11-02'))
    ],
    报告待办: [Object.assign({ 待办ID: 't1', 待办: '核对订单', 状态: '待处理', 排序: 1 }, own('weekly-2026-11-09', 'g-current', '2026-11-09'))]
  };
}

test('#409 P2 model: a report’s asset snapshot is copied from that generation’s own rows only', () => {
  const tabs = snapshotTabs();
  const latest = logic.buildReportViewModel_(tabs, 'weekly', null);
  const aaa = latest.assetSnapshots.find((s) => s.code === 'AAA');
  assert.equal(aaa.reportId, 'weekly-2026-11-09');
  assert.equal(aaa.generationId, 'g-current');
  assert.equal(aaa.threeLayer, true);
  assert.equal(aaa.layerNote, '');
  assert.equal(aaa.evidence.keyChange, '新：订单加速', 'never the superseded generation');
  assert.deepEqual(aaa.conditions, { confirm: '站稳 360', deny: '跌破 340', stop: '指引下修则暂停', nextCheck: '11/20 财报', blocker: '' });
  assert.deepEqual(aaa.risks.map((r) => r.risk), ['客户集中', '行业周期'],
    '风险对象 decides when present; else an exact 影响资产 entry; AAAX and a BBB-object row do not match');
  assert.deepEqual(aaa.blockers, [{ id: 't1', found: true, todo: '核对订单', status: '待处理' }, { id: 't9', found: false }]);
  assert.deepEqual(latest.assetSnapshots.map((s) => s.code), ['AAA', 'BBB']);

  const old = logic.getReport_(tabs, 'weekly-2026-11-02');
  const oldAaa = old.assetSnapshots.find((s) => s.code === 'AAA');
  assert.equal(oldAaa.reportId, 'weekly-2026-11-02');
  assert.equal(oldAaa.evidence.keyChange, '旧：订单平稳');
  assert.deepEqual(oldAaa.risks.map((r) => r.risk), ['旧风险']);
  assert.equal(oldAaa.threeLayer, false);
  assert.equal(oldAaa.layerNote, '本报告版本无三层快照');
  assert.deepEqual(oldAaa.conditions, { confirm: '', deny: '', stop: '', nextCheck: '', blocker: '' }, 'nothing filled from the newer report');
  assert.equal(old.assetSnapshots.find((s) => s.code === 'BBB'), undefined, 'a code the old report does not list has no snapshot there');
});

test('#409 P2 model: weekly research items join a snapshot only by an exact 关联代码 entry', () => {
  const summary = { 报告ID: 'weekly-2026-11-09', 生成ID: 'g', 报告类型: 'weekly', 报告日期: '2026-11-09' };
  const research = [
    { 关联代码: 'AAA、CCC', 分区: '判断变化', 标题: '订单', 结论: '加速', 本周证据: '公告', 状态: '已变化' },
    { 关联代码: 'AAAX', 分区: '判断变化', 标题: '别的', 结论: 'x' },
    { 关联代码: '', 分区: '本周结论', 标题: '组合', 结论: 'y' }
  ];
  const snap = logic.buildAssetSnapshot_(assetRow(), summary, [], [], research);
  assert.deepEqual(snap.evidence.research, [{ section: '判断变化', title: '订单', conclusion: '加速', evidence: '公告', status: '已变化', next: '' }]);
});

function twoReportBootstrap(weeklyRows, dailyRows, extra) {
  const base = bootstrapWith(weeklyRows);
  base.daily = Object.assign({}, base.weekly, {
    reportType: 'daily',
    summary: Object.assign({}, base.weekly.summary, { 报告ID: 'daily-2026-11-10', 报告日期: '2026-11-10' }),
    holdingDetail: dailyRows
  });
  return Object.assign(base, extra || {});
}

test('#409 P2: an asset in both latest reports is read from the newer one and listed once; mixed sources say so', () => {
  const weekly = [detail({}), detail({ 代码: 'WOW', 名称: 'Weekly Only' })];
  const daily = [detail({ 周计划状态: '事件暂停' })];
  const { content } = load(twoReportBootstrap(weekly, daily));
  const table = byClass(content, 'ios-holding-detail-table')[0];
  const labels = LABELS(table);
  const rows = descendants(table).filter((n) => n.tagName === 'TR' && n.getAttribute('data-code'));
  assert.deepEqual(rows.map((r) => r.getAttribute('data-code')), ['AAA', 'WOW'], 'AAA once');
  assert.equal(rowCells(table, 'AAA')[labels.indexOf('快照来源')], '日报 11/10');
  assert.equal(rowCells(table, 'AAA')[labels.indexOf(RANGE)], '无区间：暂停中', 'the newer report’s values');
  assert.equal(rowCells(table, 'WOW')[labels.indexOf('快照来源')], '周报 11/09');
  assert.equal(GROUP_HEADS(table)[1], '本周执行区间 · 各行见「快照来源」');
  const same = load(twoReportBootstrap([detail({})], [detail({})])).content;
  assert.equal(GROUP_HEADS(byClass(same, 'ios-holding-detail-table')[0])[1], '本周执行区间 · 日报 11/10');
});

function snapshotBootstrap(handlers) {
  const tabs = snapshotTabs();
  const boot = logic.buildDashboardBootstrap_(tabs);
  boot.weeklyHistory = logic.buildHistoryList_(tabs['报告摘要'], 'weekly');
  const calls = [];
  const loaded = load(boot, Object.assign({ getReport: (id) => { calls.push(id); return Object.assign({ error: null }, logic.getReport_(tabs, id)); } }, handlers || {}));
  return Object.assign(loaded, { calls });
}

function openRow(content, code) {
  const table = byClass(content, 'ios-holding-detail-table')[0];
  descendants(table).filter((n) => n.tagName === 'TR' && n.getAttribute('data-code') === code)[0].click();
  return byClass(byClass(content, 'ios-holding-detail-table')[0], 'ios-asset-detail')[0];
}

test('#409 P2 detail: a row opens 本期快照, the shared todo/risk items of this code, and 判断历史; a second click closes it', () => {
  const { content } = snapshotBootstrap();
  const detailNode = openRow(content, 'AAA');
  assert.ok(detailNode, 'the detail opens beneath the row');
  const text = detailNode.textContent;
  assert.match(text, /本期快照 · 最新周报 11\/09/);
  assert.match(text, /关键变化: 新：订单加速/);
  assert.match(text, /价格参考确认条件: 站稳 360/);
  assert.match(text, /价格参考否定条件: 跌破 340/);
  assert.match(text, /停止条件: 指引下修则暂停/);
  assert.match(text, /下一验证点: 11\/20 财报/);
  assert.match(text, /t9: 未找到：该报告没有这条待办/);
  assert.match(text, /相关待办与风险（与「待办与风险」页同源）卡住买入 2 · 触发风险 2 · 数据维护 0/);
  assert.match(text, /核对订单/);
  assert.match(text, /阻塞待办未找到/);
  assert.doesNotMatch(byClass(detailNode, 'ios-asset-actions')[0].textContent, /名字相近|对象是 BBB/);
  const history = byClass(detailNode, 'ios-history-link').map((b) => b.textContent);
  assert.deepEqual(history, ['周报 11/09', '周报 11/02']);
  assert.doesNotMatch(text, /weekly-2026-11-0\d/, 'report IDs stay out of the reading text');
  const card = byClass(content, 'ios-holding-detail-cards')[0].children[0];
  assert.ok(byClass(card, 'ios-asset-detail').length === 1, 'the phone card shows the same detail');
  openRow(content, 'AAA');
  assert.equal(byClass(content, 'ios-asset-detail').length, 0);
});

test('#409 P2 判断历史: a history date opens that report ID’s own snapshot, never the latest one', () => {
  const { content, calls } = snapshotBootstrap();
  let node = openRow(content, 'AAA');
  byClass(node, 'ios-history-link').find((b) => b.textContent === '周报 11/02').click();
  assert.deepEqual(calls, ['weekly-2026-11-02'], 'fetched by its report ID');
  const panel = byClass(content, 'ios-snapshot-panel')[0];
  assert.equal(panel.getAttribute('data-report-id'), 'weekly-2026-11-02');
  const text = panel.textContent;
  assert.match(text, /^报告时快照 · 周报 11\/02/);
  assert.match(text, /历史报告的快照，只是该报告当时的内容，不是当前结论。/);
  assert.match(text, /关键变化: 旧：订单平稳/);
  assert.match(text, /Thesis状态: 维持/);
  assert.match(text, /本报告版本无三层快照/);
  assert.match(text, /旧风险/);
  assert.doesNotMatch(text, /新：订单加速|站稳 360|客户集中|核对订单/, 'nothing from the latest report');
  assert.match(text, /本周执行区间 \/ 长期估值约束（该报告）状态: 本报告版本无三层快照/);
  node = byClass(content, 'ios-asset-detail')[0];
  byClass(node, 'ios-history-link').find((b) => b.textContent === '周报 11/09').click();
  assert.deepEqual(calls, ['weekly-2026-11-02'], 'the latest report is already loaded, no fetch');
  assert.match(byClass(content, 'ios-snapshot-panel')[0].textContent, /这是最新一份周报。/);
});

test('#409 P2 判断历史: a report that does not list the asset says so, and a failed read says so; neither falls back to the latest', () => {
  const { content } = snapshotBootstrap();
  const node = openRow(content, 'BBB');
  byClass(node, 'ios-history-link').find((b) => b.textContent === '周报 11/02').click();
  const panel = byClass(content, 'ios-snapshot-panel')[0].textContent;
  assert.match(panel, /该报告未列出此标的。不用其他报告的数据补位。/);
  assert.doesNotMatch(panel, /Beta Co\.|行业周期/);
  const failing = snapshotBootstrap({ getReport: () => { throw new Error('超时'); } });
  byClass(openRow(failing.content, 'AAA'), 'ios-history-link').find((b) => b.textContent === '周报 11/02').click();
  assert.match(byClass(failing.content, 'ios-snapshot-panel')[0].textContent, /读取该报告失败：超时/);
  const missing = snapshotBootstrap({ getReport: () => ({ error: null, found: false }) });
  byClass(openRow(missing.content, 'AAA'), 'ios-history-link').find((b) => b.textContent === '周报 11/02').click();
  assert.match(byClass(missing.content, 'ios-snapshot-panel')[0].textContent, /找不到该报告。/);
});

test('#409 P2 判断历史: a late answer for a snapshot the viewer already left is ignored', () => {
  const tabs = snapshotTabs();
  const boot = logic.buildDashboardBootstrap_(tabs);
  boot.weeklyHistory = logic.buildHistoryList_(tabs['报告摘要'], 'weekly');
  let answer = null;
  const document = createFakeDocument();
  const pending = {};
  const google = { script: { run: { withSuccessHandler(ok) { return { withFailureHandler() { return { getReport(id) { pending.ok = ok; pending.id = id; } }; } }; } } } };
  const sandbox = { document, window: {}, google, IOS_BOOTSTRAP: boot, IOS_ACTIVE_VIEW: 'weekly', console };
  vm.createContext(sandbox);
  vm.runInContext(SCRIPT_HTML_SRC, sandbox, { filename: 'Script.html' });
  sandbox.window.selectTab('holdingDetail');
  const content = document.getElementById('ios-tab-content');
  byClass(openRow(content, 'AAA'), 'ios-history-link').find((b) => b.textContent === '周报 11/02').click();
  assert.match(byClass(content, 'ios-snapshot-panel')[0].textContent, /正在读取该报告/);
  byClass(byClass(content, 'ios-snapshot-panel')[0], 'ios-snapshot-close')[0].click();
  answer = Object.assign({ error: null }, logic.getReport_(tabs, pending.id));
  pending.ok(answer);
  assert.equal(byClass(content, 'ios-snapshot-panel').length, 0, 'a closed snapshot stays closed');
});

test('#409 P2: a row without the three-layer snapshot says so once, not in every column; the card says it once too', () => {
  const legacy = logic.buildHoldingDetailRow_({ 代码: 'OLD', 名称: 'Old Co.', 资产类型: 'holding' }, null);
  const { content } = load(bootstrapWith([ROWS[0], legacy]));
  const table = byClass(content, 'ios-holding-detail-table')[0];
  const old = descendants(table).filter((n) => n.tagName === 'TR' && n.getAttribute('data-code') === 'OLD')[0];
  const merged = old.children.filter((c) => c.textContent === '本报告版本无三层快照');
  assert.equal(merged.length, 1);
  assert.equal(merged[0].getAttribute('colspan'), '10', 'spans 本周执行区间 and 长期估值约束');
  assert.doesNotMatch(old.textContent, /未提供（本报告版本无三层快照）/);
  const width = (tr) => tr.children.reduce((n, c) => n + Number(c.getAttribute('colspan') || 1), 0);
  assert.equal(width(old), width(descendants(table).filter((n) => n.tagName === 'TR' && n.getAttribute('data-code') === 'AAA')[0]));
  const card = byClass(content, 'ios-holding-detail-cards')[0].children[1];
  assert.equal((card.textContent.match(/本报告版本无三层快照/g) || []).length, 1);
});
