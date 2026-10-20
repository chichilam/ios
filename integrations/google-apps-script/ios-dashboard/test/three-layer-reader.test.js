// Tests for the Issue #316 P4 (#323) three-layer reader: the current-epoch
// gate, the safe scan of both suspension carriers, the seen-set gate, the
// build marker, and the three-layer card (今日行动 → 本周购买计划 → 长期估值).
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
  return cardNode.children.filter((c) => c.tagName !== 'DETAILS').map((c) => c.textContent).join('\n');
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
  assert.match(screen, /适用周 2026-10-19–2026-10-23 NYSE · 周计划状态 有效/);
  assert.match(screen, /价格条件: 可小额开始 · 资金（仅本批次）: 已核验充足/);
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

test('card order: the first screen, then 本周购买计划, then 长期估值, each with its own labelled date', () => {
  const doc = render(logic.buildDashboardBootstrap_(world()));
  const block = details(card(doc));
  const headings = block.children.filter((c) => c.tagName === 'H3').map((c) => c.textContent);
  assert.deepEqual(headings, ['本周购买计划', '长期估值']);
  const textContent = block.textContent;
  assert.ok(textContent.indexOf('本周购买计划') < textContent.indexOf('长期估值'));
  assert.match(textContent, /周计划复核时间（每周复核，不是重新估值）: 2026-10-18T09:00/);
  assert.match(textContent, /周度研究依据截至: 2026-10-17T16:00/);
  assert.match(textContent, /估值研究日期（长期估值研究，不随每周复核变化）: 2026-09-30/);
  assert.match(textContent, /长期合理价值: 420–480 USD/);
  assert.match(textContent, /长期买入上限: 400/);
  assert.match(textContent, /执行路径: 估值区间限价/);
  assert.match(textContent, /复核方式: 新研究/);
  assert.match(textContent, /周计划版本: wp-a-7 v7/);
  assert.match(textContent, /入场计划版本: plan-a-v3 v3/);
  // The first screen precedes the details block.
  const children = card(doc).children;
  assert.equal(children[children.length - 1].tagName, 'DETAILS');
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
