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
    '排序': 1,
    '入场计划ID': '',
    '执行状态': '',
    '当前区间': '',
    '需要复核': '',
    '入场计划估值锚点': '',
    '入场计划版本': '',
    '入场计划数据时间': '',
    '行情截至时间': '',
    '当前阻碍': '',
    '下次检查': '',
    '停止条件说明': '',
    '较上次变化说明': '',
    '准备状态': '',
    '建议限价': '',
    '建议订单规模说明': '',
    '计划订单有效期': '',
    '跳空处理提示': '',
    '最近订单状态': '',
    // What Code.gs's applyReaderGate_ attaches to a current-epoch row (Issue #316 P4).
    _iosOrderable: { ok: true, message: null }
  }, overrides);
  return {
    error: null,
    daily: {
      found: true,
      reportType: 'daily',
      readerGate: { threeLayer: false, current: true, banner: null },
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

/** Locates the rendered holding card's 执行状态 (Entry Plan) badge -- same slot as pricePositionBadge, since the two are mutually exclusive (Issue #298). */
function entryPlanBadge(document) {
  const card = document.getElementById('ios-tab-content').children[0].children[1].children[0];
  return card.children[3].children[1];
}

/** Locates the rendered holding card's 当前区间 label (3rd child of the 参考 line), or undefined if absent. */
function entryPlanZone(document) {
  const card = document.getElementById('ios-tab-content').children[0].children[1].children[0];
  return card.children[3].children[2];
}

/** The 参考 line's own child count -- used to assert no extra/duplicate badge is rendered alongside the one expected. */
function referenceLineChildCount(document) {
  const card = document.getElementById('ios-tab-content').children[0].children[1].children[0];
  return card.children[3].children.length;
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
  assert.equal(summaryContainer.children.length, 4, 'summary grid + headline card + report caption + layering (Issue #364), in that order');
  assert.ok(summaryContainer.children[0].classList.contains('ios-summary-grid'));
  assert.ok(summaryContainer.children[1].classList.contains('ios-headline-card'));
  assert.ok(summaryContainer.children[2].classList.contains('ios-report-caption'));
  assert.ok(summaryContainer.children[3].classList.contains('ios-layering'));
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
  // DEMO1 has an active 入场计划 (since Issue #298), so its primary display
  // is the plan's snapshotted anchor + 执行状态, not its legacy 参考买入价/
  // 区间 (still present in the underlying data, but no longer the row's
  // primary rendered text -- see the dedicated Entry Plan tests below).
  assert.match(portfolioText, /锚点: \$40/);
  assert.match(portfolioText, /等待价格/);
  // DEMO2's reference range is blank in the report-time snapshot, and it has
  // no 入场计划 -- must still render the explicit missing-value marker and
  // legacy 价格位置, never an empty string or omitted entirely (which would
  // look like a column-shift artifact).
  assert.match(portfolioText, /未设定/);
  assert.match(portfolioText, /价格位置[\s\S]*未知|未知/);
});

test('holding cards render the v1.1 content order -- 价格/参考(+价格位置)/变化/逻辑/验证 -- not a Thesis line', () => {
  const { document } = loadDashboard(DEMO_BOOTSTRAP, 'daily', {});
  const portfolioText = tabText(document);
  assert.match(portfolioText, /价格: 41\.2/);
  // DEMO1 has an active plan, so its second line is the plan anchor, not
  // the legacy 参考 line -- see the dedicated Entry Plan tests below for
  // that a plan-free row (e.g. DEMO2) still renders 参考(+价格位置).
  assert.match(portfolioText, /锚点: \$40 附近/);
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

// -- Entry Plan display (Issue #298, schema_version 4; PR #299 review) --
//
// The branch is selected by whether 入场计划ID is populated, NOT by
// whether 执行状态 is populated (PR #299 review finding #2): an active
// plan can exist with 执行状态 blank because this run's source data was
// insufficient to evaluate it, which must render an explicit neutral
// "status unavailable" badge, never a silent fall-through to the legacy
// 价格位置 badge. A row with no active plan (入场计划ID blank) must render
// exactly as it did before this feature -- 参考买入价/区间 + 价格位置.

test('入场计划ID present: the five canonical 执行状态 values map to distinct, sensible badge classes', () => {
  const start = loadDashboard(buildBootstrapWithHolding({ '入场计划ID': 'plan-1', '执行状态': '可小额开始' }), 'daily', {});
  const near = loadDashboard(buildBootstrapWithHolding({ '入场计划ID': 'plan-1', '执行状态': '接近区间' }), 'daily', {});
  const waitPrice = loadDashboard(buildBootstrapWithHolding({ '入场计划ID': 'plan-1', '执行状态': '等待价格' }), 'daily', {});
  const waitConfirm = loadDashboard(buildBootstrapWithHolding({ '入场计划ID': 'plan-1', '执行状态': '等待确认' }), 'daily', {});
  const pause = loadDashboard(buildBootstrapWithHolding({ '入场计划ID': 'plan-1', '执行状态': '暂停复核' }), 'daily', {});

  assert.ok(entryPlanBadge(start.document).classList.contains('ios-severity-low'));
  assert.ok(entryPlanBadge(near.document).classList.contains('ios-severity-medium'));
  assert.equal(entryPlanBadge(waitPrice.document).className, 'ios-badge ios-badge-entry-plan', '等待价格 is neutral -- the plain plan-badge look, no extra tier class');
  assert.ok(entryPlanBadge(waitConfirm.document).classList.contains('ios-badge-price-position'));
  assert.ok(entryPlanBadge(pause.document).classList.contains('ios-severity-high'), '暂停复核 is the highest-attention tier -- a signal to stop and re-evaluate');

  assert.equal(entryPlanBadge(start.document).textContent, '可小额开始');
  assert.equal(entryPlanBadge(pause.document).textContent, '暂停复核');
});

test('入场计划ID present: an unrecognized or legacy 执行状态 value keeps its raw text and falls back to the plain neutral entry-plan badge', () => {
  const { document } = loadDashboard(buildBootstrapWithHolding({ '入场计划ID': 'plan-1', '执行状态': '一个从没见过的执行状态' }), 'daily', {});
  const badge = entryPlanBadge(document);
  assert.equal(badge.textContent, '一个从没见过的执行状态');
  assert.equal(badge.className, 'ios-badge ios-badge-entry-plan');
});

test('入场计划ID present but 执行状态 blank: renders an explicit neutral "status unavailable" badge, never the legacy 价格位置 badge (PR #299 review finding #2)', () => {
  const { document } = loadDashboard(buildBootstrapWithHolding({ '入场计划ID': 'plan-1', '执行状态': '', '价格位置': '低于区间' }), 'daily', {});
  const badge = entryPlanBadge(document);
  assert.equal(badge.textContent, '状态不可用');
  assert.equal(badge.className, 'ios-badge ios-badge-entry-plan ios-badge-unavailable');
  assert.equal(referenceLineChildCount(document), 2, '锚点文本 + 不可用徽章 only -- 价格位置 must never appear alongside an active plan');
});

test('入场计划ID present: 入场计划估值锚点 renders as "锚点: ..." replacing the legacy "参考: ..." text', () => {
  const { document } = loadDashboard(buildBootstrapWithHolding({ '入场计划ID': 'plan-1', '执行状态': '等待价格', '入场计划估值锚点': '$100 附近' }), 'daily', {});
  const card = document.getElementById('ios-tab-content').children[0].children[1].children[0];
  assert.equal(card.children[3].children[0].textContent, '锚点: $100 附近');
});

test('入场计划ID present but 入场计划估值锚点 blank: anchor text falls back to an explicit "未知", never fabricated or omitted', () => {
  const { document } = loadDashboard(buildBootstrapWithHolding({ '入场计划ID': 'plan-1', '执行状态': '等待价格', '入场计划估值锚点': '' }), 'daily', {});
  const card = document.getElementById('ios-tab-content').children[0].children[1].children[0];
  assert.equal(card.children[3].children[0].textContent, '锚点: 未知');
});

test('入场计划ID present: 当前区间 renders as an additional label alongside the badge when present', () => {
  const { document } = loadDashboard(buildBootstrapWithHolding({ '入场计划ID': 'plan-1', '执行状态': '接近区间', '当前区间': '区间1' }), 'daily', {});
  assert.equal(entryPlanZone(document).textContent, '区间1');
  assert.equal(referenceLineChildCount(document), 3, '锚点文本 + 执行状态徽章 + 当前区间标签，且没有额外的价格位置徽章');
});

test('入场计划ID present: blank 当前区间 does not render an empty zone label', () => {
  const { document } = loadDashboard(buildBootstrapWithHolding({ '入场计划ID': 'plan-1', '执行状态': '等待价格', '当前区间': '' }), 'daily', {});
  assert.equal(referenceLineChildCount(document), 2, '锚点文本 + 执行状态徽章 only, no empty 当前区间 slot');
});

test('入场计划ID present supersedes 价格位置 -- the two never render as competing badges on the same row', () => {
  const { document } = loadDashboard(buildBootstrapWithHolding({ '入场计划ID': 'plan-1', '执行状态': '暂停复核', '当前区间': '低于全部区间', '价格位置': '低于区间' }), 'daily', {});
  assert.equal(entryPlanBadge(document).textContent, '暂停复核', 'the plan-based badge wins the one badge slot');
  assert.equal(referenceLineChildCount(document), 3, '只有执行状态徽章 + 当前区间，价格位置徽章被压制，不会同时出现两个徽章');
});

test('入场计划ID blank (no active plan) falls back to the legacy 参考买入价/区间 + 价格位置 rendering, unchanged from before this feature -- even if 执行状态 is somehow non-blank', () => {
  const { document } = loadDashboard(buildBootstrapWithHolding({ '入场计划ID': '', '执行状态': '', '当前区间': '', '价格位置': '区间内' }), 'daily', {});
  assert.ok(pricePositionBadge(document).classList.contains('ios-severity-low'));
  assert.equal(referenceLineChildCount(document), 2, '参考文本 + 价格位置徽章 only, matching the pre-Issue-#298 shape');
  const card = document.getElementById('ios-tab-content').children[0].children[1].children[0];
  assert.match(card.children[3].children[0].textContent, /^参考: /);
});

test('demo dataset: DEMO1 (has an active 入场计划) renders its snapshotted anchor + 执行状态 badge; DEMO2 (no plan) still falls back to 价格位置', () => {
  const { document } = loadDashboard(DEMO_BOOTSTRAP, 'daily', {});
  const cards = document.getElementById('ios-tab-content').children[0].children[1].children;
  const demo1Card = cards.find((card) => card.children[0].children[0].textContent === 'DEMO1');
  const demo2Card = cards.find((card) => card.children[0].children[0].textContent === 'DEMO2');
  const demo1Badge = demo1Card.children[3].children[1];
  const demo2Badge = demo2Card.children[3].children[1];
  assert.equal(demo1Card.children[3].children[0].textContent, '锚点: $40 附近（示例，Deep Dive 更新后的锚点）');
  assert.equal(demo1Badge.textContent, '等待价格', 'DEMO1 has an active plan-demo1-v2 in the demo fixture');
  assert.equal(demo1Card.children[3].children[2].textContent, '高于全部区间');
  assert.match(demo2Card.children[3].children[0].textContent, /^参考: /, 'DEMO2 has no 入场计划 row -- falls back to the legacy 参考 text');
  assert.equal(demo2Badge.textContent, '未知', 'DEMO2 has no 入场计划 row -- falls back to its legacy 价格位置');
});

// -- Entry Plan execution-explanation lines (Issue #303 Phase 1, schema_version 5) --
//
// Layered strictly after the schema_version 4 reference line (card.children[3])
// above -- these render at card.children[4] onward, in the fixed order:
// freshness line (入场计划版本/入场计划数据时间/行情截至时间, combined), then
// 当前阻碍, 下次检查, 停止条件说明, 较上次变化说明, each shown only when
// present. A Sheet without these columns (all seven blank, the default in
// buildBootstrapWithHolding) must render identically to the pre-Phase-1 card
// shape -- card.children.length stays 4, no extra lines at all.

/** Returns the holding card's children beyond the reference line (index 4+), i.e. the Phase 1 explanation lines actually rendered. */
function entryPlanExplanationLines(document) {
  const card = document.getElementById('ios-tab-content').children[0].children[1].children[0];
  return card.children.slice(4);
}

test('schema_version 5 columns all blank: renders exactly the same card shape as before Issue #303 Phase 1 existed -- no extra lines', () => {
  const { document } = loadDashboard(buildBootstrapWithHolding({ '入场计划ID': 'plan-1', '执行状态': '等待价格' }), 'daily', {});
  assert.equal(entryPlanExplanationLines(document).length, 0);
});

test('入场计划版本/入场计划数据时间/行情截至时间 render together as one muted freshness line, in that order', () => {
  const { document } = loadDashboard(buildBootstrapWithHolding({
    '入场计划ID': 'plan-1', '执行状态': '等待价格',
    '入场计划版本': 2, '入场计划数据时间': '2026-08-10', '行情截至时间': '2026-10-13 收盘'
  }), 'daily', {});
  const lines = entryPlanExplanationLines(document);
  assert.equal(lines.length, 1);
  assert.ok(lines[0].classList.contains('ios-entry-plan-freshness'));
  assert.equal(lines[0].textContent, '计划 v2 · 计划更新: 2026-08-10 · 行情截至: 2026-10-13 收盘');
});

test('freshness line omits whichever of the three parts is blank, rather than rendering an empty segment', () => {
  const { document } = loadDashboard(buildBootstrapWithHolding({
    '入场计划ID': 'plan-1', '执行状态': '等待价格',
    '入场计划版本': 2, '入场计划数据时间': '', '行情截至时间': ''
  }), 'daily', {});
  const lines = entryPlanExplanationLines(document);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].textContent, '计划 v2');
});

test('当前阻碍/下次检查/停止条件说明/较上次变化说明 each render as their own labeled line, in that fixed order', () => {
  const { document } = loadDashboard(buildBootstrapWithHolding({
    '入场计划ID': 'plan-1', '执行状态': '等待确认',
    '当前阻碍': '技术确认条件尚未满足', '下次检查': '等待下一次正式收盘确认',
    '停止条件说明': '不追高条件：单周涨幅超过 15%', '较上次变化说明': '继续等待，无变化'
  }), 'daily', {});
  const lines = entryPlanExplanationLines(document);
  assert.deepEqual(lines.map((line) => line.textContent), [
    '阻碍: 技术确认条件尚未满足',
    '下次检查: 等待下一次正式收盘确认',
    '停止条件: 不追高条件：单周涨幅超过 15%',
    '较上次变化: 继续等待，无变化'
  ]);
  lines.forEach((line) => assert.ok(!line.classList.contains('ios-entry-plan-incomplete'), '普通说明文字不应带有"计划未完善"样式'));
});

test('a "计划未完善：..." value gets the distinct incomplete-plan style, never the same look as a normal explanation line', () => {
  const { document } = loadDashboard(buildBootstrapWithHolding({
    '入场计划ID': 'plan-1', '执行状态': '等待确认',
    '当前阻碍': '计划未完善：未设置技术确认条件，暂无法说明阻碍'
  }), 'daily', {});
  const lines = entryPlanExplanationLines(document);
  assert.equal(lines.length, 1);
  assert.ok(lines[0].classList.contains('ios-entry-plan-incomplete'));
  assert.equal(lines[0].textContent, '阻碍: 计划未完善：未设置技术确认条件，暂无法说明阻碍');
});

test('round 2 review correction: no active plan still renders 当前阻碍/下次检查 as a required safety explanation (Issue #303 scenario 1), never silently blank, alongside the unchanged legacy reference display', () => {
  const { document } = loadDashboard(buildBootstrapWithHolding({
    '入场计划ID': '', '执行状态': '', '价格位置': '区间内',
    '当前阻碍': '无可靠 active 入场计划，研究或估值尚未完成',
    '下次检查': '建议先完成研究/估值，由 Deep Dive 制定入场计划；在此之前，参考价/区间不构成下单授权'
  }), 'daily', {});
  const lines = entryPlanExplanationLines(document);
  assert.equal(lines.length, 2, '当前阻碍/下次检查 render even though 入场计划ID is blank');
  assert.equal(lines[0].textContent, '阻碍: 无可靠 active 入场计划，研究或估值尚未完成');
  assert.ok(lines[0].classList.contains('ios-entry-plan-incomplete'), '"无可靠" 前缀也应触发醒目样式');
  assert.equal(lines[1].textContent, '下次检查: 建议先完成研究/估值，由 Deep Dive 制定入场计划；在此之前，参考价/区间不构成下单授权');
  assert.equal(referenceLineChildCount(document), 2, '仍然只渲染参考文本 + 价格位置徽章——两种显示并存，不是互斥');
});

test('round 2 review correction: no active plan leaves 入场计划版本/行情截至时间/停止条件说明/较上次变化说明 blank even when 当前阻碍/下次检查 are populated -- not all seven fields share one shape', () => {
  const { document } = loadDashboard(buildBootstrapWithHolding({
    '入场计划ID': '', '执行状态': '',
    '当前阻碍': '无可靠 active 入场计划，研究或估值尚未完成',
    '下次检查': '建议先完成研究/估值'
  }), 'daily', {});
  const lines = entryPlanExplanationLines(document);
  assert.equal(lines.length, 2, '只有 当前阻碍/下次检查 两行，没有新鲜度行或停止条件/较上次变化行');
});

test('round 2 review correction: "无法确认：..." (evaluation data missing) gets the same distinct incomplete-plan style as "计划未完善：..."', () => {
  const { document } = loadDashboard(buildBootstrapWithHolding({
    '入场计划ID': 'plan-1', '执行状态': '',
    '当前阻碍': '无法确认：当前价格缺失',
    '下次检查': '无法确认：等待下次价格数据可用后重新评估',
    '停止条件说明': '示例：不追高条件触发暂停加仓',
    '较上次变化说明': '无法确认：本次评估数据缺失，暂无法确定执行状态较上次的变化'
  }), 'daily', {});
  const lines = entryPlanExplanationLines(document);
  assert.equal(lines.length, 4);
  assert.ok(lines[0].classList.contains('ios-entry-plan-incomplete'), '阻碍: 无法确认 应触发醒目样式');
  assert.ok(lines[1].classList.contains('ios-entry-plan-incomplete'), '下次检查: 无法确认 应触发醒目样式');
  assert.ok(!lines[2].classList.contains('ios-entry-plan-incomplete'), '停止条件说明 来自计划自身条件，评估数据缺失不影响它');
  assert.ok(lines[3].classList.contains('ios-entry-plan-incomplete'), '较上次变化: 无法确认 应触发醒目样式');
});

test('round 2 review correction: 执行状态=可小额开始 lets 当前阻碍 stay blank while 下次检查 still carries content (下次检查 has no blank case of its own)', () => {
  const { document } = loadDashboard(buildBootstrapWithHolding({
    '入场计划ID': 'plan-1', '执行状态': '可小额开始',
    '当前阻碍': '', '下次检查': '按计划区间执行后，等待下一次财报验证自由现金流'
  }), 'daily', {});
  const lines = entryPlanExplanationLines(document);
  assert.equal(lines.length, 1);
  assert.match(lines[0].textContent, /^下次检查: /);
});

test('round 2 review correction: 行情截至时间 blank without a distinct as-of label is not an incomplete-plan case -- no warning style, no fabricated time', () => {
  const { document } = loadDashboard(buildBootstrapWithHolding({
    '入场计划ID': 'plan-1', '执行状态': '等待价格', '入场计划版本': 2, '行情截至时间': ''
  }), 'daily', {});
  const lines = entryPlanExplanationLines(document);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].textContent, '计划 v2');
  assert.ok(!lines[0].classList.contains('ios-entry-plan-incomplete'));
});

test('round 2 review correction: 停止条件说明/较上次变化说明 stay populated when 执行状态 is blank but the plan was reliably selected (price missing), not blanked alongside 执行状态', () => {
  const { document } = loadDashboard(buildBootstrapWithHolding({
    '入场计划ID': 'plan-1', '执行状态': '', '当前区间': '',
    '入场计划版本': 2, '入场计划数据时间': '2026-08-10',
    '当前阻碍': '无法确认：当前价格缺失', '下次检查': '无法确认：等待下次价格数据可用后重新评估',
    '停止条件说明': '示例：不追高条件触发暂停加仓',
    '较上次变化说明': '无法确认：本次评估数据缺失，暂无法确定执行状态较上次的变化'
  }), 'daily', {});
  const lines = entryPlanExplanationLines(document);
  assert.equal(lines.length, 5, '1 条新鲜度行 + 当前阻碍/下次检查/停止条件/较上次变化 四行，没有因为执行状态留空而跟着清空');
});

test('demo dataset: DEMO1 renders its Issue #303 Phase 1 freshness line and all four explanation lines', () => {
  const { document } = loadDashboard(DEMO_BOOTSTRAP, 'daily', {});
  const cards = document.getElementById('ios-tab-content').children[0].children[1].children;
  const demo1Card = cards.find((card) => card.children[0].children[0].textContent === 'DEMO1');
  // slice(4, 9), not slice(4) -- DEMO1's demo row also has 关键变化/长期逻辑或估值/
  // 下一验证点 populated, which render as three further narrative lines right
  // after these five Phase 1 lines; this test only asserts the Phase 1 slice.
  const lines = demo1Card.children.slice(4, 9);
  assert.equal(lines.length, 5, '1 条新鲜度行 + 4 条说明行');
  assert.equal(lines[0].textContent, '计划 v2 · 计划更新: 2026-08-10 · 行情截至: 2026-08-15 收盘');
  assert.match(lines[1].textContent, /^阻碍: /);
  assert.match(lines[2].textContent, /^下次检查: /);
  assert.match(lines[3].textContent, /^停止条件: /);
  assert.equal(lines[4].textContent, '较上次变化: 示例：首次评估，无可比历史');
});

// -- Order preparation lines (Issue #303 Phase 2, schema_version 6) --
//
// Layered strictly after the schema_version 5 explanation lines above
// (entryPlanExplanationLines) -- these render immediately following
// whatever Phase 1 lines were produced. A Sheet without these six columns
// (all blank, the default in buildBootstrapWithHolding) must render
// identically to the pre-Phase-2 card shape -- no extra lines at all.

/**
 * Returns the holding card's children beyond the reference line, i.e. the
 * Phase 2 order-prep lines actually rendered. Every fixture below
 * deliberately leaves the Phase 1 explanation fields (当前阻碍/下次检查/
 * 停止条件说明/较上次变化说明/freshness) blank, so index 4 is exactly where
 * Phase 2 lines begin -- this must NOT be computed by subtracting
 * entryPlanExplanationLines(document).length, because that helper's own
 * card.children.slice(4) would already include these same Phase 2 lines
 * whenever Phase 1 contributes nothing, double-counting them away.
 */
function orderPrepLines(document) {
  const card = document.getElementById('ios-tab-content').children[0].children[1].children[0];
  return card.children.slice(4);
}

test('schema_version 6 order-prep columns all blank: renders exactly the same card shape as before Issue #303 Phase 2 existed -- no extra lines', () => {
  const { document } = loadDashboard(buildBootstrapWithHolding({ '入场计划ID': 'plan-1', '执行状态': '可小额开始' }), 'daily', {});
  assert.equal(orderPrepLines(document).length, 0);
});

test('准备状态 renders as its own labeled badge line, distinct from the 执行状态 badge in the reference line', () => {
  const { document } = loadDashboard(buildBootstrapWithHolding({
    '入场计划ID': 'plan-1', '执行状态': '可小额开始', '准备状态': '可准备订单'
  }), 'daily', {});
  const lines = orderPrepLines(document);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].textContent, '订单准备: 可准备订单');
  const badge = lines[0].children[1];
  assert.ok(badge.classList.contains('ios-badge-order-prep'));
  assert.ok(badge.classList.contains('ios-severity-low'), '可准备订单 应映射到低严重度（正面）徽章样式');
});

test('计划未完善停在核对 maps to the unavailable/needs-attention badge tier', () => {
  const { document } = loadDashboard(buildBootstrapWithHolding({
    '入场计划ID': 'plan-1', '执行状态': '可小额开始', '准备状态': '计划未完善停在核对'
  }), 'daily', {});
  const lines = orderPrepLines(document);
  const badge = lines[0].children[1];
  assert.ok(badge.classList.contains('ios-badge-unavailable'));
});

test('已有有效订单不重复建议/无需准备 both map to the muted badge tier', () => {
  ['已有有效订单不重复建议', '无需准备'].forEach((value) => {
    const { document } = loadDashboard(buildBootstrapWithHolding({
      '入场计划ID': 'plan-1', '执行状态': '可小额开始', '准备状态': value
    }), 'daily', {});
    const lines = orderPrepLines(document);
    assert.ok(lines[0].children[1].classList.contains('ios-badge-muted'), value + ' 应映射到静音徽章样式');
  });
});

test('建议限价/建议订单规模说明/计划订单有效期/最近订单状态/跳空处理提示 each render as their own labeled line, in that fixed order', () => {
  const { document } = loadDashboard(buildBootstrapWithHolding({
    '入场计划ID': 'plan-1', '执行状态': '可小额开始', '准备状态': '可准备订单',
    '建议限价': '区间1价格 $38', '建议订单规模说明': '区间1占比 40% x 计划新增仓位金额 $1000 = $400',
    '计划订单有效期': '当日有效', '最近订单状态': '未下单',
    '跳空处理提示': '跳空处理规则：跳空超过区间1限价时暂停，等待回落或人工复核'
  }), 'daily', {});
  const lines = orderPrepLines(document);
  assert.deepEqual(lines.map((line) => line.textContent), [
    '订单准备: 可准备订单',
    '建议限价: 区间1价格 $38',
    '建议规模: 区间1占比 40% x 计划新增仓位金额 $1000 = $400',
    '计划订单有效期: 当日有效',
    '最近订单状态: 未下单',
    '跳空处理提示: 跳空处理规则：跳空超过区间1限价时暂停，等待回落或人工复核'
  ]);
});

test('建议限价/建议订单规模说明 stay blank when 准备状态 is not 可准备订单 -- the Dashboard never fabricates a price/size the writer did not populate', () => {
  const { document } = loadDashboard(buildBootstrapWithHolding({
    '入场计划ID': 'plan-1', '执行状态': '可小额开始', '准备状态': '计划未完善停在核对',
    '计划订单有效期': '当日有效', '最近订单状态': '未知'
  }), 'daily', {});
  const lines = orderPrepLines(document);
  assert.deepEqual(lines.map((line) => line.textContent), [
    '订单准备: 计划未完善停在核对',
    '计划订单有效期: 当日有效',
    '最近订单状态: 未知'
  ]);
});

test('准备状态 blank (no active plan) renders no order-prep lines at all, even if other Phase 1 lines are present', () => {
  const { document } = loadDashboard(buildBootstrapWithHolding({
    '入场计划ID': '', '执行状态': '',
    '当前阻碍': '无可靠 active 入场计划，研究或估值尚未完成',
    '下次检查': '建议先完成研究/估值'
  }), 'daily', {});
  const card = document.getElementById('ios-tab-content').children[0].children[1].children[0];
  assert.equal(card.children.length, 6, '4 条基础行 + 当前阻碍/下次检查 两条 Phase 1 说明行，没有任何订单准备行');
  assert.equal(card.children[4].textContent, '阻碍: 无可靠 active 入场计划，研究或估值尚未完成');
  assert.equal(card.children[5].textContent, '下次检查: 建议先完成研究/估值');
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

test('watchlist candidates render separately from holdings and show their report-provided action', () => {
  const { document } = loadDashboard(DEMO_BOOTSTRAP, 'daily', {});
  const text = tabText(document);
  assert.match(text, /DEMOW1/);
  assert.match(text, /insufficient_evidence/);
  assert.doesNotMatch(text, /观察名单/, 'the section provides asset type; cards must not repeat the redundant badge');
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


function buildBootstrapWithWatchlistAction(action, reportType) {
  const candidate = { '代码': 'WATCH1', '名称': 'Watch Co.', 'IOS状态': action, 'Thesis状态': '', '关键变化': '', '长期逻辑或估值': '', '下一验证点': '', '参考买入价/区间': '', '当前价格': '', '价格位置': '未知', '优先级': '高', '排序': 1 };
  const report = { found: true, reportType, summary: { 报告ID: reportType + '-2026-09-05', 报告日期: '2026-09-05', 周期开始: '', 周期结束: '', 一句话结论: 'test headline', 核心状态: '正常', Review状态: '未Review', 当前持仓数: 0, 高优先级观察数: 1, 生成时间: '2026-09-05T09:00:00+09:00' }, holdings: [], watchlistCandidates: [candidate], risks: [], todos: [] };
  return { error: null, daily: reportType === 'daily' ? report : { found: false, reportType: 'daily' }, weekly: reportType === 'weekly' ? report : { found: false, reportType: 'weekly' }, dailyHistory: [], weeklyHistory: [], allocation: [] };
}

function watchlistActionBadge(document) {
  const section = document.getElementById('ios-tab-content').children[1];
  const card = section.children[2].children[0];
  return card.children[0].children[1];
}

test('watchlist cards use the stored canonical IOS action instead of a redundant 观察名单 badge', () => {
  const { document } = loadDashboard(buildBootstrapWithWatchlistAction('研究建仓', 'daily'), 'daily', {});
  const badge = watchlistActionBadge(document);
  assert.equal(badge.textContent, '研究建仓');
  assert.ok(badge.classList.contains('ios-severity-low'));
  assert.ok(!badge.classList.contains('ios-badge-watchlist'));
});

test('canonical watchlist action badges keep action, priority, and price position separate', () => {
  const { document } = loadDashboard(buildBootstrapWithWatchlistAction('等待价格', 'daily'), 'daily', {});
  const badge = watchlistActionBadge(document);
  assert.equal(badge.textContent, '等待价格');
  assert.ok(badge.classList.contains('ios-severity-medium'));
  const cardText = document.getElementById('ios-tab-content').children[1].children[2].children[0].textContent;
  assert.match(cardText, /未知/, 'price-position snapshot stays separately visible');
  assert.doesNotMatch(cardText, /观察名单/, 'the candidate section supplies asset type; the card does not repeat it');
});

test('the same renderer preserves stored canonical watchlist actions for Weekly and history reports', () => {
  const bootstrap = buildBootstrapWithWatchlistAction('降低优先级', 'weekly');
  const { document, window } = loadDashboard(bootstrap, 'weekly', { getReport: () => { const result = JSON.parse(JSON.stringify(bootstrap.weekly)); result.error = null; return result; } });
  assert.equal(watchlistActionBadge(document).textContent, '降低优先级');
  assert.ok(watchlistActionBadge(document).classList.contains('ios-badge-muted'));
  window.selectHistoryReport('weekly-2026-09-05');
  assert.equal(watchlistActionBadge(document).textContent, '降低优先级');
});

test('every canonical watchlist action has a deterministic mapping and unknown legacy values remain neutral', () => {
  const expected = { '研究建仓': 'ios-severity-low', '等待估值': 'ios-severity-medium', '等待价格': 'ios-severity-medium', '继续观察': '', '降低优先级': 'ios-badge-muted' };
  for (const [action, className] of Object.entries(expected)) {
    const { document } = loadDashboard(buildBootstrapWithWatchlistAction(action, 'daily'), 'daily', {});
    const badge = watchlistActionBadge(document);
    assert.equal(badge.textContent, action);
    if (className) assert.ok(badge.classList.contains(className)); else assert.equal(badge.className, 'ios-badge');
  }
  const { document } = loadDashboard(buildBootstrapWithWatchlistAction('历史自定义动作', 'daily'), 'daily', {});
  assert.equal(watchlistActionBadge(document).className, 'ios-badge');
  assert.equal(watchlistActionBadge(document).textContent, '历史自定义动作');
});

// -- Action-first card (Issue #306, schema_version 7) --
//
// A row carrying 今日行动 renders one primary conclusion first; quotes,
// the valuation anchor, 执行状态 and research narrative move into a
// collapsed <details> block. Rows without 今日行动 keep their own layout.

function firstCard(document) {
  return document.getElementById('ios-tab-content').children[0].children[1].children[0];
}

function firstScreenText(card) {
  return card.children.filter((c) => c.tagName !== 'DETAILS').map((c) => c.textContent).join('\n');
}

function detailsOf(card) {
  return card.children.find((c) => c.tagName === 'DETAILS');
}

function allElements(node) {
  return (node.children || []).reduce((acc, c) => acc.concat([c], allElements(c)), []);
}

// Synthetic GOOGL-like row: a quote, a valuation anchor and a plan range
// coexist, 执行状态=可小额开始, but order feedback is missing.
const GOOGL_LIKE_MISSING_FEEDBACK = {
  '代码': 'GOOGL', '名称': 'Alphabet (synthetic)', 'IOS状态': '研究建仓',
  '当前价格': 171.4, '行情截至时间': '2026-10-14 收盘（美东）',
  '入场计划ID': 'plan-googl-v3', '执行状态': '可小额开始', '当前区间': '区间1',
  '入场计划估值锚点': '$190 附近', '入场计划版本': 3, '入场计划数据时间': '2026-10-01',
  '当前阻碍': '无法确认：入场执行反馈 中区间1 没有任何记录，缺少订单记录不等于未下单',
  '下次检查': '补录区间1 订单状态后，下一次 Daily 重新评估',
  '准备状态': '无法确认', '计划订单有效期': '当日有效',
  '今日行动': '先核对缺项',
  '今日行动说明': '现在不挂单：先在 入场执行反馈 补录区间1 是否已有订单；补录后由下一次 Daily（东京时间工作日 09:00）重新判断',
  '计划买入上限': '需补全：区间1 只给出范围 165-175，计划未写明最高买入价'
};

test('Issue #306 GOOGL-like: missing order feedback -> first screen says 先核对缺项, no quote/anchor/可小额开始 competes, no guessed price', () => {
  const { document } = loadDashboard(buildBootstrapWithHolding(GOOGL_LIKE_MISSING_FEEDBACK), 'daily', {});
  const card = firstCard(document);
  const head = card.children[0];
  assert.equal(head.children[1].textContent, '无法判断');
  assert.ok(head.children[1].classList.contains('ios-badge-unavailable'));
  const first = firstScreenText(card);
  assert.match(first, /无法判断原因: 无法确认/);
  assert.match(first, /需要: 现在不挂单/);
  assert.match(first, /最高 未确定（区间1 只给出范围 165-175，计划未写明最高买入价）/);
  assert.match(first, /市价: 171\.4 · 截至 2026-10-14 收盘（美东） · 行情属性未提供（非下单价）/, '市价只作为报告时行情展示，标明非下单价');
  assert.match(first, /阻塞待办: 本报告版本未提供关联/);
  assert.doesNotMatch(first, /\$190/, '估值锚点不能出现在首屏');
  assert.doesNotMatch(first, /可小额开始/, '可小额开始 不能和主结论争夺首屏');
  assert.doesNotMatch(first, /已校验订单限价/);
  assert.doesNotMatch(first, /(限价|上限|买入价)[:：] ?\$?17\d/, '只有范围时不能出现猜出来的单点价（区间上沿或现价）');
  const noGreen = allElements(card).every((node) => !node.classList || !node.classList.contains('ios-severity-low'));
  assert.ok(noGreen, '订单无法确认时整张卡片不能有任何绿色主动作样式');
});

test('Issue #306: research detail sits in a <details> block collapsed by default, with the four price kinds labelled', () => {
  const { document } = loadDashboard(buildBootstrapWithHolding(GOOGL_LIKE_MISSING_FEEDBACK), 'daily', {});
  const details = detailsOf(firstCard(document));
  assert.ok(details, '研究详情必须放在 details 里');
  assert.equal(details.getAttribute('open'), null, 'details 默认折叠');
  assert.equal(details.children[0].tagName, 'SUMMARY');
  const t = details.textContent;
  assert.match(t, /研究建议: 研究建仓/);
  assert.match(t, /内部行动: 先核对缺项/);
  assert.match(t, /长期估值锚点: \$190 附近（研究判断，非订单限价）/);
  assert.match(t, /计划条件: 可小额开始/);
  assert.match(t, /订单准备: 无法确认/);
  const planBadge = allElements(details).find((n) => n.textContent === '可小额开始' && n.classList && n.classList.contains('ios-badge'));
  assert.ok(planBadge.classList.contains('ios-badge-muted'));
  assert.ok(!planBadge.classList.contains('ios-severity-low'));
});

test('Issue #306: a defined plan cap with no orderable order shows as conditional, never as a validated limit', () => {
  const { document } = loadDashboard(buildBootstrapWithHolding({
    '入场计划ID': 'plan-1', '执行状态': '可小额开始', '准备状态': '计划未完善停在核对',
    '今日行动': '先核对缺项', '今日行动说明': '现在不挂单：计划缺少订单资金账户与交易单位确认，等待下次 Weekly Deep Dive 补全',
    '计划买入上限': '180 USD（区间1）', '建议限价': ''
  }), 'daily', {});
  const first = firstScreenText(firstCard(document));
  assert.match(first, /最高 180 USD（区间1）/);
  assert.match(first, /条件性范围，当前未满足条件，尚不可据此下单/);
  assert.doesNotMatch(first, /已校验订单限价/);
});

test('Issue #306: 建议限价 is never promoted to a validated limit unless the writer said 可人工准备限价单', () => {
  const { document } = loadDashboard(buildBootstrapWithHolding({
    '入场计划ID': 'plan-1', '准备状态': '已有有效订单不重复建议', '今日行动': '已有订单勿重复',
    '今日行动说明': '区间1 已有挂单，不要重复下单，请与券商记录核对',
    '建议限价': '180 USD', '计划买入上限': '180 USD（区间1）'
  }), 'daily', {});
  const first = firstScreenText(firstCard(document));
  assert.doesNotMatch(first, /已校验订单限价/);
  assert.match(first, /尚不可据此下单/);
});

test('Issue #306 positive case: 可人工准备限价单 shows one clear limit-order preparation with price/size/validity and manual submission', () => {
  const { document } = loadDashboard(buildBootstrapWithHolding({
    '入场计划ID': 'plan-1', '执行状态': '可小额开始', '准备状态': '可准备订单', '当前价格': 176.2,
    '今日行动': '可人工准备限价单',
    '今日行动说明': '今天（美东交易日）可人工准备一笔限价单，最高 180 USD，当日有效；开盘跳空高于 180 不追价、不提价，未成交按反馈处理',
    '建议限价': '180 USD', '建议订单规模说明': '约 2,000 USD（区间1 占比 40% x 计划基数 5,000 USD）',
    '计划订单有效期': '当日有效', '跳空处理提示': '开盘高于限价则不追价', '计划买入上限': '180 USD（区间1）',
    '阻塞待办ID': '无'
  }), 'daily', {});
  const card = firstCard(document);
  assert.ok(card.children[0].children[1].classList.contains('ios-severity-low'));
  const first = firstScreenText(card);
  assert.equal(card.children[0].children[1].textContent, '适合买入');
  assert.match(first, /已校验订单限价: 180 USD（人工复查后手工提交）/);
  assert.match(first, /规模: 约 2,000 USD.* · 有效期: 当日有效/);
  assert.match(first, /执行: 今天（美东交易日）可人工准备一笔限价单/, '正向案例首屏必须给出执行时段');
  assert.match(detailsOf(card).textContent, /跳空处理: 开盘高于限价则不追价/);
  assert.match(first, /市价: 176\.2（非下单价）|市价: 176\.2 ·/);
  assert.doesNotMatch(first, /(已校验订单限价|最高)[:：]? ?176\.2/, '现价不能替代计划限价');
});

test('Issue #306: no plan reads 建议买入范围: 无; unknown 今日行动 renders as 无法判断, never as ready', () => {
  const { document } = loadDashboard(buildBootstrapWithHolding({
    '今日行动': '马上买入', '今日行动说明': 'x'
  }), 'daily', {});
  const card = firstCard(document);
  const badge = card.children[0].children[1];
  assert.equal(badge.textContent, '无法判断', '未知 今日行动 一律落到 无法判断');
  assert.equal(badge.className, 'ios-badge ios-badge-today-verdict ios-badge-unavailable');
  assert.match(firstScreenText(card), /建议买入范围: 无（没有可用的入场计划）/);
});

test('Issue #306: every canonical 今日行动 value except 可人工准备限价单 avoids the green ready tier', () => {
  ['已有订单勿重复', '先核对缺项', '暂停新增待复核', '等待确认', '等待价格', '无入场计划'].forEach((value) => {
    const { document } = loadDashboard(buildBootstrapWithHolding({ '今日行动': value }), 'daily', {});
    const badge = firstCard(document).children[0].children[1];
    assert.ok(!badge.classList.contains('ios-severity-low'), value);
  });
});

test('Issue #306: a pre-schema_version-7 row (no 今日行动) keeps its historical layout, no details block', () => {
  const { document } = loadDashboard(buildBootstrapWithHolding({
    '入场计划ID': 'plan-1', '执行状态': '可小额开始', '准备状态': '无法确认'
  }), 'daily', {});
  const card = firstCard(document);
  assert.equal(detailsOf(card), undefined);
  assert.match(card.textContent, /订单准备: 无法确认/);
});

test('Issue #306 / PR #307 review: 可人工准备限价单 with missing order fields renders a neutral incomplete state, no ready badge, no validated limit', () => {
  [
    { '建议限价': '', '建议订单规模说明': '约 2,000 USD', '计划订单有效期': '当日有效' },
    { '建议限价': '180 USD', '建议订单规模说明': '', '计划订单有效期': '当日有效' },
    { '建议限价': '180 USD', '建议订单规模说明': '约 2,000 USD', '计划订单有效期': '' }
  ].forEach((fields) => {
    const { document } = loadDashboard(buildBootstrapWithHolding(Object.assign({
      '入场计划ID': 'plan-1', '执行状态': '可小额开始', '准备状态': '可准备订单', '今日行动': '可人工准备限价单',
      '今日行动说明': '今天可人工准备一笔限价单', '计划买入上限': '180 USD（区间1）'
    }, fields)), 'daily', {});
    const card = firstCard(document);
    const badge = card.children[0].children[1];
    assert.equal(badge.textContent, '无法判断');
    assert.ok(badge.classList.contains('ios-badge-unavailable'));
    const noGreen = allElements(card).every((node) => !node.classList || !node.classList.contains('ios-severity-low'));
    assert.ok(noGreen, JSON.stringify(fields));
    const first = firstScreenText(card);
    assert.match(first, /缺少 .*，请勿据此下单/);
    assert.doesNotMatch(first, /已校验订单限价/);
  });
});

test('PR #307 round-2 review: a contradictory 可人工准备限价单 row (paused or otherwise inconsistent plan) fails closed even with every order field present', () => {
  [
    { '执行状态': '暂停复核', '准备状态': '可准备订单' },
    { '执行状态': '等待价格', '准备状态': '可准备订单' },
    { '执行状态': '', '准备状态': '可准备订单' },
    { '执行状态': '可小额开始', '准备状态': '无法确认' }
  ].forEach((states) => {
    const { document } = loadDashboard(buildBootstrapWithHolding(Object.assign({
      '入场计划ID': 'plan-1', '今日行动': '可人工准备限价单', '今日行动说明': '今天可人工准备一笔限价单',
      '建议限价': '180 USD', '建议订单规模说明': '约 2,000 USD', '计划订单有效期': '当日有效',
      '计划买入上限': '180 USD（区间1）'
    }, states)), 'daily', {});
    const card = firstCard(document);
    const badge = card.children[0].children[1];
    assert.equal(badge.textContent, '无法判断', JSON.stringify(states));
    assert.ok(badge.classList.contains('ios-badge-unavailable'));
    const noGreen = allElements(card).every((node) => !node.classList || !node.classList.contains('ios-severity-low'));
    assert.ok(noGreen, JSON.stringify(states));
    const first = firstScreenText(card);
    assert.match(first, /与之矛盾，请勿据此下单/);
    assert.doesNotMatch(first, /已校验订单限价/, '不能从 UI 字段推断出订单');
  });
});

test('Issue #306 decision 4: a pre-schema-7 plan row keeps its layout but is labelled as a dated snapshot, not today\'s action', () => {
  const { document } = loadDashboard(buildBootstrapWithHolding({
    '报告日期': '2026-08-15', '入场计划ID': 'plan-1', '执行状态': '可小额开始', '行情截至时间': '2026-08-15 收盘'
  }), 'daily', {});
  const card = firstCard(document);
  assert.equal(detailsOf(card), undefined, '旧行不改版式');
  const last = card.children[card.children.length - 1];
  assert.equal(last.textContent, '报告 2026-08-15 快照（行情截至 2026-08-15 收盘），非今日行动');
});

// -- Issue #306 five-item first screen (schema_version 8) --------------------

function withTodos(bootstrap, todos) {
  bootstrap.daily.todos = todos;
  return bootstrap;
}

const V8_READY = {
  '入场计划ID': 'plan-1', '执行状态': '可小额开始', '准备状态': '可准备订单', '当前区间': '区间2',
  '当前价格': 168.4, '报价币种': 'USD', '行情截至时间': '2026-10-15 16:00 美东', '行情属性': '正式收盘',
  '今日行动': '可人工准备限价单',
  '今日行动说明': '下一个美东交易日开盘前人工准备限价单，最高 170 USD，当日有效；跳空高于 170 不追价',
  '建议限价': '170 USD', '建议订单规模说明': '约 2,000 USD', '计划订单有效期': '当日有效',
  '计划买入下限': '165 USD（区间2）', '计划买入上限': '170 USD（区间2）', '阻塞待办ID': '无',
  '入场计划估值锚点': '$190 附近', '入场计划版本': 4
};

test('Issue #306 v8: 适合买入 card shows the five items in order: quote, verdict, two-sided range with validated limit, execution, 阻塞待办: 无', () => {
  const { document } = loadDashboard(buildBootstrapWithHolding(V8_READY), 'daily', {});
  const card = firstCard(document);
  const badge = card.children[0].children[1];
  assert.equal(badge.textContent, '适合买入');
  assert.ok(badge.classList.contains('ios-severity-low'));
  const first = firstScreenText(card);
  assert.match(first, /今日建议/);
  assert.match(first, /市价: 168\.4 USD · 截至 2026-10-15 16:00 美东 · 正式收盘（非下单价）/);
  assert.match(first, /建议买入范围: 最低 165 USD（区间2） · 最高 170 USD（区间2）/);
  assert.match(first, /已校验订单限价: 170 USD（人工复查后手工提交）/);
  assert.match(first, /执行: 下一个美东交易日开盘前人工准备限价单/);
  assert.match(first, /阻塞待办: 无/);
  assert.doesNotMatch(first, /等待理由/, '适合买入 时不显示无意义的等待理由');
  assert.doesNotMatch(first, /\$190|计划 v4|可小额开始/, '估值锚点、计划版本、内部状态都折叠');
  assert.ok(first.indexOf('市价') < first.indexOf('建议买入范围'));
  assert.ok(first.indexOf('建议买入范围') < first.indexOf('阻塞待办'));
});

test('Issue #306 v8: 等待 keeps the known conditional range visible, gives the waiting reason, and never shows a validated limit', () => {
  const { document } = loadDashboard(buildBootstrapWithHolding(Object.assign({}, V8_READY, {
    '执行状态': '等待价格', '准备状态': '无需准备', '今日行动': '等待价格', '当前区间': '高于全部区间',
    '今日行动说明': '现价高于区间2，跌入 165–170 USD 后再由下一次 Daily 评估', '建议限价': '', '建议订单规模说明': ''
  })), 'daily', {});
  const card = firstCard(document);
  assert.equal(card.children[0].children[1].textContent, '等待');
  const first = firstScreenText(card);
  assert.match(first, /最低 165 USD（区间2） · 最高 170 USD（区间2）/);
  assert.match(first, /条件性范围，当前未满足条件，尚不可据此下单/);
  assert.match(first, /等待理由: 现价高于区间2/);
  assert.doesNotMatch(first, /已校验订单限价/);
});

test('Issue #306 v8: 已有订单勿重复 and 暂停新增待复核 read as 等待 with their own reason, never green', () => {
  [['已有订单勿重复', '区间2 已有挂单，不要重复下单，请与券商记录核对'],
   ['暂停新增待复核', '计划失效条件触发，暂停新增买入；这不是卖出现有持仓的指令']].forEach(([action, said]) => {
    const { document } = loadDashboard(buildBootstrapWithHolding(Object.assign({}, V8_READY, {
      '今日行动': action, '今日行动说明': said, '准备状态': '已有有效订单不重复建议'
    })), 'daily', {});
    const card = firstCard(document);
    assert.equal(card.children[0].children[1].textContent, '等待', action);
    assert.match(firstScreenText(card), new RegExp('等待理由: ' + said.slice(0, 6)));
    assert.ok(allElements(card).every((n) => !n.classList || !n.classList.contains('ios-severity-low')), action);
  });
});

test('Issue #306 v8: a ready row that still lists a blocker todo is 无法判断, not green', () => {
  const { document } = loadDashboard(withTodos(buildBootstrapWithHolding(Object.assign({}, V8_READY, { '阻塞待办ID': 'TEST1-1' })),
    [{ '待办ID': 'TEST1-1', '待办': '执行时点缺项：计划未声明执行路径', '状态': '待处理', '跟进类型': '可执行' }]), 'daily', {});
  const card = firstCard(document);
  assert.equal(card.children[0].children[1].textContent, '无法判断');
  assert.doesNotMatch(firstScreenText(card), /已校验订单限价/);
});

test('Issue #306 v8: 无法判断 links each blocker todo by 待办ID; clicking jumps to the todo tab and highlights that todo', () => {
  const bootstrap = withTodos(buildBootstrapWithHolding({
    '入场计划ID': 'plan-1', '执行状态': '', '准备状态': '计划未完善停在核对', '今日行动': '先核对缺项',
    '当前价格': 41.2, '报价币种': 'USD', '行情属性': '盘后',
    '当前阻碍': '计划未完善：无有效价格分档', '今日行动说明': '现在不挂单：等 Weekly Deep Dive 补建价格分档',
    '计划买入下限': '需补全：计划没有有效价格分档', '计划买入上限': '需补全：计划没有有效价格分档',
    '阻塞待办ID': 'TEST1-1、TEST1-2'
  }), [
    { '待办ID': 'TEST1-1', '待办': '计划维护：为 TEST1 建立有效价格分档', '状态': '待处理', '跟进类型': '可执行' },
    { '待办ID': 'TEST1-2', '待办': '执行时点缺项：TEST1 计划未声明执行路径', '状态': '待处理', '跟进类型': '可执行' },
    { '待办ID': 'OTHER-1', '待办': '无关待办', '状态': '待处理', '跟进类型': '可执行' }
  ]);
  const { document, window } = loadDashboard(bootstrap, 'daily', {});
  const card = firstCard(document);
  assert.equal(card.children[0].children[1].textContent, '无法判断');
  const first = firstScreenText(card);
  assert.match(first, /市价: 41\.2 USD · 盘后（非下单价）/);
  assert.match(first, /无法判断原因: 计划未完善：无有效价格分档/);
  assert.match(first, /最低 未确定（计划没有有效价格分档） · 最高 未确定（计划没有有效价格分档）/);
  const links = allElements(card).filter((n) => n.classList && n.classList.contains('ios-blocker-link'));
  assert.deepEqual(links.map((n) => n.textContent), ['计划维护：为 TEST1 建立有效价格分档', '执行时点缺项：TEST1 计划未声明执行路径']);
  assert.doesNotMatch(first, /关联异常/);
  links[1].click();
  const items = allElements(document.getElementById('ios-tab-content')).filter((n) => n.tagName === 'LI');
  const highlighted = items.filter((n) => n.classList.contains('ios-todo-highlight'));
  assert.equal(highlighted.length, 1);
  assert.equal(highlighted[0].getAttribute('data-todo-id'), 'TEST1-2');
  void window;
});

test('Issue #306 v8: missing, completed or absent blocker links render as explicit anomalies, never as no blocker', () => {
  const base = { '入场计划ID': 'plan-1', '今日行动': '先核对缺项', '当前阻碍': '无法确认：缺少订单记录' };
  const cases = [
    [{ '阻塞待办ID': 'GONE-9' }, [], /关联异常: 待办 GONE-9 不在本报告中/],
    [{ '阻塞待办ID': 'TEST1-1' }, [{ '待办ID': 'TEST1-1', '待办': 'x', '状态': '已完成' }], /关联异常: 待办 TEST1-1 已标记完成，仍被列为阻碍/],
    [{ '阻塞待办ID': '无' }, [], /关联异常: 无法判断但未关联阻塞待办/]
  ];
  cases.forEach(([fields, todos, pattern]) => {
    const { document } = loadDashboard(withTodos(buildBootstrapWithHolding(Object.assign({}, base, fields)), todos), 'daily', {});
    const first = firstScreenText(firstCard(document));
    assert.match(first, pattern);
    assert.doesNotMatch(first, /阻塞待办: 无/);
  });
});

test('Issue #306 v8: a single-price plan never gets a copied lower bound; the gap is named instead', () => {
  const { document } = loadDashboard(buildBootstrapWithHolding(Object.assign({}, V8_READY, {
    '今日行动': '等待价格', '执行状态': '等待价格', '准备状态': '无需准备', '建议限价': '',
    '计划买入下限': '需补全：计划只规定最高出价 180 USD，未规定最低价', '计划买入上限': '180 USD（区间1）',
    '阻塞待办ID': 'TEST1-3'
  })), 'daily', {});
  const first = firstScreenText(firstCard(document));
  assert.match(first, /最低 未确定（计划只规定最高出价 180 USD，未规定最低价） · 最高 180 USD（区间1）/);
  assert.doesNotMatch(first, /最低 180/);
});

test('Issue #306 v8: missing or stale quote is stated plainly on the first screen', () => {
  let r = loadDashboard(buildBootstrapWithHolding(Object.assign({}, V8_READY, { '当前价格': '', '报价币种': '', '行情属性': '' })), 'daily', {});
  assert.match(firstScreenText(firstCard(r.document)), /市价: 缺失（本次报告没有可靠报价）/);
  r = loadDashboard(buildBootstrapWithHolding(Object.assign({}, V8_READY, { '行情属性': '过期' })), 'daily', {});
  const quote = firstCard(r.document).children.find((c) => c.classList && c.classList.contains('ios-action-quote'));
  assert.match(quote.textContent, /过期（非下单价）/);
  assert.ok(quote.classList.contains('ios-entry-plan-incomplete'));
});

test('Issue #306 v8: a history generation labels the verdict 当时建议 with its own date and resolves links inside that generation', () => {
  const historyVm = buildBootstrapWithHolding(Object.assign({}, V8_READY, {
    '报告日期': '2026-10-10', '今日行动': '先核对缺项', '阻塞待办ID': 'TEST1-1', '当前阻碍': '无法确认：缺少订单记录'
  })).daily;
  historyVm.summary.报告ID = 'daily-2026-10-10';
  historyVm.todos = [{ '待办ID': 'TEST1-1', '待办': '补录 TEST1 区间2 订单状态', '状态': '待处理' }];
  const { document, window } = loadDashboard(buildBootstrapWithHolding(V8_READY), 'daily', {
    getReport: () => Object.assign({ error: null }, historyVm)
  });
  assert.match(firstScreenText(firstCard(document)), /今日建议/);
  window.selectHistoryReport('daily-2026-10-10');
  const first = firstScreenText(firstCard(document));
  assert.match(first, /当时建议（报告 2026-10-10）/);
  assert.doesNotMatch(first, /今日建议/);
  assert.match(first, /阻塞待办: 补录 TEST1 区间2 订单状态/);
});

test('PR #311 review: 适合买入 needs an explicit 无; a missing, empty or whitespace 阻塞待办ID is never a buy promise', () => {
  const cases = [['missing', null], ['empty', ''], ['whitespace', '   '], ['explicit', '无']];
  cases.forEach(([label, value]) => {
    const row = Object.assign({}, V8_READY);
    if (value === null) { delete row['阻塞待办ID']; } else { row['阻塞待办ID'] = value; }
    const bootstrap = buildBootstrapWithHolding({});
    bootstrap.daily.holdings = [Object.assign({}, bootstrap.daily.holdings[0], row)];
    if (value === null) { delete bootstrap.daily.holdings[0]['阻塞待办ID']; }
    const { document } = loadDashboard(bootstrap, 'daily', {});
    const card = firstCard(document);
    const first = firstScreenText(card);
    if (label === 'explicit') {
      assert.equal(card.children[0].children[1].textContent, '适合买入');
      assert.match(first, /阻塞待办: 无/);
    } else {
      assert.equal(card.children[0].children[1].textContent, '无法判断', label);
      assert.doesNotMatch(first, /已校验订单限价/, label);
      assert.match(first, /关联异常: 未提供阻塞待办关联，不能确认没有阻碍/, label);
      assert.ok(allElements(card).every((n) => !n.classList || !n.classList.contains('ios-severity-low')), label);
    }
  });
});

test('PR #311 review: a defined maximum with every gate passed but no lower bound is still 适合买入; the missing floor is shown, not a blocker', () => {
  const { document } = loadDashboard(buildBootstrapWithHolding(Object.assign({}, V8_READY, {
    '建议限价': '180 USD', '计划买入上限': '180 USD（区间1）',
    '计划买入下限': '需补全：计划只规定最高出价 180 USD，未规定最低价', '阻塞待办ID': '无'
  })), 'daily', {});
  const card = firstCard(document);
  assert.equal(card.children[0].children[1].textContent, '适合买入');
  const first = firstScreenText(card);
  assert.match(first, /最低 未确定（计划只规定最高出价 180 USD，未规定最低价） · 最高 180 USD（区间1）/);
  assert.match(first, /已校验订单限价: 180 USD（人工复查后手工提交）/);
  assert.match(first, /阻塞待办: 无/);
});

// -- Issue #337: FUND-SLEEVE aggregate row keeps the existing tsumitate ------------------

const FUND_SLEEVE_ROW = {
  '代码': 'FUND-SLEEVE', '名称': '投资信托（S&P500 / All Country）', '今日行动': '沿用定投',
  '今日行动说明': '沿用既有定投：每月 S&P500 60000 JPY、All Country 20000 JPY（账户状态截至 2026-10-20；基金明细截至 2026-10-20）；不是额外申购授权',
  '当前阻碍': '', '阻塞待办ID': '无'
};
const FUND_PLAN_TODO = { '待办ID': 'FUND-PLAN-1', '待办': '先完成基金长期估值', '状态': '已完成', '跟进类型': '可执行' };

test('Issue #337: a 沿用定投 FUND-SLEEVE row shows the tsumitate boundary, no buy verdict and no blocker anomaly', () => {
  const { document } = loadDashboard(withTodos(buildBootstrapWithHolding(FUND_SLEEVE_ROW), [FUND_PLAN_TODO]), 'daily', {});
  const card = firstCard(document);
  const badge = card.children[0].children[1];
  assert.equal(badge.textContent, '沿用定投');
  assert.equal(badge.className, 'ios-badge ios-badge-today-verdict ios-badge-muted');
  const first = firstScreenText(card);
  assert.match(first, /建议买入范围: 不适用（沿用既有定投，不是额外申购授权）/);
  assert.match(first, /定投: 沿用既有定投：每月 S&P500 60000 JPY/);
  assert.match(first, /阻塞待办: 无/);
  assert.doesNotMatch(first, /关联异常|适合买入|已校验订单限价|没有可用的入场计划|长期估值/);
  assert.ok(allElements(card).every((n) => !n.classList || !n.classList.contains('ios-severity-low')));
});

test('Issue #337: 2026-10-22 screenshot shape -- a completed blocker still linked stays an explicit anomaly', () => {
  const old = { '代码': 'FUND-SLEEVE', '今日行动': '无入场计划', '当前阻碍': '基金行需先完成长期估值', '阻塞待办ID': 'FUND-PLAN-1' };
  const { document } = loadDashboard(withTodos(buildBootstrapWithHolding(old), [FUND_PLAN_TODO]), 'daily', {});
  assert.match(firstScreenText(firstCard(document)), /关联异常: 待办 FUND-PLAN-1 已标记完成，仍被列为阻碍/);
  // Clearing only the ID trades it for the next anomaly; the fix is the writer's 沿用定投 revision.
  const cleared = loadDashboard(buildBootstrapWithHolding(Object.assign({}, old, { '阻塞待办ID': '无' })), 'daily', {});
  assert.match(firstScreenText(firstCard(cleared.document)), /关联异常: 无法判断但未关联阻塞待办/);
});

test('Issue #337: 沿用定投 fails closed outside the FUND-SLEEVE row or with any blocker link', () => {
  [
    [{ '代码': 'TEST1' }, [], /无法判断原因: 报告标注为 沿用定投，但本行不是基金聚合行/],
    [{ '阻塞待办ID': 'FUND-PLAN-1' }, [FUND_PLAN_TODO], /关联异常: 待办 FUND-PLAN-1 已标记完成，仍被列为阻碍/],
    [{ '阻塞待办ID': '' }, [], /无法判断原因: 报告标注为 沿用定投，但阻塞待办ID 不是 无/]
  ].forEach(([fields, todos, pattern]) => {
    const { document } = loadDashboard(withTodos(buildBootstrapWithHolding(Object.assign({}, FUND_SLEEVE_ROW, fields)), todos), 'daily', {});
    const card = firstCard(document);
    assert.equal(card.children[0].children[1].textContent, '无法判断', JSON.stringify(fields));
    const first = firstScreenText(card);
    assert.match(first, pattern);
    assert.doesNotMatch(first, /不适用（沿用既有定投/);
  });
});

test('PR #338 review: 沿用定投 with any plan, order, range or blocker field, or without the no-authorization sentence, fails closed', () => {
  const forbidden = ['入场计划ID', '周计划ID', '执行状态', '准备状态', '建议限价', '建议订单规模说明',
    '计划订单有效期', '计划买入下限', '计划买入上限', '当前阻碍'];
  const cases = forbidden.map((name) => [{ [name]: name.endsWith('ID') ? 'plan-fund-v1' : '100' }, new RegExp(name + ' 应为空')]);
  cases.push([{ '入场计划ID': 'plan-fund-v1', '建议限价': '100', '计划买入上限': '100' }, /入场计划ID、建议限价、计划买入上限 应为空/]);
  cases.push([{ '今日行动说明': '' }, /今日行动说明未写明不是额外申购授权/]);
  cases.push([{ '今日行动说明': '沿用既有定投：每月 S&P500 60000 JPY' }, /今日行动说明未写明不是额外申购授权/]);
  cases.forEach(([fields, pattern]) => {
    const { document } = loadDashboard(buildBootstrapWithHolding(Object.assign({}, FUND_SLEEVE_ROW, fields)), 'daily', {});
    const card = firstCard(document);
    assert.equal(card.children[0].children[1].textContent, '无法判断', JSON.stringify(fields));
    const first = firstScreenText(card);
    assert.match(first, pattern, JSON.stringify(fields));
    assert.doesNotMatch(first, /不适用（沿用既有定投|已校验订单限价/, JSON.stringify(fields));
  });
});

test('PR #338 review round 2: 周计划状态 must prove no active weekly plan -- 无周计划 in three-layer, blank in legacy', () => {
  const verdictOf = (fields) => {
    const { document } = loadDashboard(buildBootstrapWithHolding(Object.assign({}, FUND_SLEEVE_ROW, fields)), 'daily', {});
    const card = firstCard(document);
    return { verdict: card.children[0].children[1].textContent, first: firstScreenText(card) };
  };
  assert.equal(verdictOf({ '_iosThreeLayer': true, '周计划状态': '无周计划' }).verdict, '沿用定投');
  assert.equal(verdictOf({}).verdict, '沿用定投');
  [
    [{ '_iosThreeLayer': true, '周计划状态': '' }, /三层模式下周计划状态应为 无周计划/],
    [{ '_iosThreeLayer': true, '周计划状态': '有效' }, /三层模式下周计划状态应为 无周计划/],
    [{ '_iosThreeLayer': true, '周计划状态': '有效', '周计划结论': '有购买区间', '周计划执行路径': '估值区间限价' },
      /三层模式下周计划状态应为 无周计划；周计划结论、周计划执行路径 应为空/],
    [{ '_iosThreeLayer': true, '周计划状态': '无周计划', '价格参考下沿': '28000' }, /价格参考下沿 应为空/],
    [{ '周计划状态': '无周计划' }, /周计划状态应为空/]
  ].forEach(([fields, pattern]) => {
    const { verdict, first } = verdictOf(fields);
    assert.equal(verdict, '无法判断', JSON.stringify(fields));
    assert.match(first, pattern, JSON.stringify(fields));
    assert.doesNotMatch(first, /不适用（沿用既有定投/, JSON.stringify(fields));
  });
});
