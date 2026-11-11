// Tests for the Issue #375 risk view: Code.gs's annotateRiskTrend_ and
// buildRiskGroups_ (pure logic) and Script.html's 风险 tab. The Dashboard
// only shows the 风险趋势 and previous values the writer stored; it never
// re-derives a trend or reads another generation (that is the writer's job,
// tests/risk_identity_spec.py). A pre-#375 row renders as before.
//
// Run: node --test integrations/google-apps-script/ios-dashboard/test/risk-identity.test.js

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

const BASE = { 报告ID: 'weekly-2026-11-07', 生成ID: 'gen-w2-b', 报告类型: 'weekly', 报告日期: '2026-11-07', 影响: '', 本期动作: '观察' };

function keyed(overrides) {
  return Object.assign({}, BASE, {
    风险类型: '组合风险', 风险: '持仓集中', 影响资产: 'AAA、CCC', 严重度: '高', 排序: 1, 变化标记: '有变化',
    风险规则ID: 'R-PORT-CONC', 风险对象: 'PORTFOLIO', 风险键: 'portfolio|PORTFOLIO|R-PORT-CONC', 风险评估: '触发',
    评估依据: '', 风险指标: 36, 风险趋势: '升级', 上期严重度: '中', 上期风险指标: 30,
    比较报告ID: 'weekly-2026-10-31', 比较生成ID: 'gen-w1'
  }, overrides || {});
}

function tabsWith(risks) {
  const copy = JSON.parse(JSON.stringify(FIXTURE));
  copy['报告风险'] = copy['报告风险'].filter((r) => r['报告ID'] !== BASE.报告ID).concat(risks);
  return copy;
}

function findAll(node, predicate, out = []) {
  if (node.nodeType === 1 && predicate(node)) out.push(node);
  (node.children || []).forEach((child) => findAll(child, predicate, out));
  return out;
}

function renderRisks(viewModel) {
  const document = createFakeDocument();
  const sandbox = {
    document,
    window: {},
    google: createGoogleScriptRunStub({}),
    IOS_BOOTSTRAP: {
      error: null, daily: { found: false, reportType: 'daily' }, weekly: viewModel,
      dailyHistory: [], weeklyHistory: [], allocation: []
    },
    IOS_ACTIVE_VIEW: 'weekly',
    console
  };
  vm.createContext(sandbox);
  vm.runInContext(SCRIPT_HTML_SRC, sandbox, { filename: 'Script.html' });
  sandbox.window.selectTab('risks');
  return document.getElementById('ios-tab-content');
}

test('trend values mirror the schema', () => {
  const values = SCHEMA.tabs['报告风险'].fields.find((f) => f.name === '风险趋势').values;
  assert.ok(values.includes('迁移缺口') && values.includes('解除') && values.length === 15);
});

test('a pre-#375 row is returned unchanged', () => {
  const legacy = FIXTURE['报告风险'][0];
  assert.equal(logic.annotateRiskTrend_(legacy), legacy);
});

test('a keyed row shows the stored trend and the previous values, never re-derived', () => {
  const row = logic.annotateRiskTrend_(keyed());
  assert.deepEqual(row._iosRiskTrend, {
    trend: '升级', key: 'portfolio|PORTFOLIO|R-PORT-CONC',
    detail: '上期 中 / 30 → 本期 高 / 36；对照 weekly-2026-10-31'
  });
  // A label the writer stored is shown as is, even when the values would suggest another one.
  assert.equal(logic.annotateRiskTrend_(keyed({ 风险趋势: '无变化' }))._iosRiskTrend.trend, '无变化');
  assert.match(logic.annotateRiskTrend_(keyed({ 风险趋势: '迁移缺口', 上期严重度: '', 上期风险指标: '' }))._iosRiskTrend.detail,
    /#375 之前/);
});

test('released and unverified rows are grouped apart from current risks', () => {
  const rows = [keyed(), keyed({ 风险规则ID: 'R-BIZ-THESIS', 风险评估: '未触发', 严重度: '', 风险趋势: '解除', 评估依据: '财报确认' }),
    keyed({ 风险规则ID: 'R-SYS-ENV', 风险评估: '未核验', 严重度: '', 风险趋势: '未核验', 评估依据: '数据缺失' }),
    keyed({ 风险规则ID: 'R-PORT-FX', 风险评估: '未覆盖', 严重度: '', 风险趋势: '未覆盖', 评估依据: '范围外' })];
  const groups = logic.buildRiskGroups_(rows);
  assert.deepEqual([groups.current.length, groups.released.length, groups.unverified.length], [1, 1, 2]);
  const legacy = logic.buildRiskGroups_([FIXTURE['报告风险'][0]]);
  assert.deepEqual([legacy.current.length, legacy.released.length, legacy.unverified.length], [1, 0, 0]);
});

test('the 风险 tab renders trend badges and keeps 未核验 apart from 解除', () => {
  // Each rule has its own 风险键 (the key embeds the rule), as the writer stores it.
  const rows = [keyed(), keyed({ 风险: '假设已验证', 风险规则ID: 'R-BIZ-THESIS', 风险键: 'business|AAA|R-BIZ-THESIS', 风险评估: '未触发', 严重度: '',
    风险趋势: '解除', 评估依据: '财报确认原假设', 上期严重度: '中', 上期风险指标: '' }),
  keyed({ 风险: '利率环境', 风险规则ID: 'R-SYS-ENV', 风险键: 'system|ENV|R-SYS-ENV', 风险评估: '未核验', 严重度: '', 风险趋势: '未核验', 评估依据: '数据缺失',
    上期严重度: '', 上期风险指标: '' })];
  const model = logic.buildReportViewModel_(tabsWith(rows), 'weekly', null);
  const content = renderRisks(model);
  const text = content.textContent;
  assert.match(text, /风险 \(1\)/);
  assert.match(text, /已解除或评估未触发 \(1\)/);
  assert.match(text, /未核验或未覆盖——不等于解除 \(1\)/);
  const badges = findAll(content, (n) => n.classList.contains('ios-risk-trend')).map((n) => n.textContent);
  assert.deepEqual(badges, ['升级', '解除', '未核验']);
  assert.match(text, /上期 中 \/ 30 → 本期 高 \/ 36/);
  assert.match(text, /依据：财报确认原假设/);
});

test('a pre-#375 generation renders without trend badges or extra groups', () => {
  const model = logic.buildReportViewModel_(JSON.parse(JSON.stringify(FIXTURE)), 'daily', null);
  const content = (function () {
    const document = createFakeDocument();
    const sandbox = {
      document, window: {}, google: createGoogleScriptRunStub({}),
      IOS_BOOTSTRAP: { error: null, daily: model, weekly: { found: false, reportType: 'weekly' },
        dailyHistory: [], weeklyHistory: [], allocation: [] },
      IOS_ACTIVE_VIEW: 'daily', console
    };
    vm.createContext(sandbox);
    vm.runInContext(SCRIPT_HTML_SRC, sandbox, { filename: 'Script.html' });
    sandbox.window.selectTab('risks');
    return document.getElementById('ios-tab-content');
  })();
  assert.match(content.textContent, /风险 \(1\)/);
  assert.equal(findAll(content, (n) => n.classList.contains('ios-risk-trend')).length, 0);
  assert.doesNotMatch(content.textContent, /已解除|不等于解除/);
});

// -- Issue #396 PR C: the 风险 tab merges the latest Daily and Weekly. --

function riskVm(type, date, risks, extra) {
  const rows = risks.map((r) => logic.annotateRiskTrend_(Object.assign({ 报告类型: type, 报告日期: date }, r)));
  return Object.assign({
    found: true, reportType: type,
    summary: { 报告ID: type + '-' + date, 报告日期: date, 一句话结论: 'x', 核心状态: '正常', Review状态: '已检查', 当前持仓数: 0, 高优先级观察数: 0 },
    holdings: [], watchlistCandidates: [], todos: [], holdingDetail: [],
    risks: rows, riskGroups: logic.buildRiskGroups_(rows)
  }, extra || {});
}

function loadMerged(daily, weekly, handlers) {
  const document = createFakeDocument();
  const sandbox = {
    document, window: {}, google: createGoogleScriptRunStub(handlers || {}), console, IOS_ACTIVE_VIEW: 'daily',
    IOS_BOOTSTRAP: { error: null, daily: daily || { found: false, reportType: 'daily' }, weekly: weekly || { found: false, reportType: 'weekly' },
      dailyHistory: [], weeklyHistory: [], allocation: [] }
  };
  vm.createContext(sandbox);
  vm.runInContext(SCRIPT_HTML_SRC, sandbox, { filename: 'Script.html' });
  sandbox.window.selectTab('risks');
  return { document, window: sandbox.window, content: document.getElementById('ios-tab-content') };
}

function section(content, cls) {
  return content.children.find((c) => c.classList.contains(cls));
}

function topItems(node) {
  const list = node.children.find((c) => c.tagName === 'UL');
  return list ? list.children : [];
}

test('#396 PR C: rows with the same 风险键 merge into one row naming both reports; rows without a key are never merged', () => {
  const weekly = riskVm('weekly', '2026-11-07', [
    keyed({ 风险: '持仓集中（周报）', 严重度: '中' }),
    keyed({ 风险: '无键风险', 风险键: '', 风险规则ID: '', 风险趋势: '未登记规则' })
  ]);
  const daily = riskVm('daily', '2026-11-10', [
    keyed({ 风险: '持仓集中', 严重度: '高' }),
    keyed({ 风险: '无键风险', 风险键: '', 风险规则ID: '', 风险趋势: '未登记规则' }),
    keyed({ 风险: '估值偏高', 风险键: 'valuation|AAA|R-VAL-HIGH', 风险规则ID: 'R-VAL-HIGH', 风险对象: 'AAA' })
  ]);
  const { content } = loadMerged(daily, weekly);
  const invest = section(content, 'ios-risk-invest');
  assert.match(invest.children[0].textContent, /^投资风险 \(4\)$/);
  const items = topItems(invest);
  assert.equal(items.length, 4);
  const merged = items[0];
  assert.match(merged.textContent, /^高持仓集中/, 'the newest report leads');
  assert.match(merged.textContent, /来源：周报 11\/07、日报 11\/10/);
  assert.match(merged.textContent, /周报 11\/07：中 持仓集中（周报）/, 'the other source\'s wording is kept');
  assert.equal(items.filter((li) => /无键风险/.test(li.textContent)).length, 2, 'a row without 风险键 is listed once per report');
  assert.doesNotMatch(content.textContent, /R-PORT-CONC|R-VAL-HIGH|portfolio\|PORTFOLIO/, 'rule IDs and keys stay off the page');
});

test('#396 PR C: 投资风险 lists only 触发 (and pre-#375 rows); 未触发 and 未核验 stay in their own groups', () => {
  const daily = riskVm('daily', '2026-11-10', [
    keyed(),
    keyed({ 风险: '已验证', 风险规则ID: 'R-BIZ-THESIS', 风险键: 'business|AAA|R-BIZ-THESIS', 风险评估: '未触发', 严重度: '', 风险趋势: '解除', 评估依据: 'x' }),
    keyed({ 风险: '数据不足', 风险规则ID: 'R-SYS-ENV', 风险键: 'system|ENV|R-SYS-ENV', 风险评估: '未核验', 严重度: '', 风险趋势: '未核验', 评估依据: 'x' })
  ]);
  const legacy = riskVm('weekly', '2026-11-07', [{ 风险: '旧版风险', 严重度: '中' }]);
  const { content } = loadMerged(daily, legacy);
  const invest = section(content, 'ios-risk-invest');
  assert.match(invest.children[0].textContent, /^投资风险 \(2\)$/);
  assert.doesNotMatch(topItems(invest).map((li) => li.textContent).join(), /已验证|数据不足/);
  assert.match(invest.textContent, /已解除或评估未触发 \(1\)[\s\S]*未核验或未覆盖——不等于解除 \(1\)/);
});

test('#396 PR C: 数据维护 holds 估值需更新 and 延续暂停 (paused and 无变化 only), folded, never counted as 投资风险', () => {
  const pause = (code, flag, extra) => Object.assign({ 代码: code, 名称: code + ' Co.', 资产类型: 'holding', 今日行动: '暂停新增待复核', 变化标记: flag, 当前阻碍: '官方事件复核中' }, extra || {});
  const weekly = riskVm('weekly', '2026-11-07', [], {
    holdings: [pause('AAA', '无变化'), pause('BBB', '有变化'), pause('CCC', ''), pause('DDD', '无可比基线'),
      pause('EEE', '无变化', { 今日行动: '等待价格', 周计划状态: '事件暂停' })],
    holdingDetail: [{ code: 'AAA', name: 'AAA Co.', valuation: { researchStale: true, researchDate: '2026-06-01（需更新，距报告 159 天）' } },
      { code: 'BBB', name: 'BBB Co.', valuation: { researchStale: false, researchDate: '2026-10-01' } }]
  });
  const daily = riskVm('daily', '2026-11-10', [keyed()], {
    holdings: [pause('AAA', '无变化')],
    holdingDetail: [{ code: 'AAA', name: 'AAA Co.', valuation: { researchStale: true, researchDate: '2026-06-01（需更新，距报告 162 天）' } }]
  });
  const { content, window, document } = loadMerged(daily, weekly);
  assert.match(section(content, 'ios-risk-invest').children[0].textContent, /^投资风险 \(1\)$/);
  const maintenance = section(content, 'ios-risk-maintenance');
  assert.match(maintenance.children[0].textContent, /^数据维护 \(3\)$/);
  const folds = maintenance.children.filter((c) => c.tagName === 'DETAILS');
  assert.deepEqual(folds.map((f) => f.children[0].textContent), ['估值需更新 1 项（展开查看）', '延续暂停 2 项（展开查看）']);
  folds.forEach((f) => assert.equal(f.getAttribute('open'), null, 'folded by default'));
  assert.match(folds[0].textContent, /AAA[\s\S]*周报 11\/07：估值研究日期 2026-06-01[\s\S]*日报 11\/10：估值研究日期/);
  assert.match(folds[1].textContent, /AAA[\s\S]*EEE/);
  assert.doesNotMatch(folds[1].textContent, /BBB|CCC|DDD/, '有变化, blank and 无可比基线 pauses are not continued pauses');
  window.selectTab('daily');
  window.selectTab('risks');
  assert.equal(document.getElementById('ios-tab-content').children.length, 2);
});

test('#396 PR C: a history report never changes the 风险 tab', () => {
  const latest = riskVm('daily', '2026-11-10', [keyed({ 风险: '最新风险' })]);
  const history = Object.assign(riskVm('daily', '2026-11-01', [keyed({ 风险: '历史风险' })]), { error: null });
  const { window, document } = loadMerged(latest, null, { getReport: () => history });
  window.selectHistoryReport('daily-2026-11-01');
  window.selectTab('risks');
  const page = document.getElementById('ios-tab-content').textContent;
  assert.match(page, /最新风险/);
  assert.doesNotMatch(page, /历史风险/);
  assert.equal(document.getElementById('ios-history-banner').hidden, true);
});

// -- #396 PR C review: one 风险键 shows once, in the group the latest report decides. --

function groupTexts(content) {
  const invest = section(content, 'ios-risk-invest');
  const all = invest.textContent;
  const releasedAt = all.indexOf('已解除或评估未触发');
  const unverifiedAt = all.indexOf('未核验或未覆盖——不等于解除');
  const cut = (from, to) => (from === -1 ? '' : all.slice(from, to === -1 ? undefined : to));
  const firstGroup = [releasedAt, unverifiedAt].filter((i) => i !== -1).sort((a, b) => a - b)[0];
  return {
    head: invest.children[0].textContent,
    invest: all.slice(0, firstGroup === undefined ? undefined : firstGroup),
    released: cut(releasedAt, unverifiedAt > releasedAt ? unverifiedAt : -1),
    unverified: cut(unverifiedAt, releasedAt > unverifiedAt ? releasedAt : -1)
  };
}

const RELEASED = { 风险: '集中已缓解', 风险评估: '未触发', 严重度: '', 风险趋势: '解除', 评估依据: '已减仓' };
const UNVERIFIED = { 风险: '集中待核验', 风险评估: '未核验', 严重度: '', 风险趋势: '未核验', 评估依据: '数据缺失' };

function count(textContent, word) {
  return textContent.split(word).length - 1;
}

test('#396 PR C review: 触发 in the older Weekly, 未触发 in the newer Daily -> only 已解除, once', () => {
  const weekly = riskVm('weekly', '2026-11-07', [keyed({ 风险: '持仓集中' })]);
  const daily = riskVm('daily', '2026-11-10', [keyed(RELEASED)]);
  const { content } = loadMerged(daily, weekly);
  const g = groupTexts(content);
  assert.equal(g.head, '投资风险 (0)');
  assert.match(g.released, /已解除或评估未触发 \(1\)[\s\S]*集中已缓解/);
  assert.match(g.released, /周报 11\/07：高 持仓集中（该报告风险评估：触发）/, 'the older wording stays, labelled');
  assert.equal(count(content.textContent, '集中已缓解'), 1);
  assert.equal(g.unverified, '');
});

test('#396 PR C review: 未触发 in the older Weekly, 触发 in the newer Daily -> only 投资风险, once', () => {
  const weekly = riskVm('weekly', '2026-11-07', [keyed(RELEASED)]);
  const daily = riskVm('daily', '2026-11-10', [keyed({ 风险: '持仓集中' })]);
  const { content } = loadMerged(daily, weekly);
  const g = groupTexts(content);
  assert.equal(g.head, '投资风险 (1)');
  assert.match(g.invest, /持仓集中[\s\S]*周报 11\/07：集中已缓解（该报告风险评估：未触发）/);
  assert.equal(g.released, '');
  assert.equal(count(content.textContent, '来源：'), 1);
});

test('#396 PR C review: 触发 vs 未核验 follows the newer report either way', () => {
  let { content } = loadMerged(riskVm('daily', '2026-11-10', [keyed(UNVERIFIED)]), riskVm('weekly', '2026-11-07', [keyed()]));
  let g = groupTexts(content);
  assert.equal(g.head, '投资风险 (0)');
  assert.match(g.unverified, /\(1\)[\s\S]*集中待核验[\s\S]*周报 11\/07：高 持仓集中（该报告风险评估：触发）/);
  ({ content } = loadMerged(riskVm('daily', '2026-11-06', [keyed(UNVERIFIED)]), riskVm('weekly', '2026-11-07', [keyed()])));
  g = groupTexts(content);
  assert.equal(g.head, '投资风险 (1)', 'a Weekly newer than the Daily leads');
  assert.match(g.invest, /日报 11\/06：集中待核验（该报告风险评估：未核验）/);
  assert.equal(g.unverified, '');
});

test('#396 PR C review: same 报告日期 -> 日报 leads, regardless of which group', () => {
  let { content } = loadMerged(riskVm('daily', '2026-11-07', [keyed(RELEASED)]), riskVm('weekly', '2026-11-07', [keyed()]));
  assert.equal(groupTexts(content).head, '投资风险 (0)');
  assert.match(groupTexts(content).released, /集中已缓解[\s\S]*来源：周报 11\/07、日报 11\/07/);
  ({ content } = loadMerged(riskVm('daily', '2026-11-07', [keyed()]), riskVm('weekly', '2026-11-07', [keyed(RELEASED)])));
  assert.equal(groupTexts(content).head, '投资风险 (1)');
  assert.equal(groupTexts(content).released, '');
});

test('#396 PR C review: rows without 风险键 are never merged, even with conflicting 评估', () => {
  const blank = { 风险键: '', 风险规则ID: '', 风险趋势: '未登记规则' };
  const weekly = riskVm('weekly', '2026-11-07', [keyed(Object.assign({ 风险: '无键A' }, blank))]);
  const daily = riskVm('daily', '2026-11-10', [keyed(Object.assign({}, RELEASED, blank, { 风险: '无键A' }))]);
  const { content } = loadMerged(daily, weekly);
  const g = groupTexts(content);
  assert.equal(g.head, '投资风险 (1)');
  assert.match(g.released, /\(1\)[\s\S]*无键A/);
  assert.doesNotMatch(content.textContent, /该报告风险评估/);
});

test('#396 PR C review: keys and rule IDs never reach the page; a missing report type is fine', () => {
  const { content } = loadMerged(null, riskVm('weekly', '2026-11-07', [keyed(), keyed(Object.assign({}, RELEASED, { 风险键: 'business|AAA|R-BIZ-THESIS', 风险规则ID: 'R-BIZ-THESIS' }))]));
  const g = groupTexts(content);
  assert.equal(g.head, '投资风险 (1)');
  assert.match(g.released, /\(1\)/);
  assert.doesNotMatch(content.textContent, /R-PORT-CONC|R-BIZ-THESIS|portfolio\|PORTFOLIO|business\|AAA/);
  assert.match(content.textContent, /合并最新周报 11\/07。/);
  const onlyDaily = loadMerged(riskVm('daily', '2026-11-10', [keyed()]), null).content;
  assert.equal(groupTexts(onlyDaily).head, '投资风险 (1)');
});

test('#396 PR C review: one key in two groups of the same report leads with 触发 and keeps the other row', () => {
  const daily = riskVm('daily', '2026-11-10', [keyed(RELEASED), keyed({ 风险: '持仓集中' })]);
  const weekly = riskVm('weekly', '2026-11-07', [keyed(UNVERIFIED)]);
  const { content } = loadMerged(daily, weekly);
  const g = groupTexts(content);
  assert.equal(g.head, '投资风险 (1)');
  assert.match(g.invest, /日报 11\/10：集中已缓解（该报告风险评估：未触发）/);
  assert.match(g.invest, /周报 11\/07：集中待核验（该报告风险评估：未核验）/);
  assert.match(g.invest, /来源：周报 11\/07、日报 11\/10/);
  assert.equal(g.released + g.unverified, '');
});

test('#396 PR C review: 估值需更新 starts at more than 90 days; exactly 90 is not stale', () => {
  const at = (research) => logic.holdingDetailResearchAge_({ 估值研究日期快照: research, 报告ID: 'daily-2026-11-10' });
  assert.equal(logic.VALUATION_RESEARCH_STALE_DAYS, 90);
  assert.equal(at('2026-08-12').state, 'current', '90 days');
  assert.equal(at('2026-08-11').state, 'stale', '91 days');
});

// -- #396 PR C review 2: every source keeps its own 风险评估, as written. --

const UNCOVERED = { 风险: '集中待核验', 风险评估: '未覆盖', 严重度: '', 风险趋势: '未覆盖', 评估依据: '范围外' };
const LEGACY = { 风险评估: '', 风险趋势: '', 评估依据: '' };

test('#396 PR C review 2: both 触发 -> one row, both sources, no 风险评估 note', () => {
  const { content } = loadMerged(riskVm('daily', '2026-11-10', [keyed()]), riskVm('weekly', '2026-11-07', [keyed()]));
  const g = groupTexts(content);
  assert.equal(g.head, '投资风险 (1)');
  assert.match(g.invest, /来源：周报 11\/07、日报 11\/10/);
  assert.doesNotMatch(content.textContent, /该报告风险评估/);
});

test('#396 PR C review 2: 触发 vs 未覆盖 shows 未覆盖, never 未核验', () => {
  let { content } = loadMerged(riskVm('daily', '2026-11-10', [keyed()]), riskVm('weekly', '2026-11-07', [keyed(UNCOVERED)]));
  assert.match(groupTexts(content).invest, /周报 11\/07：集中待核验（该报告风险评估：未覆盖）/);
  ({ content } = loadMerged(riskVm('daily', '2026-11-10', [keyed(UNCOVERED)]), riskVm('weekly', '2026-11-07', [keyed()])));
  const g = groupTexts(content);
  assert.equal(g.head, '投资风险 (0)');
  assert.match(g.unverified, /\(1\)[\s\S]*周报 11\/07：高 持仓集中（该报告风险评估：触发）/);
  assert.doesNotMatch(content.textContent, /风险评估：未核验/);
});

test('#396 PR C review 2: 未核验 vs 未覆盖 with identical wording still shows the difference', () => {
  const { content } = loadMerged(riskVm('daily', '2026-11-10', [keyed(UNVERIFIED)]),
    riskVm('weekly', '2026-11-07', [keyed(Object.assign({}, UNCOVERED, { 风险: UNVERIFIED.风险 }))]));
  const g = groupTexts(content);
  assert.match(g.unverified, /\(1\)[\s\S]*周报 11\/07：集中待核验（该报告风险评估：未覆盖）/);
});

test('#396 PR C review 2: a pre-#375 row without 风险评估 is never called 触发', () => {
  // Older legacy Weekly, newer Daily says 未触发.
  let { content } = loadMerged(riskVm('daily', '2026-11-10', [keyed(RELEASED)]), riskVm('weekly', '2026-11-07', [keyed(LEGACY)]));
  let g = groupTexts(content);
  assert.equal(g.head, '投资风险 (0)');
  assert.match(g.released, /周报 11\/07：高 持仓集中（该报告风险评估：未提供（旧版行））/);
  assert.doesNotMatch(content.textContent, /风险评估：触发/);
  // Newer legacy row leads; each modern value beneath it keeps its own name.
  [['触发', '触发'], ['未触发', RELEASED], ['未核验', UNVERIFIED], ['未覆盖', UNCOVERED]].forEach(([word, over]) => {
    const older = word === '触发' ? keyed() : keyed(over);
    ({ content } = loadMerged(riskVm('daily', '2026-11-10', [keyed(LEGACY)]), riskVm('weekly', '2026-11-07', [older])));
    g = groupTexts(content);
    assert.equal(g.head, '投资风险 (1)', 'a legacy row stays in the 当前 group, as before');
    assert.match(g.invest, new RegExp('周报 11/07：.*（该报告风险评估：' + word + '）'));
  });
  // Both legacy: no note.
  ({ content } = loadMerged(riskVm('daily', '2026-11-10', [keyed(LEGACY)]), riskVm('weekly', '2026-11-07', [keyed(LEGACY)])));
  assert.doesNotMatch(content.textContent, /该报告风险评估/);
});
