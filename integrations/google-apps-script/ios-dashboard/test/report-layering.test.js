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
  assert.match(root.textContent, /⑤ 全部持仓与观察候选的完整卡片见下方；持仓明细、风险与待办见顶部对应 tab/);
  assert.match(root.textContent, /较上周基线：weekly-2026-10-31/);
});

test('Weekly: maintained judgments fold with their evidence; uncomparable rows say why; unresolved never reads as done', () => {
  const root = layering(load(null, view('weekly'), 'weekly'));
  // Issue #388 PR B: ② and ③ and every row's evidence fold too; all collapsed by default.
  const all = findAll(root, (n) => n.tagName === 'DETAILS');
  assert.ok(all.every((d) => d.getAttribute('open') === null), 'collapsed by default');
  const folds = findAll(root, (n) => n.tagName === 'DETAILS' && n.classList.contains('ios-layer-fold'));
  const maintained = folds.filter((f) => /^判断维持 \(1\)/.test(f.children[0].textContent));
  assert.equal(maintained.length, 1);
  assert.match(maintained[0].textContent, /判断维持 \(1\).*2026-11-05 订单公告/);
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
  assert.deepEqual(folds.map((f) => f.children[0].textContent), ['其余 1 只无变化（另 1 条风险无变化）', '无可比基线 (1)']);
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

test('#383: a Weekly 无变化 flag never hides an action, pause, funding, order or range signal', () => {
  const paused = weeklyAsset({ 代码: 'PPP', 变化标记: '无变化', 今日行动: '暂停新增待复核', 今日行动说明: '官方业绩待复核',
    周计划状态: '事件暂停', 周计划结论: '本周无可靠区间', 执行状态: '暂停复核', 准备状态: '无需准备', 建议限价: '' });
  const blocked = weeklyAsset({ 代码: 'BBB', 变化标记: '无变化', 今日行动: '先核对缺项', 今日行动说明: '资金未核验',
    资金结论: '不足', 阻塞待办ID: 'BBB-2', 准备状态: '计划未完善停在核对', 建议限价: '' });
  const ranged = weeklyAsset({ 代码: 'RRR', 变化标记: '无变化', 今日行动: '等待价格', 今日行动说明: '高于本周区间',
    计划买入下限: '330 USD', 计划买入上限: '360 USD', 建议限价: '' });
  const items = fourth([paused, blocked, ranged]);
  assert.equal(items.length, 3, 'every asset with 今日行动 is listed whatever its 变化标记');
  assert.match(items[0].textContent, /PPP.*等待.*暂停新增待复核/);
  assert.match(items[1].textContent, /BBB.*无法判断.*先核对缺项/);
  assert.match(items[2].textContent, /RRR.*等待价格/);
  assert.match(items[2].textContent, /最低 330 USD · 最高 360 USD/);
  const page = layering(load(null, Object.assign(view('weekly'), { holdings: [paused, blocked, ranged], watchlistCandidates: [] }), 'weekly'));
  assert.ok(!/无变化 \(|本期有变化/.test(page.textContent), 'the Weekly page has no 变化标记 fold');
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

// -- Issue #388 PR B: default folds, Daily increment, internal IDs in 技术信息 --

function loadWithWindow(vmDaily, vmWeekly, activeView, handlers) {
  const document = createFakeDocument();
  const sandbox = {
    document, window: {}, google: createGoogleScriptRunStub(handlers || {}),
    IOS_BOOTSTRAP: {
      error: null,
      daily: vmDaily || { found: false, reportType: 'daily' },
      weekly: vmWeekly || { found: false, reportType: 'weekly' },
      dailyHistory: [], weeklyHistory: [], allocation: []
    },
    IOS_ACTIVE_VIEW: activeView, console
  };
  vm.createContext(sandbox);
  vm.runInContext(SCRIPT_HTML_SRC, sandbox, { filename: 'Script.html' });
  return { document, window: sandbox.window };
}

function sectionByHeading(root, pattern) {
  return findAll(root, (n) => n.tagName === 'H2' && pattern.test(n.textContent))[0].parentNode;
}

test('PR B: ② and ③ fold by default, the summary line carries the counts', () => {
  const vmodel = view('weekly');
  const root = layering(load(null, vmodel, 'weekly'));
  const capital = vmodel.layering.weekly.capital;
  const second = sectionByHeading(root, /^②/);
  const secondFold = second.children[1];
  assert.equal(secondFold.tagName, 'DETAILS');
  assert.equal(secondFold.getAttribute('open'), null);
  assert.equal(secondFold.children[0].textContent,
    '研究优先 ' + capital.research.length + ' · 条件性资本优先 ' + capital.conditional.length +
    (capital.other.length ? ' · 保留现金或不排序 ' + capital.other.length : '') +
    ' · 共同风险 ' + vmodel.layering.weekly.commonRisks.length);
  const third = sectionByHeading(root, /^③/);
  const total = vmodel.layering.weekly.reviews.reduce((n, g) => n + g.rows.length, 0);
  assert.ok(total > 0, 'fixture has review rows');
  assert.equal(third.children[1].tagName, 'DETAILS');
  assert.equal(third.children[1].getAttribute('open'), null);
  assert.match(third.children[1].children[0].textContent, new RegExp('^复核成果 ' + total + ' 条（'));
  const empty = layering(load(null, view('weekly', null, (t) => {
    t['报告周度研究'] = t['报告周度研究'].filter((r) => r['分区'] !== '复核成果');
  }), 'weekly'));
  const emptyThird = sectionByHeading(empty, /^③/);
  assert.match(emptyThird.textContent, /本周没有复核成果/);
  assert.equal(findAll(emptyThird, (n) => n.tagName === 'DETAILS').length, 0, 'nothing to fold');
});

test('PR B: a research row keeps its conclusion visible; evidence folds and record ids sit in 技术信息', () => {
  const root = layering(load(null, view('weekly', null, (t) => {
    const row = t['报告周度研究'].find((r) => r['生成ID'] === 'gen-w2-b' && r['状态'] === '已变化');
    row['来源记录'] = '入场计划|ep-aaa-v3|2026-11-05';
  }), 'weekly'));
  const rows = findAll(root, (n) => n.classList.contains('ios-layer-row'));
  const withSource = rows.find((r) => /ep-aaa-v3/.test(r.textContent));
  const visible = withSource.children.filter((c) => c.tagName !== 'DETAILS').map((c) => c.textContent).join('\n');
  assert.doesNotMatch(visible, /ep-aaa-v3|上周判断|本周证据/, 'ids and evidence are not on the first screen');
  const evidence = withSource.children.find((c) => c.tagName === 'DETAILS');
  assert.equal(evidence.children[0].textContent, '依据与证据');
  assert.equal(evidence.getAttribute('open'), null);
  const tech = findAll(evidence, (n) => n.classList.contains('ios-tech-info'))[0];
  assert.equal(tech.children[0].textContent, '技术信息');
  assert.match(tech.textContent, /来源: 入场计划\|ep-aaa-v3\|2026-11-05/);
});

test('PR B: ④ keeps the verdict and range on screen; the price reference folds, its source in 技术信息', () => {
  const [item] = fourth([weeklyAsset({
    价格参考出处: JSON.stringify({ 数据来源: 'premium-export-2026-11', 取价口径: '未复权收盘价', 回看窗口: '前一个完整交易周', 交易所: 'NYSE', 交易所时区: 'America/New_York' })
  })]);
  const visible = item.children.filter((c) => c.tagName !== 'DETAILS').map((c) => c.textContent).join('\n');
  assert.match(visible, /适合买入/);
  assert.match(visible, /本周购买区间: 最低 350 USD · 最高 380 USD/);
  assert.doesNotMatch(visible, /支撑参考|premium-export/);
  const fold = item.children.find((c) => c.tagName === 'DETAILS');
  assert.equal(fold.children[0].textContent, '本周价格参考');
  assert.equal(fold.getAttribute('open'), null);
  const tech = findAll(fold, (n) => n.classList.contains('ios-tech-info'))[0];
  assert.match(tech.textContent, /出处: premium-export-2026-11/);
});

test('PR B: the fund aggregate reads as 基金定投（合计）; its code is kept in 技术信息', () => {
  const fund = weeklyAsset({
    代码: 'FUND-SLEEVE', 名称: '基金聚合', 今日行动: '沿用定投', 今日行动说明: '沿用既有定投，不是额外申购授权',
    入场计划ID: '', 周计划ID: '', 周计划版本: '', 周计划状态: '', 周计划结论: '', 周计划执行路径: '', 周计划适用周: '',
    周计划研究截至: '', 周计划复核时间: '', 周计划复核方式: '', 价格参考结论: '', 执行状态: '', 准备状态: '', 建议限价: '',
    建议订单规模说明: '', 计划订单有效期: '', 计划买入下限: '', 计划买入上限: '', 当前阻碍: '', 阻塞待办ID: '无',
    _iosThreeLayer: false
  });
  const [item] = fourth([fund]);
  assert.equal(item.children[0].children[0].textContent, '基金定投（合计）');
  const vmodel = view('weekly');
  vmodel.holdings = [fund];
  vmodel.watchlistCandidates = [];
  const { document } = loadWithWindow(null, vmodel, 'weekly');
  const cardNode = findAll(document.getElementById('ios-summary-content'), (n) => n.classList.contains('ios-asset-card'))[0];
  assert.equal(cardNode.children[0].children[0].textContent, '基金定投（合计）');
  const tech = findAll(cardNode, (n) => n.classList.contains('ios-tech-info'))[0];
  assert.match(tech.textContent, /代码: FUND-SLEEVE/);
});

test('PR B: plan ids leave the 今日行动依据 reading flow for its 技术信息 block', () => {
  const vmodel = view('weekly');
  vmodel.holdings = [weeklyAsset()];
  vmodel.watchlistCandidates = [];
  const { document } = loadWithWindow(null, vmodel, 'weekly');
  const cardNode = findAll(document.getElementById('ios-summary-content'), (n) => n.classList.contains('ios-asset-card'))[0];
  const basis = cardNode.children.find((c) => c.tagName === 'DETAILS');
  const flow = basis.children.filter((c) => !c.classList.contains('ios-tech-info')).map((c) => c.textContent).join('\n');
  assert.doesNotMatch(flow, /wp-a-8|plan-a-v3/);
  const tech = basis.children.find((c) => c.classList.contains('ios-tech-info'));
  assert.equal(tech.getAttribute('open'), null);
  assert.match(tech.textContent, /周计划版本: wp-a-8 v8/);
  assert.match(tech.textContent, /入场计划版本: plan-a-v3 v3/);
});

function dailyTwin(overrides) {
  return weeklyAsset(Object.assign({
    报告ID: 'daily-2026-11-10', 生成ID: 'gen-d-c', 报告类型: 'daily', 报告日期: '2026-11-10', 变化标记: '有变化'
  }, overrides || {}));
}

function withReportId(vmodel, reportId) {
  vmodel.summary = Object.assign({}, vmodel.summary, { 报告ID: reportId });
  return vmodel;
}

/** Rebuilds a Daily view model's change layering from the holdings a test swapped in, as Code.gs would have. */
function relayerDaily(vmodel) {
  vmodel.layering = logic.buildLayeringView_('daily', vmodel.summary, null, vmodel.holdings, vmodel.watchlistCandidates, [], []);
  return vmodel;
}

function dailyWithWeekly(dailyAssets, weeklyAssets, ids, handlers) {
  const daily = withReportId(view('daily'), (ids && ids.daily) || 'daily-2026-11-10');
  daily.holdings = dailyAssets;
  daily.watchlistCandidates = [];
  relayerDaily(daily);
  const weekly = withReportId(view('weekly'), (ids && ids.weekly) || 'weekly-2026-11-07');
  weekly.holdings = weeklyAssets;
  weekly.watchlistCandidates = [];
  return loadWithWindow(daily, weekly, 'daily', handlers);
}

/** A layered Daily's asset cards live only in the report (本期有变化 / 其余无变化 / 无可比基线) since #388 PR D. */
function portfolioCards(document) {
  return findAll(document.getElementById('ios-summary-content'), (n) => n.classList.contains('ios-asset-card'));
}

test('PR B: no Daily↔Weekly link exists in the snapshot, so a Daily always keeps its own full plan block', () => {
  // 报告摘要/报告持仓 carry no field naming the Weekly a Daily used, so even a Weekly with identical
  // snapshot columns is never treated as the Daily's referenced Weekly (maintainer review on 4c4ab66).
  const cases = [
    ['same period', null],
    ['much older Weekly', { daily: 'daily-2026-11-10', weekly: 'weekly-2026-10-25' }],
    ['later Weekly', { daily: 'daily-2026-11-06', weekly: 'weekly-2026-11-07' }],
    ['malformed ids', { daily: 'manual-run', weekly: 'weekly-latest' }]
  ];
  for (const [name, ids] of cases) {
    const { document } = dailyWithWeekly([dailyTwin()], [weeklyAsset()], ids);
    const basis = portfolioCards(document)[0].children.find((c) => c.tagName === 'DETAILS');
    assert.match(basis.textContent, /周计划结论: 有购买区间/, name);
    assert.match(basis.textContent, /支撑参考: 350 前低/, name);
    assert.ok(!findAll(basis, (n) => n.tagName === 'BUTTON' && n.textContent === '查看周报').length, name);
  }
  const historical = withReportId(view('daily'), 'daily-2026-10-30');
  historical.holdings = [dailyTwin({ 报告ID: 'daily-2026-10-30', 报告日期: '2026-10-30' })];
  historical.watchlistCandidates = [];
  relayerDaily(historical);
  const page = dailyWithWeekly([dailyTwin()], [weeklyAsset()], null, {
    getReport: () => Object.assign(JSON.parse(JSON.stringify(historical)), { error: null })
  });
  page.window.selectHistoryReport('daily-2026-10-30');
  const t = portfolioCards(page.document)[0].children.find((c) => c.tagName === 'DETAILS').textContent;
  assert.match(t, /周计划结论: 有购买区间/, 'a history Daily keeps its own frozen plan');
  assert.match(t, /支撑参考: 350 前低/);
});

test('#396 PR A: a layered Daily shows each asset once, in the report; a Weekly or an old Daily closes its page with the cards the removed 组合 view held', () => {
  const rows = [
    dailyTwin({ 代码: 'AAA', 变化标记: '有变化' }),
    dailyTwin({ 代码: 'BBB', 变化标记: '无变化' }),
    dailyTwin({ 代码: 'CCC', 变化标记: '无变化' }),
    dailyTwin({ 代码: 'DDD', 变化标记: '' }),
    dailyTwin({ 代码: 'EEE', 变化标记: '无可比基线' })
  ];
  const { document } = dailyWithWeekly(rows, []);
  const report = document.getElementById('ios-summary-content');
  assert.ok(!report.children.some((c) => c.children[0] && /^当前持仓 \(/.test(c.children[0].textContent)), 'a layered Daily adds no second card section');
  assert.ok(report.children.some((c) => c.classList.contains('ios-report-overview')), 'the summary grid of the removed 组合 view closes the report');
  const codes = portfolioCards(document).map((c) => c.children[0].children[0].textContent);
  assert.deepEqual(codes.slice().sort(), ['AAA', 'BBB', 'CCC', 'DDD', 'EEE'], 'every asset is in the report exactly once');
  const fold = findAll(report, (n) => n.tagName === 'DETAILS' && /^其余 2 只无变化/.test(n.children[0].textContent))[0];
  assert.equal(fold.getAttribute('open'), null);
  assert.match(fold.textContent, /BBB[\s\S]*CCC/);
  assert.equal(document.getElementById('ios-tab-portfolio'), null, 'there is no 组合 view any more');

  const weekly = view('weekly');
  weekly.holdings = rows.map((r) => Object.assign({}, r, { 报告类型: 'weekly' }));
  weekly.watchlistCandidates = [];
  const w = loadWithWindow(null, weekly, 'weekly');
  const wReport = w.document.getElementById('ios-summary-content');
  assert.equal(findAll(wReport, (n) => n.classList.contains('ios-asset-card')).length, 5, 'a Weekly verdict layering has no per-asset cards, so the cards close its page');
  assert.equal(findAll(layering(w.document), (n) => n.tagName === 'DETAILS' && /无变化/.test(n.children[0].textContent)).length, 0, '#383: a Weekly layering hides nothing behind 无变化');
  const legacyDaily = view('daily', null, (t) => {
    t['报告持仓'].forEach((r) => { r['变化标记'] = ''; });
    t['报告风险'].forEach((r) => { r['变化标记'] = ''; });
    t['报告摘要'][3]['研究截至'] = '';
  });
  assert.equal(legacyDaily.layering.legacy, true);
  const old = loadWithWindow(legacyDaily, null, 'daily');
  assert.equal(findAll(old.document.getElementById('ios-summary-content'), (n) => n.classList.contains('ios-asset-card')).length,
    legacyDaily.holdings.length + legacyDaily.watchlistCandidates.length, 'an old Daily without a change layering keeps its cards on its page');
});

// -- Issue #396 PR B: the 日报 / 周报 page is 结论 → 买入判断 → 计数卡 → 本期变化.
// The #388 PR C conclusion card and three tiers are gone (the issue's "不再出现
// 三级列表"); their tests went with them. --

function summaryChild(document, className) {
  return findAll(document.getElementById('ios-summary-content'), (n) => n.classList.contains(className))[0];
}

function current(vmodel) {
  vmodel.readerGate = { threeLayer: true, mode: 'three_layer', current: true, banner: null };
  return vmodel;
}

function weeklyWith(assets, extra) {
  const vmodel = current(view('weekly'));
  vmodel.holdings = assets.filter((a) => a['资产类型'] === 'holding');
  vmodel.watchlistCandidates = assets.filter((a) => a['资产类型'] === 'watchlist');
  return Object.assign(vmodel, { todos: [], risks: [], riskGroups: { current: [], released: [], unverified: [] }, holdingDetail: [] }, extra || {});
}

/** { group title: [code, ...] } of the 买入判断 block, in page order. */
function buyGroups(document) {
  const block = summaryChild(document, 'ios-buy-judgment');
  const out = {};
  let current = null;
  block.children.forEach((c) => {
    if (c.tagName === 'H3') { current = c.textContent.replace(/ \(\d+\)$/, ''); out[current] = []; }
    if (c.classList.contains('ios-buy-row')) out[current].push(c.getAttribute('data-code'));
  });
  return out;
}

function buyRow(document, code) {
  return findAll(summaryChild(document, 'ios-buy-judgment'), (n) => n.classList.contains('ios-buy-row') && n.getAttribute('data-code') === code)[0];
}

test('#396 PR B: the report page reads 结论 → 买入判断 → 计数卡 → 本期变化, then the report detail; no tiers or conclusion card', () => {
  const { document, window } = loadWithWindow(null, weeklyWith([weeklyAsset()]), 'weekly');
  window.selectTab('weekly');
  const order = document.getElementById('ios-summary-content').children.map((c) => c.className.split(' ').filter((x) => x !== 'ios-card')[0]);
  assert.deepEqual(order.slice(0, 6), ['ios-headline-card', 'ios-report-caption', 'ios-buy-judgment', 'ios-count-cards', 'ios-period-changes', 'ios-report-detail-head']);
  assert.equal(summaryChild(document, 'ios-tiers'), undefined);
  assert.equal(summaryChild(document, 'ios-conclusion-card'), undefined);
  assert.doesNotMatch(document.getElementById('ios-summary-content').textContent, /必须执行|仅供了解/);
  assert.match(summaryChild(document, 'ios-buy-judgment').children[0].textContent, /^本周买入判断$/);
  assert.match(summaryChild(document, 'ios-buy-judgment').textContent, /结论取自报告的今日行动，页面不自行判断；价格为报告时价格；要不要买由你决定。/);
});

test('#396 PR B: 买入判断 groups by the fixed 今日建议 mapping; a gated, inconsistent or hold row never shows as 适合买入', () => {
  const rows = [
    weeklyAsset({ 代码: 'BUY' }),
    weeklyAsset({ 代码: 'GATE', _iosOrderable: { ok: false, message: '有未纳入本报告的暂停事件' } }),
    weeklyAsset({ 代码: 'FUNDS', 资金结论: '未核验' }),
    weeklyAsset({ 代码: 'BLOCK', 阻塞待办ID: 'T-1' }),
    weeklyAsset({ 代码: 'HOLD', _iosPurchaseMode: 'three_layer_hold' }),
    weeklyAsset({ 代码: 'WAIT', 今日行动: '等待价格', 今日行动说明: '高于区间', 当前阻碍: '报告时价格高于计划买入区间', 阻塞待办ID: '无' }),
    weeklyAsset({ 代码: 'NONE', 今日行动: '' }),
    weeklyAsset({ 代码: 'WREADY', 资产类型: 'watchlist' }),
    weeklyAsset({ 代码: 'WBLANK', 资产类型: 'watchlist', 今日行动: '' }),
    weeklyAsset({ 代码: 'FUND-SLEEVE', 今日行动: '沿用定投' })
  ];
  const { document } = loadWithWindow(null, weeklyWith(rows, { todos: [{ 待办ID: 'T-1', 待办: '核对', 状态: '待处理' }] }), 'weekly');
  assert.deepEqual(buyGroups(document), {
    '适合买入': ['BUY', 'WREADY'],
    '等待': ['WAIT'],
    '无法判断': ['GATE', 'FUNDS', 'BLOCK', 'HOLD', 'NONE'],
    '观察（报告未判断）': ['WBLANK']
  });
  assert.doesNotMatch(summaryChild(document, 'ios-buy-judgment').textContent, /基金定投|FUND-SLEEVE/, 'the fund aggregate is not part of 买入判断');
  assert.match(buyRow(document, 'GATE').textContent, /无法判断原因: 有未纳入本报告的暂停事件，请勿据此下单/);
  assert.match(buyRow(document, 'WREADY').textContent, /观察/);
  assert.doesNotMatch(buyRow(document, 'BUY').textContent, /当前阻碍/, 'a 适合买入 row shows no blocker line');
  assert.match(buyRow(document, 'WAIT').textContent, /当前阻碍报告时价格高于计划买入区间/);
});

test('#396 PR B: each row shows only report fields side by side, the price labelled as the report-time price, missing as 未提供', () => {
  const rows = [weeklyAsset(), weeklyAsset({ 代码: 'GAP', 今日行动: '先核对缺项', 今日行动说明: '', 当前价格: '', 计划买入下限: '', 计划买入上限: '',
    长期买入上限快照: '', 资金结论: '', 周计划状态: '事件暂停', 暂停事件载荷: '[{"事件":"x"}]', 当前阻碍: '本次报告没有可靠报价', 阻塞待办ID: '无' })];
  const { document } = loadWithWindow(null, weeklyWith(rows), 'weekly');
  const fields = (code) => Object.fromEntries(findAll(buyRow(document, code), (n) => n.classList.contains('ios-buy-field'))
    .map((f) => [f.children[0].textContent, f.children[1].textContent]));
  assert.deepEqual(fields('AAA'), {
    报告时价格: '365 USD · 收盘 · 截至 2026-11-06 16:00 美东', 计划买入区间: '350 USD – 380 USD', 长期买入上限: '400',
    暂停状态: '无暂停记录（周计划状态：有效）', 资金结论: '已核验充足', 报告结论: '可人工准备限价单。人工准备限价单，最高 380 USD，当日有效'
  });
  assert.deepEqual(fields('GAP'), {
    报告时价格: '价格未提供 USD · 收盘 · 截至 2026-11-06 16:00 美东', 计划买入区间: '未提供', 长期买入上限: '未提供',
    暂停状态: '暂停中（事件暂停） · 1 个暂停事件事件类别未提供 · 事件时间未提供：事件说明未提供',
    资金结论: '未提供', 报告结论: '先核对缺项', 当前阻碍: '本次报告没有可靠报价'
  });
  assert.doesNotMatch(summaryChild(document, 'ios-buy-judgment').textContent, /%|高于区间|低于区间/, 'no distance or percentage is computed');
});

test('#396 PR B: a blocker on the latest report jumps to the 待办 tab and highlights that todo', () => {
  const weekly = weeklyWith([weeklyAsset({ 今日行动: '等待确认', 当前阻碍: '等待官方事件复核', 阻塞待办ID: 'T-9' })],
    { todos: [{ 待办ID: 'T-9', 待办: '复核官方事件', 状态: '待处理' }] });
  const { document, window } = loadWithWindow(null, weekly, 'weekly');
  window.selectTab('weekly');
  findAll(buyRow(document, 'AAA'), (n) => n.classList.contains('ios-blocker-link'))[0].click();
  assert.ok(document.getElementById('ios-tab-todos').classList.contains('active'));
  const lit = findAll(document.getElementById('ios-tab-content'), (n) => n.classList.contains('ios-todo-highlight'));
  assert.deepEqual(lit.map((n) => n.getAttribute('data-todo-key')), ['weekly|T-9']);
});

test('#396 PR B: on the latest report the count cards add Daily + Weekly, say so, and jump to their tab', () => {
  const risk = (key, evaluation) => ({ 风险: key, 风险键: key, 风险评估: evaluation, 严重度: evaluation === '触发' ? '中' : '' });
  const riskRows = (rows) => ({ risks: rows, riskGroups: logic.buildRiskGroups_(rows) });
  const weekly = weeklyWith([weeklyAsset({ 今日行动: '等待确认', 阻塞待办ID: 'T-1' })], Object.assign({
    todos: [{ 待办ID: 'T-1', 待办: 'w blocker', 状态: '待处理' }, { 待办: 'w other', 状态: '待处理' }]
  }, riskRows([risk('a|A|R1', '触发'), risk('b|B|R2', '未触发')])));
  const daily = current(view('daily'));
  Object.assign(daily, { holdings: [], watchlistCandidates: [], holdingDetail: [{ code: 'AAA', name: '', valuation: { researchStale: true, researchDate: 'x' } }],
    todos: [{ 待办: 'd other', 状态: '未完成' }, { 待办: 'd done', 状态: '已完成' }] }, riskRows([risk('a|A|R1', '触发'), risk('c|C|R3', '触发')]));
  const { document, window } = loadWithWindow(daily, weekly, 'weekly');
  window.selectTab('weekly');
  const cards = summaryChild(document, 'ios-count-cards').children;
  assert.deepEqual(cards.map((c) => c.textContent), ['卡住买入 1 / 其他待办 2 →含日报+周报', '风险 2 项 →数据维护 1 项 · 含日报+周报']);
  cards[1].click();
  assert.ok(document.getElementById('ios-tab-risks').classList.contains('active'));
  window.selectTab('weekly');
  summaryChild(document, 'ios-count-cards').children[0].click();
  assert.ok(document.getElementById('ios-tab-todos').classList.contains('active'));
});

test('#396 PR B: a history report counts only itself, opens its own lists on its page and shows its own 买入判断', () => {
  const latest = weeklyWith([weeklyAsset({ 代码: 'NEW' })], { todos: [{ 待办: 'latest', 状态: '待处理' }] });
  const history = Object.assign(weeklyWith([weeklyAsset({ 代码: 'OLD', 今日行动: '等待确认', 当前阻碍: '旧阻碍', 阻塞待办ID: 'H-1' })], {
    todos: [{ 待办ID: 'H-1', 待办: 'history blocker', 状态: '待处理' }],
    risks: [{ 风险: '历史风险', 严重度: '高' }], riskGroups: { current: [{ 风险: '历史风险', 严重度: '高' }], released: [], unverified: [] }
  }), { error: null });
  history.summary = Object.assign({}, history.summary, { 报告ID: 'weekly-2026-10-31', 报告日期: '2026-10-31' });
  const { document, window } = loadWithWindow(null, latest, 'weekly', { getReport: () => history });
  window.selectHistoryReport('weekly-2026-10-31');
  assert.deepEqual(buyGroups(document)['等待'], ['OLD']);
  assert.deepEqual(buyGroups(document)['适合买入'], [], 'the latest report\'s rows never leak into a history page');
  const cards = summaryChild(document, 'ios-count-cards').children;
  assert.deepEqual(cards.map((c) => c.textContent), ['卡住买入 1 / 其他待办 0 →仅这一期', '风险 1 项 →数据维护 0 项 · 仅这一期']);
  cards[1].click();
  assert.ok(document.getElementById('ios-tab-weekly').classList.contains('active'), 'a history card never jumps to the latest tab');
  assert.match(summaryChild(document, 'ios-period-panel').textContent, /历史风险[\s\S]*风险 tab 仍是最新日报 \+ 最新周报的合并结果|风险 tab 仍是最新日报 \+ 最新周报的合并结果[\s\S]*历史风险/);
  findAll(buyRow(document, 'OLD'), (n) => n.classList.contains('ios-blocker-link'))[0].click();
  const panel = summaryChild(document, 'ios-period-panel');
  assert.equal(panel.getAttribute('data-panel'), 'todos');
  assert.deepEqual(findAll(panel, (n) => n.classList.contains('ios-todo-highlight')).map((n) => n.getAttribute('data-todo-key')), ['weekly|H-1']);
  assert.doesNotMatch(panel.textContent, /latest/);
});

test('#396 PR B: 本期变化 groups rows by their own 变化标记; 无可比基线 and blank read 未比较; 无变化 folds', () => {
  const rows = [
    weeklyAsset({ 代码: 'CHG', 变化标记: '有变化', 较上次变化说明: '区间下调' }),
    weeklyAsset({ 代码: 'SAME', 变化标记: '无变化', 较上次变化说明: '' }),
    weeklyAsset({ 代码: 'BASE', 变化标记: '无可比基线' }),
    weeklyAsset({ 代码: 'BLANK', 变化标记: '' }),
    weeklyAsset({ 代码: 'FUND-SLEEVE', 变化标记: '无变化', 今日行动: '沿用定投', 今日行动说明: '定投照常' })
  ];
  const { document } = loadWithWindow(null, weeklyWith(rows), 'weekly');
  const section = summaryChild(document, 'ios-period-changes');
  const t = section.textContent;
  assert.match(t, /有变化 \(1\)CHG AAA Co\.有变化区间下调/);
  const fold = section.children.find((c) => c.tagName === 'DETAILS');
  assert.equal(fold.getAttribute('open'), null);
  assert.match(fold.textContent, /^无变化 2 项（展开查看）[\s\S]*基金定投（合计）[\s\S]*定投照常/);
  assert.match(t, /未比较 \(2\)BASE[\s\S]*BLANK/);
  const badges = findAll(section, (n) => n.classList.contains('ios-badge')).map((n) => n.textContent);
  assert.ok(!badges.includes('无可比基线'), '无可比基线 reads 未比较');
});

// -- #396 PR B review: nothing the snapshot says is hidden from 买入判断. --

function fieldLines(document, code, label) {
  const field = findAll(buyRow(document, code), (n) => n.classList.contains('ios-buy-field'))
    .find((f) => f.children[0].textContent === label);
  if (!field) return null;
  const value = field.children[1];
  return value.children.length ? value.children.map((c) => c.textContent) : [value.textContent];
}

test('#396 PR B review: a watchlist row the report did not judge still shows 当前阻碍 and its blocker links', () => {
  const rows = [
    weeklyAsset({ 代码: 'WOPEN', 资产类型: 'watchlist', 今日行动: '', 当前阻碍: '等待官方证据', 阻塞待办ID: 'T-1' }),
    weeklyAsset({ 代码: 'WMISS', 资产类型: 'watchlist', 今日行动: '', 当前阻碍: '', 阻塞待办ID: 'T-404' }),
    weeklyAsset({ 代码: 'WDONE', 资产类型: 'watchlist', 今日行动: '', 当前阻碍: '已核对', 阻塞待办ID: 'T-2' }),
    weeklyAsset({ 代码: 'WNONE', 资产类型: 'watchlist', 今日行动: '', 当前阻碍: '', 阻塞待办ID: '无' }),
    weeklyAsset({ 代码: 'WBLANK', 资产类型: 'watchlist', 今日行动: '', 当前阻碍: '', 阻塞待办ID: '' })
  ];
  const todos = [{ 待办ID: 'T-1', 待办: '取得官方证据', 状态: '待处理' }, { 待办ID: 'T-2', 待办: '已做', 状态: 'done' }];
  const { document, window } = loadWithWindow(null, weeklyWith(rows, { todos }), 'weekly');
  window.selectTab('weekly');
  assert.deepEqual(buyGroups(document)['观察（报告未判断）'], ['WOPEN', 'WMISS', 'WDONE', 'WNONE', 'WBLANK']);
  assert.deepEqual(fieldLines(document, 'WOPEN', '当前阻碍'), ['等待官方证据']);
  assert.deepEqual(fieldLines(document, 'WMISS', '当前阻碍'), ['未提供']);
  assert.match(buyRow(document, 'WMISS').textContent, /关联异常: 待办 T-404 不在本报告中/);
  assert.match(buyRow(document, 'WDONE').textContent, /关联异常: 待办 T-2 已标记完成，仍被列为阻碍/);
  assert.match(buyRow(document, 'WNONE').textContent, /阻塞待办: 无/);
  assert.match(buyRow(document, 'WBLANK').textContent, /阻塞待办: 本报告版本未提供关联/);
  findAll(buyRow(document, 'WOPEN'), (n) => n.classList.contains('ios-blocker-link'))[0].click();
  assert.ok(document.getElementById('ios-tab-todos').classList.contains('active'));
  const lit = findAll(document.getElementById('ios-tab-content'), (n) => n.classList.contains('ios-todo-highlight'));
  assert.deepEqual(lit.map((n) => n.getAttribute('data-todo-key')), ['weekly|T-1']);
});

test('#396 PR B review: every part of the report-time quote is kept; each missing part says 未提供', () => {
  const q = (over) => weeklyAsset(Object.assign({ 当前价格: 100, 报价币种: 'USD', 行情属性: '收盘', 行情截至时间: '2026-11-11' }, over));
  const rows = [
    q({ 代码: 'FULL' }),
    q({ 代码: 'NOPRICE', 当前价格: '' }),
    q({ 代码: 'NOCCY', 报价币种: '' }),
    q({ 代码: 'NOSESSION', 行情属性: '' }),
    q({ 代码: 'NOTIME', 行情截至时间: '' }),
    q({ 代码: 'TWO', 报价币种: '', 行情属性: '' }),
    q({ 代码: 'ONLYTIME', 当前价格: '', 报价币种: '', 行情属性: '' }),
    q({ 代码: 'NONE', 当前价格: '', 报价币种: '', 行情属性: '', 行情截至时间: '' })
  ];
  const { document } = loadWithWindow(null, weeklyWith(rows), 'weekly');
  const quote = (code) => fieldLines(document, code, '报告时价格')[0];
  assert.equal(quote('FULL'), '100 USD · 收盘 · 截至 2026-11-11');
  assert.equal(quote('NOPRICE'), '价格未提供 USD · 收盘 · 截至 2026-11-11');
  assert.equal(quote('NOCCY'), '100 币种未提供 · 收盘 · 截至 2026-11-11');
  assert.equal(quote('NOSESSION'), '100 USD · 行情属性未提供 · 截至 2026-11-11');
  assert.equal(quote('NOTIME'), '100 USD · 收盘 · 截至 未提供');
  assert.equal(quote('TWO'), '100 币种未提供 · 行情属性未提供 · 截至 2026-11-11');
  assert.equal(quote('ONLYTIME'), '价格未提供 币种未提供 · 行情属性未提供 · 截至 2026-11-11');
  assert.equal(quote('NONE'), '未提供');
});

test('#396 PR B review: 暂停状态 lists every payload record as written; bad or empty payloads say so', () => {
  const rec = (id, kind, time, said) => ({ 暂停记录ID: id, 代码: 'AAA', 周计划ID: 'wp', 事件类别: kind, 事件说明: said, 事件时间: time, 来源: 's', 记录时间: time, 记录者: 'r' });
  const p = (over) => weeklyAsset(Object.assign({ 今日行动: '等待确认', 当前阻碍: 'x', 阻塞待办ID: '无' }, over));
  const rows = [
    p({ 代码: 'ONE', 周计划状态: '事件暂停', 暂停事件载荷: JSON.stringify([rec('P-1', '财报', '2026-11-05', '等待财报后复核')]) }),
    p({ 代码: 'TWO', 周计划状态: '事件暂停', 暂停事件载荷: JSON.stringify([rec('P-1', '财报', '2026-11-05', '等待财报后复核'), rec('P-2', '公告', '2026-11-07', '')]) }),
    p({ 代码: 'NOSAID', 今日行动: '暂停新增待复核', 周计划状态: '有效', 暂停事件载荷: JSON.stringify([{ 暂停记录ID: 'P-3' }]) }),
    p({ 代码: 'BADREC', 周计划状态: '事件暂停', 暂停事件载荷: '["x", null]' }),
    p({ 代码: 'NOTARRAY', 周计划状态: '事件暂停', 暂停事件载荷: '{"事件说明":"x"}' }),
    p({ 代码: 'BROKEN', 周计划状态: '有效', 暂停事件载荷: '[{' }),
    p({ 代码: 'EMPTYPAUSED', 周计划状态: '事件暂停', 暂停事件载荷: '[]' }),
    p({ 代码: 'NOPAYLOAD', 周计划状态: '事件暂停', 暂停事件载荷: '' }),
    p({ 代码: 'PAYLOADONLY', 周计划状态: '有效', 暂停事件载荷: JSON.stringify([rec('P-4', '监管', '2026-11-09', '监管问询')]) }),
    p({ 代码: 'EMPTY', 周计划状态: '有效', 暂停事件载荷: '[]' })
  ];
  const { document } = loadWithWindow(null, weeklyWith(rows), 'weekly');
  const pause = (code) => fieldLines(document, code, '暂停状态');
  assert.deepEqual(pause('ONE'), ['暂停中（事件暂停） · 1 个暂停事件', '财报 · 2026-11-05：等待财报后复核']);
  assert.deepEqual(pause('TWO'), ['暂停中（事件暂停） · 2 个暂停事件', '1. 财报 · 2026-11-05：等待财报后复核', '2. 公告 · 2026-11-07：事件说明未提供']);
  assert.deepEqual(pause('NOSAID'), ['暂停中（暂停新增待复核） · 1 个暂停事件', '事件类别未提供 · 事件时间未提供：事件说明未提供']);
  assert.deepEqual(pause('BADREC'), ['暂停中（事件暂停） · 2 个暂停事件', '1. 暂停事件记录不可读', '2. 暂停事件记录不可读']);
  assert.deepEqual(pause('NOTARRAY'), ['暂停中（事件暂停） · 暂停载荷不可读（不是 JSON 数组），无法列出暂停原因']);
  assert.deepEqual(pause('BROKEN'), ['暂停载荷不可读（不是 JSON 数组），无法列出暂停原因']);
  assert.deepEqual(pause('EMPTYPAUSED'), ['暂停中（事件暂停） · 暂停载荷为空，报告未列出暂停事件']);
  assert.deepEqual(pause('NOPAYLOAD'), ['暂停中（事件暂停） · 报告未提供暂停事件载荷']);
  assert.deepEqual(pause('PAYLOADONLY'), ['暂停中 · 1 个暂停事件', '监管 · 2026-11-09：监管问询']);
  assert.deepEqual(pause('EMPTY'), ['无暂停']);
  assert.doesNotMatch(summaryChild(document, 'ios-buy-judgment').textContent, /P-1|P-2|暂停记录ID|wp/, 'record IDs stay off the page');
});

test('#396 PR B review: a reader-gated or paused row never reaches 适合买入, whatever else it carries', () => {
  const rows = [
    weeklyAsset({ 代码: 'GATED', _iosOrderable: { ok: false, message: '本报告不作为当前买入依据' } }),
    weeklyAsset({ 代码: 'PAUSED', 周计划状态: '事件暂停', 暂停事件载荷: '[]' }),
    weeklyAsset({ 代码: 'WGATED', 资产类型: 'watchlist', _iosOrderable: { ok: false, message: '本报告不作为当前买入依据' } })
  ];
  const { document } = loadWithWindow(null, weeklyWith(rows), 'weekly');
  const groups = buyGroups(document);
  assert.deepEqual(groups['适合买入'], []);
  assert.deepEqual(groups['无法判断'], ['GATED', 'PAUSED', 'WGATED']);
  assert.deepEqual(fieldLines(document, 'PAUSED', '暂停状态'), ['暂停中（事件暂停） · 暂停载荷为空，报告未列出暂停事件']);
});

test('#396 PR B review: a history report shows its own pause records, quotes and blockers, and opens its own list', () => {
  const latest = weeklyWith([weeklyAsset({ 今日行动: '等待确认', 当前阻碍: '最新阻碍', 阻塞待办ID: 'T-9' })],
    { todos: [{ 待办ID: 'T-9', 待办: '最新待办', 状态: '待处理' }] });
  const history = weeklyWith([weeklyAsset({ 今日行动: '等待确认', 当前阻碍: '历史阻碍', 阻塞待办ID: 'T-1', 当前价格: 90, 报价币种: '',
    周计划状态: '事件暂停', 暂停事件载荷: JSON.stringify([{ 事件类别: '财报', 事件时间: '2026-10-01', 事件说明: '历史暂停原因' }]) })],
    { todos: [{ 待办ID: 'T-1', 待办: '历史待办', 状态: '待处理' }], error: null });
  history.summary = Object.assign({}, history.summary, { 报告ID: 'weekly-2026-10-03', 报告日期: '2026-10-03' });
  const { document, window } = loadWithWindow(null, latest, 'weekly', { getReport: () => history });
  window.selectHistoryReport('weekly-2026-10-03');
  const row = buyRow(document, 'AAA').textContent;
  assert.match(row, /历史阻碍/);
  assert.match(row, /财报 · 2026-10-01：历史暂停原因/);
  assert.match(row, /90 币种未提供/);
  assert.doesNotMatch(row, /最新阻碍|最新待办/);
  findAll(buyRow(document, 'AAA'), (n) => n.classList.contains('ios-blocker-link'))[0].click();
  assert.ok(document.getElementById('ios-tab-weekly').classList.contains('active'), 'stays on the history page');
  const panel = summaryChild(document, 'ios-period-panel');
  assert.equal(panel.getAttribute('data-panel'), 'todos');
  assert.match(panel.textContent, /历史待办/);
  assert.doesNotMatch(panel.textContent, /最新待办/);
});

// -- #396 PR D: fixes from the production acceptance. --

test('#396 PR D: 计划买入区间 is a range only when both ends are numbers; the report wording otherwise, once', () => {
  const r = (code, lo, hi) => weeklyAsset({ 代码: code, 今日行动: '等待价格', 计划买入下限: lo, 计划买入上限: hi, 长期买入上限快照: 999 });
  const pause = '本周无可执行区间：暂停新增待复核';
  const rows = [r('NUM', '350 USD', '380 USD'), r('PLAIN', 350, 380), r('SAME', pause, pause),
    r('DIFF', '需补全：下限', '需补全：上限'), r('HALF', 350, '需补全：上限'), r('NONE', '', ''), r('ONE', '', '380 USD')];
  const { document } = loadWithWindow(null, weeklyWith(rows), 'weekly');
  const range = (code) => fieldLines(document, code, '计划买入区间')[0];
  assert.equal(range('NUM'), '350 USD – 380 USD');
  assert.equal(range('PLAIN'), '350 – 380');
  assert.equal(range('SAME'), pause, 'identical wording reads once, never "A – A"');
  assert.equal(range('DIFF'), '下限：需补全：下限 · 上限：需补全：上限');
  assert.equal(range('HALF'), '下限：350 · 上限：需补全：上限');
  assert.equal(range('NONE'), '未提供');
  assert.equal(range('ONE'), '下限：未提供 · 上限：380 USD');
  assert.doesNotMatch(range('NONE') + range('SAME'), /999/, '长期买入上限 never fills the gap');
});

test('#396 PR D: weekly plan IDs never reach reading text, latest or history; a change reads 周计划已更新', () => {
  const said = '周计划ID由 wp-20261101-AAA-v11 变为 wp-20261108-AAA-v13-gen-w2-b；价格未变';
  const mk = () => weeklyWith([weeklyAsset({ 变化标记: '有变化', 较上次变化说明: said }),
    weeklyAsset({ 代码: 'BBB', 变化标记: '无变化', 较上次变化说明: '沿用 wp-20261101-BBB-v2' })]);
  const latest = mk();
  const history = Object.assign(mk(), { error: null });
  history.summary = Object.assign({}, history.summary, { 报告ID: 'weekly-2026-11-01', 报告日期: '2026-11-01' });
  const { document, window } = loadWithWindow(null, latest, 'weekly', { getReport: () => history });
  window.selectTab('weekly');
  const check = () => {
    const changes = summaryChild(document, 'ios-period-changes').textContent;
    assert.match(changes, /周计划已更新；价格未变/);
    assert.match(changes, /沿用 周计划/);
    assert.doesNotMatch(changes, /wp-/);
    assert.doesNotMatch(summaryChild(document, 'ios-buy-judgment').textContent, /wp-/);
  };
  check();
  window.selectHistoryReport('weekly-2026-11-01');
  check();
});

test('#396 PR D: 「名称|名称 vN」 and repeated names read once, in todos, 买入判断 and 持仓明细 alike', () => {
  const weekly = weeklyWith([weeklyAsset({ 今日行动: '等待价格', 今日行动说明: '依据 入场计划|ep-20261101-AAA-v4', 当前阻碍: '依据 入场计划|入场计划 v9' })],
    { todos: [{ 待办ID: 'T-1', 待办: '复核 依据 入场计划|ep-20261101-AAA-v3', 状态: '待处理' },
      { 待办ID: 'T-2', 待办: '复核 ep-20261101-AAA-v2|ep-20261101-AAA-v2', 状态: '待处理' }] });
  const { document, window } = loadWithWindow(null, weekly, 'weekly');
  window.selectTab('weekly');
  const buy = summaryChild(document, 'ios-buy-judgment').textContent;
  assert.match(buy, /依据 入场计划 v4/);
  assert.match(buy, /依据 入场计划 v9/);
  window.selectTab('todos');
  const todos = document.getElementById('ios-tab-content').textContent;
  assert.match(todos, /复核 依据 入场计划 v3/);
  assert.match(todos, /复核 入场计划 v2(?!\|)/);
  assert.doesNotMatch(buy + todos, /\|/, 'no pipe-joined name is left');
});

test('#396 PR D: no page text points at the removed 「组合」 view', () => {
  const { document, window } = loadWithWindow(null, weeklyWith([weeklyAsset()]), 'weekly');
  ['todos', 'daily', 'weekly', 'holdingDetail', 'risks'].forEach((tab) => {
    window.selectTab(tab);
    const page = document.getElementById('ios-summary-content').textContent + document.getElementById('ios-tab-content').textContent;
    assert.doesNotMatch(page, /「组合」|组合 \/|资本配置」视图/, tab);
  });
  assert.doesNotMatch(SCRIPT_HTML_SRC, /「组合」视图|「组合 \//);
});

test('#396 PR D: an ISO as-of instant reads in Tokyo time; a bare date or free text is unchanged', () => {
  const q = (code, asOf) => weeklyAsset({ 代码: code, 当前价格: 100, 报价币种: 'USD', 行情属性: '收盘', 行情截至时间: asOf });
  const rows = [q('UTC', '2026-11-07T00:59:59Z'), q('OFF', '2026-11-06T15:00:00-05:00'), q('DAY', '2026-11-09'), q('FREE', '2026-11-06 16:00 美东')];
  const { document } = loadWithWindow(null, weeklyWith(rows), 'weekly');
  const quote = (code) => fieldLines(document, code, '报告时价格')[0];
  assert.equal(quote('UTC'), '100 USD · 收盘 · 截至 2026-11-07 09:59 JST');
  assert.equal(quote('OFF'), '100 USD · 收盘 · 截至 2026-11-07 05:00 JST');
  assert.equal(quote('DAY'), '100 USD · 收盘 · 截至 2026-11-09');
  assert.equal(quote('FREE'), '100 USD · 收盘 · 截至 2026-11-06 16:00 美东');
});

test('#396 PR D/E: 当前阻碍 identical to the 今日行动说明 is shown once, in 当前阻碍', () => {
  const rows = [weeklyAsset({ 代码: 'SAME', 今日行动: '等待价格', 今日行动说明: '高于计划区间', 当前阻碍: '高于计划区间', 阻塞待办ID: '无' }),
    weeklyAsset({ 代码: 'DIFF', 今日行动: '等待价格', 今日行动说明: '高于计划区间', 当前阻碍: '等待财报', 阻塞待办ID: '无' })];
  const { document } = loadWithWindow(null, weeklyWith(rows), 'weekly');
  assert.deepEqual(fieldLines(document, 'SAME', '报告结论'), ['等待价格。'], 'PR F: 报告结论 is cut to what it says beyond 当前阻碍');
  assert.deepEqual(fieldLines(document, 'SAME', '当前阻碍'), ['高于计划区间']);
  assert.deepEqual(fieldLines(document, 'DIFF', '当前阻碍'), ['等待财报']);
});

// -- #396 PR E: array changes, ISO instants, prefix dedupe. --

function periodChangeText(document) {
  return summaryChild(document, 'ios-period-changes');
}

test('#396 PR E: a 已核验暂停记录ID change reads as added / removed records with an 依据 link, never raw JSON or pipes', () => {
  const rec = (code, kind, url, day) => code + '|' + kind + '|' + url + '|' + day;
  const sec1 = 'https://www.sec.gov/Archives/edgar/data/1/0001.htm';
  const sec2 = 'https://www.sec.gov/Archives/edgar/data/2/0002.htm';
  const r1 = rec('AAA', '业绩或指引', sec1, '2026-11-05');
  const r2 = rec('AAA', '重大公告', sec2, '2026-11-07');
  const said = (a, b) => '已核验暂停记录ID由' + JSON.stringify(a) + '变为' + JSON.stringify(b);
  const rows = [
    weeklyAsset({ 代码: 'ADD', 变化标记: '有变化', 较上次变化说明: said([], [r1]) }),
    weeklyAsset({ 代码: 'CLEAR', 变化标记: '有变化', 较上次变化说明: said([r1], []) }),
    weeklyAsset({ 代码: 'MORE', 变化标记: '有变化', 较上次变化说明: said([r1], [r1, r2]) + '；价格未变' }),
    weeklyAsset({ 代码: 'SWAP', 变化标记: '有变化', 较上次变化说明: said([r1], [r2]) }),
    weeklyAsset({ 代码: 'BADURL', 变化标记: '有变化', 较上次变化说明: said([], [rec('AAA', '业绩或指引', 'javascript:alert(1)', '2026-11-05')]) }),
    weeklyAsset({ 代码: 'PARTS', 变化标记: '有变化', 较上次变化说明: said([], ['AAA|业绩或指引|2026-11-05']) }),
    weeklyAsset({ 代码: 'JSON', 变化标记: '有变化', 较上次变化说明: '已核验暂停记录ID由[]变为["AAA|x|' + sec1 + '|2026-11-05",]' }),
    weeklyAsset({ 代码: 'PLAIN', 变化标记: '有变化', 较上次变化说明: '关注标签由["半导体"]变为["半导体","AI"]' })
  ];
  const warnings = [];
  const realWarn = console.warn;
  console.warn = (msg) => warnings.push(String(msg));
  let document;
  try {
    ({ document } = loadWithWindow(null, weeklyWith(rows), 'weekly'));
  } finally {
    console.warn = realWarn;
  }
  const changes = periodChangeText(document);
  const items = findAll(changes, (n) => n.tagName === 'LI');
  const textOf = (i) => items[i].textContent;
  assert.match(textOf(0), /已核验暂停记录：新增 1 条：业绩或指引（2026-11-05） · 依据/);
  assert.match(textOf(1), /已核验暂停记录已清空/);
  assert.match(textOf(2), /已核验暂停记录：新增 1 条：重大公告（2026-11-07） · 依据；价格未变/);
  assert.match(textOf(3), /新增 1 条：重大公告（2026-11-07） · 依据；移除 1 条：业绩或指引（2026-11-05） · 依据/);
  assert.match(textOf(4), /新增 1 条：业绩或指引（2026-11-05）$/, 'a non-http URL gets no link');
  assert.match(textOf(5), /已核验暂停记录有变化（格式无法解析）/);
  assert.match(textOf(6), /已核验暂停记录有变化（格式无法解析）/);
  assert.match(textOf(7), /关注标签：新增 1 条：AI/);
  const links = findAll(changes, (n) => n.tagName === 'A');
  assert.equal(links.length, 4, 'ADD 1 + MORE 1 + SWAP 2; BADURL none');
  links.forEach((a) => {
    assert.equal(a.textContent, '依据');
    assert.match(a.getAttribute('href'), /^https:\/\/www\.sec\.gov\//);
    assert.equal(a.getAttribute('target'), '_blank');
    assert.equal(a.getAttribute('rel'), 'noopener');
  });
  const all = changes.textContent;
  assert.doesNotMatch(all, /\||\["|sec\.gov|javascript:|暂停记录ID/);
  assert.equal(warnings.filter((w) => /无法解析/.test(w)).length, 2);
});

test('#396 PR E: ISO instants read in Tokyo time anywhere in reading text; bare dates are unchanged', () => {
  const rows = [weeklyAsset({ 代码: 'T1', 变化标记: '有变化', 较上次变化说明: '行情 2026-11-09T05:03:42.295Z、2026-11-07T00:59:59Z、2026-11-06T15:00+09:00、2026-11-06 ~ 2026-11-07T00:59:59Z、2026-11-09' })];
  const vmodel = weeklyWith(rows);
  vmodel.summary = Object.assign({}, vmodel.summary, { 生成时间: '2026-11-09T05:03:42.295Z' });
  const { document } = loadWithWindow(null, vmodel, 'weekly');
  const said = periodChangeText(document).textContent;
  assert.match(said, /行情 2026-11-09 14:03 JST、2026-11-07 09:59 JST、2026-11-06 15:00 JST、2026-11-06 ~ 2026-11-07 09:59 JST、2026-11-09/);
  const page = document.getElementById('ios-summary-content').textContent;
  assert.doesNotMatch(page, /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})/, 'no raw ISO instant is left on the page');
});

test('#396 PR E: when 今日行动说明 is a status prefix + the 当前阻碍 text, 报告结论 keeps the prefix and 当前阻碍 the body', () => {
  const rows = [
    weeklyAsset({ 代码: 'PRE', 今日行动: '暂停新增待复核', 今日行动说明: '事件暂停中：等待 10-Q 复核', 当前阻碍: '等待 10-Q 复核', 阻塞待办ID: '无' }),
    weeklyAsset({ 代码: 'OTHER', 今日行动: '等待价格', 今日行动说明: '高于计划区间', 当前阻碍: '等待财报', 阻塞待办ID: '无' }),
    weeklyAsset({ 代码: 'BUY' })
  ];
  const { document } = loadWithWindow(null, weeklyWith(rows), 'weekly');
  assert.deepEqual(fieldLines(document, 'PRE', '报告结论'), ['暂停新增待复核。事件暂停中']);
  assert.deepEqual(fieldLines(document, 'PRE', '当前阻碍'), ['等待 10-Q 复核']);
  assert.deepEqual(fieldLines(document, 'OTHER', '报告结论'), ['等待价格。高于计划区间']);
  assert.deepEqual(fieldLines(document, 'OTHER', '当前阻碍'), ['等待财报']);
  assert.match(fieldLines(document, 'BUY', '报告结论')[0], /^可人工准备限价单。人工准备限价单/, 'a 适合买入 row keeps its full conclusion');
});

// -- #396 PR E review: array changes are scanned (never regex-truncated),
// keep their links on every reading path, and fail closed with no raw fragment. --

const PE_SEC1 = 'https://www.sec.gov/Archives/edgar/data/1/0001.htm';
const PE_SEC2 = 'http://www.sec.gov/Archives/edgar/data/2/0002.htm';
const peRec = (kind, url, day) => 'AAA|' + kind + '|' + url + '|' + day;
const peSaid = (a, b) => '已核验暂停记录ID由' + JSON.stringify(a) + '变为' + JSON.stringify(b);
const PE_LEAK = /\||\[|\]|"|\\|sec\.gov|javascript:|data:|ftp:|暂停记录ID|AAA\||leaked|ep-2026|\{|\}/;

function withWarnings(fn) {
  const warnings = [];
  const realWarn = console.warn;
  console.warn = (msg) => warnings.push(String(msg));
  try { return { result: fn(), warnings }; } finally { console.warn = realWarn; }
}

function periodItems(document) {
  return findAll(periodChangeText(document), (n) => n.tagName === 'LI');
}

function assertLinks(root, expected) {
  const links = findAll(root, (n) => n.tagName === 'A' && n.classList.contains('ios-source-link'));
  assert.deepEqual(links.map((a) => a.getAttribute('href')), expected);
  links.forEach((a) => {
    assert.equal(a.textContent, '依据');
    assert.equal(a.getAttribute('target'), '_blank');
    assert.equal(a.getAttribute('rel'), 'noopener');
  });
}

test('#396 PR E review: 0→1, 1→0, 1→2, replace, 未变 and two changes in one sentence all read cleanly', () => {
  const r1 = peRec('业绩或指引', PE_SEC1, '2026-11-05');
  const r2 = peRec('重大公告', PE_SEC2, '2026-11-07');
  const rows = [
    ['ADD', peSaid([], [r1])],
    ['CLEAR', peSaid([r1], [])],
    ['MORE', peSaid([r1], [r1, r2])],
    ['SWAP', peSaid([r1], [r2])],
    ['SAME', peSaid([r1], [r1])],
    ['TWO', peSaid([], [r1]) + '；关注标签由["半导体"]变为["半导体","AI"]，价格未变'],
    ['WORD', peSaid([], [peRec('公告]补充}', PE_SEC1, '2026-11-05'), peRec('业绩"指引\\修订', PE_SEC2, '2026-11-06')])]
  ].map(([code, said]) => weeklyAsset({ 代码: code, 变化标记: '有变化', 较上次变化说明: said }));
  const { result: { document }, warnings } = withWarnings(() => loadWithWindow(null, weeklyWith(rows), 'weekly'));
  const items = periodItems(document).map((li) => li.textContent);
  assert.match(items[0], /已核验暂停记录：新增 1 条：业绩或指引（2026-11-05） · 依据$/);
  assert.match(items[1], /已核验暂停记录已清空$/);
  assert.match(items[2], /已核验暂停记录：新增 1 条：重大公告（2026-11-07） · 依据$/);
  assert.match(items[3], /已核验暂停记录：新增 1 条：重大公告（2026-11-07） · 依据；移除 1 条：业绩或指引（2026-11-05） · 依据$/);
  assert.match(items[4], /已核验暂停记录未变$/);
  assert.match(items[5], /已核验暂停记录：新增 1 条：业绩或指引（2026-11-05） · 依据；关注标签：新增 1 条：AI，价格未变$/);
  assert.match(items[6], /已核验暂停记录：新增 2 条：公告\]补充}（2026-11-05） · 依据、业绩"指引\\修订（2026-11-06） · 依据$/,
    'a ] } " or \\ inside a JSON string is scanned as wording, not as the array end');
  assertLinks(periodChangeText(document), [PE_SEC1, PE_SEC2, PE_SEC2, PE_SEC1, PE_SEC1, PE_SEC1, PE_SEC2]);
  assert.doesNotMatch(items.slice(0, 6).join('\n'), PE_LEAK);
  assert.doesNotMatch(items[6], /\||sec\.gov|暂停记录ID|AAA\|/);
  assert.equal(warnings.length, 0);
});

test('#396 PR E review: every malformed change fails closed to 「<字段>有变化（格式无法解析）」 with no raw fragment', () => {
  const ok = peRec('业绩或指引', PE_SEC1, '2026-11-05');
  const cases = [
    ['LTRUNC', '已核验暂停记录ID由["' + ok + '"', ''],
    ['LTRUNC2', '已核验暂停记录ID由["' + ok + '"；价格未变', ''],
    ['RTRUNC', '已核验暂停记录ID由[]变为["' + ok, ''],
    ['RMISS', '已核验暂停记录ID由["' + ok + '"]；价格未变', '；价格未变'],
    ['RNOTARR', '已核验暂停记录ID由[]变为 ' + ok + '；价格未变', '；价格未变'],
    ['LMISS', '已核验暂停记录ID由 ' + ok + ' 变为["' + ok + '"]；价格未变', '；价格未变'],
    ['BADJSON', '已核验暂停记录ID由[]变为["' + ok + '",]；价格未变', '；价格未变'],
    ['NONSTR', peSaid([], [1]) + '；价格未变', '；价格未变'],
    ['OBJ', peSaid([], [{ url: PE_SEC1 }]) + '；价格未变', '；价格未变'],
    ['PARTS', peSaid([], ['AAA|业绩或指引|2026-11-05']) + '；价格未变', '；价格未变'],
    ['NOKIND', peSaid([], [peRec('', PE_SEC1, '2026-11-05')]) + '；价格未变', '；价格未变'],
    ['NODAY', peSaid([], [peRec('业绩或指引', PE_SEC1, '')]) + '；价格未变', '；价格未变'],
    ['BADDAY', peSaid([], [peRec('业绩或指引', PE_SEC1, 'soon')]) + '；价格未变', '；价格未变'],
    ['LMISMATCH', '已核验暂停记录ID由["' + ok + '"}变为[]；价格未变|leaked ' + PE_SEC1, ''],
    ['RMISMATCH', '已核验暂停记录ID由[]变为["' + ok + '"}|leaked ' + PE_SEC1 + '；javascript:alert(1)', ''],
    ['RBRACE', '已核验暂停记录ID由[]变为{"a":"' + ok + '"]|leaked；价格未变', '；价格未变'],
    ['EXTRA', '已核验暂停记录ID由[]变为["' + ok + '"]}|leaked ep-20261101-AAA-v3；价格未变', '；价格未变'],
    ['CROSS', '已核验暂停记录ID由[]变为[["' + ok + '"}]|leaked；价格未变', ''],
    ['RESIDUE', peSaid([], [ok]) + '|leaked ' + PE_SEC1 + ' {"x":1}；价格未变', '；价格未变'],
    ['LBRACE', '已核验暂停记录ID由{"a":1}变为["' + ok + '"]|leaked；价格未变', '；价格未变'],
    ['PLAINJSON', peSaid([], ['{"x":1}']) + '；价格未变', '；价格未变'],
    ['PLAINURL', peSaid([], ['javascript:alert(1)']) + '；价格未变', '；价格未变'],
    ['PLAINPIPE', peSaid(['AAA|x'], []) + '；价格未变', '；价格未变']
  ];
  const rows = cases.map(([code, said]) => weeklyAsset({ 代码: code, 变化标记: '有变化', 较上次变化说明: said }));
  const { result: { document }, warnings } = withWarnings(() => loadWithWindow(null, weeklyWith(rows), 'weekly'));
  const items = periodItems(document);
  cases.forEach(([code, , rest], i) => {
    const said = items[i].textContent;
    assert.ok(said.endsWith('已核验暂停记录有变化（格式无法解析）' + rest), code + ': ' + said);
    assert.doesNotMatch(said, PE_LEAK, code);
    assert.equal(findAll(items[i], (n) => n.tagName === 'A').length, 0, code + ' has no link');
  });
  assert.equal(warnings.filter((w) => /无法解析的数组变化：已核验暂停记录$/.test(w)).length, cases.length);
});

test('#396 PR E review: only http(s) URLs become links; other protocols never reach text or href', () => {
  const urls = ['javascript:alert(1)', 'data:text/html,x', 'ftp://www.sec.gov/x', 'JAVASCRIPT:alert(1)', 'https://x y', ''];
  const rows = urls.map((url, i) => weeklyAsset({ 代码: 'P' + i, 变化标记: '有变化', 较上次变化说明: peSaid([], [peRec('业绩或指引', url, '2026-11-05')]) }));
  const { document } = loadWithWindow(null, weeklyWith(rows), 'weekly');
  periodItems(document).forEach((li, i) => {
    assert.match(li.textContent, /已核验暂停记录：新增 1 条：业绩或指引（2026-11-05）$/, urls[i]);
  });
  assertLinks(periodChangeText(document), []);
  assert.doesNotMatch(periodChangeText(document).textContent, PE_LEAK);
});

test('#396 PR E review: links survive on report cards and in a layered research row\'s evidence (layerLine_)', () => {
  const said = peSaid([], [peRec('业绩或指引', PE_SEC1, '2026-11-05')]);
  // A Daily report card (pre-three-layer row: 较上次变化 sits in 研究与估值详情).
  const legacy = dailyTwin({ 较上次变化说明: said, _iosThreeLayer: false, 周计划ID: '', 周计划状态: '' });
  const { document: daily } = dailyWithWeekly([legacy], [weeklyAsset()]);
  const card = portfolioCards(daily)[0];
  const line = findAll(card, (n) => n.tagName === 'P' && /^较上次变化: /.test(n.textContent))[0];
  assert.equal(line.textContent, '较上次变化: 已核验暂停记录：新增 1 条：业绩或指引（2026-11-05） · 依据');
  assertLinks(line, [PE_SEC1]);
  assert.doesNotMatch(card.textContent, PE_LEAK);
  // A Weekly research row's 本周证据 (layerLine_); 来源记录 stays raw in 技术信息.
  const root = layering(load(null, view('weekly', null, (t) => {
    const row = t['报告周度研究'].find((r) => r['生成ID'] === 'gen-w2-b' && r['状态'] === '已变化');
    row['本周证据'] = said;
    row['来源记录'] = said;
  }), 'weekly'));
  const evidence = findAll(root, (n) => n.tagName === 'DETAILS' && n.classList.contains('ios-layer-evidence'))
    .find((d) => /业绩或指引（2026-11-05）/.test(d.textContent));
  const evLine = evidence.children.find((c) => /^本周证据：/.test(c.textContent));
  assert.equal(evLine.textContent, '本周证据：已核验暂停记录：新增 1 条：业绩或指引（2026-11-05） · 依据');
  assertLinks(evLine, [PE_SEC1]);
  const tech = findAll(evidence, (n) => n.classList.contains('ios-tech-info'))[0];
  assert.ok(tech.textContent.includes('来源: ' + said), '技术信息 keeps the raw value');
  assertLinks(tech, []);
});

test('#396 PR E review: ISO instants -- Z with/without ms, ± offsets, day rollover; bare dates, zone-less and invalid times unchanged', () => {
  const said = [
    'A 2026-11-09T05:03:42.295Z', 'B 2026-11-09T05:03:42Z', 'C 2026-11-09T05:03Z',
    'D 2026-11-06T15:00:00+09:00', 'E 2026-11-06T15:00:00-05:00', 'F 2026-12-31T20:30:00Z',
    'G 2026-11-09', 'H 2026-11-09T05:03:42', 'I 2026-13-45T99:99:00Z'
  ].join('、');
  const { document } = loadWithWindow(null, weeklyWith([weeklyAsset({ 变化标记: '有变化', 较上次变化说明: said })]), 'weekly');
  assert.match(periodChangeText(document).textContent, new RegExp([
    'A 2026-11-09 14:03 JST', 'B 2026-11-09 14:03 JST', 'C 2026-11-09 14:03 JST',
    'D 2026-11-06 15:00 JST', 'E 2026-11-07 05:00 JST', 'F 2027-01-01 05:30 JST',
    'G 2026-11-09', 'H 2026-11-09T05:03:42', 'I 2026-13-45T99:99:00Z'
  ].join('、')));
});

test('#396 PR E review: a latest and a history report with malformed changes both fail closed, independently', () => {
  const bad = '已核验暂停记录ID由["AAA|x';
  const latest = weeklyWith([weeklyAsset({ 变化标记: '有变化', 较上次变化说明: bad })]);
  const history = Object.assign(weeklyWith([weeklyAsset({ 变化标记: '有变化', 较上次变化说明: peSaid([], [1]) + '；价格未变' })]), { error: null });
  history.summary = Object.assign({}, history.summary, { 报告ID: 'weekly-2026-11-01', 报告日期: '2026-11-01' });
  const { result, warnings } = withWarnings(() => {
    const loaded = loadWithWindow(null, latest, 'weekly', { getReport: () => history });
    loaded.window.selectTab('weekly');
    const first = periodChangeText(loaded.document).textContent;
    loaded.window.selectHistoryReport('weekly-2026-11-01');
    return { first, second: periodChangeText(loaded.document).textContent };
  });
  assert.match(result.first, /已核验暂停记录有变化（格式无法解析）$/);
  assert.match(result.second, /已核验暂停记录有变化（格式无法解析）；价格未变$/);
  assert.doesNotMatch(result.first + result.second, PE_LEAK);
  assert.ok(warnings.length >= 2);
});

test('#396 PR E review 2: mismatched closers in two reports at once leave no raw value anywhere on the page', () => {
  const ok = peRec('业绩或指引', PE_SEC1, '2026-11-05');
  const bad1 = '已核验暂停记录ID由[]变为["' + ok + '"}|leaked ep-20261101-AAA-v3 javascript:alert(1)';
  const bad2 = '已核验暂停记录ID由[["' + ok + '"}]变为[]|leaked {"x":1}';
  const bad3 = peSaid([], [ok]) + '}|leaked ' + PE_SEC2 + '；价格未变 2026-11-09T05:03Z..q';
  const latest = weeklyWith([weeklyAsset({ 变化标记: '有变化', 较上次变化说明: bad1 }), weeklyAsset({ 代码: 'BBB', 变化标记: '有变化', 较上次变化说明: bad3 })]);
  const history = Object.assign(weeklyWith([weeklyAsset({ 变化标记: '有变化', 较上次变化说明: bad2 })]), { error: null });
  history.summary = Object.assign({}, history.summary, { 报告ID: 'weekly-2026-11-01', 报告日期: '2026-11-01' });
  const { result, warnings } = withWarnings(() => {
    const { document, window } = loadWithWindow(null, latest, 'weekly', { getReport: () => history });
    const page = () => document.getElementById('ios-summary-content').textContent + document.getElementById('ios-tab-content').textContent;
    window.selectTab('weekly');
    const first = { page: page(), items: periodItems(document).map((li) => li.textContent) };
    window.selectHistoryReport('weekly-2026-11-01');
    return { first, second: { page: page(), items: periodItems(document).map((li) => li.textContent) } };
  });
  assert.match(result.first.items[0], /已核验暂停记录有变化（格式无法解析）$/);
  assert.match(result.first.items[1], /已核验暂停记录有变化（格式无法解析）；价格未变 2026-11-09T05:03Z\.\.q$/);
  assert.match(result.second.items[0], /已核验暂停记录有变化（格式无法解析）$/);
  [result.first.page, result.second.page].forEach((page) => {
    assert.doesNotMatch(page, /leaked|sec\.gov|javascript:|ep-20261101|\{"x"|AAA\|/);
  });
  assert.ok(warnings.length >= 3, "each render warns once per broken change");
});

test('#396 PR E review 3: the whole tail after a right array is checked, not only its first character', () => {
  const ok = peSaid([], [peRec('业绩或指引', PE_SEC1, '2026-11-05')]);
  const bad = [
    ['PIPE', ok + '|raw；价格未变'],
    ['XPIPE', ok + 'x|raw；价格未变'],
    ['URL', ok + '，说明 https://sec.gov/x|raw；价格未变'],
    ['URL2', ok + ' 详见 www.sec.gov//x；价格未变'],
    ['JSON', ok + '，前缀{"x":1}；价格未变'],
    ['QUOTE', ok + '，备注"raw；价格未变'],
    ['EPID', ok + '，沿用 ep-20261101-AAA-v3；价格未变'],
    ['WPID', ok + '，沿用 wp-20261101-AAA-v3；价格未变'],
    ['SCHEME', ok + '，见 javascript:alert(1)；价格未变'],
    ['BEFORE2', ok + '，x|raw 关注标签由["半导体"]变为["AI"]；价格未变']
  ];
  const good = [
    ['TAIL', ok + '，价格未变'],
    ['TAILTIME', ok + '，复核于 2026-11-09T05:03:42Z 与 16:00 收盘后；价格未变'],
    ['TWO', ok + '，另 关注标签由["半导体"]变为["AI"]，价格未变']
  ];
  const rows = bad.concat(good).map(([code, said]) => weeklyAsset({ 代码: code, 变化标记: '有变化', 较上次变化说明: said }));
  const { result: { document }, warnings } = withWarnings(() => loadWithWindow(null, weeklyWith(rows), 'weekly'));
  const items = periodItems(document).map((li) => li.textContent);
  bad.forEach(([code], i) => {
    assert.ok(items[i].endsWith('已核验暂停记录有变化（格式无法解析）；价格未变'), code + ': ' + items[i]);
    assert.doesNotMatch(items[i], /raw|sec\.gov|\{|"|ep-2026|wp-2026|javascript:|半导体|AI/, code);
  });
  const g = items.slice(bad.length);
  assert.match(g[0], /已核验暂停记录：新增 1 条：业绩或指引（2026-11-05） · 依据，价格未变$/);
  assert.match(g[1], /依据，复核于 2026-11-09 14:03 JST 与 16:00 收盘后；价格未变$/);
  assert.match(g[2], /依据，另 关注标签：新增 1 条：AI；移除 1 条：半导体，价格未变$/);
  assert.equal(warnings.length, bad.length);
});

test('#396 PR E review 3: record dates are semantically valid or the change fails closed', () => {
  const day = (d) => peSaid([], [peRec('业绩或指引', PE_SEC1, d)]) + '；价格未变';
  const valid = ['2028-02-29', '2000-02-29', '2026-11-05T10:00', '2026-11-05T10:00:59Z', '2026-11-05T10:00+14:00', '2026-11-05T10:00-12:00'];
  const invalid = ['2026-02-29', '1900-02-29', '2026-00-10', '2026-13-10', '2026-11-00', '2026-11-31', '2026-13-40',
    '2026-11-05T24:00', '2026-11-05T10:60', '2026-11-05T10:00:60Z', '2026-11-05T10:00+09:60', '2026-11-05T10:00+99:99',
    '2026-11-05T10:00+14:01', '2026/11/05'];
  const rows = valid.concat(invalid).map((d, i) => weeklyAsset({ 代码: 'D' + i, 变化标记: '有变化', 较上次变化说明: day(d) }));
  const { result: { document }, warnings } = withWarnings(() => loadWithWindow(null, weeklyWith(rows), 'weekly'));
  const items = periodItems(document).map((li) => li.textContent);
  valid.forEach((d, i) => assert.match(items[i], /已核验暂停记录：新增 1 条：业绩或指引（.+） · 依据；价格未变$/, d));
  assert.match(items[0], /业绩或指引（2028-02-29）/);
  assert.match(items[3], /业绩或指引（2026-11-05 19:00 JST）/);
  assert.match(items[4], /业绩或指引（2026-11-05 05:00 JST）/);
  assert.match(items[5], /业绩或指引（2026-11-06 07:00 JST）/);
  invalid.forEach((d, i) => {
    const said = items[valid.length + i];
    assert.ok(said.endsWith('已核验暂停记录有变化（格式无法解析）；价格未变'), d + ': ' + said);
    assert.doesNotMatch(said, /sec\.gov|\|/, d);
  });
  assert.equal(warnings.length, invalid.length);
});

test('#396 PR E review 3: an invalid ISO-like time in reading text is shown as written, never converted', () => {
  const said = [
    'A 2026-11-09T05:03:42+09:60', 'B 2026-11-09T05:03:42+99:99', 'C 2026-02-29T10:00:00Z', 'D 2026-11-31T10:00Z',
    'E 2026-11-09T24:00Z', 'F 2026-11-09T10:00+14:01', 'G 2028-02-29T15:00:00Z', 'H 2026-11-09T10:00+14:00',
    'I 2026-11-09T10:00-12:00', 'J 2026-12-31T23:59:59.999-05:00'
  ].join('、');
  const { document } = loadWithWindow(null, weeklyWith([weeklyAsset({ 变化标记: '有变化', 较上次变化说明: said })]), 'weekly');
  assert.match(periodChangeText(document).textContent, new RegExp([
    'A 2026-11-09T05:03:42\\+09:60', 'B 2026-11-09T05:03:42\\+99:99', 'C 2026-02-29T10:00:00Z', 'D 2026-11-31T10:00Z',
    'E 2026-11-09T24:00Z', 'F 2026-11-09T10:00\\+14:01', 'G 2028-03-01 00:00 JST', 'H 2026-11-09 05:00 JST',
    'I 2026-11-10 07:00 JST', 'J 2027-01-01 13:59 JST'
  ].join('、')));
});

test('#396 PR E review 4: only a whole ISO token converts; a valid prefix of a longer token stays as written', () => {
  const kept = ['2026-11-09T05:03:42+09:000', '2026-11-09T05:03:42Zebra', '12026-11-09T05:03:42Z', '2026-11-09T05:03:42+14:001',
    '2026-11-09T05:03:42+09:00abc', 'x2026-11-09T05:03:42Z', '2026-11-09T05:03:42Z9', '2026-11-09T05:03:42.12Zq',
    '2026-11-09T05:03:42Z-05', 'v.2026-11-09T05:03Z', '2026-11-09T05:03:42+09:00:15', '2026-11-09T05:03Z_x',
    '2026-11-09T05:03:42Z..q', '2026-11-09T05:03:42+09:00::1', '2026-11-09T05:03:42Z.+abc', '2026-11-09T05:03Z-.-:_',
    '2026-11-09T05:03Z+++9', 'q..2026-11-09T05:03Z', '2026-11-09T05:03:42.5Z...7'];
  const converted = [
    ['2026-11-09T05:03:42+09:00，正常', '2026-11-09 05:03 JST，正常'],
    ['2026-11-09T05:03:42Z.', '2026-11-09 14:03 JST.'],
    ['(2026-11-09T05:03:42.5-05:00)', '(2026-11-09 19:03 JST)'],
    ['「2026-12-31T20:30Z」', '「2027-01-01 05:30 JST」'],
    ['2028-02-29T15:00:00Z; ok', '2028-03-01 00:00 JST; ok'],
    ['at 2026-11-09T05:03Z, then', 'at 2026-11-09 14:03 JST, then'],
    ['2026-11-09T05:03Z 2026-11-09T06:03Z', '2026-11-09 14:03 JST 2026-11-09 15:03 JST'],
    ['2026-11-09T05:03Z...', '2026-11-09 14:03 JST...'],
    ['2026-11-09T05:03Z--', '2026-11-09 14:03 JST--']
  ];
  const said = kept.concat(converted.map((c) => c[0])).join(' ／ ');
  const { document } = loadWithWindow(null, weeklyWith([weeklyAsset({ 变化标记: '有变化', 较上次变化说明: said })]), 'weekly');
  const text = periodChangeText(document).textContent;
  kept.forEach((k) => assert.ok(text.includes(' ' + k + ' ') || text.includes(k + ' ／'), 'kept as written: ' + k));
  converted.forEach(([, out]) => assert.ok(text.includes(out), 'converted: ' + out));
  assert.equal((text.match(/JST/g) || []).length, 10, 'only the whole valid tokens convert');
});

// -- #396 PR F: 报告结论 (C) shows only what it says beyond 当前阻碍 (B); B is always shown in full. --

test('#396 PR F: 报告结论 vs 当前阻碍 -- equal, containment either way, punctuation/space-only differences, overlap, blanks', () => {
  const row = (code, action, said, blocker, extra) => weeklyAsset(Object.assign({ 代码: code, 今日行动: action, 今日行动说明: said, 当前阻碍: blocker, 阻塞待办ID: '无' }, extra || {}));
  const B = '本周无购买计划：周计划状态为事件暂停，原计划暂停条件。';
  const cases = [
    // [code, action, said, blocker, expected 报告结论 (null = not shown)]
    ['EQ', '', B, B, null],
    ['EQPUNCT', '', '本周无购买计划:周计划状态为事件暂停,  原计划暂停条件.', B, null],
    ['EQSPACE', '', '  ' + B + '  ', B, null],
    ['PREFIX', '本周无购买区间', B, B, '本周无购买区间。'],
    ['PREFIXN', '本周无购买区间', '本周无购买计划:周计划状态为事件暂停, 原计划暂停条件.', B, '本周无购买区间。'],
    ['SUFFIX', '', B + '下周复核。', B, '下周复核。'],
    ['MIDDLE', '本周无购买区间', B + '下周复核。', B, '本周无购买区间。下周复核。'],
    ['BHASC', '', '周计划状态为事件暂停', B, null],
    ['BHASC2', '等待价格', '', '等待价格，报告时价格高于计划区间', null],
    ['ONLYPUNCT', '', B + '。', B, null],
    ['OVERLAP', '等待价格', '报告时价格高于计划区间上沿', '高于计划区间上沿且资金未核验', '等待价格。报告时价格高于计划区间上沿'],
    ['DIFF', '等待价格', '高于计划区间', '等待财报', '等待价格。高于计划区间'],
    ['NOB', '等待价格', '高于计划区间', '', '等待价格。高于计划区间'],
    ['NOC', '', '', '等待财报', '未提供']
  ];
  const rows = cases.map(([code, action, said, blocker]) => row(code, action, said, blocker))
    .concat([weeklyAsset({ 代码: 'BUY', 今日行动说明: '人工准备限价单：财报', 当前阻碍: '财报' })]);
  const { document } = loadWithWindow(null, weeklyWith(rows), 'weekly');
  cases.forEach(([code, action, said, blocker, expected]) => {
    const got = fieldLines(document, code, '报告结论');
    assert.deepEqual(got, expected === null ? null : [expected], code);
    assert.deepEqual(fieldLines(document, code, '当前阻碍'), [blocker === '' ? '未提供' : blocker], code + ': 当前阻碍 is always the original');
    if (expected !== null && expected !== '未提供') {
      const full = action === '' ? said : (said === '' ? action : action + '。' + said);
      if (code === 'MIDDLE') {
        const cut = full.indexOf(blocker);
        assert.equal(expected, full.slice(0, cut) + full.slice(cut + blocker.length), 'middle: the two original slices around B');
      } else {
        assert.ok(full.includes(expected), code + ': the shown text is a substring of the original');
      }
    }
  });
  assert.match(fieldLines(document, 'BUY', '报告结论')[0], /^可人工准备限价单。人工准备限价单：财报$/, 'a 适合买入 row (no 当前阻碍 field) keeps its full conclusion');
  assert.equal(fieldLines(document, 'BUY', '当前阻碍'), null);
});

test('#396 PR F: the same rule applies to Daily, Weekly and history reports; 报告明细 keeps the full text', () => {
  const B = '本周无购买计划：周计划状态为事件暂停。';
  const mk = () => weeklyAsset({ 代码: 'PAU', 今日行动: '本周无购买区间', 今日行动说明: B, 当前阻碍: B, 阻塞待办ID: '无', 变化标记: '有变化' });
  const latest = weeklyWith([mk()]);
  const history = Object.assign(weeklyWith([mk()]), { error: null });
  history.summary = Object.assign({}, history.summary, { 报告ID: 'weekly-2026-11-01', 报告日期: '2026-11-01' });
  const { document, window } = loadWithWindow(null, latest, 'weekly', { getReport: () => history });
  window.selectTab('weekly');
  assert.deepEqual(fieldLines(document, 'PAU', '报告结论'), ['本周无购买区间。']);
  assert.deepEqual(fieldLines(document, 'PAU', '当前阻碍'), [B]);
  window.selectHistoryReport('weekly-2026-11-01');
  assert.deepEqual(fieldLines(document, 'PAU', '报告结论'), ['本周无购买区间。']);
  assert.deepEqual(fieldLines(document, 'PAU', '当前阻碍'), [B]);
  // Daily, through the same buy-judgment card.
  const { document: daily } = dailyWithWeekly([dailyTwin({ 代码: 'PAU', 今日行动: '本周无购买区间', 今日行动说明: B, 当前阻碍: B, 阻塞待办ID: '无' })], [weeklyAsset()]);
  assert.deepEqual(fieldLines(daily, 'PAU', '报告结论'), ['本周无购买区间。']);
  assert.deepEqual(fieldLines(daily, 'PAU', '当前阻碍'), [B]);
});

test('#396 PR F review: every whole instance of 当前阻碍 is cut from 报告结论, not only the first', () => {
  const row = (code, action, said, blocker) => weeklyAsset({ 代码: code, 今日行动: action, 今日行动说明: said, 当前阻碍: blocker, 阻塞待办ID: '无' });
  const cases = [
    ['TWICE', '等待价格', '等待价格', '等待价格', null],
    ['TWICE2', '', '等待价格。等待价格', '等待价格', null],
    ['TWICEMIX', '', '等待价格.  等待价格；', '等待价格', null],
    ['SANDWICH', '', '财报；下周复核；财报', '财报', '下周复核'],
    ['AROUND', '等待价格', '高于区间；等待价格', '等待价格', '高于区间'],
    ['THREE', '', '财报，A，财报，B。财报', '财报', 'A，B。'],
    ['PRESUF', '', '前缀：财报，后缀。', '财报', '前缀：后缀。'],
    ['ADJ', '', '财报财报，补充', '财报', '补充'],
    ['OVERLAP', '', '财报日前', '财报日前后', '财报日前' /* B contains C -> hidden */],
    ['PARTIAL', '', '等待价格回落', '价格回落到区间', '等待价格回落']
  ];
  cases[8][4] = null;
  const rows = cases.map(([code, a, sd, b]) => row(code, a, sd, b));
  const { document } = loadWithWindow(null, weeklyWith(rows), 'weekly');
  cases.forEach(([code, , , blocker, expected]) => {
    assert.deepEqual(fieldLines(document, code, '报告结论'), expected === null ? null : [expected], code);
    assert.deepEqual(fieldLines(document, code, '当前阻碍'), [blocker], code);
    if (expected !== null && code !== 'PARTIAL') { assert.ok(!expected.includes(blocker), code + ': no whole 当前阻碍 is left'); }
  });
});

test('#396 PR F review: a latest and a history report with repeated 当前阻碍 dedupe independently', () => {
  const latest = weeklyWith([weeklyAsset({ 代码: 'REP', 今日行动: '等待价格', 今日行动说明: '高于区间；等待价格', 当前阻碍: '等待价格', 阻塞待办ID: '无' })]);
  const history = Object.assign(weeklyWith([weeklyAsset({ 代码: 'REP', 今日行动: '', 今日行动说明: '财报；下周复核；财报', 当前阻碍: '财报', 阻塞待办ID: '无' })]), { error: null });
  history.summary = Object.assign({}, history.summary, { 报告ID: 'weekly-2026-11-01', 报告日期: '2026-11-01' });
  const { document, window } = loadWithWindow(null, latest, 'weekly', { getReport: () => history });
  window.selectTab('weekly');
  assert.deepEqual(fieldLines(document, 'REP', '报告结论'), ['高于区间']);
  window.selectHistoryReport('weekly-2026-11-01');
  assert.deepEqual(fieldLines(document, 'REP', '报告结论'), ['下周复核']);
  assert.deepEqual(fieldLines(document, 'REP', '当前阻碍'), ['财报']);
});
