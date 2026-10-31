// Tests for the report layering view (Issue #364 P3): Code.gs's
// buildLayeringView_ (pure logic) and Script.html's Weekly/Daily page order,
// old-report line, shape-error labels and folds, against the synthetic
// fixture test/report-layering-fixture.json. The Dashboard only groups and
// labels the generation's own rows; it never derives a change, a baseline or
// a completion (that is the writer's job, tests/weekly_research_spec.py).
//
// Run: node integrations/google-apps-script/ios-dashboard/test/report-layering.test.js

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { createFakeDocument, createGoogleScriptRunStub } = require('./fake-dom');

const logic = require(path.join(__dirname, '..', 'Code.gs'));
const FIXTURE = JSON.parse(fs.readFileSync(path.join(__dirname, 'report-layering-fixture.json'), 'utf8'));
const SCHEMA = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', 'setup', 'schema', 'sheet-schema.json'), 'utf8')
);
const SCRIPT_HTML_SRC = fs.readFileSync(path.join(__dirname, '..', 'Script.html'), 'utf8');
const STYLES_SRC = fs.readFileSync(path.join(__dirname, '..', 'Styles.html'), 'utf8');

function tabs(change) {
  const copy = JSON.parse(JSON.stringify(FIXTURE));
  if (change) change(copy);
  return copy;
}

function view(type, reportId, change) {
  return logic.buildReportViewModel_(tabs(change), type, reportId || null);
}

function field(tab, name) {
  return SCHEMA.tabs[tab].fields.find((f) => f.name === name);
}

function findAll(node, predicate, out = []) {
  if (node.nodeType === 1 && predicate(node)) out.push(node);
  (node.children || []).forEach((child) => findAll(child, predicate, out));
  return out;
}

function load(vmDaily, vmWeekly, activeView) {
  const document = createFakeDocument();
  const sandbox = {
    document,
    window: {},
    google: createGoogleScriptRunStub({}),
    IOS_BOOTSTRAP: {
      error: null,
      daily: vmDaily || { found: false, reportType: 'daily' },
      weekly: vmWeekly || { found: false, reportType: 'weekly' },
      dailyHistory: [],
      weeklyHistory: [],
      allocation: []
    },
    IOS_ACTIVE_VIEW: activeView,
    console
  };
  vm.createContext(sandbox);
  vm.runInContext(SCRIPT_HTML_SRC, sandbox, { filename: 'Script.html' });
  return document;
}

function layering(document) {
  return findAll(document.getElementById('ios-summary-content'), (n) => n.classList.contains('ios-layering'))[0];
}

// -- Drift guards: the Dashboard's closed values mirror the schema --

test('closed values mirror setup/schema/sheet-schema.json', () => {
  assert.deepEqual(Object.keys(logic.LAYER_PARTITION_STATUS_), field('报告周度研究', '分区').values);
  assert.deepEqual(logic.LAYER_PARTITION_STATUS_, field('报告周度研究', '状态').values_by.map);
  assert.deepEqual(logic.LAYER_COMPARISON_, field('报告周度研究', '比较依据').values);
  assert.deepEqual(logic.LAYER_BASELINE_STATES_, field('报告摘要', '基线状态').values);
  assert.deepEqual(logic.LAYER_CHANGE_FLAGS_, field('报告持仓', '变化标记').values);
  assert.deepEqual(logic.LAYER_CHANGE_FLAGS_, field('报告风险', '变化标记').values);
  const required = SCHEMA.tabs['报告周度研究'].fields.filter((f) => f.required).map((f) => f.name);
  assert.deepEqual(logic.WEEKLY_RESEARCH_REQUIRED_, required);
  assert.ok(!logic.SHEET_TABS_.includes(logic.WEEKLY_RESEARCH_TAB_), 'optional tab: never Blocks an older installation');
});

// -- Weekly view model --

test('Weekly groups the generation\'s own rows in page order', () => {
  const w = view('weekly').layering.weekly;
  assert.equal(w.baseline.text, '较上周基线：weekly-2026-10-31（研究截至 2026-10-31T08:00:00+09:00）');
  assert.deepEqual(w.headlines.map((r) => r['条目ID']), ['h1']);
  assert.deepEqual(w.judgments.changed.map((r) => r['条目ID']), ['j1']);
  assert.deepEqual(w.judgments.maintained.map((r) => r['条目ID']), ['j2']);
  assert.deepEqual(w.judgments.other.map((r) => r['条目ID']), ['j3']);
  assert.deepEqual(w.capital.research.map((r) => r['条目ID']), ['c1']);
  assert.deepEqual(w.capital.conditional.map((r) => r['条目ID']), ['c2']);
  assert.deepEqual(w.capital.other.map((r) => r['条目ID']), ['c3']);
  assert.deepEqual(w.commonRisks.map((r) => r['条目ID']), ['k1']);
  assert.deepEqual(w.reviews.map((g) => g.status), ['已完成', '待独立DeepDive', '完成状态不可核验']);
  assert.deepEqual(w.focus.map((r) => r['条目ID']), ['f1', 'f2'], '下周重点 sorted by 排序');
  assert.equal(w.shapeErrorCount, 0);
});

test('only the pointed generation\'s research rows render (a failed staged row never does)', () => {
  const ids = JSON.stringify(view('weekly').layering.weekly);
  assert.ok(!ids.includes('失败暂存'));
  const header = view('weekly').layering.header;
  assert.deepEqual(header, {
    coverage: '2026-11-01 – 2026-11-07',
    quoteCutoff: '2026-11-06T15:00+09:00 ~ 2026-11-07T05:00+09:00',
    researchCutoff: '2026-11-07T08:00:00+09:00',
    nextWeek: 'XTKS 2026-11-09~2026-11-13'
  });
});

test('baseline line for every 基线状态', () => {
  const cases = { 无基线: '无可比较的上周基线', 基线无周度研究: '上周报告版本未提供周度研究',
    基线不可核验: '上周基线不可核验（历史读取不完整或报告指针冲突）' };
  for (const [state, line] of Object.entries(cases)) {
    const w = view('weekly', null, (t) => { t['报告摘要'][2]['基线状态'] = state; }).layering.weekly;
    assert.equal(w.baseline.text, line, state);
  }
  const unknown = view('weekly', null, (t) => { t['报告摘要'][2]['基线状态'] = '大概有'; }).layering.weekly;
  assert.match(unknown.baseline.text, /周度研究格式异常/);
  const missingPointer = view('weekly', null, (t) => { t['报告摘要'][2]['基线生成ID'] = 'gen-other'; }).layering.weekly;
  assert.match(missingPointer.baseline.text, /研究截至 未知/, 'the baseline cutoff is read only from the pointed generation');
});

test('a pre-#364 Weekly renders the current layout plus one line, nothing back-filled', () => {
  const old = view('weekly', 'weekly-2026-10-24').layering;
  assert.equal(old.legacy, true);
  assert.equal(old.legacyLine, '本报告版本未提供周度研究（生成于 #364 之前）');
  assert.equal(old.weekly, undefined);
  const absent = view('weekly', null, (t) => {
    delete t['报告周度研究'];
    Object.assign(t['报告摘要'][2], { 基线状态: '', 基线报告ID: '', 基线生成ID: '' });
  }).layering;
  assert.equal(absent.legacy, true, 'no tab below schema_version 11 reads as no rows');
  const unreadable = view('weekly', null, (t) => { t['报告周度研究'] = null; }).layering;
  assert.equal(unreadable.unreadable, true);
  assert.equal(unreadable.legacy, false, 'an unreadable tab is never called pre-#364');
});

test('shape errors are labelled per row and never hide the row', () => {
  const broken = view('weekly', null, (t) => {
    const rows = t['报告周度研究'];
    rows.find((r) => r['条目ID'] === 'j3')['判断键'] = '组合|市场环境';
    rows.find((r) => r['条目ID'] === 'j3')['原判断'] = '不该出现';
    rows.find((r) => r['条目ID'] === 'r2')['复核键'] = '事件|DDD|业绩或指引|TDNET-9|2026-10-20';
    rows.find((r) => r['条目ID'] === 'c3')['状态'] = '已变化';
    rows.find((r) => r['条目ID'] === 'k1')['依据性质'] = '';
    rows.find((r) => r['条目ID'] === 'h1')['状态'] = '维持';
    rows.push(Object.assign({}, rows[1], { 条目ID: 'u1', 分区: '杂项' }));
  }).layering.weekly;
  const errors = (id) => [].concat(...Object.values(broken).filter(Array.isArray), ...Object.values(broken.judgments),
    ...Object.values(broken.capital), ...broken.reviews.map((g) => g.rows))
    .filter((r) => r['条目ID'] === id).map((r) => r._iosShapeErrors || [])[0];
  assert.deepEqual(errors('j3'), ['原判断只能出现在基线同键', '判断键缺失或在本期重复']);
  assert.deepEqual(errors('j1'), ['判断键缺失或在本期重复'], 'both occurrences of a duplicate are labelled');
  assert.deepEqual(errors('r2'), ['复核键缺失或在本期重复']);
  assert.deepEqual(errors('r3'), ['复核键缺失或在本期重复']);
  assert.deepEqual(errors('c3'), ['状态不在本分区封闭值内']);
  assert.deepEqual(errors('k1'), ['依据性质缺失或不在封闭值内']);
  assert.deepEqual(errors('h1'), ['状态不在本分区封闭值内']);
  assert.deepEqual(broken.unplaced.map((r) => r['条目ID']), ['u1'], 'an unknown 分区 is still shown');
  assert.equal(broken.shapeErrorCount, 8);
  assert.ok(broken.capital.other.some((r) => r['条目ID'] === 'c3'), 'a bad 状态 never moves a row into another group');
});

// -- Daily view model --

test('Daily groups rows by the writer\'s 变化标记; blank stays in the changed group, labelled', () => {
  const d = view('daily').layering.daily;
  const ids = (items) => items.map((i) => i.kind + ':' + (i.row['代码'] || i.row['风险']));
  assert.deepEqual(ids(d.changed), ['holding:AAA', 'watchlist:CCC']);
  assert.deepEqual(d.changed.map((i) => i.unmarked), [false, true]);
  assert.deepEqual(ids(d.unchanged), ['holding:BBB', 'risk:AI 链集中']);
  assert.deepEqual(ids(d.noBaseline), ['holding:DDD']);
  assert.ok(!JSON.stringify(d).includes('ZZZ'), 'orphaned generation never renders');
  const unknownFlag = view('daily', null, (t) => { t['报告持仓'][4]['变化标记'] = '变了'; }).layering.daily;
  assert.ok(unknownFlag.changed.some((i) => i.row['代码'] === 'BBB' && i.unmarked));
});

test('a pre-#364 Daily is legacy; a Daily never reads weekly research', () => {
  const old = view('daily', null, (t) => {
    t['报告摘要'][3]['研究截至'] = '';
    t['报告持仓'].forEach((r) => { r['变化标记'] = ''; });
    t['报告风险'].forEach((r) => { r['变化标记'] = ''; });
  }).layering;
  assert.equal(old.legacy, true);
  assert.equal(old.legacyLine, logic.LAYER_TEXT_.legacy);
  assert.equal(view('daily').layering.weekly, undefined);
});

test('readWeeklyResearchTab_: absent, unreadable, missing column and readable', () => {
  const sheet = (values) => ({ getDataRange: () => ({ getValues: () => values }) });
  const book = (s) => ({ getSheetByName: () => s });
  assert.equal(logic.readWeeklyResearchTab_(book(null)), undefined);
  assert.equal(logic.readWeeklyResearchTab_({ getSheetByName: () => { throw new Error('x'); } }), null);
  assert.equal(logic.readWeeklyResearchTab_(book(sheet([['报告ID', '生成ID']]))), null);
  const header = logic.WEEKLY_RESEARCH_REQUIRED_;
  const rows = logic.readWeeklyResearchTab_(book(sheet([header, header.map((h) => h + '-1')])));
  assert.equal(rows.length, 1);
  assert.equal(rows[0]['条目ID'], '条目ID-1');
});

test('native Date cells display as ISO text', () => {
  const header = view('weekly', null, (t) => { t['报告摘要'][2]['研究截至'] = new Date('2026-11-06T23:00:00.000Z'); }).layering.header;
  assert.equal(header.researchCutoff, '2026-11-06T23:00:00.000Z');
});

// -- Rendering --

test('Weekly page order: header facts, then sections ① to ④, then the detail tabs', () => {
  const document = load(null, view('weekly'), 'weekly');
  const root = layering(document);
  const facts = root.children[0];
  assert.ok(facts.classList.contains('ios-layer-facts'));
  assert.match(facts.textContent, /行情截至.*研究截至.*下一适用交易周/);
  const headings = findAll(root, (n) => n.tagName === 'H2').map((n) => n.textContent);
  assert.deepEqual(headings, ['① 本周结论与较上周变化', '② 资本配置比较与组合风险', '③ 本周事件与估值复核',
    '④ 下周重点与适用周购买结论']);
  assert.match(root.textContent, /⑤ 全部持仓、观察候选、风险与待办明细见下方标签页/);
  assert.match(root.textContent, /较上周基线：weekly-2026-10-31/);
});

test('Weekly: maintained judgments fold with their evidence; uncomparable rows say why; unresolved never reads as done', () => {
  const root = layering(load(null, view('weekly'), 'weekly'));
  const folds = findAll(root, (n) => n.tagName === 'DETAILS');
  assert.equal(folds.length, 1);
  assert.equal(folds[0].getAttribute('open'), null, 'collapsed by default');
  assert.match(folds[0].textContent, /判断维持 \(1\).*2026-11-05 订单公告/);
  assert.match(root.textContent, /上周没有这一判断/);
  assert.match(root.textContent, /上周判断：组合 AI 资本开支周期仍在扩张/);
  assert.match(root.textContent, /完成状态不可核验：未完成，也未关闭/);
  const verdicts = findAll(root, (n) => n.classList.contains('ios-layer-verdicts'))[0];
  assert.match(verdicts.textContent, /AAA等待/, 'the existing first-screen verdict, unchanged');
});

test('Weekly: a shape error is labelled and the row is still shown', () => {
  const broken = view('weekly', null, (t) => {
    t['报告周度研究'].find((r) => r['条目ID'] === 'c3')['状态'] = '已变化';
  });
  const root = layering(load(null, broken, 'weekly'));
  assert.match(root.textContent, /周度研究格式异常：1 行/);
  const errorRows = findAll(root, (n) => n.classList.contains('ios-layer-row-error'));
  assert.equal(errorRows.length, 1);
  assert.match(errorRows[0].textContent, /其余保留现金.*格式问题：状态不在本分区封闭值内/);
});

test('old and unreadable Weekly reports show one line and keep the detail tabs', () => {
  const document = load(null, view('weekly', 'weekly-2026-10-24'), 'weekly');
  assert.match(layering(document).textContent, /本报告版本未提供周度研究（生成于 #364 之前）/);
  assert.equal(findAll(layering(document), (n) => n.tagName === 'H2').length, 0);
  const unreadable = load(null, view('weekly', null, (t) => { t['报告周度研究'] = null; }), 'weekly');
  assert.match(layering(unreadable).textContent, /周度研究读取失败/);
});

test('Daily page order: window and cutoff, changed rows, follow-ups, then folded remaining rows', () => {
  const root = layering(load(view('daily'), null, 'daily'));
  assert.ok(root.children[0].classList.contains('ios-layer-facts'));
  assert.ok(!/下一适用交易周/.test(root.children[0].textContent), 'Weekly-only fact');
  const headings = findAll(root, (n) => n.tagName === 'H2').map((n) => n.textContent);
  assert.deepEqual(headings, ['本期有变化 (2)', '跟进 (1)']);
  assert.match(root.textContent, /未标记变化/);
  const folds = findAll(root, (n) => n.tagName === 'DETAILS');
  assert.deepEqual(folds.map((f) => f.children[0].textContent), ['无变化 (2)', '无可比基线 (1)']);
  assert.match(folds[0].textContent, /BBB.*AI 链集中/);
  assert.match(folds[1].textContent, /DDD/);
  assert.ok(folds.every((f) => f.getAttribute('open') === null));
});

test('mobile layout: layering wraps text and drops to two fact columns on a phone', () => {
  assert.match(STYLES_SRC, /\.ios-layer-row \{ overflow-wrap: anywhere; \}/);
  assert.match(STYLES_SRC, /\.ios-layer-verdict \{[^}]*overflow-wrap: anywhere;/, '④ items wrap on a phone');
  const phone = STYLES_SRC.slice(STYLES_SRC.indexOf('@media (max-width: 720px)'));
  assert.match(phone, /\.ios-layer-facts \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \}/);
  assert.ok(!/\.ios-layer[^{]*\{[^}]*width:\s*\d+px/.test(STYLES_SRC), 'no fixed pixel widths in the layering styles');
});

// -- Old-report rule per report type (contract "Old and malformed reports") --

test('Daily old-report rule: 研究截至 × 变化标记 give one result each', () => {
  const daily = (cutoff, flags) => view('daily', null, (t) => {
    t['报告摘要'][3]['研究截至'] = cutoff ? '2026-11-07T07:30:00+09:00' : '';
    let n = 0;
    t['报告持仓'].concat(t['报告风险']).filter((r) => r['报告类型'] === 'daily').forEach((r) => {
      r['变化标记'] = flags === 'all' ? '无变化' : (flags === 'some' && n++ === 0 ? '有变化' : '');
    });
  }).layering;
  const onlyCutoff = daily(true, 'none');
  assert.equal(onlyCutoff.legacy, false);
  assert.ok(onlyCutoff.daily.changed.length > 0 && onlyCutoff.daily.changed.every((i) => i.unmarked),
    'every blank flag stays expanded in the changed group, labelled');
  for (const cutoff of [true, false]) {
    const some = daily(cutoff, 'some');
    assert.equal(some.legacy, false, 'some flags, cutoff=' + cutoff);
    assert.ok(some.daily.changed.some((i) => !i.unmarked) && some.daily.changed.some((i) => i.unmarked));
  }
  assert.equal(daily(false, 'all').legacy, false);
  const neither = daily(false, 'none');
  assert.equal(neither.legacy, true);
  assert.equal(neither.daily, undefined, 'nothing is grouped or back-filled');
  const invalid = view('daily', null, (t) => {
    t['报告持仓'].filter((r) => r['报告类型'] === 'daily').forEach((r) => { r['变化标记'] = '不知道'; });
  }).layering;
  assert.equal(invalid.legacy, false);
  assert.ok(invalid.daily.changed.filter((i) => i.kind !== 'risk').every((i) => i.unmarked));
});

test('Weekly old-report rule: research rows × 基线状态; absent and unreadable tabs', () => {
  const noRows = (state, drop) => view('weekly', null, (t) => {
    if (drop) { delete t['报告周度研究']; } else { t['报告周度研究'] = t['报告周度研究'].filter((r) => r['生成ID'] !== 'gen-w2-b'); }
    t['报告摘要'][2]['基线状态'] = state;
  }).layering;
  for (const state of logic.LAYER_BASELINE_STATES_) {
    for (const drop of [false, true]) {
      const v = noRows(state, drop);
      assert.equal(v.legacy, false, state + (drop ? ' (tab absent)' : ''));
      assert.deepEqual(v.weekly.headlines, []);
    }
  }
  assert.equal(noRows('', false).legacy, true);
  assert.equal(noRows('', true).legacy, true);
  const rowsNoState = view('weekly', null, (t) => { t['报告摘要'][2]['基线状态'] = ''; }).layering;
  assert.equal(rowsNoState.legacy, false, 'research rows make it post-#364 even with a blank 基线状态');
  const unreadable = view('weekly', null, (t) => { t['报告周度研究'] = null; t['报告摘要'][2]['基线状态'] = ''; }).layering;
  assert.equal(unreadable.unreadable, true);
  assert.equal(unreadable.legacy, false);
  assert.ok(!JSON.stringify(noRows('有基线', false)).includes('失败暂存'), 'a failed staged generation never leaks');
});

// -- ④ verdicts and #327 price references, through the 组合 card's functions --

function weeklyAsset(overrides) {
  return Object.assign({
    报告ID: 'weekly-2026-11-07', 生成ID: 'gen-w2-b', 报告类型: 'weekly', 报告日期: '2026-11-07',
    资产类型: 'holding', 代码: 'AAA', 名称: 'AAA Co.', 排序: 1,
    入场计划ID: 'plan-a-v3', 入场计划版本: 3, 执行状态: '可小额开始', 准备状态: '可准备订单',
    今日行动: '可人工准备限价单', 今日行动说明: '人工准备限价单，最高 380 USD，当日有效',
    当前价格: 365, 报价币种: 'USD', 行情属性: '收盘', 行情截至时间: '2026-11-06 16:00 美东',
    计划买入下限: '350 USD', 计划买入上限: '380 USD',
    建议限价: 380, 建议订单规模说明: '10000 USD（区间1）', 计划订单有效期: '当日有效', 阻塞待办ID: '无',
    周计划ID: 'wp-a-8', 周计划版本: 8, 周计划状态: '有效', 周计划结论: '有购买区间', 周计划执行路径: '估值区间限价',
    周计划适用周: 'XTKS 2026-11-09~2026-11-13', 周计划研究截至: '2026-11-07T08:00', 周计划复核时间: '2026-11-07T09:00',
    周计划复核方式: '新研究', 长期合理价值: '420–480 USD', 长期买入上限快照: 400, 资金结论: '已核验充足',
    价格参考结论: '关注区间', 价格参考下沿: 350, 价格参考上沿: 380, 价格参考币种: 'USD',
    价格参考支撑: '350 前低', 价格参考阻力: '395 前高', 价格参考与上限关系: '关注区低于上限',
    价格参考确认条件: '日线收盘站上 360', 价格参考否定条件: '跌破 340',
    _iosThreeLayer: true, _iosPurchaseMode: 'three_layer', _iosOrderable: { ok: true, message: null }
  }, overrides || {});
}

function fourth(assets) {
  const vmodel = view('weekly');
  vmodel.holdings = assets;
  vmodel.watchlistCandidates = [];
  const root = layering(load(null, vmodel, 'weekly'));
  const section = findAll(root, (n) => n.tagName === 'H2' && /^④/.test(n.textContent))[0].parentNode;
  return findAll(section, (n) => n.classList.contains('ios-layer-verdict'));
}

test('④ shows the 适用周, gated verdict and #327 price reference directly', () => {
  const [item] = fourth([weeklyAsset()]);
  const t = item.textContent;
  assert.match(t, /AAA.*适合买入/);
  assert.match(t, /适用周: XTKS 2026-11-09~2026-11-13/);
  assert.match(t, /本周购买区间: 最低 350 USD · 最高 380 USD/);
  assert.match(t, /技术关注范围: 350 – 380 USD/);
  assert.match(t, /已校验订单限价: 380/);
  assert.match(t, /本周价格参考.*参考结论: 关注区间.*支撑参考: 350 前低/);
  assert.match(t, /技术研究，不是买入授权/);
});

test('④ never shows an orderable conclusion without the evidence', () => {
  const cases = {
    wait: weeklyAsset({ 今日行动: '本周无购买区间', 今日行动说明: '无符合长期估值的区间', 计划买入下限: '', 计划买入上限: '',
      周计划结论: '无符合长期估值的区间', 建议限价: '' }),
    gate: weeklyAsset({ _iosOrderable: { ok: false, message: '存在未核验的暂停事件' } }),
    hold: weeklyAsset({ _iosPurchaseMode: 'three_layer_hold', _iosOrderable: { ok: false, message: '三层购买计划暂停中' } }),
    missingFields: weeklyAsset({ 建议限价: '' }),
    contradiction: weeklyAsset({ 准备状态: '等待确认' }),
    blocked: weeklyAsset({ 阻塞待办ID: '' }),
    noReference: weeklyAsset({ 今日行动: '等待价格', 价格参考结论: '', 价格参考下沿: '', 价格参考上沿: '', 价格参考缺口: '',
      价格参考确认条件: '', 价格参考否定条件: '' }),
    referenceGap: weeklyAsset({ 今日行动: '等待价格', 价格参考结论: '', 价格参考下沿: '', 价格参考上沿: '', 价格参考缺口: '日线数据不足',
      价格参考确认条件: '', 价格参考否定条件: '' })
  };
  const items = fourth(Object.values(cases));
  const byName = Object.fromEntries(Object.keys(cases).map((k, i) => [k, items[i].textContent]));
  for (const [name, t] of Object.entries(byName)) {
    assert.ok(!/适合买入/.test(t), name + ' must not read as 适合买入');
    assert.ok(!/已校验订单限价/.test(t), name + ' must not show an order limit');
  }
  assert.match(byName.wait, /等待.*本周购买区间: 无（无符合长期估值的区间）/);
  assert.match(byName.wait, /尚不可据此下单/);
  assert.match(byName.gate, /无法判断.*存在未核验的暂停事件/);
  assert.match(byName.hold, /三层购买计划暂停中，此为暂停前的研究，不表示恢复购买/);
  assert.match(byName.missingFields, /缺少 建议限价/);
  assert.match(byName.contradiction, /与之矛盾/);
  assert.match(byName.noReference, /本报告版本未提供本周价格参考（生成于 #327 之前）/);
  assert.ok(!/技术关注范围/.test(byName.noReference), 'no range is invented');
  assert.match(byName.referenceGap, /本周价格参考不可用（日线数据不足）/);
});

test('④ with no 今日行动 rows says so; Daily and Weekly never mix generations', () => {
  const vmodel = view('weekly');
  vmodel.holdings = [weeklyAsset({ 今日行动: '' })];
  const root = layering(load(null, vmodel, 'weekly'));
  assert.match(root.textContent, /本报告没有写出今日行动的资产/);
  const daily = layering(load(view('daily'), view('weekly'), 'daily'));
  assert.ok(!/①|下一适用交易周|ZZZ/.test(daily.textContent));
  const weekly = layering(load(view('daily'), view('weekly'), 'weekly'));
  assert.ok(!/本期有变化|ZZZ/.test(weekly.textContent));
});

// -- P4 acceptance feedback: copy that must not overstate --

test('① never calls uncomparable judgments "unchanged"', () => {
  const allUncomparable = view('weekly', null, (t) => {
    t['报告周度研究'].filter((r) => r['生成ID'] === 'gen-w2-b' && r['分区'] === '判断变化')
      .forEach((r) => { Object.assign(r, { 状态: '不可比较', 比较依据: '基线无周度研究', 原判断: '' }); });
    t['报告摘要'][2]['基线状态'] = '基线无周度研究';
  });
  const n = allUncomparable.layering.weekly.judgments.other.length;
  assert.ok(n > 0);
  const root = layering(load(null, allUncomparable, 'weekly'));
  assert.ok(!/本周没有判断发生变化/.test(root.textContent));
  assert.match(root.textContent, new RegExp('本周没有可与上周比较的判断：' + n + ' 条不可比较'));
  const withMaintained = layering(load(null, view('weekly', null, (t) => {
    t['报告周度研究'].filter((r) => r['生成ID'] === 'gen-w2-b' && r['状态'] === '已变化')
      .forEach((r) => { r['状态'] = '维持'; });
  }), 'weekly'));
  assert.match(withMaintained.textContent, /本周没有判断发生变化（\d+ 条维持）/);
});

test('a 沿用定投 fund row says price reference is not applicable, never "before #327"', () => {
  const fund = weeklyAsset({
    代码: 'FUND-SLEEVE', 名称: '基金聚合', 今日行动: '沿用定投', 今日行动说明: '沿用既有定投，不是额外申购授权',
    入场计划ID: '', 周计划ID: '', 周计划版本: '', 周计划状态: '无周计划', 周计划结论: '', 周计划执行路径: '',
    周计划适用周: '', 周计划研究截至: '', 周计划复核时间: '', 周计划复核方式: '', 价格参考结论: '', 价格参考下沿: '',
    价格参考上沿: '', 价格参考缺口: '', 价格参考确认条件: '', 价格参考否定条件: '', 执行状态: '', 准备状态: '',
    建议限价: '', 建议订单规模说明: '', 计划订单有效期: '', 计划买入下限: '', 计划买入上限: '', 当前阻碍: '', 阻塞待办ID: '无'
  });
  const [item] = fourth([fund]);
  assert.match(item.textContent, /沿用定投/);
  assert.match(item.textContent, /不适用（沿用既有定投，不做技术价格参考）/);
  assert.ok(!/#327 之前/.test(item.textContent));
  const vmodel = view('weekly');
  vmodel.holdings = [fund];
  vmodel.watchlistCandidates = [];
  const document = load(null, vmodel, 'weekly');
  const cards = findAll(document.body || document.documentElement || document.getElementById('ios-summary-content'), () => true)
    .filter((n) => /#327 之前/.test(n.textContent || '') && n.children.length === 0);
  assert.equal(cards.length, 0, 'no element anywhere says the fund row predates #327');
});
