// Tests for Script.html's client-side interaction (Issue #250) -- the
// in-page Daily/Weekly toggle, 组合/资本配置/风险/待办 tab switching, the
// topbar history <select>, and the summary metric grid / headline card
// that port the v1.1 Dashboard's visual structure -- all of which replaced
// the old ?view=/&report= relative-link navigation (which broke inside
// Apps Script's userCodeAppPanel iframe). Runs the actual Script.html
// source in a Node vm sandbox against the fake DOM in fake-dom.js -- no
// browser, no third-party dependency, same "plain node:test/node:assert
// only" discipline as dashboard-logic.test.js.
//
// Run: node integrations/google-apps-script/ios-dashboard/test/dashboard-script.test.js

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { createFakeDocument, createGoogleScriptRunStub } = require('./fake-dom');

const logic = require(path.join(__dirname, '..', 'Code.gs'));
const demoSheet = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'demo', 'demo-sheet.json'), 'utf8')
);
const SCRIPT_HTML_SRC = fs.readFileSync(path.join(__dirname, '..', 'Script.html'), 'utf8');

const DEMO_BOOTSTRAP = logic.buildDashboardBootstrap_(demoSheet);

/**
 * Runs Script.html fresh in an isolated sandbox (a real browser re-parses
 * and re-executes it on every page load too, so a fresh vm context per
 * test mirrors that rather than sharing module-level state across tests).
 * Returns { document, window } so a test can both drive interaction
 * (window.switchView/selectTab/selectHistoryReport/onHistorySelectChange/
 * refresh) and inspect the resulting fake DOM tree.
 */
function loadDashboard(bootstrap, activeView, googleHandlers) {
  const document = createFakeDocument();
  const sandbox = {
    document,
    window: {},
    google: createGoogleScriptRunStub(googleHandlers || {}),
    IOS_BOOTSTRAP: bootstrap,
    IOS_ACTIVE_VIEW: activeView,
    console
  };
  vm.createContext(sandbox);
  vm.runInContext(SCRIPT_HTML_SRC, sandbox, { filename: 'Script.html' });
  return { document, window: sandbox.window };
}

function summaryText(document) {
  return document.getElementById('ios-summary-content').textContent;
}

function tabText(document) {
  return document.getElementById('ios-tab-content').textContent;
}

function historySelectOptionValues(document) {
  return document.getElementById('ios-history-select').children.map((opt) => opt.getAttribute('value'));
}

/**
 * A minimal daily bootstrap carrying only the given todo rows -- used by
 * the Issue #255 todo-checklist tests, which need specific 状态/排序/备注
 * combinations the demo dataset's single todo row doesn't exercise.
 */
function buildBootstrapWithTodos(todos) {
  return {
    error: null,
    daily: {
      found: true,
      reportType: 'daily',
      summary: {
        报告ID: 'daily-2026-08-20',
        报告日期: '2026-08-20',
        周期开始: '',
        周期结束: '',
        一句话结论: 'test headline',
        核心状态: '正常',
        Review状态: '未Review',
        当前持仓数: 0,
        高优先级观察数: 0,
        生成时间: '2026-08-20T09:00:00+09:00'
      },
      holdings: [],
      watchlistCandidates: [],
      risks: [],
      todos: todos
    },
    weekly: { found: false, reportType: 'weekly' },
    dailyHistory: [],
    weeklyHistory: [],
    allocation: []
  };
}

/**
 * A minimal daily bootstrap carrying one holding with the given field
 * overrides -- used by the Issue #257 semantic-badge tests, which need
 * specific IOS状态/价格位置 combinations the demo dataset doesn't cover.
 */
function buildBootstrapWithHolding(overrides) {
  const holding = Object.assign({
    '代码': 'TEST1',
    '名称': 'Test Co.',
    'IOS状态': '',
    'Thesis状态': '',
    '关键变化': '',
    '长期逻辑或估值': '',
    '下一验证点': '',
    '参考买入价/区间': '',
    '当前价格': '',
    '价格位置': '',
    '优先级': '',
    '排序': 1
  }, overrides);
  return {
    error: null,
    daily: {
      found: true,
      reportType: 'daily',
      summary: {
        报告ID: 'daily-2026-08-20',
        报告日期: '2026-08-20',
        周期开始: '',
        周期结束: '',
        一句话结论: 'test headline',
        核心状态: '正常',
        Review状态: '未Review',
        当前持仓数: 0,
        高优先级观察数: 0,
        生成时间: '2026-08-20T09:00:00+09:00'
      },
      holdings: [holding],
      watchlistCandidates: [],
      risks: [],
      todos: []
    },
    weekly: { found: false, reportType: 'weekly' },
    dailyHistory: [],
    weeklyHistory: [],
    allocation: []
  };
}

/** Locates the rendered holding card's IOS状态 badge (head's 2nd child) after loadDashboard + default portfolio tab. */
function iosStatusBadge(document) {
  const card = document.getElementById('ios-tab-content').children[0].children[1].children[0];
  return card.children[0].children[1];
}

/** Locates the rendered holding card's 价格位置 badge (2nd child of the 参考 line), or undefined if 价格位置 was blank. */
function pricePositionBadge(document) {
  const card = document.getElementById('ios-tab-content').children[0].children[1].children[0];
  return card.children[3].children[1];
}

test('initial render shows the Daily summary grid + headline and marks the Daily nav button + 组合 tab active', () => {
  const { document } = loadDashboard(DEMO_BOOTSTRAP, 'daily', {});
  assert.match(summaryText(document), /daily-2026-08-15/);
  assert.ok(document.getElementById('ios-nav-daily').classList.contains('active'));
  assert.equal(document.getElementById('ios-nav-daily').getAttribute('aria-current'), 'page');
  assert.ok(!document.getElementById('ios-nav-weekly').classList.contains('active'));
  assert.ok(document.getElementById('ios-tab-portfolio').classList.contains('active'));
  assert.equal(document.getElementById('ios-tab-portfolio').getAttribute('aria-current'), 'page');
  assert.match(tabText(document), /DEMO1/, '组合 (portfolio) tab is the default active tab and shows holdings');

  const summaryContainer = document.getElementById('ios-summary-content');
  assert.equal(summaryContainer.children.length, 3, 'summary grid + headline card + report caption, in that order');
  assert.ok(summaryContainer.children[0].classList.contains('ios-summary-grid'));
  assert.ok(summaryContainer.children[1].classList.contains('ios-headline-card'));
  assert.ok(summaryContainer.children[2].classList.contains('ios-report-caption'));
});

test('the summary grid has exactly the 4 v1.1 metrics (当前持仓/观察名单/核心状态/Review) with their explanatory subtitles, not tab-count shortcuts', () => {
  const { document } = loadDashboard(DEMO_BOOTSTRAP, 'daily', {});
  const grid = document.getElementById('ios-summary-content').children[0];
  assert.equal(grid.children.length, 4);
  const labels = grid.children.map((card) => card.children[1].textContent);
  const subtitles = grid.children.map((card) => card.children[2].textContent);
  assert.deepEqual(labels, ['当前持仓', '观察名单', '核心状态', '数据检查']);
  assert.deepEqual(subtitles, ['实时组合事实', '高优先级', 'IOS判断', '数据完整性']);
  // All 4 values are presentation-only reads from the report's own
  // 报告摘要 row (当前持仓数=2, 高优先级观察数=1 in the demo data), never
  // recomputed client-side from live/report-detail rows -- so a
  // historical report's summary always matches the writer's snapshot.
  const values = grid.children.map((card) => card.children[0].textContent);
  assert.deepEqual(values, ['2', '1', '正常', '未Review']);
});

test('summary grid metrics come from the pinned historical report\'s own summary snapshot, not live/recomputed data', () => {
  const { document, window } = loadDashboard(DEMO_BOOTSTRAP, 'daily', {
    getReport: (reportId) => {
      const result = logic.getReport_(demoSheet, reportId);
      result.error = null;
      // A historical snapshot whose 当前持仓数/高优先级观察数 differ from
      // today's live counts -- the grid must render this snapshot, not
      // recompute from vm.watchlistCandidates or the live allocation.
      result.summary = Object.assign({}, result.summary, { 当前持仓数: 7, 高优先级观察数: 3 });
      return result;
    }
  });
  window.selectHistoryReport('daily-2026-08-15');
  const grid = document.getElementById('ios-summary-content').children[0];
  const values = grid.children.map((card) => card.children[0].textContent);
  assert.deepEqual(values.slice(0, 2), ['7', '3']);
});

test('summary grid metrics render "未知" for a blank 当前持仓数/高优先级观察数, never a fabricated 0', () => {
  const bootstrapWithBlankCounts = Object.assign({}, DEMO_BOOTSTRAP, {
    daily: Object.assign({}, DEMO_BOOTSTRAP.daily, {
      summary: Object.assign({}, DEMO_BOOTSTRAP.daily.summary, { 当前持仓数: '', 高优先级观察数: undefined })
    })
  });
  const { document } = loadDashboard(bootstrapWithBlankCounts, 'daily', {});
  const grid = document.getElementById('ios-summary-content').children[0];
  const values = grid.children.map((card) => card.children[0].textContent);
  assert.deepEqual(values.slice(0, 2), ['未知', '未知']);
});

test('summary metric cards are plain informational cards, not tab shortcuts -- no click handler, no button element', () => {
  const { document } = loadDashboard(DEMO_BOOTSTRAP, 'daily', {});
  const grid = document.getElementById('ios-summary-content').children[0];
  grid.children.forEach((card) => {
    assert.notEqual(card.tagName, 'BUTTON');
    card.click(); // must be inert -- no onclick was ever registered
  });
  assert.ok(document.getElementById('ios-tab-portfolio').classList.contains('active'), 'clicking a metric card must never change the active tab');
});

test('switchView("weekly") re-renders in place without any google.script.run call (both viewModels already cached from bootstrap)', () => {
  let runCalls = 0;
  const { document, window } = loadDashboard(DEMO_BOOTSTRAP, 'daily', {
    getReport: () => { runCalls += 1; return {}; },
    getDashboardBootstrap: () => { runCalls += 1; return {}; }
  });
  window.switchView('weekly');
  assert.match(summaryText(document), /weekly-2026-08-15/);
  assert.ok(document.getElementById('ios-nav-weekly').classList.contains('active'));
  assert.ok(!document.getElementById('ios-nav-daily').classList.contains('active'));
  assert.equal(runCalls, 0, 'toggling between the two already-fetched latest reports must never hit the server');
});

test('switchView back and forth is idempotent and always reflects the latest report of that type', () => {
  const { document, window } = loadDashboard(DEMO_BOOTSTRAP, 'daily', {});
  window.switchView('weekly');
  window.switchView('daily');
  assert.match(summaryText(document), /daily-2026-08-15/);
});

test('switchView repopulates the history <select> with that view\'s own history entries', () => {
  const { document, window } = loadDashboard(DEMO_BOOTSTRAP, 'daily', {});
  assert.deepEqual(historySelectOptionValues(document), ['', 'daily-2026-08-15']);
  window.switchView('weekly');
  assert.deepEqual(historySelectOptionValues(document), ['', 'weekly-2026-08-15']);
});

test('selectTab switches between 组合/资本配置/风险/待办 without any google.script.run call, and updates aria-current', () => {
  let runCalls = 0;
  const { document, window } = loadDashboard(DEMO_BOOTSTRAP, 'daily', {
    getReport: () => { runCalls += 1; return {}; },
    getDashboardBootstrap: () => { runCalls += 1; return {}; }
  });

  window.selectTab('allocation');
  assert.ok(document.getElementById('ios-tab-allocation').classList.contains('active'));
  assert.equal(document.getElementById('ios-tab-portfolio').getAttribute('aria-current'), null);
  assert.match(tabText(document), /DEMO1/, '资本配置 tab shows the live current-holdings table');

  window.selectTab('risks');
  assert.ok(document.getElementById('ios-tab-risks').classList.contains('active'));
  assert.match(tabText(document), /风险/);

  window.selectTab('todos');
  assert.ok(document.getElementById('ios-tab-todos').classList.contains('active'));
  assert.match(tabText(document), /待办事项/);

  window.selectTab('portfolio');
  assert.ok(document.getElementById('ios-tab-portfolio').classList.contains('active'));

  assert.equal(runCalls, 0, 'tab switching only re-renders already-cached data, never hits the server');
});

test('selectTab ignores an unrecognized tab name rather than clearing the current tab', () => {
  const { document, window } = loadDashboard(DEMO_BOOTSTRAP, 'daily', {});
  window.selectTab('not-a-real-tab');
  assert.ok(document.getElementById('ios-tab-portfolio').classList.contains('active'), 'must remain on the previously active tab');
});

test('the 资本配置 (capital allocation) tab renders live current-holdings data independent of which Daily/Weekly view is active', () => {
  const { document, window } = loadDashboard(DEMO_BOOTSTRAP, 'daily', {});
  window.selectTab('allocation');
  const allocationText = tabText(document);
  assert.match(allocationText, /DEMO1/);
  assert.match(allocationText, /DEMO2/);
  window.switchView('weekly');
  assert.equal(tabText(document), allocationText, 'allocation is not report-scoped and must not change when the active view changes');
});

test('capital allocation (Issue #255) renders both a desktop table and a mobile card list from the same data -- a CSS breakpoint picks one, Script.html never branches on viewport itself', () => {
  const { document, window } = loadDashboard(DEMO_BOOTSTRAP, 'daily', {});
  window.selectTab('allocation');
  const section = document.getElementById('ios-tab-content').children[0];
  const tableWrap = section.children[2];
  const cards = section.children[3];
  assert.ok(tableWrap.classList.contains('ios-allocation-table'), 'the table wrapper carries the class the mobile breakpoint hides');
  assert.ok(cards.classList.contains('ios-allocation-cards'), 'the card container carries the class the desktop breakpoint hides');
  assert.equal(tableWrap.children[0].tagName, 'TABLE');
  assert.match(tableWrap.textContent, /DEMO1/);
  assert.match(cards.textContent, /DEMO1/);
  assert.equal(cards.children.length, 2, 'one card per allocation entry -- the same 2 live holdings the table shows');
});

test('a capital-allocation mobile card surfaces code/name/quantity/avg-cost/reference with the same missing-value handling as the table', () => {
  const { document, window } = loadDashboard(DEMO_BOOTSTRAP, 'daily', {});
  window.selectTab('allocation');
  const cards = document.getElementById('ios-tab-content').children[0].children[3];
  const demo1Card = cards.children.find((card) => card.textContent.indexOf('DEMO1') !== -1);
  const demo2Card = cards.children.find((card) => card.textContent.indexOf('DEMO2') !== -1);
  assert.match(demo1Card.textContent, /42\.5/);
  assert.match(demo1Card.textContent, /38-40/);
  assert.match(demo2Card.textContent, /未知/, 'DEMO2 has a blank 平均成本 in 当前持仓 -- must render explicitly, never a fabricated 0');
  assert.match(demo2Card.textContent, /未设定/, 'DEMO2 has a blank 参考买入价/区间 in 当前持仓 -- must render explicitly, never blank/omitted');
});

test('onHistorySelectChange("") resets to latest, same as clicking the active Daily/Weekly nav button', () => {
  const { document, window } = loadDashboard(DEMO_BOOTSTRAP, 'daily', {
    getReport: (reportId) => {
      const result = logic.getReport_(demoSheet, reportId);
      result.error = null;
      return result;
    }
  });
  window.selectHistoryReport('daily-2026-08-15');
  assert.equal(document.getElementById('ios-history-banner').hidden, false);
  window.onHistorySelectChange('');
  assert.equal(document.getElementById('ios-history-banner').hidden, true);
});

test('onHistorySelectChange(reportId) fetches via google.script.run.getReport, same as selectHistoryReport', () => {
  const { document, window } = loadDashboard(DEMO_BOOTSTRAP, 'daily', {
    getReport: (reportId) => {
      const result = logic.getReport_(demoSheet, reportId);
      result.error = null;
      return result;
    }
  });
  window.onHistorySelectChange('daily-2026-08-15');
  const banner = document.getElementById('ios-history-banner');
  assert.equal(banner.hidden, false);
  assert.match(banner.textContent, /daily-2026-08-15/);
  assert.match(summaryText(document), /daily-2026-08-15/);
});

test('selectHistoryReport fetches via google.script.run.getReport and pins that report, showing the "back to latest" banner', () => {
  const { document, window } = loadDashboard(DEMO_BOOTSTRAP, 'daily', {
    getReport: (reportId) => {
      const result = logic.getReport_(demoSheet, reportId);
      result.error = null;
      return result;
    }
  });
  window.selectHistoryReport('daily-2026-08-15');
  const banner = document.getElementById('ios-history-banner');
  assert.equal(banner.hidden, false);
  assert.match(banner.textContent, /daily-2026-08-15/);
  assert.match(summaryText(document), /daily-2026-08-15/);
});

test('clicking the corresponding Daily/Weekly nav button again clears a pinned history selection back to latest', () => {
  const { document, window } = loadDashboard(DEMO_BOOTSTRAP, 'daily', {
    getReport: (reportId) => {
      const result = logic.getReport_(demoSheet, reportId);
      result.error = null;
      return result;
    }
  });
  window.selectHistoryReport('daily-2026-08-15');
  assert.equal(document.getElementById('ios-history-banner').hidden, false);
  window.switchView('daily');
  assert.equal(document.getElementById('ios-history-banner').hidden, true);
});

test('a getReport failure (thrown server error) shows a transient message and does not clobber the currently displayed report', () => {
  const { document, window } = loadDashboard(DEMO_BOOTSTRAP, 'daily', {
    getReport: () => { throw new Error('Sheet tab not found: 报告持仓'); }
  });
  window.selectHistoryReport('daily-2026-08-15');
  const statusBanner = document.getElementById('ios-status-banner');
  assert.equal(statusBanner.hidden, false);
  assert.match(statusBanner.textContent, /Sheet tab not found/);
  // The summary section must still show the report that was on screen
  // before the failed history fetch -- a transient failure is not the
  // same as a Blocked bootstrap and must not wipe working content.
  assert.match(summaryText(document), /daily-2026-08-15/);
});

test('a Blocked bootstrap (error set) renders the status banner and leaves the summary/tab sections empty, for every view and tab', () => {
  const blocked = {
    error: 'Sheet tab "当前持仓" is missing required column(s): 状态',
    daily: { found: false, reportType: 'daily' },
    weekly: { found: false, reportType: 'weekly' },
    dailyHistory: [],
    weeklyHistory: [],
    allocation: []
  };
  const { document, window } = loadDashboard(blocked, 'daily', {});
  const statusBanner = document.getElementById('ios-status-banner');
  assert.equal(statusBanner.hidden, false);
  assert.ok(statusBanner.classList.contains('ios-status-blocked'));
  assert.match(statusBanner.textContent, /missing required column/);
  assert.equal(summaryText(document), '');
  assert.equal(tabText(document), '');

  window.switchView('weekly');
  assert.equal(summaryText(document), '', 'Blocked must stay Blocked across a view switch, never partially recover');

  window.selectTab('allocation');
  assert.equal(tabText(document), '', 'Blocked must stay Blocked across a tab switch too, including the otherwise view-independent allocation tab');
});

test('an empty-state (found: false, no error) renders the explicit "no report yet" card in the summary section, not a blank page', () => {
  const emptyBootstrap = {
    error: null,
    daily: { found: false, reportType: 'daily' },
    weekly: { found: false, reportType: 'weekly' },
    dailyHistory: [],
    weeklyHistory: [],
    allocation: []
  };
  const { document } = loadDashboard(emptyBootstrap, 'daily', {});
  assert.match(summaryText(document), /暂无日报/);
  assert.equal(tabText(document), '', 'the portfolio tab has nothing to show when there is no report yet');
});

test('the "no report yet" empty state points to the onboarding prompt as a next step (Issue #273), without running any profile logic itself', () => {
  const emptyBootstrap = {
    error: null,
    daily: { found: false, reportType: 'daily' },
    weekly: { found: false, reportType: 'weekly' },
    dailyHistory: [],
    weeklyHistory: [],
    allocation: []
  };
  const { document } = loadDashboard(emptyBootstrap, 'daily', {});
  assert.match(summaryText(document), /onboarding-prompt\.md/, 'the empty state should name the onboarding prompt file as the next step, not just describe the empty state');
});

test('reference-price/price-position mapping renders explicit missing-value text, never a blank or shifted column, on the 组合 tab', () => {
  const { document } = loadDashboard(DEMO_BOOTSTRAP, 'daily', {});
  const portfolioText = tabText(document);
  // DEMO1 has both a reference range and a price position.
  assert.match(portfolioText, /38-40/);
  assert.match(portfolioText, /高于区间/);
  // DEMO2's reference range is blank in the report-time snapshot -- must
  // render as the explicit marker, never as an empty string or omitted
  // entirely (which would look like a column-shift artifact).
  assert.match(portfolioText, /未设定/);
  assert.match(portfolioText, /价格位置[\s\S]*未知|未知/);
});

test('holding cards render the v1.1 content order -- 价格/参考(+价格位置)/变化/逻辑/验证 -- not a Thesis line', () => {
  const { document } = loadDashboard(DEMO_BOOTSTRAP, 'daily', {});
  const portfolioText = tabText(document);
  assert.match(portfolioText, /价格: 41\.2/);
  assert.match(portfolioText, /参考: 38-40/);
  assert.match(portfolioText, /变化: 无重大变化/);
  assert.match(portfolioText, /逻辑: 长期逻辑未变/, '长期逻辑或估值 must render under the 逻辑 label, replacing the old Thesis line');
  assert.match(portfolioText, /验证: 下季度财报/);
  assert.ok(!/Thesis/.test(portfolioText), 'the v1.1 card has no Thesis line');
});

// -- Semantic badge colors for IOS状态/价格位置 (Issue #257) --

test('IOS状态: 可研究加仓/继续持有/监控风险 map to visibly distinct badge classes', () => {
  const opportunity = loadDashboard(buildBootstrapWithHolding({ 'IOS状态': '可研究加仓' }), 'daily', {});
  const neutral = loadDashboard(buildBootstrapWithHolding({ 'IOS状态': '继续持有' }), 'daily', {});
  const risk = loadDashboard(buildBootstrapWithHolding({ 'IOS状态': '监控风险' }), 'daily', {});

  const opportunityBadge = iosStatusBadge(opportunity.document);
  const neutralBadge = iosStatusBadge(neutral.document);
  const riskBadge = iosStatusBadge(risk.document);

  assert.ok(opportunityBadge.classList.contains('ios-severity-low'));
  assert.ok(riskBadge.classList.contains('ios-severity-high'));
  assert.ok(!neutralBadge.classList.contains('ios-severity-low'));
  assert.ok(!neutralBadge.classList.contains('ios-severity-high'));
  assert.notEqual(opportunityBadge.className, neutralBadge.className);
  assert.notEqual(neutralBadge.className, riskBadge.className);
  assert.notEqual(opportunityBadge.className, riskBadge.className);

  assert.equal(opportunityBadge.textContent, '可研究加仓', 'badge text stays the raw canonical value -- color is supplementary, never the only carrier of meaning');
  assert.equal(riskBadge.textContent, '监控风险');
});

test('IOS状态: the remaining canonical Weekly action-language values (等待/降低研究优先级/更新假设/延后动作) get sensible explicit tiers too', () => {
  const wait = loadDashboard(buildBootstrapWithHolding({ 'IOS状态': '等待' }), 'daily', {});
  const deprioritize = loadDashboard(buildBootstrapWithHolding({ 'IOS状态': '降低研究优先级' }), 'daily', {});
  const updateAssumptions = loadDashboard(buildBootstrapWithHolding({ 'IOS状态': '更新假设' }), 'daily', {});
  const defer = loadDashboard(buildBootstrapWithHolding({ 'IOS状态': '延后动作' }), 'daily', {});

  assert.ok(iosStatusBadge(wait.document).classList.contains('ios-severity-medium'));
  assert.ok(iosStatusBadge(updateAssumptions.document).classList.contains('ios-severity-medium'));
  assert.ok(iosStatusBadge(deprioritize.document).classList.contains('ios-badge-muted'));
  assert.ok(iosStatusBadge(defer.document).classList.contains('ios-badge-muted'));
});

test('IOS状态: an unrecognized value keeps its raw text and falls back to the plain neutral badge -- never an accidental semantic color', () => {
  const { document } = loadDashboard(buildBootstrapWithHolding({ 'IOS状态': '一个从没见过的自定义状态' }), 'daily', {});
  const badge = iosStatusBadge(document);
  assert.equal(badge.textContent, '一个从没见过的自定义状态');
  assert.ok(!badge.classList.contains('ios-severity-low'));
  assert.ok(!badge.classList.contains('ios-severity-medium'));
  assert.ok(!badge.classList.contains('ios-severity-high'));
  assert.ok(!badge.classList.contains('ios-badge-muted'));
  assert.equal(badge.className, 'ios-badge', 'the plain badge class alone is the safe neutral fallback');
});

test('价格位置: 区间内/接近参考/高于参考 map to visibly distinct badge classes (green/amber/red)', () => {
  const inRange = loadDashboard(buildBootstrapWithHolding({ '价格位置': '区间内' }), 'daily', {});
  const near = loadDashboard(buildBootstrapWithHolding({ '价格位置': '接近参考' }), 'daily', {});
  const above = loadDashboard(buildBootstrapWithHolding({ '价格位置': '高于参考' }), 'daily', {});

  assert.ok(pricePositionBadge(inRange.document).classList.contains('ios-severity-low'));
  assert.ok(pricePositionBadge(near.document).classList.contains('ios-severity-medium'));
  assert.ok(pricePositionBadge(above.document).classList.contains('ios-severity-high'));
});

test('价格位置: 低于参考/无参考/无可靠价格 each get an explicit, distinct safe treatment', () => {
  const below = loadDashboard(buildBootstrapWithHolding({ '价格位置': '低于参考' }), 'daily', {});
  const noReference = loadDashboard(buildBootstrapWithHolding({ '价格位置': '无参考' }), 'daily', {});
  const unreliable = loadDashboard(buildBootstrapWithHolding({ '价格位置': '无可靠价格' }), 'daily', {});

  const belowBadge = pricePositionBadge(below.document);
  const noReferenceBadge = pricePositionBadge(noReference.document);
  const unreliableBadge = pricePositionBadge(unreliable.document);

  assert.ok(belowBadge.classList.contains('ios-badge-price-opportunity'), '低于参考 gets its own explicit opportunity/under-reference treatment');
  assert.ok(unreliableBadge.classList.contains('ios-badge-unavailable'), '无可靠价格 gets an explicit unavailable treatment, distinct from plain neutral');
  assert.equal(noReferenceBadge.className, 'ios-badge ios-badge-price-position', '无参考 is neutral/muted -- the plain badge look, no extra tier class');
  assert.notEqual(belowBadge.className, unreliableBadge.className);
  assert.notEqual(belowBadge.className, noReferenceBadge.className);
});

test('价格位置: the exact 区间-worded vocabulary the Task prompts and sheet-schema.json actually document (低于区间/区间内/高于区间/未知) is colored too, not just the issue\'s 参考-worded list', () => {
  const below = loadDashboard(buildBootstrapWithHolding({ '价格位置': '低于区间' }), 'daily', {});
  const inRange = loadDashboard(buildBootstrapWithHolding({ '价格位置': '区间内' }), 'daily', {});
  const above = loadDashboard(buildBootstrapWithHolding({ '价格位置': '高于区间' }), 'daily', {});
  const unknown = loadDashboard(buildBootstrapWithHolding({ '价格位置': '未知' }), 'daily', {});

  assert.ok(pricePositionBadge(below.document).classList.contains('ios-badge-price-opportunity'));
  assert.ok(pricePositionBadge(inRange.document).classList.contains('ios-severity-low'));
  assert.ok(pricePositionBadge(above.document).classList.contains('ios-severity-high'));
  assert.equal(pricePositionBadge(unknown.document).className, 'ios-badge ios-badge-price-position');
});

test('价格位置: an unrecognized value keeps its raw text and falls back to the plain neutral badge', () => {
  const { document } = loadDashboard(buildBootstrapWithHolding({ '价格位置': '从没见过的位置描述' }), 'daily', {});
  const badge = pricePositionBadge(document);
  assert.equal(badge.textContent, '从没见过的位置描述');
  assert.equal(badge.className, 'ios-badge ios-badge-price-position');
});

test('semantic badge mapping is the same function regardless of Daily/Weekly/history rendering path', () => {
  const bootstrap = buildBootstrapWithHolding({ 'IOS状态': '监控风险', '价格位置': '高于参考' });
  // Exercise the same holding through a pinned history-report render, not
  // just the default latest-Daily path, to confirm there's no separate
  // (and possibly diverging) mapping used for history-selected reports.
  const { document, window } = loadDashboard(bootstrap, 'daily', {
    getReport: () => {
      const result = JSON.parse(JSON.stringify(bootstrap.daily));
      result.error = null;
      return result;
    }
  });
  window.selectHistoryReport('daily-2026-08-20');
  assert.ok(iosStatusBadge(document).classList.contains('ios-severity-high'));
  assert.ok(pricePositionBadge(document).classList.contains('ios-severity-high'));
});

test('watchlist candidates render separately from holdings and are labeled as watchlist, not holdings', () => {
  const { document } = loadDashboard(DEMO_BOOTSTRAP, 'daily', {});
  const text = tabText(document);
  assert.match(text, /DEMOW1/);
  assert.match(text, /观察名单/);
});

// -- Todo checklist (Issue #255): count summary, open-before-done grouping
// with 排序 preserved within each group, conservative status handling. --

test('todos: count summary shows the open/done split, and open items render before done ones with 排序 order preserved within each group', () => {
  const todos = [
    { 排序: 1, 分类: 'research', 待办: 'Task A', 状态: 'open', 备注: '' },
    { 排序: 2, 分类: 'follow-up', 待办: 'Task B', 状态: 'done', 备注: 'note B' },
    { 排序: 3, 分类: '', 待办: 'Task C', 状态: '', 备注: '' },
    { 排序: 4, 分类: '', 待办: 'Task D', 状态: 'done', 备注: '' }
  ];
  const { document, window } = loadDashboard(buildBootstrapWithTodos(todos), 'daily', {});
  window.selectTab('todos');
  const section = document.getElementById('ios-tab-content').children[0];
  const summary = section.children[1];
  assert.match(summary.textContent, /2 待处理/);
  assert.match(summary.textContent, /2 已完成/);
  const items = section.children[2].children;
  const taskNames = items.map((li) => li.children[0].children[1].textContent);
  assert.deepEqual(taskNames, ['Task A', 'Task C', 'Task B', 'Task D'],
    'open items (A, C -- their own 排序 order) render before done items (B, D -- their own 排序 order), never re-sorted across the whole list');
});

test('todos: a completed item is struck through and its indicator marks it done; an open item is not', () => {
  const todos = [
    { 排序: 1, 分类: '', 待办: 'Open task', 状态: 'open', 备注: '' },
    { 排序: 2, 分类: '', 待办: 'Done task', 状态: 'done', 备注: '' }
  ];
  const { document, window } = loadDashboard(buildBootstrapWithTodos(todos), 'daily', {});
  window.selectTab('todos');
  const items = document.getElementById('ios-tab-content').children[0].children[2].children;
  const openItem = items.find((li) => li.textContent.indexOf('Open task') !== -1);
  const doneItem = items.find((li) => li.textContent.indexOf('Done task') !== -1);
  assert.ok(openItem.classList.contains('ios-todo-open'));
  assert.ok(!openItem.classList.contains('ios-todo-done'));
  assert.ok(doneItem.classList.contains('ios-todo-done'));
  assert.ok(!doneItem.classList.contains('ios-todo-open'));
});

test('todos: an unrecognized status is displayed explicitly but conservatively treated as open, never assumed completed', () => {
  const todos = [{ 排序: 1, 分类: '', 待办: 'Task with a custom status', 状态: 'in-progress', 备注: '' }];
  const { document, window } = loadDashboard(buildBootstrapWithTodos(todos), 'daily', {});
  window.selectTab('todos');
  const li = document.getElementById('ios-tab-content').children[0].children[2].children[0];
  assert.ok(!li.classList.contains('ios-todo-done'), 'an unrecognized status must never be treated as completed');
  assert.ok(li.classList.contains('ios-todo-open'));
  assert.match(li.textContent, /in-progress/, 'the raw status text is still shown explicitly, not hidden or relabeled');
});

test('todos: a blank 状态 is treated the same as "待处理" (conservative default), and is shown as such', () => {
  const todos = [{ 排序: 1, 分类: '', 待办: 'No status set', 状态: '', 备注: '' }];
  const { document, window } = loadDashboard(buildBootstrapWithTodos(todos), 'daily', {});
  window.selectTab('todos');
  const li = document.getElementById('ios-tab-content').children[0].children[2].children[0];
  assert.ok(li.classList.contains('ios-todo-open'));
  assert.match(li.textContent, /待处理/);
});

test('todos: 分类 and 状态 render as badges on every item; 备注 renders as a secondary note only when present', () => {
  const withNote = loadDashboard(buildBootstrapWithTodos([
    { 排序: 1, 分类: 'ops', 待办: 'Has a note', 状态: 'open', 备注: 'secondary detail' }
  ]), 'daily', {});
  withNote.window.selectTab('todos');
  const liWithNote = withNote.document.getElementById('ios-tab-content').children[0].children[2].children[0];
  assert.match(liWithNote.children[1].textContent, /ops/, '分类 badge');
  assert.match(liWithNote.children[1].textContent, /open/, '状态 badge');
  assert.equal(liWithNote.children.length, 3, 'head + meta + note when 备注 is present');
  assert.match(liWithNote.children[2].textContent, /secondary detail/);

  const withoutNote = loadDashboard(buildBootstrapWithTodos([
    { 排序: 1, 分类: '', 待办: 'No note', 状态: 'open', 备注: '' }
  ]), 'daily', {});
  withoutNote.window.selectTab('todos');
  const liWithoutNote = withoutNote.document.getElementById('ios-tab-content').children[0].children[2].children[0];
  assert.equal(liWithoutNote.children.length, 2, 'no note element at all when 备注 is blank -- never an empty note line');
});

test('todos: an empty result shows only the explicit empty-state note -- no count summary or list for zero items', () => {
  const { document, window } = loadDashboard(buildBootstrapWithTodos([]), 'daily', {});
  window.selectTab('todos');
  const section = document.getElementById('ios-tab-content').children[0];
  assert.equal(section.children.length, 2, 'h2 + empty-note only');
  assert.match(section.children[1].textContent, /合法的空结果/);
});

// -- Todo status classifier (Issue #260): counts, grouping, card styling,
// and the status badge class must all derive from the same normalized
// completion classification, so a real report's status text can never
// make one of them disagree with the others. --

test('todos: "Done"/"DONE"/whitespace-padded "done" all classify as completed -- counts, grouping, card class, and badge class all agree', () => {
  const todos = [
    { 排序: 1, 分类: '', 待办: 'Mixed case', 状态: 'Done', 备注: '' },
    { 排序: 2, 分类: '', 待办: 'All caps', 状态: 'DONE', 备注: '' },
    { 排序: 3, 分类: '', 待办: 'Padded', 状态: '  done  ', 备注: '' },
    { 排序: 4, 分类: '', 待办: 'Actually open', 状态: 'open', 备注: '' }
  ];
  const { document, window } = loadDashboard(buildBootstrapWithTodos(todos), 'daily', {});
  window.selectTab('todos');
  const section = document.getElementById('ios-tab-content').children[0];
  const summary = section.children[1];
  assert.match(summary.textContent, /1 待处理/, 'only the literal "open" status counts as 待处理');
  assert.match(summary.textContent, /3 已完成/, 'Done/DONE/whitespace-padded done must all count as 已完成');
  const items = section.children[2].children;
  const byName = (name) => items.find((li) => li.textContent.indexOf(name) !== -1);
  for (const name of ['Mixed case', 'All caps', 'Padded']) {
    const li = byName(name);
    assert.ok(li.classList.contains('ios-todo-done'), `${name}: must be grouped/styled as done`);
    assert.ok(!li.classList.contains('ios-todo-open'), `${name}: must not also carry the open class`);
    const statusBadge = li.children[1].children[0];
    assert.ok(statusBadge.classList.contains('ios-badge-done'), `${name}: status badge must carry the done tier class`);
  }
  const openLi = byName('Actually open');
  assert.ok(openLi.classList.contains('ios-todo-open'));
  const openBadge = openLi.children[1].children[0];
  assert.ok(!openBadge.classList.contains('ios-badge-done'), 'an open item\'s status badge must never carry the done tier class');
});

test('todos: the real Chinese canonical values 已完成/待处理 classify correctly -- Issue #260 reopened, production evidence from weekly-2026-08-31', () => {
  // Exact shape of the production defect: live report rows used 已完成/待处理,
  // but TODO_COMPLETED_STATUSES_ only recognized the literal 'done', so every
  // 已完成 row was conservatively treated as open -- a Dashboard showing
  // "6 open / 0 done" while multiple visible cards said 已完成.
  const todos = [
    { 排序: 1, 分类: 'research', 待办: '复核 TSM 论点', 状态: '已完成', 备注: '' },
    { 排序: 2, 分类: 'research', 待办: '复核 GOOGL 论点', 状态: '已完成', 备注: '' },
    { 排序: 3, 分类: 'research', 待办: '复核 ORCL 论点', 状态: '已完成', 备注: '' },
    { 排序: 4, 分类: 'research', 待办: '复核 6501 论点', 状态: '已完成', 备注: '' },
    { 排序: 5, 分类: 'research', 待办: '风险调整后收益对比', 状态: '已完成', 备注: '' },
    { 排序: 6, 分类: 'follow-up', 待办: '跟进新增观察名单候选', 状态: '待处理', 备注: '' }
  ];
  const { document, window } = loadDashboard(buildBootstrapWithTodos(todos), 'daily', {});
  window.selectTab('todos');
  const section = document.getElementById('ios-tab-content').children[0];
  const summary = section.children[1];
  assert.match(summary.textContent, /1 待处理/, '待处理 must count as 待处理');
  assert.match(summary.textContent, /5 已完成/, 'every 已完成 row must count as 已完成');
  const items = section.children[2].children;
  const byName = (name) => items.find((li) => li.textContent.indexOf(name) !== -1);
  for (const name of ['复核 TSM 论点', '复核 GOOGL 论点', '复核 ORCL 论点', '复核 6501 论点', '风险调整后收益对比']) {
    const li = byName(name);
    assert.ok(li.classList.contains('ios-todo-done'), `${name}: 已完成 must be grouped/styled as done`);
    const statusBadge = li.children[1].children[0];
    assert.ok(statusBadge.classList.contains('ios-badge-done'), `${name}: 已完成 badge must carry the done tier class (green)`);
    assert.match(statusBadge.textContent, /已完成/, `${name}: raw 已完成 text must still render on the badge`);
  }
  const openLi = byName('跟进新增观察名单候选');
  assert.ok(openLi.classList.contains('ios-todo-open'), '待处理 must be grouped/styled as open, not completed');
  const openBadge = openLi.children[1].children[0];
  assert.ok(!openBadge.classList.contains('ios-badge-done'), '待处理 badge must never carry the done tier class');
  assert.match(openBadge.textContent, /待处理/, 'raw 待处理 text must still render on the badge');
});

test('todos: Weekly and history-selected reports classify 已完成/待处理 the same way as the live Daily view', () => {
  const bootstrap = buildBootstrapWithTodos([
    { 排序: 1, 分类: '', 待办: 'Daily 已完成', 状态: '已完成', 备注: '' }
  ]);
  bootstrap.weekly = {
    found: true,
    reportType: 'weekly',
    summary: {
      报告ID: 'weekly-2026-08-31', 报告日期: '2026-08-31', 周期开始: '2026-08-25', 周期结束: '2026-08-31',
      一句话结论: 'weekly headline', 核心状态: '正常', Review状态: '未Review',
      当前持仓数: 0, 高优先级观察数: 0, 生成时间: '2026-08-31T09:00:00+09:00'
    },
    holdings: [], watchlistCandidates: [], risks: [],
    todos: [
      { 排序: 1, 分类: '', 待办: 'Weekly 已完成', 状态: '已完成', 备注: '' },
      { 排序: 2, 分类: '', 待办: 'Weekly 待处理', 状态: '待处理', 备注: '' }
    ]
  };
  const { document, window } = loadDashboard(bootstrap, 'weekly', {});
  window.selectTab('todos');
  const section = document.getElementById('ios-tab-content').children[0];
  assert.match(section.children[1].textContent, /1 待处理/);
  assert.match(section.children[1].textContent, /1 已完成/);
  const items = section.children[2].children;
  const doneLi = items.find((li) => li.textContent.indexOf('Weekly 已完成') !== -1);
  const openLi = items.find((li) => li.textContent.indexOf('Weekly 待处理') !== -1);
  assert.ok(doneLi.classList.contains('ios-todo-done'), 'Weekly must classify 已完成 as completed the same as Daily does');
  assert.ok(openLi.classList.contains('ios-todo-open'), 'Weekly must classify 待处理 as actionable the same as Daily does');

  const historyReport = {
    error: null, found: true, reportType: 'daily',
    summary: {
      报告ID: 'daily-2026-08-30', 报告日期: '2026-08-30', 周期开始: '', 周期结束: '',
      一句话结论: 'history headline', 核心状态: '正常', Review状态: '未Review',
      当前持仓数: 0, 高优先级观察数: 0, 生成时间: '2026-08-30T09:00:00+09:00'
    },
    holdings: [], watchlistCandidates: [], risks: [],
    todos: [{ 排序: 1, 分类: '', 待办: 'History 已完成', 状态: '已完成', 备注: '' }]
  };
  const historyView = loadDashboard(buildBootstrapWithTodos([]), 'daily', { getReport: () => historyReport });
  historyView.window.selectHistoryReport('daily-2026-08-30');
  historyView.window.selectTab('todos');
  const historySection = historyView.document.getElementById('ios-tab-content').children[0];
  assert.match(historySection.children[1].textContent, /1 已完成/, 'a history-selected report must classify 已完成 as completed the same as the live view');
  assert.ok(historySection.children[2].children[0].classList.contains('ios-todo-done'));
});

test('todos: an unrecognized status\'s badge never carries the done tier class either, matching its open/actionable grouping', () => {
  const todos = [{ 排序: 1, 分类: '', 待办: 'Custom status', 状态: 'in-progress', 备注: '' }];
  const { document, window } = loadDashboard(buildBootstrapWithTodos(todos), 'daily', {});
  window.selectTab('todos');
  const li = document.getElementById('ios-tab-content').children[0].children[2].children[0];
  const statusBadge = li.children[1].children[0];
  assert.ok(!statusBadge.classList.contains('ios-badge-done'));
  assert.match(statusBadge.textContent, /in-progress/, 'the raw status text is still shown verbatim on the badge');
});

test('todos: the Weekly view classifies the same status vocabulary the same way as Daily', () => {
  const bootstrap = buildBootstrapWithTodos([
    { 排序: 1, 分类: '', 待办: 'Daily done', 状态: 'Done', 备注: '' }
  ]);
  bootstrap.weekly = {
    found: true,
    reportType: 'weekly',
    summary: {
      报告ID: 'weekly-2026-08-16', 报告日期: '2026-08-16', 周期开始: '2026-08-10', 周期结束: '2026-08-16',
      一句话结论: 'weekly headline', 核心状态: '正常', Review状态: '未Review',
      当前持仓数: 0, 高优先级观察数: 0, 生成时间: '2026-08-16T09:00:00+09:00'
    },
    holdings: [], watchlistCandidates: [], risks: [],
    todos: [{ 排序: 1, 分类: '', 待办: 'Weekly done', 状态: 'DONE', 备注: '' }]
  };
  const { document, window } = loadDashboard(bootstrap, 'weekly', {});
  window.selectTab('todos');
  const section = document.getElementById('ios-tab-content').children[0];
  assert.match(section.children[1].textContent, /1 已完成/);
  const li = section.children[2].children[0];
  assert.ok(li.classList.contains('ios-todo-done'), 'Weekly must classify "DONE" as completed the same as Daily does');
});

test('todos: a history-selected report classifies the same status vocabulary the same way as the live view', () => {
  const historyReport = {
    error: null,
    found: true,
    reportType: 'daily',
    summary: {
      报告ID: 'daily-2026-08-10', 报告日期: '2026-08-10', 周期开始: '', 周期结束: '',
      一句话结论: 'history headline', 核心状态: '正常', Review状态: '未Review',
      当前持仓数: 0, 高优先级观察数: 0, 生成时间: '2026-08-10T09:00:00+09:00'
    },
    holdings: [], watchlistCandidates: [], risks: [],
    todos: [{ 排序: 1, 分类: '', 待办: 'History done', 状态: '  Done  ', 备注: '' }]
  };
  const { document, window } = loadDashboard(buildBootstrapWithTodos([]), 'daily', {
    getReport: () => historyReport
  });
  window.selectHistoryReport('daily-2026-08-10');
  window.selectTab('todos');
  const section = document.getElementById('ios-tab-content').children[0];
  assert.match(section.children[1].textContent, /1 已完成/, 'a history-selected report must classify a padded/mixed-case done status the same as the live view');
  const li = section.children[2].children[0];
  assert.ok(li.classList.contains('ios-todo-done'));
});

// -- 跟进类型 classifier (Issue #267): distinguishes actionable work from
// ongoing monitoring and waiting-for-external-evidence items, so neither
// inflates the 待处理 backlog count or reads as ordinary unfinished work. --

test('todos: a row with no 跟进类型 field at all (every pre-#267 report) renders exactly like before -- no kind badge, counted as 待处理', () => {
  const todos = [{ 排序: 1, 分类: '', 待办: 'Legacy row', 状态: '待处理', 备注: '' }];
  const { document, window } = loadDashboard(buildBootstrapWithTodos(todos), 'daily', {});
  window.selectTab('todos');
  const section = document.getElementById('ios-tab-content').children[0];
  const summary = section.children[1];
  assert.match(summary.textContent, /1 待处理/);
  assert.doesNotMatch(summary.textContent, /持续观察/, 'zero monitoring items -- that badge must not render at all');
  assert.doesNotMatch(summary.textContent, /等待证据/, 'zero waiting-for-evidence items -- that badge must not render at all');
  const li = section.children[2].children[0];
  assert.ok(!li.classList.contains('ios-todo-monitoring'));
  assert.ok(!li.classList.contains('ios-todo-waiting'));
  const statusBadge = li.children[1].children[0];
  assert.match(statusBadge.textContent, /待处理/, 'the plain 状态 badge renders, unchanged from before Issue #267');
});

test('todos: 跟进类型=持续观察 shows the monitoring badge instead of the 状态 badge, does not count as 待处理, and gets its own summary count', () => {
  const todos = [
    { 排序: 1, 分类: '', 待办: 'Track NVIDIA Rubin ramp', 状态: '待处理', 跟进类型: '持续观察', 备注: '' },
    { 排序: 2, 分类: '', 待办: 'Actual actionable work', 状态: '待处理', 备注: '' }
  ];
  const { document, window } = loadDashboard(buildBootstrapWithTodos(todos), 'daily', {});
  window.selectTab('todos');
  const section = document.getElementById('ios-tab-content').children[0];
  const summary = section.children[1];
  assert.match(summary.textContent, /1 待处理/, 'only the genuinely actionable row counts as backlog');
  assert.match(summary.textContent, /1 持续观察/);
  const items = section.children[2].children;
  const monitoringItem = items.find((li) => li.textContent.indexOf('Track NVIDIA Rubin ramp') !== -1);
  assert.ok(monitoringItem.classList.contains('ios-todo-monitoring'));
  assert.ok(monitoringItem.classList.contains('ios-todo-open'), 'still open -- just not backlog');
  const kindBadge = monitoringItem.children[1].children[0];
  assert.match(kindBadge.textContent, /^持续观察$/);
  assert.ok(kindBadge.classList.contains('ios-badge-monitoring'));
});

test('todos: 跟进类型=等待证据 shows the waiting badge, does not count as 待处理, and gets its own summary count', () => {
  const todos = [
    { 排序: 1, 分类: '', 待办: 'Wait for board decision', 状态: '待处理', 跟进类型: '等待证据', 备注: '' }
  ];
  const { document, window } = loadDashboard(buildBootstrapWithTodos(todos), 'daily', {});
  window.selectTab('todos');
  const section = document.getElementById('ios-tab-content').children[0];
  const summary = section.children[1];
  assert.match(summary.textContent, /0 待处理/);
  assert.match(summary.textContent, /1 等待证据/);
  const li = section.children[2].children[0];
  assert.ok(li.classList.contains('ios-todo-waiting'));
  const kindBadge = li.children[1].children[0];
  assert.match(kindBadge.textContent, /^等待证据$/);
  assert.ok(kindBadge.classList.contains('ios-badge-waiting'));
});

test('todos: an unrecognized or blank 跟进类型 value falls back to 可执行 (actionable) -- the safe, conservative default, never invented monitoring/waiting semantics', () => {
  const todos = [
    { 排序: 1, 分类: '', 待办: 'Blank kind', 状态: '待处理', 跟进类型: '', 备注: '' },
    { 排序: 2, 分类: '', 待办: 'Unrecognized kind', 状态: '待处理', 跟进类型: 'some-future-value', 备注: '' }
  ];
  const { document, window } = loadDashboard(buildBootstrapWithTodos(todos), 'daily', {});
  window.selectTab('todos');
  const section = document.getElementById('ios-tab-content').children[0];
  const summary = section.children[1];
  assert.match(summary.textContent, /2 待处理/);
  assert.doesNotMatch(summary.textContent, /持续观察/);
  assert.doesNotMatch(summary.textContent, /等待证据/);
  const items = section.children[2].children;
  items.forEach((li) => {
    assert.ok(!li.classList.contains('ios-todo-monitoring'));
    assert.ok(!li.classList.contains('ios-todo-waiting'));
  });
});

test('todos: a malformed non-string 跟进类型 value (a pasted number or boolean) never crashes rendering and still falls back to 可执行', () => {
  // PR #268 review: classifyTodoKind_ previously did `(rawKind || '').trim()`,
  // which throws on any truthy non-string value (numbers/booleans have no
  // .trim()) -- one malformed cell in this optional Sheet column could crash
  // the entire todo section, hiding otherwise-valid actionable work too.
  const todos = [
    { 排序: 1, 分类: '', 待办: 'Numeric kind', 状态: '待处理', 跟进类型: 42, 备注: '' },
    { 排序: 2, 分类: '', 待办: 'Boolean kind', 状态: '待处理', 跟进类型: true, 备注: '' },
    { 排序: 3, 分类: '', 待办: 'Zero kind', 状态: '待处理', 跟进类型: 0, 备注: '' },
    { 排序: 4, 分类: '', 待办: 'False kind', 状态: '待处理', 跟进类型: false, 备注: '' }
  ];
  assert.doesNotThrow(() => {
    const { document, window } = loadDashboard(buildBootstrapWithTodos(todos), 'daily', {});
    window.selectTab('todos');
    const section = document.getElementById('ios-tab-content').children[0];
    const summary = section.children[1];
    assert.match(summary.textContent, /4 待处理/, 'every malformed-kind row still counts as actionable backlog');
    assert.doesNotMatch(summary.textContent, /持续观察/);
    assert.doesNotMatch(summary.textContent, /等待证据/);
    const items = section.children[2].children;
    assert.equal(items.length, 4);
    items.forEach((li) => {
      assert.ok(!li.classList.contains('ios-todo-monitoring'));
      assert.ok(!li.classList.contains('ios-todo-waiting'));
      assert.ok(li.classList.contains('ios-todo-open'));
    });
    const taskNames = items.map((li) => li.children[0].children[1].textContent);
    assert.deepEqual(
      taskNames, ['Numeric kind', 'Boolean kind', 'Zero kind', 'False kind'],
      'raw report data (每一行的 待办 文本) is preserved verbatim despite the malformed 跟进类型 cell'
    );
  }, 'a malformed non-string 跟进类型 value must never crash Daily/Weekly/history rendering');
});

test('todos: a malformed non-string 跟进类型 value never crashes the Weekly view either, and still falls back to 可执行', () => {
  const bootstrap = buildBootstrapWithTodos([]);
  bootstrap.weekly = {
    found: true,
    reportType: 'weekly',
    summary: {
      报告ID: 'weekly-2026-08-16', 报告日期: '2026-08-16', 周期开始: '2026-08-10', 周期结束: '2026-08-16',
      一句话结论: 'weekly headline', 核心状态: '正常', Review状态: '未Review',
      当前持仓数: 0, 高优先级观察数: 0, 生成时间: '2026-08-16T09:00:00+09:00'
    },
    holdings: [], watchlistCandidates: [], risks: [],
    todos: [{ 排序: 1, 分类: '', 待办: 'Weekly numeric kind', 状态: '待处理', 跟进类型: 7, 备注: '' }]
  };
  assert.doesNotThrow(() => {
    const { document, window } = loadDashboard(bootstrap, 'weekly', {});
    window.selectTab('todos');
    const section = document.getElementById('ios-tab-content').children[0];
    assert.match(section.children[1].textContent, /1 待处理/);
    const li = section.children[2].children[0];
    assert.ok(li.classList.contains('ios-todo-open'));
    assert.match(li.children[0].children[1].textContent, /Weekly numeric kind/);
  }, 'a malformed 跟进类型 value must never crash the Weekly view');
});

test('todos: a malformed non-string 跟进类型 value never crashes a history-selected report either, and still falls back to 可执行', () => {
  const historyReport = {
    error: null,
    found: true,
    reportType: 'daily',
    summary: {
      报告ID: 'daily-2026-08-10', 报告日期: '2026-08-10', 周期开始: '', 周期结束: '',
      一句话结论: 'history headline', 核心状态: '正常', Review状态: '未Review',
      当前持仓数: 0, 高优先级观察数: 0, 生成时间: '2026-08-10T09:00:00+09:00'
    },
    holdings: [], watchlistCandidates: [], risks: [],
    todos: [{ 排序: 1, 分类: '', 待办: 'History boolean kind', 状态: '待处理', 跟进类型: false, 备注: '' }]
  };
  assert.doesNotThrow(() => {
    const { document, window } = loadDashboard(buildBootstrapWithTodos([]), 'daily', {
      getReport: () => historyReport
    });
    window.selectHistoryReport('daily-2026-08-10');
    window.selectTab('todos');
    const section = document.getElementById('ios-tab-content').children[0];
    assert.match(section.children[1].textContent, /1 待处理/);
    const li = section.children[2].children[0];
    assert.ok(li.classList.contains('ios-todo-open'));
    assert.match(li.children[0].children[1].textContent, /History boolean kind/);
  }, 'a malformed 跟进类型 value must never crash a history-selected report view');
});

test('todos: a completed monitoring/waiting item shows the plain 已完成 badge, not its kind badge, and counts as 已完成 -- not its open kind bucket', () => {
  const todos = [
    { 排序: 1, 分类: '', 待办: 'Monitoring concluded', 状态: '已完成', 跟进类型: '持续观察', 备注: '' },
    { 排序: 2, 分类: '', 待办: 'Evidence arrived', 状态: '已完成', 跟进类型: '等待证据', 备注: '' }
  ];
  const { document, window } = loadDashboard(buildBootstrapWithTodos(todos), 'daily', {});
  window.selectTab('todos');
  const section = document.getElementById('ios-tab-content').children[0];
  const summary = section.children[1];
  assert.match(summary.textContent, /0 待处理/);
  assert.doesNotMatch(summary.textContent, /持续观察/, 'a completed monitoring item is no longer counted as open monitoring');
  assert.doesNotMatch(summary.textContent, /等待证据/, 'a completed waiting item is no longer counted as open waiting');
  assert.match(summary.textContent, /2 已完成/);
  const items = section.children[2].children;
  items.forEach((li) => {
    assert.ok(li.classList.contains('ios-todo-done'));
    assert.ok(!li.classList.contains('ios-todo-monitoring'));
    assert.ok(!li.classList.contains('ios-todo-waiting'));
    const badge = li.children[1].children[0];
    assert.match(badge.textContent, /已完成/, 'shows the plain completed badge, not the monitoring/waiting kind badge');
    assert.ok(badge.classList.contains('ios-badge-done'));
  });
});

test('todos: render order is actionable-open, then monitoring, then waiting-for-evidence, then completed -- actionable work is never buried behind non-backlog groups', () => {
  const todos = [
    { 排序: 1, 分类: '', 待办: 'Done item', 状态: '已完成', 备注: '' },
    { 排序: 2, 分类: '', 待办: 'Waiting item', 状态: '待处理', 跟进类型: '等待证据', 备注: '' },
    { 排序: 3, 分类: '', 待办: 'Monitoring item', 状态: '待处理', 跟进类型: '持续观察', 备注: '' },
    { 排序: 4, 分类: '', 待办: 'Actionable item', 状态: '待处理', 备注: '' }
  ];
  const { document, window } = loadDashboard(buildBootstrapWithTodos(todos), 'daily', {});
  window.selectTab('todos');
  const items = document.getElementById('ios-tab-content').children[0].children[2].children;
  const taskNames = items.map((li) => li.children[0].children[1].textContent);
  assert.deepEqual(taskNames, ['Actionable item', 'Monitoring item', 'Waiting item', 'Done item']);
});

test('refresh() re-fetches the whole bootstrap via google.script.run.getDashboardBootstrap and re-renders from it, on the currently active tab', () => {
  let refreshCalls = 0;
  const updatedBootstrap = Object.assign({}, DEMO_BOOTSTRAP, {
    daily: Object.assign({}, DEMO_BOOTSTRAP.daily, {
      summary: Object.assign({}, DEMO_BOOTSTRAP.daily.summary, { 一句话结论: 'updated after refresh' })
    })
  });
  const { document, window } = loadDashboard(DEMO_BOOTSTRAP, 'daily', {
    getDashboardBootstrap: () => { refreshCalls += 1; return updatedBootstrap; }
  });
  window.refresh();
  assert.equal(refreshCalls, 1);
  assert.match(summaryText(document), /updated after refresh/);
});
