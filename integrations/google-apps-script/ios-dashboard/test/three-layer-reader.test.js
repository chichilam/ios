// Tests for the Issue #316 P4 (#323) three-layer reader: the current-epoch
// gate, the safe scan of both suspension carriers, the seen-set gate, the
// build marker, and the three-layer card. Issue #327 (PR C) adds the
// 本周价格参考 block: 今日行动 (first screen, then its collapsed basis,
// 本周购买区间 → 确认/否定条件; all research is in 今日行动依据.
// Same plain node:test/node:assert discipline as the other test files.
//
// Run: node --test integrations/google-apps-script/ios-dashboard/test/three-layer-reader.test.js

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { createFakeDocument, createGoogleScriptRunStub } = require('./fake-dom');

const logic = require(path.join(__dirname, '..', 'Code.gs'));
const SCRIPT_HTML_SRC = fs.readFileSync(path.join(__dirname, '..', 'Script.html'), 'utf8');

const T = logic.READER_TEXT_;
const E1_ID = 'AAA|业绩或指引|8-K-2026-10-20';
const E1 = {
  暂停记录ID: E1_ID, 代码: 'AAA', 事件类别: '业绩或指引', 事件说明: '指引下调', 事件时间: '2026-10-20T08:00',
  来源: '公司公告 8-K', 记录时间: '2026-10-20T09:00', 记录者: 'daily'
};

function payload(records) {
  return JSON.stringify(records);
}

function readyRow(overrides) {
  return Object.assign({
    报告ID: 'daily-2026-10-19', 生成ID: 'g-current', 报告类型: 'daily', 报告日期: '2026-10-19',
    资产类型: 'holding', 代码: 'AAA', 名称: 'Alpha Co.', 排序: 1,
    入场计划ID: 'plan-a-v3', 入场计划版本: 3, 执行状态: '可小额开始', 准备状态: '可准备订单',
    今日行动: '可人工准备限价单', 今日行动说明: '人工准备限价单，最高 380 USD，当日有效',
    当前价格: 365, 报价币种: 'USD', 行情属性: '实时', 行情截至时间: '2026-10-19 10:30 美东',
    计划买入下限: '350 USD（区间1，本周购买计划）', 计划买入上限: '380 USD（区间1，本周购买计划）',
    建议限价: 380, 建议订单规模说明: '10000 USD（区间1）', 计划订单有效期: '当日有效', 阻塞待办ID: '无',
    周计划ID: 'wp-a-7', 周计划版本: 7, 周计划状态: '有效', 周计划结论: '有购买区间', 周计划执行路径: '估值区间限价',
    周计划适用周: '2026-10-19–2026-10-23 NYSE', 周计划研究截至: '2026-10-17T16:00', 周计划复核时间: '2026-10-18T09:00',
    周计划复核方式: '新研究', 长期合理价值: '420–480 USD', 长期买入上限快照: 400, 估值研究日期快照: '2026-09-30',
    资金结论: '已核验充足', 当前阻碍: '', 暂停事件载荷: '', 已核验暂停记录ID: '[]'
  }, overrides || {});
}

function summaryRow(overrides) {
  return Object.assign({
    报告ID: 'daily-2026-10-19', 生成ID: 'g-current', 报告类型: 'daily', 报告日期: '2026-10-19',
    一句话结论: 'three-layer headline', 核心状态: '正常', Review状态: '已检查', 当前持仓数: 1, 高优先级观察数: 0,
    生成时间: '2026-10-19T10:30:00-04:00', 购买计划模式: 'three_layer', 模式纪元: 2,
    暂停载体行数: JSON.stringify({ 报告持仓: 1, 周计划暂停记录: 0 })
  }, overrides || {});
}

/** A three_layer installation at epoch 2 with one current Daily generation. */
function world(changes) {
  const c = changes || {};
  const tabs = {
    当前持仓: [], 交易记录: [], 观察名单: [],
    报告摘要: c.summaries || [summaryRow(c.summary)],
    报告持仓: c.assets || [readyRow(c.row)],
    报告风险: [], 报告待办: [],
    _安装状态: c.state === undefined ? [{ purchase_plan_mode: 'three_layer', purchase_plan_mode_epoch: 2 }] : c.state,
    周计划暂停记录: c.records === undefined ? [] : c.records
  };
  if (c.state === null) delete tabs._安装状态;
  if (c.records === null) delete tabs.周计划暂停记录;
  return tabs;
}

/** A well-formed #327 snapshot (matrix #51): attention 360–370 USD, not above the cap of 400. */
const REFERENCE_360 = {
  价格参考结论: '有关注范围', 价格参考下沿: 360, 价格参考上沿: 370, 价格参考币种: 'USD',
  价格参考支撑: '358（2026-10-14 低点）', 价格参考阻力: '392（2026-10-09 高点）',
  价格参考确认条件: '本周连续两个交易日收盘不低于 360', 价格参考否定条件: '收盘跌破 350 且放量',
  价格参考趋势环境: '板块横盘，大盘温和上行',
  价格参考出处: JSON.stringify({ 数据来源: '交易所日线', 取价口径: '未复权收盘价', 回看窗口: '前一个完整交易周', 交易所: 'NYSE', 交易所时区: 'America/New_York' }),
  价格参考缺口: '', 价格参考与上限关系: '关注区不高于上限', 价格参考位置: '关注区内'
};

/** Matrix #52: no range within the long-term cap; the attention zone 420–440 lies entirely above 400. */
const T7_ABOVE_CAP = Object.assign({}, REFERENCE_360, {
  价格参考下沿: 420, 价格参考上沿: 440, 价格参考与上限关系: '关注区全部高于上限', 价格参考位置: '低于关注区',
  周计划结论: '无符合长期估值的区间', 周计划执行路径: '', 今日行动: '本周无购买区间',
  今日行动说明: '本周技术关注区高于长期买入上限', 执行状态: '', 准备状态: '', 计划买入下限: '', 计划买入上限: '',
  建议限价: '', 建议订单规模说明: '', 计划订单有效期: '', 当前阻碍: '本周无符合长期估值的购买区间'
});

const REFERENCE_COLUMNS = Object.keys(REFERENCE_360);

function referenceBlock(cardNode) {
  return descendants(cardNode).find((c) => c.classList && c.classList.contains('ios-price-reference')) || null;
}

function descendants(node) {
  return (node.children || []).reduce((all, child) => all.concat([child], descendants(child)), []);
}

function firstRow(tabs) {
  return logic.buildReportViewModel_(tabs, 'daily', null).holdings[0];
}

function render(bootstrap) {
  const document = createFakeDocument();
  const sandbox = {
    document, window: {}, google: createGoogleScriptRunStub({}),
    IOS_BOOTSTRAP: bootstrap, IOS_ACTIVE_VIEW: 'daily', console
  };
  vm.createContext(sandbox);
  vm.runInContext(SCRIPT_HTML_SRC, sandbox, { filename: 'Script.html' });
  return document;
}

function card(document) {
  return document.getElementById('ios-tab-content').children[0].children[1].children[0];
}

function firstScreen(cardNode) {
  return cardNode.children.filter((c) => c.tagName !== 'DETAILS' && !c.classList.contains('ios-price-reference'))
    .map((c) => c.textContent).join('\n');
}

function details(cardNode) {
  return cardNode.children.find((c) => c.tagName === 'DETAILS');
}

function verdictOf(tabs) {
  const doc = render(logic.buildDashboardBootstrap_(tabs));
  return { doc, badge: card(doc).children[0].children[1].textContent, screen: firstScreen(card(doc)) };
}

// -- Mode and epoch -----------------------------------------------------------

test('resolveInstallMode_: a well-formed single row gives (mode, epoch); everything else is unreadable', () => {
  const ok = (rows, hasModeColumns) => logic.resolveInstallMode_({ status: 'ok', hasModeColumns: hasModeColumns !== false, rows });
  assert.deepEqual(ok([{ purchase_plan_mode: 'three_layer', purchase_plan_mode_epoch: 2 }]), { readable: true, mode: 'three_layer', epoch: 2 });
  assert.deepEqual(ok([{ purchase_plan_mode: 'three_layer_hold', purchase_plan_mode_epoch: '3' }]), { readable: true, mode: 'three_layer_hold', epoch: 3 });
  for (const epoch of ['', null, 0, -1, 1.5, '2a', true, '0', ' ']) {
    assert.equal(ok([{ purchase_plan_mode: 'three_layer', purchase_plan_mode_epoch: epoch }]).readable, false, String(epoch));
  }
  for (const mode of ['', 'three_layer_v2', 'Three_layer', null]) {
    assert.equal(ok([{ purchase_plan_mode: mode, purchase_plan_mode_epoch: 2 }]).readable, false, String(mode));
  }
  assert.equal(ok([]).readable, false, 'no row');
  assert.equal(ok([{ purchase_plan_mode: 'legacy', purchase_plan_mode_epoch: 1 }, { purchase_plan_mode: 'legacy', purchase_plan_mode_epoch: 1 }]).readable, false, 'two rows');
  assert.equal(logic.resolveInstallMode_({ status: 'missing' }).readable, false);
  assert.equal(logic.resolveInstallMode_({ status: 'error' }).readable, false);
  assert.equal(logic.resolveInstallMode_(undefined).readable, false);
  // A pre-schema_version-9 installation (no mode columns at all) is legacy at epoch 1.
  assert.deepEqual(ok([{}], false), { readable: true, mode: 'legacy', epoch: 1 });
});

test('generationMode_: pre-guard rows read as legacy epoch 1; a three-layer generation must carry its epoch', () => {
  assert.deepEqual(logic.generationMode_({ 购买计划模式: '', 模式纪元: '' }), { mode: 'legacy', epoch: 1 });
  assert.deepEqual(logic.generationMode_({}), { mode: 'legacy', epoch: 1 });
  assert.deepEqual(logic.generationMode_({ 购买计划模式: 'three_layer', 模式纪元: '4' }), { mode: 'three_layer', epoch: 4 });
  assert.equal(logic.generationMode_({ 购买计划模式: 'three_layer', 模式纪元: '' }), null);
  assert.equal(logic.generationMode_({ 购买计划模式: 'three_layer', 模式纪元: 'x' }), null);
  assert.equal(logic.generationMode_({ 购买计划模式: 'other', 模式纪元: 2 }), null);
});

// -- Parsing ------------------------------------------------------------------

test('parsePayloadCell_ and parseSeenSet_ accept only the canonical shapes', () => {
  assert.deepEqual(logic.parsePayloadCell_(''), []);
  assert.deepEqual(logic.parsePayloadCell_(payload([E1])).map((e) => e.暂停记录ID), [E1_ID]);
  for (const bad of ['{', '{}', '[1]', '[{"代码":"AAA"}]', '[{"暂停记录ID":"x","代码":""}]', 7, true]) {
    assert.equal(logic.parsePayloadCell_(bad), null, String(bad));
  }
  assert.deepEqual(logic.parseSeenSet_('[]'), []);
  assert.deepEqual(logic.parseSeenSet_('["a","b"]'), ['a', 'b']);
  for (const bad of ['', null, '["b","a"]', '["a","a"]', '[1]', '{}', 'x', '[""]', 5]) {
    assert.equal(logic.parseSeenSet_(bad), null, String(bad));
  }
});

test('scanWatermark_ takes the largest recorded counts and refuses a malformed one', () => {
  const marks = logic.scanWatermark_([
    { 暂停载体行数: JSON.stringify({ 报告持仓: 5, 周计划暂停记录: 1 }) },
    { 暂停载体行数: JSON.stringify({ 报告持仓: 3, 周计划暂停记录: 2 }) },
    { 暂停载体行数: '' }
  ]);
  assert.deepEqual(marks, { ok: true, marks: { 报告持仓: 5, 周计划暂停记录: 2 } });
  for (const bad of ['{', '[]', '{"报告持仓":-1}', '{"报告持仓":1.5}', '{"报告持仓":"3"}', 42]) {
    assert.equal(logic.scanWatermark_([{ 暂停载体行数: bad }]).ok, false, String(bad));
  }
});

// -- Safe scan ----------------------------------------------------------------

function reader(results, calls, name) {
  let i = 0;
  return () => {
    calls.push(name);
    const r = results[Math.min(i, results.length - 1)];
    i += 1;
    return typeof r === 'function' ? r() : r;
  };
}

const WM0 = { ok: true, marks: { 报告持仓: 0, 周计划暂停记录: 0 } };

test('runSafeScan_ reads the payload column before the record tab, retries once, and never returns an empty set on failure', () => {
  const calls = [];
  const scan = logic.runSafeScan_(
    reader([{ ok: false }, { ok: true, cells: [payload([E1]), ''] }], calls, 'payload'),
    reader([{ ok: true, rows: [] }], calls, 'records'),
    WM0
  );
  assert.deepEqual(calls, ['payload', 'records', 'payload', 'records']);
  assert.deepEqual(scan, { verifiable: true, idsByCode: { AAA: [E1_ID] } });

  const failing = logic.runSafeScan_(reader([{ ok: false }], [], 'p'), reader([{ ok: true, rows: [] }], [], 'r'), WM0);
  assert.deepEqual(failing, { verifiable: false });
  const recordsFail = logic.runSafeScan_(reader([{ ok: true, cells: [] }], [], 'p'), reader([{ ok: false }], [], 'r'), WM0);
  assert.equal(recordsFail.verifiable, false);
});

test('runSafeScan_: a count below the watermark, a malformed payload cell or an unreadable record row is unverifiable', () => {
  const wm = { ok: true, marks: { 报告持仓: 2, 周计划暂停记录: 1 } };
  const short = logic.runSafeScan_(reader([{ ok: true, cells: [''] }], [], 'p'), reader([{ ok: true, rows: [{ id: E1_ID, code: 'AAA' }] }], [], 'r'), wm);
  assert.equal(short.verifiable, false, 'payload rows below the watermark');
  const shortRecords = logic.runSafeScan_(reader([{ ok: true, cells: ['', ''] }], [], 'p'), reader([{ ok: true, rows: [] }], [], 'r'), wm);
  assert.equal(shortRecords.verifiable, false, 'record rows below the watermark');
  const recovered = logic.runSafeScan_(
    reader([{ ok: true, cells: [''] }, { ok: true, cells: ['', ''] }], [], 'p'),
    reader([{ ok: true, rows: [{ id: E1_ID, code: 'AAA' }] }], [], 'r'), wm);
  assert.equal(recovered.verifiable, true, 'the one retry may succeed');
  const malformed = logic.runSafeScan_(reader([{ ok: true, cells: ['not json'] }], [], 'p'), reader([{ ok: true, rows: [] }], [], 'r'), WM0);
  assert.equal(malformed.verifiable, false);
  for (const rec of [{ id: '', code: 'AAA' }, { id: E1_ID, code: '' }, { id: E1_ID, code: null }]) {
    const bad = logic.runSafeScan_(reader([{ ok: true, cells: [] }], [], 'p'), reader([{ ok: true, rows: [rec] }], [], 'r'), WM0);
    assert.equal(bad.verifiable, false, JSON.stringify(rec));
  }
  assert.equal(logic.runSafeScan_(reader([{ ok: true, cells: [] }], [], 'p'), reader([{ ok: true, rows: [] }], [], 'r'), { ok: false }).verifiable, false);
});

test('#46/#47: an event moved from a payload into the record tab before, between or after the two reads is never missed', () => {
  // Before the scan: in both. Between the reads: in the payload read. After: in the payload read.
  const cases = {
    before: [{ ok: true, cells: [payload([E1])] }, { ok: true, rows: [{ id: E1_ID, code: 'AAA' }] }],
    between: [{ ok: true, cells: [payload([E1])] }, { ok: true, rows: [{ id: E1_ID, code: 'AAA' }] }],
    after: [{ ok: true, cells: [payload([E1])] }, { ok: true, rows: [] }]
  };
  for (const [name, [p, r]] of Object.entries(cases)) {
    const scan = logic.runSafeScan_(() => p, () => r, WM0);
    assert.deepEqual(scan.idsByCode.AAA, [E1_ID], name);
  }
});

// -- Reader gate on real view models --------------------------------------------

test('#19/#31/#45: a current three_layer generation with no event is orderable and shows 适合买入 with the weekly range', () => {
  const row = firstRow(world());
  assert.deepEqual(row._iosOrderable, { ok: true, message: null });
  const { doc, badge, screen } = verdictOf(world());
  assert.equal(badge, '适合买入');
  assert.match(screen, /今日建议/);
  assert.match(screen, /本周购买区间: 最低 350 USD（区间1，本周购买计划） · 最高 380 USD（区间1，本周购买计划）/);
  assert.match(details(card(doc)).textContent, /适用周: 2026-10-19–2026-10-23 NYSE/);
  assert.match(details(card(doc)).textContent, /周计划状态: 有效/);
  assert.match(details(card(doc)).textContent, /价格条件: 可小额开始/);
  assert.match(details(card(doc)).textContent, /资金（仅本批次）: 已核验充足/);
  assert.match(screen, /已校验订单限价: 380（人工复查后手工提交）/);
  assert.match(screen, /规模: 10000 USD（区间1） · 有效期: 当日有效/);
  assert.equal(doc.getElementById('ios-summary-content').textContent.indexOf('非当前行动'), -1);
});

test('#20/#21/#22: a generation from another epoch is a pre-change snapshot -- banner, nothing orderable, order facts kept', () => {
  for (const state of [
    [{ purchase_plan_mode: 'three_layer', purchase_plan_mode_epoch: 3 }],
    [{ purchase_plan_mode: 'three_layer_hold', purchase_plan_mode_epoch: 3 }]
  ]) {
    const tabs = world({ state, assets: [readyRow(), readyRow({ 代码: 'BBB', 排序: 2, 今日行动: '已有订单勿重复', 建议限价: '',
      建议订单规模说明: '', 计划订单有效期: '', 准备状态: '已有有效订单不重复建议', 最近订单状态: '已挂单', 阻塞待办ID: '无' })] });
    const vmodel = logic.buildReportViewModel_(tabs, 'daily', null);
    assert.equal(vmodel.readerGate.current, false);
    assert.equal(vmodel.readerGate.banner, T.epochChanged);
    const doc = render(logic.buildDashboardBootstrap_(tabs));
    assert.match(doc.getElementById('ios-summary-content').textContent, /该报告生成于购买计划模式变更前，非当前行动/);
    const cards = doc.getElementById('ios-tab-content').children[0].children[1].children;
    assert.equal(cards[0].children[0].children[1].textContent, '无法判断');
    const first = firstScreen(cards[0]);
    assert.doesNotMatch(first, /已校验订单限价/);
    assert.match(first, /报告建议（非当前行动）/);
    assert.match(first, /该报告生成于购买计划模式变更前，非当前行动，请勿据此下单/);
    assert.equal(cards[1].children[0].children[1].textContent, '等待', 'an open-order row keeps its 已有订单勿重复 wait');
    assert.match(details(cards[1]).textContent, /最近订单状态: 已挂单/);
  }
});

test('#20: a legacy generation written before a switch is not current once the epoch moved', () => {
  const legacy = readyRow({ 周计划ID: '', 周计划状态: '', 资金结论: '', 已核验暂停记录ID: '', 计划买入下限: '350 USD（区间1）',
    计划买入上限: '380 USD（区间1）' });
  for (const summary of [{ 购买计划模式: '', 模式纪元: '' }, { 购买计划模式: 'legacy', 模式纪元: 1 }]) {
    const tabs = world({ summary, assets: [legacy] });
    const vmodel = logic.buildReportViewModel_(tabs, 'daily', null);
    assert.equal(vmodel.readerGate.current, false, JSON.stringify(summary));
    assert.equal(vmodel.holdings[0]._iosOrderable.ok, false);
    assert.equal(verdictOf(tabs).badge, '无法判断');
  }
  // Still legacy at epoch 1: the same row is current and keeps its legacy layout.
  const unchanged = world({ summary: { 购买计划模式: '', 模式纪元: '' }, assets: [legacy],
    state: [{ purchase_plan_mode: 'legacy', purchase_plan_mode_epoch: 1 }] });
  const { badge, screen } = verdictOf(unchanged);
  assert.equal(badge, '适合买入');
  assert.match(screen, /建议买入范围: 最低 350 USD（区间1） · 最高 380 USD（区间1）/);
});

test('the same epoch with a different mode is still not current', () => {
  const tabs = world({ state: [{ purchase_plan_mode: 'three_layer_hold', purchase_plan_mode_epoch: 2 }] });
  const vmodel = logic.buildReportViewModel_(tabs, 'daily', null);
  assert.equal(vmodel.readerGate.current, false);
  assert.equal(vmodel.holdings[0]._iosOrderable.ok, false);
});

test('an unreadable _安装状态 makes every generation not current-executable', () => {
  for (const state of [null, [], [{ purchase_plan_mode: 'three_layer', purchase_plan_mode_epoch: '' }],
    [{ purchase_plan_mode: 'three_layer', purchase_plan_mode_epoch: 2 }, { purchase_plan_mode: 'three_layer', purchase_plan_mode_epoch: 2 }]]) {
    const vmodel = logic.buildReportViewModel_(world({ state }), 'daily', null);
    assert.equal(vmodel.readerGate.current, false, JSON.stringify(state));
    assert.equal(vmodel.readerGate.banner, T.modeUnreadable);
    assert.equal(verdictOf(world({ state })).badge, '无法判断');
  }
  const blankEpoch = logic.buildReportViewModel_(world({ summary: { 模式纪元: '' } }), 'daily', null);
  assert.equal(blankEpoch.readerGate.banner, T.generationInvalid);
});

test('#32/#38/#39/#40: an id the generation did not see makes the row not orderable, from either carrier', () => {
  const inRecords = world({ records: [E1] });
  assert.deepEqual(firstRow(inRecords)._iosOrderable, { ok: false, message: T.unseenEvent });
  const orphan = readyRow({ 生成ID: 'g-orphan', 暂停事件载荷: payload([E1]) });
  const inPayload = world({ assets: [readyRow(), orphan], summary: { 暂停载体行数: JSON.stringify({ 报告持仓: 2, 周计划暂停记录: 0 }) } });
  assert.deepEqual(firstRow(inPayload)._iosOrderable, { ok: false, message: T.unseenEvent });
  const { badge, screen } = verdictOf(inRecords);
  assert.equal(badge, '无法判断');
  assert.match(screen, /有未纳入本报告的暂停事件，非当前行动/);
  assert.doesNotMatch(screen, /已校验订单限价/);
});

test('#43/#44: a released event the generation saw does not block; an older generation that never saw it stays blocked', () => {
  const sawIt = world({ records: [E1], row: { 已核验暂停记录ID: JSON.stringify([E1_ID]) } });
  assert.equal(firstRow(sawIt)._iosOrderable.ok, true);
  assert.equal(verdictOf(sawIt).badge, '适合买入');
  const older = world({ records: [E1], row: { 已核验暂停记录ID: '[]' } });
  assert.equal(firstRow(older)._iosOrderable.ok, false);
});

test('an event for another 代码 never blocks this row', () => {
  const other = Object.assign({}, E1, { 暂停记录ID: 'BBB|业绩或指引|x', 代码: 'BBB' });
  assert.equal(firstRow(world({ records: [other] }))._iosOrderable.ok, true);
});

test('#41/#48: a failed, partial or malformed scan, or a blank/unparseable seen set, is 暂停状态无法核验', () => {
  const unverifiable = { ok: false, message: T.scanUnverifiable };
  assert.deepEqual(firstRow(world({ records: null }))._iosOrderable, unverifiable, 'record tab absent');
  assert.deepEqual(firstRow(world({ row: { 暂停事件载荷: '{bad' } }))._iosOrderable, unverifiable, 'payload cell malformed');
  assert.deepEqual(firstRow(world({ summary: { 暂停载体行数: JSON.stringify({ 报告持仓: 9, 周计划暂停记录: 0 }) } }))._iosOrderable,
    unverifiable, 'fewer rows than the watermark');
  assert.deepEqual(firstRow(world({ records: [{ 暂停记录ID: E1_ID, 代码: '' }] }))._iosOrderable, unverifiable, 'unreadable 代码');
  for (const seen of ['', 'x', '["b","a"]']) {
    assert.deepEqual(firstRow(world({ row: { 已核验暂停记录ID: seen } }))._iosOrderable, unverifiable, seen);
  }
  const { badge, screen } = verdictOf(world({ records: null }));
  assert.equal(badge, '无法判断');
  assert.match(screen, /暂停状态无法核验/);
});

test('the suspension gate applies only to three-layer generations; a legacy generation is gated by its epoch alone', () => {
  const legacy = world({
    summary: { 购买计划模式: 'legacy', 模式纪元: 1, 暂停载体行数: '' },
    row: { 周计划ID: '', 周计划状态: '', 资金结论: '', 已核验暂停记录ID: '' },
    state: [{ purchase_plan_mode: 'legacy', purchase_plan_mode_epoch: 1 }],
    records: null
  });
  assert.equal(firstRow(legacy)._iosOrderable.ok, true);
});

test('a three-layer ready row also needs 周计划状态=有效 and 资金结论=已核验充足', () => {
  for (const row of [{ 周计划状态: '已过期' }, { 资金结论: '不足' }, { 资金结论: '未核验' }, { 资金结论: '' }]) {
    assert.equal(verdictOf(world({ row })).badge, '无法判断', JSON.stringify(row));
  }
});

test('#3/#4: 本周无购买区间 renders as 等待 with its reason, and never shows a validated limit', () => {
  const tabs = world({ row: { 今日行动: '本周无购买区间', 执行状态: '', 准备状态: '无需准备', 建议限价: '', 建议订单规模说明: '',
    计划订单有效期: '', 周计划结论: '无符合长期估值的区间', 计划买入下限: '', 计划买入上限: '', 资金结论: '不适用',
    当前阻碍: '本周研究区间 420–440 高于长期买入上限 400', 今日行动说明: '' } });
  const { badge, screen } = verdictOf(tabs);
  assert.equal(badge, '等待');
  assert.match(screen, /本周购买区间: 无（无符合长期估值的区间）/);
  assert.match(screen, /等待理由: 本周研究区间 420–440 高于长期买入上限 400/);
  assert.doesNotMatch(screen, /已校验订单限价/);
});

test('hold mode: rows are 先核对缺项 with no range, and order hints stay first', () => {
  const tabs = world({
    summary: { 购买计划模式: 'three_layer_hold', 模式纪元: 3 },
    state: [{ purchase_plan_mode: 'three_layer_hold', purchase_plan_mode_epoch: 3 }],
    row: { 今日行动: '先核对缺项', 执行状态: '', 准备状态: '无法确认', 建议限价: '', 建议订单规模说明: '', 计划订单有效期: '',
      计划买入下限: '三层购买计划暂停中', 计划买入上限: '三层购买计划暂停中', 当前阻碍: '三层购买计划暂停中', 阻塞待办ID: 'T-1' }
  });
  const { badge, screen } = verdictOf(tabs);
  assert.equal(badge, '无法判断');
  assert.match(screen, /本周购买区间: 三层购买计划暂停中/);
  assert.doesNotMatch(screen, /已校验订单限价/);
});

test('B3: a current hold generation never buys, even from a writer\'s mistaken ready row; order facts stay', () => {
  const hold = { summary: { 购买计划模式: 'three_layer_hold', 模式纪元: 3 },
    state: [{ purchase_plan_mode: 'three_layer_hold', purchase_plan_mode_epoch: 3 }] };
  const tabs = world(Object.assign({}, hold, { assets: [readyRow(), readyRow({ 代码: 'BBB', 排序: 2, 今日行动: '已有订单勿重复', 建议限价: '',
    建议订单规模说明: '', 计划订单有效期: '', 准备状态: '已有有效订单不重复建议', 最近订单状态: '已挂单' })] }));
  const vmodel = logic.buildReportViewModel_(tabs, 'daily', null);
  assert.equal(vmodel.readerGate.current, true, 'the hold generation itself is current');
  assert.equal(vmodel.readerGate.mode, 'three_layer_hold');
  assert.deepEqual(vmodel.holdings[0]._iosOrderable, { ok: false, message: T.holdMode });
  const doc = render(logic.buildDashboardBootstrap_(tabs));
  const cards = doc.getElementById('ios-tab-content').children[0].children[1].children;
  assert.equal(cards[0].children[0].children[1].textContent, '无法判断');
  assert.doesNotMatch(firstScreen(cards[0]), /已校验订单限价/);
  assert.match(firstScreen(cards[0]), /三层购买计划暂停中，非当前行动/);
  assert.equal(cards[1].children[0].children[1].textContent, '等待');
  assert.match(details(cards[1]).textContent, /最近订单状态: 已挂单/);
});

test('B3: the renderer refuses a hold or unmarked three-layer ready row even if the server gate says ok', () => {
  for (const mode of ['three_layer_hold', undefined, null, 'other']) {
    const bootstrap = logic.buildDashboardBootstrap_(world());
    bootstrap.daily.holdings.forEach((row) => { row._iosOrderable = { ok: true, message: null }; row._iosPurchaseMode = mode; });
    assert.equal(card(render(bootstrap)).children[0].children[1].textContent, '无法判断', String(mode));
  }
  const ok = logic.buildDashboardBootstrap_(world());
  assert.equal(card(render(ok)).children[0].children[1].textContent, '适合买入');
});

test('B3: hold crossed with an epoch change or a blank epoch still never buys', () => {
  const cases = [
    { summary: { 购买计划模式: 'three_layer_hold', 模式纪元: 3 }, state: [{ purchase_plan_mode: 'three_layer', purchase_plan_mode_epoch: 4 }] },
    { summary: { 购买计划模式: 'three_layer_hold', 模式纪元: '' }, state: [{ purchase_plan_mode: 'three_layer_hold', purchase_plan_mode_epoch: 3 }] },
    { summary: { 购买计划模式: 'three_layer_hold', 模式纪元: 3 }, state: null }
  ];
  for (const c of cases) assert.equal(verdictOf(world(c)).badge, '无法判断', JSON.stringify(c));
});

test('card order: technical range precedes conditions after the weekly range; one closed basis holds other research', () => {
  const c = card(render(logic.buildDashboardBootstrap_(world({ row: REFERENCE_360 }))));
  const children = c.children;
  const blocks = children.filter((n) => n.tagName === 'DETAILS');
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].children[0].textContent, '今日行动依据');
  assert.equal(blocks[0].getAttribute('open'), null);
  assert.equal(children[children.length - 1], blocks[0]);
  const range = children.findIndex((n) => n.textContent.startsWith('本周购买区间:'));
  assert.equal(children[range + 2].textContent, '确认条件: 本周连续两个交易日收盘不低于 360');
  assert.equal(children[range + 3].textContent, '否定条件: 收盘跌破 350 且放量');
  assert.equal(children[range + 1].textContent, '技术关注范围: 360 – 370 USD');
  assert.match(children[range + 4].textContent, /技术参考，不是买入授权/);
  const screen = firstScreen(c);
  assert.doesNotMatch(screen, /支撑参考|阻力参考|趋势与环境|出处:|估值研究日期/);
  const basis = blocks[0].textContent;
  assert.match(basis, /周计划复核时间（每周复核，不是重新估值）: 2026-10-18T09:00/);
  assert.match(basis, /周度研究依据截至: 2026-10-17T16:00/);
  assert.match(basis, /执行路径: 估值区间限价/);
  assert.match(basis, /周计划版本: wp-a-7 v7/);
  assert.doesNotMatch(referenceBlock(c).textContent, /技术关注范围:/);
  assert.match(basis, /估值研究日期（长期估值研究，不随每周复核变化）: 2026-09-30/);
  assert.match(screen, /基准估值（长期合理价值）: 420–480 USD/);
  assert.doesNotMatch(basis, /长期合理价值/);
  assert.match(firstScreen(c), /长期买入上限: 400/);
  const quoteIndex = c.children.findIndex((node) => node.textContent.startsWith('市价:'));
  assert.equal(c.children[quoteIndex + 1].textContent, '基准估值（长期合理价值）: 420–480 USD');
  assert.equal(c.children[quoteIndex + 2].textContent, '长期买入上限: 400');
  assert.doesNotMatch(basis, /长期买入上限: 400/);
  assert.doesNotMatch(referenceBlock(c).textContent, /确认条件:|否定条件:/);
});

test('the Dashboard never shows a legacy 参考/锚点 range beside the weekly range on a three-layer row', () => {
  const tabs = world({ row: { '参考买入价/区间': '330-340', 入场计划估值锚点: '$450 附近', 当前区间: '区间2' } });
  const doc = render(logic.buildDashboardBootstrap_(tabs));
  const all = card(doc).textContent;
  assert.doesNotMatch(all, /330-340/);
  assert.doesNotMatch(all, /\$450 附近/);
  assert.doesNotMatch(all, /建议买入范围/);
});

test('a view model without reader results (an older server) is never shown as a current action', () => {
  const bootstrap = logic.buildDashboardBootstrap_(world());
  delete bootstrap.daily.readerGate;
  bootstrap.daily.holdings.forEach((row) => { delete row._iosOrderable; });
  const doc = render(bootstrap);
  assert.equal(card(doc).children[0].children[1].textContent, '无法判断');
  assert.match(doc.getElementById('ios-summary-content').textContent, /非当前行动/);
});

test('history: getReport_ applies the same gate to an older report', () => {
  const tabs = world({
    summaries: [summaryRow(), summaryRow({ 报告ID: 'daily-2026-10-16', 生成ID: 'g-old', 报告日期: '2026-10-16', 模式纪元: 1 })],
    assets: [readyRow(), readyRow({ 报告ID: 'daily-2026-10-16', 生成ID: 'g-old', 报告日期: '2026-10-16' })],
    summary: { 暂停载体行数: JSON.stringify({ 报告持仓: 2, 周计划暂停记录: 0 }) }
  });
  const old = logic.getReport_(tabs, 'daily-2026-10-16');
  assert.equal(old.readerGate.current, false);
  assert.equal(old.holdings[0]._iosOrderable.ok, false);
});

test('the reader keeps the generation pointer: an orphaned generation\'s rows are never rendered, though its payload is scanned', () => {
  const orphan = readyRow({ 生成ID: 'g-orphan', 代码: 'ZZZ', 暂停事件载荷: payload([Object.assign({}, E1, { 代码: 'ZZZ', 暂停记录ID: 'ZZZ|x' })]) });
  const tabs = world({ assets: [readyRow(), orphan], summary: { 暂停载体行数: JSON.stringify({ 报告持仓: 2, 周计划暂停记录: 0 }) } });
  const vmodel = logic.buildReportViewModel_(tabs, 'daily', null);
  assert.deepEqual(vmodel.holdings.map((r) => r.代码), ['AAA']);
  assert.equal(vmodel.holdings[0]._iosOrderable.ok, true);
});

// -- Issue #327 本周价格参考 (PR C) --------------------------------------------

const STATEMENT = '技术研究，不是买入授权，也不是订单价格。';
const OLD_REPORT_LINE = '本报告版本未提供本周价格参考（生成于 #327 之前）';

test('#51 有购买区间: the reference is collapsed apart from the executable range; the verdict is unchanged', () => {
  const doc = render(logic.buildDashboardBootstrap_(world({ row: REFERENCE_360 })));
  const c = card(doc);
  assert.equal(c.children[0].children[1].textContent, '适合买入');
  const block = referenceBlock(c);
  const t = block.textContent;
  assert.match(t, /^本周价格参考/);
  assert.ok(t.includes(STATEMENT));
  assert.match(t, /参考结论: 有关注范围/);
  assert.match(firstScreen(c), /技术关注范围: 360 – 370 USD/);
  assert.match(t, /支撑参考: 358（2026-10-14 低点）/);
  assert.match(t, /阻力参考: 392（2026-10-09 高点）/);
  assert.match(firstScreen(c), /确认条件: 本周连续两个交易日收盘不低于 360/);
  assert.match(firstScreen(c), /否定条件: 收盘跌破 350 且放量/);
  assert.match(t, /趋势与环境: 板块横盘，大盘温和上行/);
  assert.match(t, /与长期买入上限: 关注区不高于上限/);
  assert.match(t, /报告时现价相对关注区: 关注区内/);
  assert.match(t, /出处: 交易所日线 · 未复权收盘价 · 回看 前一个完整交易周 · NYSE（America\/New_York）/);
  assert.match(t, /技术研究截至 2026-10-17T16:00$/);
  // Never styled or worded as a second buy signal; the order price stays on the first screen only.
  assert.ok(descendants(block).every((n) => !n.classList || !n.classList.contains('ios-action-price')));
  assert.doesNotMatch(t, /已校验订单限价|建议限价|本周购买区间|适合买入/);
  assert.match(firstScreen(c), /已校验订单限价: 380/);
});

test('#52/#64 T7: no executable range, no buy, and the reference stays in the basis with the above-cap explanation', () => {
  const doc = render(logic.buildDashboardBootstrap_(world({ row: T7_ABOVE_CAP })));
  const c = card(doc);
  assert.equal(c.children[0].children[1].textContent, '等待');
  assert.match(firstScreen(c), /本周购买区间: 无（无符合长期估值的区间）/);
  assert.doesNotMatch(firstScreen(c), /已校验订单限价/);
  const t = referenceBlock(c).textContent;
  assert.match(t, /本周技术关注区高于长期买入上限，本周不执行新增购买/);
  assert.match(firstScreen(c), /技术关注范围: 420 – 440 USD/);
  assert.match(t, /与长期买入上限: 关注区全部高于上限/);
  // The visible cap is the snapshot's 400, never raised to the zone.
  assert.match(firstScreen(c), /长期买入上限: 400/);
});

test('#54 long-term valuation missing: a well-formed reference stays, compared as 无法比较, and never authorizes a buy', () => {
  const row = Object.assign({}, REFERENCE_360, {
    周计划结论: '长期估值缺失或失效', 今日行动: '先核对缺项', 今日行动说明: '长期估值缺失', 当前阻碍: '长期估值缺失',
    长期买入上限快照: '', 长期合理价值: '', 计划买入下限: '', 计划买入上限: '', 建议限价: '',
    价格参考与上限关系: '无法比较'
  });
  const c = card(render(logic.buildDashboardBootstrap_(world({ row }))));
  assert.equal(c.children[0].children[1].textContent, '无法判断');
  const t = referenceBlock(c).textContent;
  assert.match(firstScreen(c), /技术关注范围: 360 – 370 USD/);
  assert.match(t, /与长期买入上限: 无法比较/);
  assert.doesNotMatch(t, /本周不执行新增购买/);
  assert.ok(t.includes(STATEMENT));
});

test('technical data insufficient / condition-only: the gap is said plainly and no position is invented', () => {
  const thin = Object.assign({}, REFERENCE_360, {
    价格参考结论: '技术数据不足', 价格参考下沿: '', 价格参考上沿: '', 价格参考币种: '', 价格参考支撑: '', 价格参考阻力: '',
    价格参考确认条件: '', 价格参考否定条件: '', 价格参考缺口: '缺前一完整交易周成交量，无法判断关注位置',
    价格参考与上限关系: '无法比较', 价格参考位置: '无法比较'
  });
  const t = referenceBlock(card(render(logic.buildDashboardBootstrap_(world({ row: thin }))))).textContent;
  assert.match(t, /参考结论: 技术数据不足/);
  assert.match(t, /技术数据缺口: 缺前一完整交易周成交量，无法判断关注位置/);
  assert.doesNotMatch(t, /技术关注范围|支撑参考|阻力参考|350|380/);
  const conditional = Object.assign({}, thin, { 价格参考结论: '仅有条件观察', 价格参考确认条件: '放量站上 392', 价格参考缺口: '' });
  const c2 = card(render(logic.buildDashboardBootstrap_(world({ row: conditional }))));
  const t2 = referenceBlock(c2).textContent;
  assert.match(t2, /参考结论: 仅有条件观察/);
  assert.match(firstScreen(c2), /确认条件: 放量站上 392/);
  assert.match(firstScreen(c2), /否定条件: 本报告未提供/);
  assert.doesNotMatch(t2, /技术关注范围/);
});

test('S1 and S2 snapshot gaps are shown as written, with nothing filled in', () => {
  const blank = Object.fromEntries(REFERENCE_COLUMNS.map((k) => [k, '']));
  for (const [gap, status] of [['周计划异常，技术参考不可用', '周计划异常'], ['无周计划', '无周计划']]) {
    const row = Object.assign({}, T7_ABOVE_CAP, blank, { 价格参考缺口: gap, 周计划状态: status });
    const t = referenceBlock(card(render(logic.buildDashboardBootstrap_(world({ row }))))).textContent;
    assert.match(t, new RegExp('本周价格参考不可用（' + gap + '）'));
    assert.ok(t.includes(STATEMENT));
    assert.doesNotMatch(t, /技术关注范围|参考结论|技术研究截至/);
  }
});

test('#60 a three-layer row with no snapshot shows the fixed old-report line and is never filled from a plan tab', () => {
  const planTab = [{ 周计划ID: 'wp-a-7', 周计划版本: 7, 代码: 'AAA', 技术参考结论: '有关注范围', 技术关注下沿: 999, 技术关注上沿: 1001 }];
  const blank = Object.fromEntries(REFERENCE_COLUMNS.map((k) => [k, '']));
  for (const row of [{}, blank]) {
    const tabs = world({ row });
    tabs.周度购买计划 = planTab;
    const c = card(render(logic.buildDashboardBootstrap_(tabs)));
    const t = referenceBlock(c).textContent;
    assert.ok(t.includes(OLD_REPORT_LINE));
    assert.doesNotMatch(c.textContent, /999|1001/);
    assert.equal(c.children[0].children[1].textContent, '适合买入', 'a missing snapshot adds no gate');
  }
});

test('#59 legacy: a row of a legacy generation keeps its layout and never shows 本周价格参考, even if columns carry values', () => {
  const legacy = {
    summary: { 购买计划模式: 'legacy', 模式纪元: 1 },
    state: [{ purchase_plan_mode: 'legacy', purchase_plan_mode_epoch: 1 }]
  };
  const plainRow = Object.assign({}, REFERENCE_360, { 周计划ID: '', 周计划状态: '', 周计划版本: '' });
  for (const row of [plainRow, REFERENCE_360]) {
    const c = card(render(logic.buildDashboardBootstrap_(world(Object.assign({ row }, legacy)))));
    assert.equal(referenceBlock(c), null);
    assert.doesNotMatch(c.textContent, /本周价格参考|技术关注范围|360 – 370/);
  }
});

test('the reference never feeds the verdict: removing or altering it leaves every badge unchanged', () => {
  const rows = [readyRow(), Object.assign({}, readyRow(), T7_ABOVE_CAP),
    readyRow({ 今日行动: '先核对缺项', 今日行动说明: '缺报价', 当前阻碍: '缺报价' })];
  for (const base of rows) {
    const badges = [
      Object.assign({}, base),
      Object.assign({}, base, REFERENCE_360),
      Object.assign({}, base, T7_ABOVE_CAP, { 今日行动: base.今日行动, 今日行动说明: base.今日行动说明, 当前阻碍: base.当前阻碍,
        计划买入下限: base.计划买入下限, 计划买入上限: base.计划买入上限, 建议限价: base.建议限价, 周计划结论: base.周计划结论,
        执行状态: base.执行状态, 准备状态: base.准备状态, 建议订单规模说明: base.建议订单规模说明, 计划订单有效期: base.计划订单有效期,
        周计划执行路径: base.周计划执行路径 }),
      Object.assign({}, base, REFERENCE_360, { 价格参考与上限关系: '乱写', 价格参考出处: '{bad json' })
    ].map((row) => card(render(logic.buildDashboardBootstrap_(world({ row })))).children[0].children[1].textContent);
    assert.equal(new Set(badges).size, 1, JSON.stringify(badges));
  }
});

const CANONICAL_PROVENANCE = { 数据来源: '交易所日线', 取价口径: '未复权收盘价', 回看窗口: '前一个完整交易周', 交易所: 'NYSE', 交易所时区: 'America/New_York' };
const LAID_OUT = '出处: 交易所日线 · 未复权收盘价 · 回看 前一个完整交易周 · NYSE（America/New_York）';

function provenanceLine(cell) {
  const row = Object.assign({}, REFERENCE_360, { 价格参考出处: cell });
  const c = card(render(logic.buildDashboardBootstrap_(world({ row }))));
  const line = referenceBlock(c).children.find((n) => n.textContent.startsWith('出处: '));
  return { line: line ? line.textContent : null, badge: c.children[0].children[1].textContent, screen: firstScreen(c) };
}

test('provenance: only the exact canonical object is laid out, in any key order', () => {
  assert.equal(provenanceLine(JSON.stringify(CANONICAL_PROVENANCE)).line, LAID_OUT);
  const reversed = Object.fromEntries(Object.entries(CANONICAL_PROVENANCE).reverse());
  assert.equal(provenanceLine(JSON.stringify(reversed)).line, LAID_OUT);
  assert.equal(provenanceLine(JSON.stringify(CANONICAL_PROVENANCE, null, 2)).line, LAID_OUT, 'whitespace is not shape');
});

test('provenance: anything not exactly canonical is shown as written, so no source text is dropped', () => {
  const without = (key) => { const o = Object.assign({}, CANONICAL_PROVENANCE); delete o[key]; return JSON.stringify(o); };
  const withValue = (key, v) => JSON.stringify(Object.assign({}, CANONICAL_PROVENANCE, { [key]: v }));
  const canonical = JSON.stringify(CANONICAL_PROVENANCE);
  const cells = [
    // Not JSON, or JSON that is not an object.
    '{bad json', '交易所日线', '[]', '["交易所日线"]', 'null', '42', '"交易所日线"', 'true',
    // A parseable object missing any one key.
    ...Object.keys(CANONICAL_PROVENANCE).map(without),
    // Extra evidence beside the five keys, or only some keys plus extras.
    JSON.stringify(Object.assign({}, CANONICAL_PROVENANCE, { 额外证据: '供应商回执' })),
    '{"数据来源":"交易所日线","额外证据":"供应商回执"}',
    // Wrong value types and blank values.
    withValue('回看窗口', 5), withValue('数据来源', null), withValue('取价口径', ['未复权']), withValue('交易所', { 名: 'NYSE' }),
    withValue('数据来源', ''), withValue('取价口径', '   '),
    // Exchange without time zone, and the reverse.
    '{"交易所时区":"America/New_York"}', without('交易所时区'), without('交易所'),
    // A repeated key that JSON.parse would silently collapse.
    canonical.replace('"数据来源":"交易所日线"', '"数据来源":"供应商A","数据来源":"交易所日线"'),
    // Several fields wrong at once: no known field covers for another.
    '{"数据来源":"","取价口径":3,"回看窗口":"前一周","交易所":"NYSE","备注":"x"}',
    '{}'
  ];
  for (const cell of cells) {
    const shown = provenanceLine(cell);
    assert.equal(shown.line, '出处: ' + cell, cell);
  }
});

test('provenance variants never change the verdict, the executable range or the reader gate', () => {
  const base = provenanceLine(JSON.stringify(CANONICAL_PROVENANCE));
  for (const cell of ['{bad json', '{"数据来源":"交易所日线","额外证据":"供应商回执"}', '{"交易所时区":"America/New_York"}', '[]', '']) {
    const shown = provenanceLine(cell);
    assert.equal(shown.badge, base.badge, cell);
    assert.equal(shown.screen, base.screen, cell);
  }
  const vm1 = logic.buildReportViewModel_(world({ row: Object.assign({}, REFERENCE_360, { 价格参考出处: '{bad' }) }), 'daily', null);
  assert.deepEqual(vm1.holdings[0]._iosOrderable, { ok: true, message: null });
});

test('#63/#58 research-time labels: before the event, expired, superseded valuation, hold and a non-current report', () => {
  const label = (changes) => {
    const c = card(render(logic.buildDashboardBootstrap_(world(changes))));
    const block = referenceBlock(c);
    const result = block.children[block.children.length - 1].textContent;
    assert.ok(firstScreen(c).includes(result), 'condition applicability stays visible while research is collapsed');
    return result;
  };
  const event = label({ row: Object.assign({}, REFERENCE_360, { 周计划状态: '事件暂停', 今日行动: '暂停新增待复核', 今日行动说明: '业绩发布，待复核' }) });
  assert.match(event, /^技术研究截至 2026-10-17T16:00（事件前的研究，待周中复核，不是事件后的复核）$/);
  assert.match(label({ row: Object.assign({}, REFERENCE_360, { 周计划状态: '已过期', 今日行动: '周计划过期待复核' }) }), /周计划已过期，为过期研究/);
  assert.match(label({ row: Object.assign({}, REFERENCE_360, { 周计划状态: '引用失效', 今日行动: '先核对缺项' }) }), /长期估值已更新，本研究未随新估值复核/);
  const hold = label({ row: REFERENCE_360, summary: { 购买计划模式: 'three_layer_hold', 模式纪元: 3 },
    state: [{ purchase_plan_mode: 'three_layer_hold', purchase_plan_mode_epoch: 3 }] });
  assert.match(hold, /技术研究截至 2026-10-17T16:00（三层购买计划暂停中，此为暂停前的研究，不表示恢复购买）/);
  const stale = label({ row: REFERENCE_360, state: [{ purchase_plan_mode: 'three_layer', purchase_plan_mode_epoch: 3 }] });
  assert.match(stale, /报告建议非当前行动，不表示暂停已解除/);
  const unseen = label({ row: REFERENCE_360, records: [E1] });
  assert.match(unseen, /报告建议非当前行动，不表示暂停已解除/);
  for (const text of [event, hold, stale, unseen]) assert.doesNotMatch(text, /可以买|允许下单|(?<!不表示)暂停已解除|事件后已复核/);
});

test('history: an older report renders its own snapshot, labelled with its report date, never the latest plan', () => {
  const tabs = world({
    summaries: [summaryRow(), summaryRow({ 报告ID: 'daily-2026-10-16', 生成ID: 'g-old', 报告日期: '2026-10-16' })],
    assets: [readyRow(REFERENCE_360), readyRow(Object.assign({}, REFERENCE_360, {
      报告ID: 'daily-2026-10-16', 生成ID: 'g-old', 报告日期: '2026-10-16', 价格参考下沿: 340, 价格参考上沿: 350,
      周计划研究截至: '2026-10-10T16:00' }))],
    summary: { 暂停载体行数: JSON.stringify({ 报告持仓: 2, 周计划暂停记录: 0 }) }
  });
  const document = createFakeDocument();
  const sandbox = {
    document, window: {}, IOS_BOOTSTRAP: logic.buildDashboardBootstrap_(tabs), IOS_ACTIVE_VIEW: 'daily', console,
    google: createGoogleScriptRunStub({ getReport: (id) => logic.getReport_(tabs, id) })
  };
  vm.createContext(sandbox);
  vm.runInContext(SCRIPT_HTML_SRC, sandbox, { filename: 'Script.html' });
  sandbox.window.selectHistoryReport('daily-2026-10-16');
  const t = referenceBlock(card(document)).textContent;
  assert.match(firstScreen(card(document)), /技术关注范围: 340 – 350 USD/);
  assert.match(t, /技术研究截至 2026-10-10T16:00（报告 2026-10-16 时的快照/);
  assert.doesNotMatch(t, /360 – 370/);
});

// -- Build marker ---------------------------------------------------------------

test('the build marker is one exact line and travels in every bootstrap', () => {
  assert.equal(logic.buildMarkerText_(), 'IOS_DASHBOARD_BUILD=' + logic.DASHBOARD_BUILD_MARKER_);
  assert.match(logic.DASHBOARD_BUILD_MARKER_, /^ios-dashboard-p4-three-layer-reader-\d+$/);
  assert.equal(logic.buildDashboardBootstrap_(world()).buildMarker, logic.DASHBOARD_BUILD_MARKER_);
});

test('B4: the attestation binds the marker to the configured Sheet, the live mode/epoch and a well-formed nonce', () => {
  const nonce = 'Ab3dEf6hIj9kLm2n';
  assert.equal(logic.buildAttestationText_(nonce, 'sid-1', { readable: true, mode: 'legacy', epoch: 1 }), [
    'IOS_DASHBOARD_BUILD=' + logic.DASHBOARD_BUILD_MARKER_, 'IOS_DASHBOARD_SHEET=sid-1', 'IOS_DASHBOARD_MODE=legacy@1',
    'IOS_DASHBOARD_NONCE=' + nonce].join('\n'));
  for (const bad of [undefined, '', 'short', 'x'.repeat(65), 'abcdefghijklmnop<', '<script>abcdefghijklmnop']) {
    assert.match(logic.buildAttestationText_(bad, 'sid-1', { readable: true, mode: 'legacy', epoch: 1 }), /IOS_DASHBOARD_NONCE=无效$/, String(bad));
  }
  const unreadable = logic.buildAttestationText_(nonce, null, { readable: false });
  assert.match(unreadable, /IOS_DASHBOARD_SHEET=未配置/);
  assert.match(unreadable, /IOS_DASHBOARD_MODE=无法读取/);
});

test('B4: the attestation reads only the two _安装状态 mode cells', () => {
  const log = [];
  assert.deepEqual(logic.readInstallMode_(fakeSpreadsheet(SHEETS(), log)), { readable: true, mode: 'three_layer', epoch: 2 });
  assert.deepEqual(log.filter((entry) => !entry.endsWith(':header')), ['_安装状态:purchase_plan_mode', '_安装状态:purchase_plan_mode_epoch']);
});

// -- Apps Script glue against a fake Spreadsheet ---------------------------------

function fakeSpreadsheet(sheets, log, faults) {
  const failures = Object.assign({}, faults || {});
  return {
    getSheetByName(name) {
      const grid = sheets[name];
      if (!grid) return null;
      return {
        getLastRow: () => grid.length,
        getLastColumn: () => (grid[0] || []).length,
        getRange(row, col, rows, cols) {
          return {
            getValues() {
              log.push(name + ':' + (row === 1 ? 'header' : grid[0][col - 1]));
              if (failures[name] > 0) { failures[name] -= 1; throw new Error('read failed'); }
              return grid.slice(row - 1, row - 1 + rows).map((r) => r.slice(col - 1, col - 1 + cols));
            }
          };
        }
      };
    }
  };
}

const SHEETS = () => ({
  _安装状态: [['schema_version', 'spreadsheet_id', 'purchase_plan_mode', 'purchase_plan_mode_epoch'], [9, 'secret-id', 'three_layer', 2]],
  报告持仓: [['报告ID', '代码', '暂停事件载荷', '备注'], ['daily-2026-10-19', 'AAA', payload([E1]), 'n']],
  周计划暂停记录: [['暂停记录ID', '代码', '事件说明', '来源'], [E1_ID, 'AAA', '不应被读取', '不应被读取']]
});

test('readReaderInputs_ reads exactly the named columns: two _安装状态 cells, the payload column, then two record columns', () => {
  const log = [];
  const inputs = logic.readReaderInputs_(fakeSpreadsheet(SHEETS(), log), { 报告摘要: [] });
  assert.deepEqual(inputs.install, { readable: true, mode: 'three_layer', epoch: 2 });
  assert.deepEqual(inputs.scan, { verifiable: true, idsByCode: { AAA: [E1_ID] } });
  const data = log.filter((entry) => !entry.endsWith(':header'));
  assert.deepEqual(data, ['_安装状态:purchase_plan_mode', '_安装状态:purchase_plan_mode_epoch', '报告持仓:暂停事件载荷',
    '周计划暂停记录:暂停记录ID', '周计划暂停记录:代码']);
});

test('readReaderInputs_ fails closed on a missing tab, a missing column or a read that throws twice; one throw is retried', () => {
  const noState = SHEETS();
  delete noState._安装状态;
  assert.equal(logic.readReaderInputs_(fakeSpreadsheet(noState, []), { 报告摘要: [] }).install.readable, false);
  const halfState = SHEETS();
  halfState._安装状态 = [['purchase_plan_mode'], ['three_layer']];
  assert.equal(logic.readReaderInputs_(fakeSpreadsheet(halfState, []), { 报告摘要: [] }).install.readable, false);
  const epochOnly = SHEETS();
  epochOnly._安装状态 = [['purchase_plan_mode_epoch'], [2]];
  assert.equal(logic.readReaderInputs_(fakeSpreadsheet(epochOnly, []), { 报告摘要: [] }).install.readable, false,
    'one mode column without the other is unreadable, never pre-v9 legacy');
  const preV9 = SHEETS();
  preV9._安装状态 = [['schema_version'], [8]];
  assert.deepEqual(logic.readReaderInputs_(fakeSpreadsheet(preV9, []), { 报告摘要: [] }).install, { readable: true, mode: 'legacy', epoch: 1 });
  const noRecords = SHEETS();
  delete noRecords.周计划暂停记录;
  assert.equal(logic.readReaderInputs_(fakeSpreadsheet(noRecords, []), { 报告摘要: [] }).scan.verifiable, false);
  const noPayloadColumn = SHEETS();
  noPayloadColumn.报告持仓 = [['报告ID', '代码'], ['daily-2026-10-19', 'AAA']];
  assert.equal(logic.readReaderInputs_(fakeSpreadsheet(noPayloadColumn, []), { 报告摘要: [] }).scan.verifiable, false);
  const once = logic.readReaderInputs_(fakeSpreadsheet(SHEETS(), [], { 周计划暂停记录: 1 }), { 报告摘要: [] });
  assert.equal(once.scan.verifiable, true, 'one failed read is retried');
  const twice = logic.readReaderInputs_(fakeSpreadsheet(SHEETS(), [], { 周计划暂停记录: 2 }), { 报告摘要: [] });
  assert.equal(twice.scan.verifiable, false, 'a second failure is unverifiable, never an empty set');
  const stateThrows = logic.readReaderInputs_(fakeSpreadsheet(SHEETS(), [], { _安装状态: 5 }), { 报告摘要: [] });
  assert.equal(stateThrows.install.readable, false);
});

test('readReaderInputs_ honors the watermark recorded by published generations', () => {
  const summaries = [{ 暂停载体行数: JSON.stringify({ 报告持仓: 4, 周计划暂停记录: 1 }) }];
  assert.equal(logic.readReaderInputs_(fakeSpreadsheet(SHEETS(), []), { 报告摘要: summaries }).scan.verifiable, false);
});

