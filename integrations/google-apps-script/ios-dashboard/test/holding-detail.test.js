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

test('the 持仓明细 tab is a tab of its own and renders the selected report', () => {
  const { document, content } = load(bootstrapWith(ROWS));
  assert.ok(document.getElementById('ios-tab-holdingDetail').classList.contains('active'));
  assert.match(content.textContent, /持仓明细/);
  assert.match(content.textContent, /第三方公允值仅供参考，不能替代长期买入上限/);
  assert.match(content.textContent, /估值研究日期早于本报告日期超过 90 天标「需更新」；日期缺失或不可读为「未比较」/);
});

test('table: three separate groups, 长期买入上限 and 本周区间 never adjacent', () => {
  const { content } = load(bootstrapWith(ROWS));
  const table = byClass(content, 'ios-holding-detail-table')[0];
  const [groupRow, labelRow] = descendants(table).filter((n) => n.tagName === 'TR').slice(0, 2);
  assert.deepEqual(groupRow.children.map((c) => c.textContent), ['标的', '估值约束（台账）', '本周执行', '第三方公允值（仅供参考）']);
  const labels = labelRow.children.map((c) => c.textContent);
  const cap = labels.indexOf('长期买入上限');
  const range = labels.indexOf('本周区间');
  assert.ok(cap !== -1 && range !== -1);
  assert.ok(Math.abs(range - cap) > 1, 'cap and weekly range are not adjacent');
  assert.ok(labelRow.children[cap].classList.contains('ios-detail-group-start'));
  assert.ok(labelRow.children[labels.indexOf('适用周')].classList.contains('ios-detail-group-start'));
  const first = descendants(table).filter((n) => n.tagName === 'TR' && n.getAttribute('data-code') === 'AAA')[0];
  const cells = first.children.map((c) => c.textContent);
  assert.equal(cells[cap], '400 USD');
  assert.equal(cells[range], '350 USD（区间1，本周购买计划） – 380 USD（区间1，本周购买计划）');
  assert.equal(cells[labels.indexOf('公允值')], '410.5 USD');
});

test('cards: the three groups are separate blocks in order, the EFV block says 仅供参考', () => {
  const { content } = load(bootstrapWith(ROWS));
  const cards = byClass(content, 'ios-holding-detail-cards')[0];
  const card = cards.children[0];
  const groups = card.children.filter((c) => c.classList.contains('ios-detail-group'));
  assert.deepEqual(groups.map((g) => g.children[0].textContent), ['估值约束（台账）', '本周执行', '第三方公允值（仅供参考）']);
  assert.match(groups[0].textContent, /长期买入上限: 400 USD/);
  assert.doesNotMatch(groups[0].textContent, /本周区间/);
  assert.match(groups[1].textContent, /本周区间: 350 USD/);
  assert.doesNotMatch(groups[1].textContent, /长期买入上限/);
  assert.match(groups[2].textContent, /来源: external-source · 获取日期: 2026-11-08/);
  assert.match(groups[2].textContent, /仅供参考，不能替代长期买入上限/);
  assert.match(cards.children[1].textContent, /本周区间: 无区间：暂停中/);
  assert.match(cards.children[2].textContent, /长期买入上限: 未提供/);
  assert.match(cards.children[2].textContent, /现价距上限: 未比较（无长期买入上限）/);
});

test('filters count and narrow the rows; an empty filter says so', () => {
  const { content, window } = load(bootstrapWith(ROWS));
  const labels = byClass(content, 'ios-detail-filter-btn').map((b) => b.textContent);
  assert.deepEqual(labels, ['全部 (3)', '本周有区间 (1)', '暂停中 (1)', '估值缺失 (1)', '持仓 (2)', '观察 (1)']);
  const codes = () => byClass(content, 'ios-holding-detail-cards')[0].children.map((c) => c.getAttribute('data-code'));
  const click = (filter) => byClass(content, 'ios-detail-filter-btn').find((b) => b.getAttribute('data-filter') === filter).click();
  click('suspended');
  assert.deepEqual(codes(), ['PPP']);
  click('watchlist');
  assert.deepEqual(codes(), ['VVV']);
  click('hasRange');
  assert.deepEqual(codes(), ['AAA']);
  const one = load(bootstrapWith([ROWS[0]]));
  byClass(one.content, 'ios-detail-filter-btn').find((b) => b.getAttribute('data-filter') === 'suspended').click();
  assert.match(one.content.textContent, /没有符合「暂停中」的标的。/);
  assert.equal(typeof window.selectTab, 'function');
});

test('an empty report and a view model without holdingDetail render safely', () => {
  assert.match(load(bootstrapWith([])).content.textContent, /本期报告没有持仓或观察行/);
  const missing = bootstrapWith(undefined);
  delete missing.weekly.holdingDetail;
  assert.match(load(missing).content.textContent, /本报告未提供持仓明细/);
});

test('a history report renders its own frozen rows, not the latest report', () => {
  const latest = bootstrapWith(ROWS);
  latest.weeklyHistory = [{ reportId: 'weekly-2026-11-02', reportDate: '2026-11-02' }];
  const legacy = logic.buildHoldingDetailRow_({ 代码: 'OLD', 名称: 'Old Co.', 资产类型: 'holding' }, null);
  const historical = bootstrapWith([legacy]).weekly;
  const { content, window } = load(latest, { getReport: () => historical });
  window.selectHistoryReport('weekly-2026-11-02');
  const text = content.textContent;
  assert.match(text, /OLD/);
  assert.doesNotMatch(text, /AAA/);
  assert.match(text, /未提供（本报告版本无三层快照）/);
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
