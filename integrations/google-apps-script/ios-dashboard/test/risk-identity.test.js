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
  const rows = [keyed(), keyed({ 风险: '假设已验证', 风险规则ID: 'R-BIZ-THESIS', 风险评估: '未触发', 严重度: '',
    风险趋势: '解除', 评估依据: '财报确认原假设', 上期严重度: '中', 上期风险指标: '' }),
  keyed({ 风险: '利率环境', 风险规则ID: 'R-SYS-ENV', 风险评估: '未核验', 严重度: '', 风险趋势: '未核验', 评估依据: '数据缺失',
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
