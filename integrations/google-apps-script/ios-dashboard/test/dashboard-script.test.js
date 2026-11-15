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

const { portfolioSection, openReportAssets, segmentOpen } = require('./report-assets-helper');

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

/** Issue #396 PR A: the 4-metric summary grid moved from the removed 组合 view into the report's 报告概况 card. */
function portfolioOverview(document) {
  // #409 P3: the summary grid sits inside the 技术信息与报告概况 fold at the end of the report.
  return findAllNodes(document.getElementById('ios-summary-content'), (c) => c.classList.contains('ios-report-overview'))[0];
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
  const card = portfolioSection(document, '当前持仓').children[1].children[0];
  return card.children[0].children[1];
}

/** Locates the rendered holding card's 价格位置 badge (2nd child of the 参考 line), or undefined if 价格位置 was blank. */
function pricePositionBadge(document) {
  const card = portfolioSection(document, '当前持仓').children[1].children[0];
  return card.children[3].children[1];
}

/** Locates the rendered holding card's 执行状态 (Entry Plan) badge -- same slot as pricePositionBadge, since the two are mutually exclusive (Issue #298). */
function entryPlanBadge(document) {
  const card = portfolioSection(document, '当前持仓').children[1].children[0];
  return card.children[3].children[1];
}

/** Locates the rendered holding card's 当前区间 label (3rd child of the 参考 line), or undefined if absent. */
function entryPlanZone(document) {
  const card = portfolioSection(document, '当前持仓').children[1].children[0];
  return card.children[3].children[2];
}

/** The 参考 line's own child count -- used to assert no extra/duplicate badge is rendered alongside the one expected. */
function referenceLineChildCount(document) {
  const card = portfolioSection(document, '当前持仓').children[1].children[0];
  return card.children[3].children.length;
}

test('Issue #409 P1 (was #396 PR A): the page opens on 今天; the report is rendered (hidden) behind it and the report toolbar is hidden', () => {
  const { document } = loadDashboard(DEMO_BOOTSTRAP, 'daily', {});
  assert.ok(document.getElementById('ios-tab-today').classList.contains('active'));
  assert.equal(document.getElementById('ios-tab-today').getAttribute('aria-current'), 'page');
  ['actions', 'report', 'holdingDetail'].forEach((tab) => assert.equal(document.getElementById('ios-tab-' + tab).getAttribute('aria-current'), null));
  assert.equal(document.getElementById('ios-summary-content').hidden, true);
  assert.equal(document.getElementById('ios-tab-content').hidden, false);
  assert.match(tabText(document), /^最新结论/);
  assert.equal(document.getElementById('ios-report-toolbar').hidden, true, 'the report toolbar belongs to 报告 only');
  assert.match(summaryText(document), /daily-2026-08-15/, 'the Daily report stays rendered (hidden) so switching to it is instant');
});
test('Issue #409 P3: 报告 · 日报 shows the report in its order, ending with 本报告涉及标的 and 技术信息', () => {
  const { document, window } = loadDashboard(DEMO_BOOTSTRAP, 'daily', {});
  window.selectTab('daily');
  assert.ok(document.getElementById('ios-tab-report').classList.contains('active'), 'the old 日报 name opens 报告');
  assert.equal(document.getElementById('ios-seg-daily').getAttribute('aria-pressed'), 'true');
  assert.equal(document.getElementById('ios-summary-content').hidden, false);
  assert.equal(document.getElementById('ios-tab-content').hidden, true);
  assert.equal(document.getElementById('ios-report-toolbar').hidden, false);
  const classes = document.getElementById('ios-summary-content').children.map((c) => c.className);
  assert.deepEqual(classes, ['ios-headline-card', 'ios-count-cards', 'ios-card ios-buy-judgment', 'ios-card ios-period-changes',
    'ios-layering', 'ios-card ios-report-assets', 'ios-card ios-report-technical']);
  assert.ok(portfolioSection(document, '当前持仓'), 'every card opens from its row');
});
test('Issue #396 PR A: each view replaces the whole page; 日报 / 周报 bring a report back', () => {
  let scrolled = 0;
  const { document, window } = loadDashboard(DEMO_BOOTSTRAP, 'daily', {});
  window.scrollTo = () => { scrolled += 1; };
  ['holdingDetail', 'risks', 'todos'].forEach((tab) => {
    window.selectTab(tab);
    assert.equal(document.getElementById('ios-summary-content').hidden, true, tab + ' hides the report');
    assert.equal(document.getElementById('ios-tab-content').hidden, false, tab + ' shows its own content');
    assert.ok(tab === 'holdingDetail' ? document.getElementById('ios-tab-holdingDetail').classList.contains('active') : segmentOpen(document, tab));
  });
  ['daily', 'weekly'].forEach((tab) => {
    window.selectTab(tab);
    assert.equal(document.getElementById('ios-summary-content').hidden, false);
    assert.equal(document.getElementById('ios-tab-content').hidden, true);
    assert.match(summaryText(document), new RegExp(tab + '-2026-08-15'));
  });
  assert.equal(scrolled, 5, 'every switch starts the new view at the top of the page');
});

test('Issue #409 P4: the views are 今天 / 标的 / 报告 / 待办与风险; 日报 / 周报 open 报告, 待办 / 风险 open 待办与风险; 组合 and 资本配置 are gone and ignored', () => {
  const index = fs.readFileSync(path.join(__dirname, '..', 'Index.html'), 'utf8');
  assert.doesNotMatch(index, /资本配置|ios-tab-allocation|ios-tab-portfolio|ios-tab-daily|ios-tab-weekly|ios-tab-todos|ios-tab-risks|ios-nav-/);
  const labels = [...index.matchAll(/class="ios-tab-label">([^<]+)</g)].map((m) => m[1]);
  assert.deepEqual(labels, ['今天', '标的', '报告', '待办与风险']);
  const { document, window } = loadDashboard(DEMO_BOOTSTRAP, 'daily', {});
  window.selectTab('holdingDetail');
  ['portfolio', 'allocation'].forEach((tab) => window.selectTab(tab));
  assert.ok(document.getElementById('ios-tab-holdingDetail').classList.contains('active'), 'an unknown view name is ignored');
  window.selectTab('weekly');
  assert.ok(document.getElementById('ios-tab-report').classList.contains('active'));
  assert.equal(document.getElementById('ios-seg-weekly').getAttribute('aria-pressed'), 'true');
  window.selectTab('risks');
  assert.ok(segmentOpen(document, 'risks'), 'the old 风险 name opens 待办与风险 on 风险');
  window.selectTab('todos');
  assert.ok(segmentOpen(document, 'todos'));
});
test('Issue #409 P0/P3: the view nav sits in the sidebar shell before every view, with read time + 刷新; 周报/日报 and the picker share one toolbar row', () => {
  const index = fs.readFileSync(path.join(__dirname, '..', 'Index.html'), 'utf8');
  const sidebar = index.indexOf('class="ios-sidebar"');
  const bar = index.indexOf('id="ios-tab-bar"');
  const main = index.indexOf('class="ios-main"');
  assert.ok(sidebar !== -1 && sidebar < bar && bar < main, 'the nav is inside the sidebar, which comes before the main column');
  assert.ok(index.indexOf('id="ios-refresh-btn"') > bar && index.indexOf('id="ios-refresh-btn"') < main, '刷新 sits in the sidebar foot');
  assert.ok(index.indexOf('id="ios-data-time"') > bar && index.indexOf('id="ios-data-time"') < main, 'the read time sits next to 刷新');
  assert.ok(main < index.indexOf('id="ios-page-title"'));
  const toolbar = index.indexOf('id="ios-report-toolbar"');
  assert.ok(toolbar > index.indexOf('id="ios-page-title"') && toolbar < index.indexOf('id="ios-summary-content"'));
  const order = ['ios-seg-weekly', 'ios-seg-daily', 'ios-history-select', 'ios-report-prev', 'ios-report-next', 'ios-report-refresh'].map((id) => index.indexOf('id="' + id + '"'));
  assert.ok(order.every((pos, i) => pos > toolbar && (i === 0 || pos > order[i - 1])), '周报 · 日报 · picker · 上一份 · 下一份 · 刷新, in that order');
  assert.ok(index.indexOf('id="ios-tab-today"') > bar && index.indexOf('id="ios-tab-today"') < index.indexOf('id="ios-tab-actions"'));
  assert.doesNotMatch(index, /ios-view-toggle|ios-topbar"/);
  // Every nav item keeps a text label next to its icon: state never relies on an icon or a colour alone.
  const buttons = [...index.matchAll(/<button type="button" class="ios-tab-btn"[\s\S]*?<\/button>/g)].map((m) => m[0]);
  assert.equal(buttons.length, 4);
  buttons.forEach((b) => { assert.match(b, /aria-hidden="true"/); assert.match(b, /class="ios-tab-label">[^<]+</); });
});
test('Issue #409 P0/P3: the page title follows the current view, and the report toolbar shows on 报告 only', () => {
  const { document, window } = loadDashboard(DEMO_BOOTSTRAP, 'daily', {});
  const title = () => document.getElementById('ios-page-title').textContent;
  assert.equal(title(), '今天');
  [['actions', '待办与风险', true], ['report', '报告', false], ['holdingDetail', '标的', true], ['today', '今天', true]].forEach(([tab, label, hidden]) => {
    window.selectTab(tab);
    assert.equal(title(), label, tab);
    assert.equal(document.getElementById('ios-report-toolbar').hidden, hidden, tab + ' report toolbar');
    assert.equal(document.getElementById('ios-tab-' + tab).getAttribute('aria-current'), 'page');
  });
});
test('Issue #409 P0: the sidebar shows when the page read the Sheet, and 刷新 updates it; a blocked read says so', () => {
  const RealDate = Date;
  let now = new RealDate(2026, 10, 16, 0, 5);
  const FakeDate = function () { return new RealDate(now.getTime()); };
  const document = createFakeDocument();
  const sandbox = {
    document, window: {}, console, Date: FakeDate, IOS_BOOTSTRAP: DEMO_BOOTSTRAP, IOS_ACTIVE_VIEW: 'daily',
    google: createGoogleScriptRunStub({ getDashboardBootstrap: () => DEMO_BOOTSTRAP })
  };
  vm.createContext(sandbox);
  vm.runInContext(SCRIPT_HTML_SRC, sandbox, { filename: 'Script.html' });
  assert.equal(document.getElementById('ios-data-time').textContent, '读取 11/16 00:05');
  now = new RealDate(2026, 10, 16, 9, 30);
  sandbox.window.refresh();
  assert.equal(document.getElementById('ios-data-time').textContent, '读取 11/16 09:30');
  assert.equal(document.getElementById('ios-refresh-btn').disabled, false, '刷新 is usable again once the read finished');
  const blocked = loadDashboard(Object.assign({}, DEMO_BOOTSTRAP, { error: 'Sheet 未配置' }), 'daily', {});
  assert.equal(blocked.document.getElementById('ios-data-time').textContent, '读取失败');
});

test('Issue #388 PR D/F, #396: a non-current generation keeps its reader banner above every view built from it; 待办 names which latest report it is', () => {
  const bootstrap = buildBootstrapWithTodos([]);
  const { document, window } = loadDashboard(bootstrap, 'daily', {});
  const banner = document.getElementById('ios-view-banner');
  assert.equal(banner.hidden, false, '今天 opens first and carries the banner of the latest Daily');
  assert.match(banner.textContent, /^最新日报：/);
  assert.match(banner.textContent, /不作为当前买入依据/);
  window.selectTab('daily');
  assert.equal(banner.hidden, true, 'the report view shows the banner itself');
  window.selectTab('holdingDetail');
  assert.equal(banner.hidden, false, '#409 P2: 标的 reads the latest reports, so their banner stays; the ledger group carries its own 当前台账 label');
});

test('the summary grid (now in the 组合 overview, #388 PR D) has exactly the 4 v1.1 metrics (当前持仓/观察名单/核心状态/Review) with their explanatory subtitles, not tab-count shortcuts', () => {
  const { document } = loadDashboard(DEMO_BOOTSTRAP, 'daily', {});
  const grid = portfolioOverview(document).children.find((c) => c.classList.contains('ios-summary-grid'));
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
  const grid = portfolioOverview(document).children.find((c) => c.classList.contains('ios-summary-grid'));
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
  const grid = portfolioOverview(document).children.find((c) => c.classList.contains('ios-summary-grid'));
  const values = grid.children.map((card) => card.children[0].textContent);
  assert.deepEqual(values.slice(0, 2), ['未知', '未知']);
});

test('summary metric cards are plain informational cards, not tab shortcuts -- no click handler, no button element', () => {
  const { document } = loadDashboard(DEMO_BOOTSTRAP, 'daily', {});
  const grid = portfolioOverview(document).children.find((c) => c.classList.contains('ios-summary-grid'));
  grid.children.forEach((card) => {
    assert.notEqual(card.tagName, 'BUTTON');
    card.click(); // must be inert -- no onclick was ever registered
  });
  assert.ok(document.getElementById('ios-tab-today').classList.contains('active'), 'clicking a metric card must never change the active tab');
});

test('switchView("weekly") opens the latest 周报 without any google.script.run call (both viewModels already cached from bootstrap)', () => {
  let runCalls = 0;
  const { document, window } = loadDashboard(DEMO_BOOTSTRAP, 'daily', {
    getReport: () => { runCalls += 1; return {}; },
    getDashboardBootstrap: () => { runCalls += 1; return {}; }
  });
  window.switchView('weekly');
  assert.match(summaryText(document), /weekly-2026-08-15/);
  assert.ok((document.getElementById('ios-tab-report').classList.contains('active') && document.getElementById('ios-seg-weekly').getAttribute('aria-pressed') === 'true'));
  assert.equal(document.getElementById('ios-seg-daily').getAttribute('aria-pressed'), 'false');
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
  // #409 P3: the latest entry is the option labelled （最新）, so it is not listed twice.
  const labels = () => document.getElementById('ios-history-select').children.map((opt) => opt.textContent);
  assert.deepEqual(historySelectOptionValues(document), ['']);
  assert.match(labels()[0], /2026-08-15.*（最新）/);
  window.switchView('weekly');
  assert.deepEqual(historySelectOptionValues(document), ['']);
  assert.match(labels()[0], /2026-08-15.*（最新）/);
});

test('selectTab switches between the views without any google.script.run call, and updates aria-current', () => {
  let runCalls = 0;
  const { document, window } = loadDashboard(DEMO_BOOTSTRAP, 'daily', {
    getReport: () => { runCalls += 1; return {}; },
    getDashboardBootstrap: () => { runCalls += 1; return {}; }
  });

  window.selectTab('holdingDetail');
  assert.ok(document.getElementById('ios-tab-holdingDetail').classList.contains('active'));
  assert.equal(document.getElementById('ios-tab-actions').getAttribute('aria-current'), null);
  assert.match(tabText(document), /DEMO1/, '持仓明细 shows the live current-holdings ledger (former 资本配置, #388 PR F)');

  window.selectTab('risks');
  assert.ok(segmentOpen(document, 'risks'));
  assert.match(tabText(document), /风险/);

  window.selectTab('todos');
  assert.ok(segmentOpen(document, 'todos'));
  assert.match(tabText(document), /卡住买入/);

  window.selectTab('weekly');
  assert.ok((document.getElementById('ios-tab-report').classList.contains('active') && document.getElementById('ios-seg-weekly').getAttribute('aria-pressed') === 'true'));

  assert.equal(runCalls, 0, 'tab switching only re-renders already-cached data, never hits the server');
});

test('selectTab ignores an unrecognized tab name rather than clearing the current tab', () => {
  const { document, window } = loadDashboard(DEMO_BOOTSTRAP, 'daily', {});
  window.selectTab('risks');
  window.selectTab('not-a-real-tab');
  assert.ok(segmentOpen(document, 'risks'), 'must remain on the previously active tab');
});

test('Issue #409 P2: 标的 reads the latest Weekly and Daily whatever 日报 / 周报 shows, and says so', () => {
  const { document, window } = loadDashboard(DEMO_BOOTSTRAP, 'daily', {});
  window.selectTab('holdingDetail');
  const first = tabText(document);
  assert.match(first, /^来源：最新周报 08\/15 与 最新日报 08\/15 · 每个标的读列出它的最新一份报告/);
  window.selectTab('weekly');
  window.selectTab('holdingDetail');
  assert.equal(tabText(document), first, 'switching 日报 / 周报 does not change 标的');
});

function ledgerGroups(document) {
  const out = [];
  (function walk(node) {
    (node.children || []).forEach((child) => {
      if (child.classList && (child.classList.contains('ios-allocation-overview') || child.classList.contains('ios-detail-group-ledger'))) out.push(child);
      walk(child);
    });
  })(document.getElementById('ios-tab-content'));
  return out;
}

function ledgerText(document) {
  return ledgerGroups(document).map((n) => n.textContent).join('|');
}

test('the live current-holdings ledger in 持仓明细 (former 资本配置, #388 PR F) is the same whichever Daily/Weekly view is active', () => {
  const { document, window } = loadDashboard(DEMO_BOOTSTRAP, 'daily', {});
  window.selectTab('holdingDetail');
  const facts = ['当前台账，非本报告快照', '当前台账持仓: 2 只', '持有数量: 100平均成本: 42.5 USD参考买入价（台账）: 38-40', '持有数量: 50平均成本: 未提供参考买入价（台账）: 未提供'];
  const dailyLedger = ledgerText(document);
  facts.forEach((fact) => assert.ok(dailyLedger.includes(fact), 'daily: ' + fact));
  window.switchView('weekly');
  const weeklyLedger = ledgerText(document);
  facts.forEach((fact) => assert.ok(weeklyLedger.includes(fact), 'weekly: ' + fact + ' is not report-scoped and must not change when the active view changes'));
});

test('the ledger rows (Issue #255, inside 持仓明细 since #388 PR F) render both a desktop table and a mobile card list from the same data -- a CSS breakpoint picks one, Script.html never branches on viewport itself', () => {
  const { document, window } = loadDashboard(Object.assign({}, DEMO_BOOTSTRAP, { daily: { found: false, reportType: 'daily' }, weekly: { found: false, reportType: 'weekly' } }), 'daily', {});
  window.selectTab('holdingDetail');
  const block = ledgerGroups(document).find((n) => n.classList.contains('ios-ledger-only'));
  const tableWrap = block.children.find((c) => c.classList.contains('ios-allocation-table'));
  const cards = block.children.find((c) => c.classList.contains('ios-allocation-cards'));
  assert.ok(tableWrap.classList.contains('ios-allocation-table'), 'the table wrapper carries the class the mobile breakpoint hides');
  assert.ok(cards.classList.contains('ios-allocation-cards'), 'the card container carries the class the desktop breakpoint hides');
  assert.equal(tableWrap.children[0].tagName, 'TABLE');
  assert.match(tableWrap.textContent, /DEMO1/);
  assert.match(cards.textContent, /DEMO1/);
  assert.equal(cards.children.length, 2, 'one card per allocation entry -- the same 2 live holdings the table shows');
});

test('a ledger mobile card surfaces code/name/quantity/avg-cost/reference with the same missing-value handling as the table', () => {
  const { document, window } = loadDashboard(Object.assign({}, DEMO_BOOTSTRAP, { daily: { found: false, reportType: 'daily' }, weekly: { found: false, reportType: 'weekly' } }), 'daily', {});
  window.selectTab('holdingDetail');
  const block = ledgerGroups(document).find((n) => n.classList.contains('ios-ledger-only'));
  const cards = block.children.find((c) => c.classList.contains('ios-allocation-cards'));
  const demo1Card = cards.children.find((card) => card.textContent.indexOf('DEMO1') !== -1);
  const demo2Card = cards.children.find((card) => card.textContent.indexOf('DEMO2') !== -1);
  assert.match(demo1Card.textContent, /42\.5/);
  assert.match(demo1Card.textContent, /参考买入价（台账）: 38-40/);
  assert.match(demo2Card.textContent, /平均成本: 未提供/, 'DEMO2 has a blank 平均成本 in 当前持仓 -- must render explicitly, never a fabricated 0');
  assert.match(demo2Card.textContent, /参考买入价（台账）: 未提供/, 'DEMO2 has a blank 参考买入价/区间 in 当前持仓 -- must render explicitly, never blank/omitted');
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
  // PR #413 review: the banner names the report by type and date; the ID stays in 技术信息.
  assert.match(banner.textContent, /^正在查看历史日报（2026-08-15）/);
  assert.doesNotMatch(banner.textContent, /daily-2026-08-15/);
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
  // PR #413 review: the banner names the report by type and date; the ID stays in 技术信息.
  assert.match(banner.textContent, /^正在查看历史日报（2026-08-15）/);
  assert.doesNotMatch(banner.textContent, /daily-2026-08-15/);
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

  window.selectTab('holdingDetail');
  assert.equal(tabText(document), '', 'Blocked must stay Blocked across a tab switch too, including the live ledger inside 持仓明细');
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
  const { document, window } = loadDashboard(emptyBootstrap, 'daily', {});
  assert.match(summaryText(document), /暂无日报/);
  assert.match(tabText(document), /暂无报告/, 'Issue #396 PR A: 待办 has nothing to merge before either report exists');
  window.selectTab('risks');
  assert.match(tabText(document), /暂无报告/, 'Issue #396 PR C: 风险 has nothing to merge before either report exists');
  window.selectTab('holdingDetail');
  assert.match(tabText(document), /暂无日报/, 'Issue #388 PR D: a report-based view replaces the report, so it repeats the "no report yet" card');
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

test('reference-price/price-position mapping renders explicit missing-value text, never a blank or shifted column, on the asset cards', () => {
  const { document } = loadDashboard(DEMO_BOOTSTRAP, 'daily', {});
  openReportAssets(document, 'holding');
  openReportAssets(document, 'watchlist');
  const portfolioText = summaryText(document);
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
  openReportAssets(document, 'holding');
  openReportAssets(document, 'watchlist');
  // #409 P3: the snapshot body beside the card may name the report's Thesis状态 column; the card itself has no Thesis line.
  const portfolioText = portfolioSection(document, '当前持仓').textContent;
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
  const card = portfolioSection(document, '当前持仓').children[1].children[0];
  assert.equal(card.children[3].children[0].textContent, '锚点: $100 附近');
});

test('入场计划ID present but 入场计划估值锚点 blank: anchor text falls back to an explicit "未知", never fabricated or omitted', () => {
  const { document } = loadDashboard(buildBootstrapWithHolding({ '入场计划ID': 'plan-1', '执行状态': '等待价格', '入场计划估值锚点': '' }), 'daily', {});
  const card = portfolioSection(document, '当前持仓').children[1].children[0];
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
  const card = portfolioSection(document, '当前持仓').children[1].children[0];
  assert.match(card.children[3].children[0].textContent, /^参考: /);
});

test('demo dataset: DEMO1 (has an active 入场计划) renders its snapshotted anchor + 执行状态 badge; DEMO2 (no plan) still falls back to 价格位置', () => {
  const { document } = loadDashboard(DEMO_BOOTSTRAP, 'daily', {});
  const cards = portfolioSection(document, '当前持仓').children[1].children;
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
  const card = portfolioSection(document, '当前持仓').children[1].children[0];
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
  const cards = portfolioSection(document, '当前持仓').children[1].children;
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
  const card = portfolioSection(document, '当前持仓').children[1].children[0];
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
  const card = portfolioSection(document, '当前持仓').children[1].children[0];
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
  const text = portfolioSection(document, '本期观察候选').textContent;
  assert.match(text, /DEMOW1/);
  assert.match(text, /insufficient_evidence/);
  assert.doesNotMatch(text, /观察名单/, 'the section provides asset type; cards must not repeat the redundant badge');
});

// -- 待办 tab (Issue #396 PR A): the latest Daily and the latest Weekly merged
// on one page. 卡住买入 is decided only by 阻塞待办ID (owner decision on #396);
// every other todo stands alone, newest report date first. Completion keeps
// the Issue #255/#260 classifier: only 已完成 / done count as completed. --

function reportVm(type, date, extra) {
  return Object.assign({
    found: true, reportType: type,
    summary: {
      报告ID: type + '-' + date, 报告日期: date, 周期开始: '', 周期结束: '', 一句话结论: type + ' headline',
      核心状态: '正常', Review状态: '未Review', 当前持仓数: 0, 高优先级观察数: 0, 生成时间: date + 'T09:00:00+09:00'
    },
    holdings: [], watchlistCandidates: [], risks: [], todos: []
  }, extra || {});
}

function latestBootstrap(daily, weekly) {
  return { error: null, daily: daily || { found: false, reportType: 'daily' }, weekly: weekly || { found: false, reportType: 'weekly' },
    dailyHistory: [], weeklyHistory: [], allocation: [] };
}

/** Issue #409 P1: 今天 opens first; the 待办 tests open the 待办 view themselves. */
function loadTodos(bootstrap, activeView, googleHandlers) {
  const loaded = loadDashboard(bootstrap, activeView, googleHandlers);
  loaded.window.selectTab('todos');
  return loaded;
}

function todoSection(document, cls) {
  return document.getElementById('ios-tab-content').children.find((c) => c.classList.contains(cls));
}

function todoItems(node) {
  return node ? allElements(node).filter((n) => n.tagName === 'LI' && n.classList.contains('ios-todo-item')) : [];
}

function todoNames(node) {
  return todoItems(node).filter((li) => li.children[0].children[1]).map((li) => li.children[0].children[1].textContent);
}

function itemNamed(document, name) {
  return todoItems(document.getElementById('ios-tab-content')).find((li) => li.textContent.indexOf(name) !== -1);
}

test('todos: the 待办 view lists open items before a folded 已完成 group, 排序 kept within one report', () => {
  const todos = [
    { 排序: 1, 分类: 'research', 待办: 'Task A', 状态: 'open', 备注: '' },
    { 排序: 2, 分类: 'follow-up', 待办: 'Task B', 状态: 'done', 备注: 'note B' },
    { 排序: 3, 分类: '', 待办: 'Task C', 状态: '', 备注: '' },
    { 排序: 4, 分类: '', 待办: 'Task D', 状态: 'done', 备注: '' }
  ];
  const { document } = loadTodos(buildBootstrapWithTodos(todos), 'daily', {});
  const overview = todoSection(document, 'ios-todo-overview');
  assert.match(overview.textContent, /卡住买入 0 项 · 其他待办 2 项/);
  assert.match(overview.textContent, /已完成 2/);
  assert.deepEqual(todoNames(todoSection(document, 'ios-todo-others')), ['Task A', 'Task C']);
  const done = todoSection(document, 'ios-todo-completed');
  const fold = done.children[0];
  assert.equal(fold.tagName, 'DETAILS');
  assert.equal(fold.getAttribute('open'), null, '已完成 is folded by default');
  assert.equal(fold.children[0].textContent, '已完成 2 项（展开查看）');
  assert.deepEqual(todoNames(done), ['Task B', 'Task D']);
});

test('todos: a completed item is struck through and marked done; an open one is not', () => {
  const { document } = loadTodos(buildBootstrapWithTodos([
    { 排序: 1, 分类: '', 待办: 'Open task', 状态: 'open', 备注: '' },
    { 排序: 2, 分类: '', 待办: 'Done task', 状态: 'done', 备注: '' }
  ]), 'daily', {});
  const openItem = itemNamed(document, 'Open task');
  const doneItem = itemNamed(document, 'Done task');
  assert.ok(openItem.classList.contains('ios-todo-open'));
  assert.ok(!openItem.classList.contains('ios-todo-done'));
  assert.ok(doneItem.classList.contains('ios-todo-done'));
  assert.ok(doneItem.children[1].children[0].classList.contains('ios-badge-done'));
});

test('todos: only 已完成 / done count as completed (any case, padded); 待处理, 未完成, blank and unknown values stay open and are shown as written', () => {
  const todos = [
    { 排序: 1, 待办: 'Mixed case', 状态: 'Done' },
    { 排序: 2, 待办: 'All caps', 状态: 'DONE' },
    { 排序: 3, 待办: 'Padded', 状态: '  done  ' },
    { 排序: 4, 待办: 'Chinese done', 状态: '已完成' },
    { 排序: 5, 待办: 'Pending', 状态: '待处理' },
    { 排序: 6, 待办: 'Unfinished', 状态: '未完成' },
    { 排序: 7, 待办: 'Blank', 状态: '' },
    { 排序: 8, 待办: 'Custom', 状态: 'in-progress' }
  ];
  const { document } = loadTodos(buildBootstrapWithTodos(todos), 'daily', {});
  assert.deepEqual(todoNames(todoSection(document, 'ios-todo-completed')), ['Mixed case', 'All caps', 'Padded', 'Chinese done']);
  assert.deepEqual(todoNames(todoSection(document, 'ios-todo-others')), ['Pending', 'Unfinished', 'Blank', 'Custom']);
  ['Mixed case', 'All caps', 'Padded', 'Chinese done'].forEach((name) => {
    const li = itemNamed(document, name);
    assert.ok(li.classList.contains('ios-todo-done'), name);
    assert.ok(li.children[1].children[0].classList.contains('ios-badge-done'), name);
  });
  const badge = (name) => itemNamed(document, name).children[1].children[0];
  assert.equal(badge('Pending').textContent, '待处理');
  assert.ok(!badge('Pending').classList.contains('ios-badge-done'));
  assert.equal(badge('Unfinished').textContent, '未完成');
  assert.ok(badge('Unfinished').classList.contains('ios-badge-incomplete'), '未完成 carries a visible mark');
  assert.equal(badge('Blank').textContent, '状态未填写', 'a blank 状态 is open and said to be blank, never relabelled 待处理');
  assert.equal(badge('Custom').textContent, 'in-progress');
  assert.match(todoSection(document, 'ios-todo-overview').textContent, /其他待办 4 项/);
});

test('todos: 跟进类型 is a display tag only -- it never moves a todo between groups, and a malformed cell never crashes rendering', () => {
  const todos = [
    { 排序: 1, 待办: 'Monitor', 状态: '待处理', 跟进类型: '持续观察' },
    { 排序: 2, 待办: 'Wait', 状态: '待处理', 跟进类型: '等待证据' },
    { 排序: 3, 待办: 'Act', 状态: '待处理', 跟进类型: '可执行' },
    { 排序: 4, 待办: 'Legacy', 状态: '待处理' },
    { 排序: 5, 待办: 'Numeric kind', 状态: '待处理', 跟进类型: 42 },
    { 排序: 6, 待办: 'False kind', 状态: '待处理', 跟进类型: false },
    { 排序: 7, 待办: 'Monitoring concluded', 状态: '已完成', 跟进类型: '持续观察' }
  ];
  let document;
  assert.doesNotThrow(() => { ({ document } = loadTodos(buildBootstrapWithTodos(todos), 'daily', {})); });
  assert.deepEqual(todoNames(todoSection(document, 'ios-todo-others')), ['Monitor', 'Wait', 'Act', 'Legacy', 'Numeric kind', 'False kind']);
  const kind = (name) => itemNamed(document, name).children[1].children.find((c) => c.classList.contains('ios-todo-kind'));
  assert.ok(kind('Monitor').classList.contains('ios-badge-monitoring'));
  assert.ok(itemNamed(document, 'Monitor').classList.contains('ios-todo-monitoring'));
  assert.ok(kind('Wait').classList.contains('ios-badge-waiting'));
  assert.equal(kind('Act').textContent, '可执行');
  assert.equal(kind('Legacy'), undefined, 'a row without 跟进类型 shows no tag');
  assert.equal(kind('Numeric kind').textContent, '42');
  assert.ok(itemNamed(document, 'Numeric kind').classList.contains('ios-todo-open'));
  const concluded = itemNamed(document, 'Monitoring concluded');
  assert.ok(concluded.classList.contains('ios-todo-done'));
  assert.ok(!concluded.classList.contains('ios-todo-monitoring'));
  assert.equal(concluded.children[1].children[0].textContent, '已完成');
});

test('todos: 分类, 状态 and the source report render as badges; 备注 only when present', () => {
  const { document } = loadTodos(buildBootstrapWithTodos([
    { 排序: 1, 分类: 'ops', 待办: 'Has a note', 状态: 'open', 备注: 'secondary detail' },
    { 排序: 2, 分类: '', 待办: 'No note', 状态: 'open', 备注: '' }
  ]), 'daily', {});
  const withNote = itemNamed(document, 'Has a note');
  assert.match(withNote.children[1].textContent, /^open.*ops日报 08\/20$/);
  assert.equal(withNote.children.length, 3);
  assert.match(withNote.children[2].textContent, /secondary detail/);
  assert.equal(itemNamed(document, 'No note').children.length, 2, 'no empty note line');
});

test('todos: no open todo anywhere reads 本期无需操作; with no report at all the tab says so', () => {
  const none = loadTodos(buildBootstrapWithTodos([]), 'daily', {});
  assert.match(todoSection(none.document, 'ios-todo-overview').textContent, /本期无需操作/);
  assert.equal(todoSection(none.document, 'ios-todo-completed'), undefined, 'no 已完成 fold when nothing is completed');
  const allDone = loadTodos(buildBootstrapWithTodos([{ 排序: 1, 待办: 'x', 状态: '已完成' }]), 'daily', {});
  assert.match(todoSection(allDone.document, 'ios-todo-overview').textContent, /本期无需操作/);
  const empty = loadTodos(latestBootstrap(null, null), 'daily', {});
  assert.match(tabText(empty.document), /暂无报告/);
});

test('todos: the latest Daily and Weekly are merged; other todos run newest report date first and name their report', () => {
  const daily = reportVm('daily', '2026-11-11', { todos: [{ 排序: 1, 待办: 'Daily item', 状态: '待处理', 报告日期: '2026-11-11' }] });
  const weekly = reportVm('weekly', '2026-11-09', { todos: [
    { 排序: 1, 待办: 'Weekly first', 状态: '待处理', 报告日期: '2026-11-09' },
    { 排序: 2, 待办: 'Weekly second', 状态: '待处理' }
  ] });
  const { document } = loadTodos(latestBootstrap(daily, weekly), 'daily', {});
  const others = todoSection(document, 'ios-todo-others');
  assert.deepEqual(todoNames(others), ['Daily item', 'Weekly first', 'Weekly second']);
  assert.match(itemNamed(document, 'Daily item').textContent, /日报 11\/11/);
  assert.match(itemNamed(document, 'Weekly second').textContent, /周报 11\/09/, 'a row without 报告日期 takes its report\'s date');
  assert.match(todoSection(document, 'ios-todo-overview').textContent, /合并最新周报 11\/09 与 最新日报 11\/11/);
  assert.equal(allElements(document.getElementById('ios-tab-content')).filter((n) => n.tagName === 'INPUT').length, 0, 'nothing on the page can tick a todo off');
});

function blockedRow(code, ids, extra) {
  return Object.assign({ 代码: code, 名称: code + ' Co.', 资产类型: 'holding', 今日行动: '先核对缺项', 阻塞待办ID: ids }, extra || {});
}

test('todos: 卡住买入 is decided by 阻塞待办ID only -- Daily ref, Weekly ref, both refs on one asset (one row, both kept), a missing ID shown as 未找到', () => {
  const daily = reportVm('daily', '2026-11-11', {
    holdings: [blockedRow('AAA', 'AAA-1'), blockedRow('CCC', 'C-9')],
    watchlistCandidates: [blockedRow('WWW', 'W-1', { 资产类型: 'watchlist' })],
    todos: [
      { 待办ID: 'AAA-1', 待办: 'Daily AAA blocker', 状态: '未完成' },
      { 待办ID: 'W-1', 待办: 'Watch blocker', 状态: '待处理' },
      { 待办ID: 'BBB-1', 待办: 'Unreferenced, looks like BBB', 状态: '待处理', 复核键: '事件|BBB|x' }
    ]
  });
  const weekly = reportVm('weekly', '2026-11-09', {
    holdings: [blockedRow('AAA', 'AAA-1'), blockedRow('BBB', 'B-2'), blockedRow('FUND-SLEEVE', 'F-1')],
    todos: [
      { 待办ID: 'AAA-1', 待办: 'Weekly AAA blocker', 状态: '待处理' },
      { 待办ID: 'B-2', 待办: 'Weekly BBB blocker', 状态: '待处理' },
      { 待办ID: 'F-1', 待办: 'Fund check', 状态: '待处理' }
    ]
  });
  let document;
  assert.doesNotThrow(() => { ({ document } = loadTodos(latestBootstrap(daily, weekly), 'daily', {})); });
  const blocked = todoSection(document, 'ios-todo-blocked');
  const assets = blocked.children.filter((c) => c.classList.contains('ios-todo-asset'));
  assert.deepEqual(assets.map((a) => a.children[0].children[0].textContent), ['AAA', 'BBB', 'CCC', 'WWW'], 'AAA appears once although both reports name it');
  assert.deepEqual(todoNames(assets[0]), ['Daily AAA blocker', 'Weekly AAA blocker'],
    'Issue #403: the same 待办ID in both reports is one item led by the newer report; the other source is kept below it, never dropped');
  assert.match(assets[0].textContent, /日报 11\/11[\s\S]*同一工作也见于周报 11\/09：待处理/);
  assert.match(assets[2].textContent, /阻塞待办未找到：日报 11\/11 的买入判断引用了待办ID C-9/);
  assert.deepEqual(todoNames(assets[3]), ['Watch blocker'], 'a watchlist row\'s blocker counts too');
  assert.deepEqual(todoNames(todoSection(document, 'ios-todo-others')), ['Unreferenced, looks like BBB', 'Fund check'],
    'no asset is inferred from 复核键 or an ID prefix, and the fund aggregate is not a buy-judgment row');
  assert.match(blocked.children[0].textContent, /卡住买入 \(4 个标的\)/);
  assert.match(todoSection(document, 'ios-todo-overview').textContent, /卡住买入 3 项 · 其他待办 2 项/, 'the merged AAA item counts once');
});

test('Issue #403: an older Daily still open and a newer Weekly 已完成 for the same 待办ID are one item led by the Weekly; the Daily snapshot is shown as a conflict, not as work to do now', () => {
  const daily = reportVm('daily', '2026-11-14', {
    holdings: [blockedRow('MSFT', 'MSFT-13、MSFT-CPI')],
    todos: [
      { 待办ID: 'MSFT-13', 待办: 'Daily MSFT Q1 check', 状态: '待处理', 跟进类型: '可执行' },
      { 待办ID: 'MSFT-CPI', 待办: 'Daily MSFT CPI check', 状态: '待处理', 跟进类型: '可执行' }
    ]
  });
  const weekly = reportVm('weekly', '2026-11-15', {
    holdings: [blockedRow('MSFT', 'MSFT-13、WP-MSFT')],
    todos: [
      { 待办ID: 'MSFT-13', 待办: 'Weekly MSFT Q1 check', 状态: '已完成', 跟进类型: '可执行', 备注: '已核验：ep-20261113-MSFT-v9；原生成ID 600b12c3' },
      { 待办ID: 'WP-MSFT', 待办: 'Weekly MSFT plan range', 状态: '待处理', 跟进类型: '可执行', 备注: '已核验：11/09–11/13 OHLCV；剩余：4/13周背景与目标周事件复核' }
    ]
  });
  const { document } = loadTodos(latestBootstrap(daily, weekly), 'daily', {});
  const blocked = todoSection(document, 'ios-todo-blocked');
  const asset = blocked.children.filter((c) => c.classList.contains('ios-todo-asset'))[0];
  const top = asset.children[1].children;
  assert.equal(top.length, 3, 'MSFT-13 once, then WP-MSFT and MSFT-CPI on their own');
  assert.equal(top[0].children[0].children[1].textContent, 'Weekly MSFT Q1 check');
  assert.ok(top[0].classList.contains('ios-todo-done'), 'the newer Weekly decides how the merged item reads');
  const conflict = top[0].children.find((c) => c.classList && c.classList.contains('ios-todo-copy'));
  assert.ok(conflict.classList.contains('ios-todo-copy-conflict'));
  assert.match(conflict.textContent, /同一工作也见于日报 11\/14：待处理·可执行（该报告快照的状态不同，以较新的周报 11\/15为准/);
  const fold = top[0].children.find((c) => c.classList && c.classList.contains('ios-todo-copy-fold'));
  assert.equal(fold.getAttribute('open'), null, 'the other source is folded');
  assert.match(fold.textContent, /Daily MSFT Q1 check/, 'and kept in full');
  assert.deepEqual([top[1], top[2]].map((li) => li.children[0].children[1].textContent), ['Weekly MSFT plan range', 'Daily MSFT CPI check']);
  assert.match(todoSection(document, 'ios-todo-overview').textContent, /卡住买入 2 项/, 'WP-MSFT and MSFT-CPI stay open; the merged MSFT-13 is not counted again');
});

test('Issue #403: 复核键 decides when both rows have one; otherwise only an equal 待办ID merges, never across 卡住买入 and 其他待办 or inside one report', () => {
  const daily = reportVm('daily', '2026-11-14', {
    holdings: [blockedRow('AAA', 'A-1')],
    todos: [
      { 待办ID: 'A-1', 待办: 'Daily A-1', 状态: '待处理' },
      { 待办ID: 'K-1', 待办: 'Daily K-1', 状态: '待处理', 复核键: '事件|BBB|财报|src-1|2026-11-01' },
      { 待办ID: 'S-1', 待办: 'Daily S-1', 状态: '待处理', 复核键: '事件|CCC|财报|src-2|2026-11-01' },
      { 待办ID: 'D-1', 待办: 'Daily D-1 same key', 状态: '待处理', 复核键: '事件|DDD|财报|src-3|2026-11-01' },
      { 待办ID: 'D-2', 待办: 'Daily D-2 same key', 状态: '待处理', 复核键: '事件|DDD|财报|src-3|2026-11-01' },
      { 待办ID: 'U-1', 待办: 'Daily U-1 unclaimed', 状态: '待处理' }
    ]
  });
  const weekly = reportVm('weekly', '2026-11-15', {
    holdings: [blockedRow('UUU', 'U-1')],
    todos: [
      { 待办ID: 'A-1', 待办: 'Weekly A-1 unclaimed', 状态: '待处理' },
      { 待办ID: 'K-9', 待办: 'Weekly K-9', 状态: '待处理', 复核键: '事件|BBB|财报|src-1|2026-11-01' },
      { 待办ID: 'S-1', 待办: 'Weekly S-1 other key', 状态: '待处理', 复核键: '事件|CCC|财报|src-9|2026-11-01' },
      { 待办ID: 'U-1', 待办: 'Weekly U-1 blocker', 状态: '待处理' }
    ]
  });
  const { document } = loadTodos(latestBootstrap(daily, weekly), 'daily', {});
  const others = todoSection(document, 'ios-todo-others');
  const top = others.children.find((c) => c.tagName === 'UL').children.map((li) => li.children[0].children[1].textContent);
  assert.deepEqual(top, ['Weekly A-1 unclaimed', 'Weekly K-9', 'Weekly S-1 other key', 'Daily S-1', 'Daily D-1 same key', 'Daily D-2 same key', 'Daily U-1 unclaimed']);
  assert.match(itemNamed(document, 'Weekly K-9').textContent, /同一工作也见于日报 11\/14/, 'equal 复核键 merges different 待办ID');
  assert.doesNotMatch(itemNamed(document, 'Weekly S-1 other key').textContent, /同一工作/, 'different 复核键 keeps an equal 待办ID apart');
  assert.doesNotMatch(itemNamed(document, 'Daily D-1 same key').textContent, /同一工作/, 'rows of one report never merge');
  assert.doesNotMatch(itemNamed(document, 'Weekly A-1 unclaimed').textContent, /同一工作/, 'a blocker and an unclaimed row stay apart');
  const blockedText = todoSection(document, 'ios-todo-blocked').textContent;
  assert.match(blockedText, /Weekly U-1 blocker/);
  assert.match(blockedText, /Daily A-1/);
  assert.doesNotMatch(blockedText, /同一工作/);
});

test('PR #405 review: only a one-to-one pair merges; one-to-many, many-to-one and many-to-many keys leave every row on its own, in any input order', () => {
  const run = (dailyTodos, weeklyTodos) => {
    const daily = reportVm('daily', '2026-11-14', { todos: dailyTodos });
    const weekly = reportVm('weekly', '2026-11-15', { todos: weeklyTodos });
    const { document } = loadTodos(latestBootstrap(daily, weekly), 'daily', {});
    const others = todoSection(document, 'ios-todo-others');
    return { text: others.textContent, names: others.children.find((c) => c.tagName === 'UL').children.map((li) => li.children[0].children[1].textContent), document };
  };
  const K = '事件|AAA|财报|src-1|2026-11-01';
  const d1 = { 待办ID: 'D1', 待办: 'Daily D1', 状态: '待处理', 复核键: K };
  const d2 = { 待办ID: 'D2', 待办: 'Daily D2', 状态: '待处理', 复核键: K };
  const w1 = { 待办ID: 'W1', 待办: 'Weekly W1', 状态: '已完成', 复核键: K };
  const w2 = { 待办ID: 'W2', 待办: 'Weekly W2', 状态: '待处理', 复核键: K };
  [[[d1, d2], [w1]], [[d2, d1], [w1]], [[d1], [w1, w2]], [[d1], [w2, w1]], [[d1, d2], [w1, w2]]].forEach(([dt, wt], i) => {
    const r = run(dt, wt);
    assert.doesNotMatch(r.text, /同一工作/, 'case ' + i + ': an ambiguous key never merges');
    assert.equal(r.names.length + todoNames(todoSection(r.document, 'ios-todo-completed')).length, dt.length + wt.length, 'case ' + i + ': every row stays');
  });
  const idOnly = run([{ 待办ID: 'X', 待办: 'Daily X a', 状态: '待处理' }],
    [{ 待办ID: 'X', 待办: 'Weekly X', 状态: '待处理' }, { 待办ID: 'Y', 待办: 'Weekly Y same key', 状态: '待处理', 复核键: 'k' }]);
  assert.match(idOnly.text, /同一工作也见于日报 11\/14/, 'a unique one-to-one pair still merges');
});

test('PR #405 review: two open rows that differ only in 跟进类型 are marked as a status difference', () => {
  const daily = reportVm('daily', '2026-11-14', { todos: [{ 待办ID: 'V-1', 待办: 'Daily V-1', 状态: '待处理', 跟进类型: '可执行' }] });
  const weekly = reportVm('weekly', '2026-11-15', { todos: [{ 待办ID: 'V-1', 待办: 'Weekly V-1', 状态: '待处理', 跟进类型: '等待证据' }] });
  const { document } = loadTodos(latestBootstrap(daily, weekly), 'daily', {});
  const item = itemNamed(document, 'Weekly V-1');
  const copy = item.children.find((c) => c.classList && c.classList.contains('ios-todo-copy'));
  assert.ok(copy.classList.contains('ios-todo-copy-conflict'));
  assert.match(copy.textContent, /日报 11\/14：待处理·可执行（该报告快照的状态不同，以较新的周报 11\/15为准/);
  const same = loadTodos(latestBootstrap(
    reportVm('daily', '2026-11-14', { todos: [{ 待办ID: 'S-1', 待办: 'Daily S-1', 状态: '待处理', 跟进类型: '等待证据' }] }),
    reportVm('weekly', '2026-11-15', { todos: [{ 待办ID: 'S-1', 待办: 'Weekly S-1', 状态: '待处理', 跟进类型: '等待证据' }] })), 'daily', {});
  const sameCopy = itemNamed(same.document, 'Weekly S-1').children.find((c) => c.classList && c.classList.contains('ios-todo-copy'));
  assert.ok(!sameCopy.classList.contains('ios-todo-copy-conflict'), 'equal 状态 and 跟进类型 is no conflict');
});

test('Issue #403: a note shows 已核验 / 剩余 / 下一验证点 first and folds the full text; a long or linked note folds; a short one stays inline', () => {
  const { document } = loadTodos(buildBootstrapWithTodos([
    { 排序: 1, 待办: 'Labelled', 状态: '待处理', 备注: '审计：原生成ID x；剩余：独立估值；已核验：ep-1 https://example.com/a；下一验证点：11/17 财报' },
    { 排序: 2, 待办: 'Linked', 状态: '待处理', 备注: '见 https://example.com/b' },
    { 排序: 3, 待办: 'Long', 状态: '待处理', 备注: '长'.repeat(121) },
    { 排序: 4, 待办: 'Short', 状态: '待处理', 备注: '已核验 但没有冒号' }
  ]), 'daily', {});
  const labelled = itemNamed(document, 'Labelled');
  const parts = labelled.children.filter((c) => c.classList && c.classList.contains('ios-todo-note-part')).map((c) => c.textContent);
  assert.deepEqual(parts, ['已核验：ep-1 https://example.com/a', '剩余：独立估值', '下一验证点：11/17 财报'], 'fixed label order, exact labels only');
  const fold = labelled.children.find((c) => c.classList && c.classList.contains('ios-todo-note-fold'));
  assert.equal(fold.getAttribute('open'), null);
  assert.match(fold.textContent, /完整备注与来源[\s\S]*审计：原生成ID x/, 'the full note is never cut');
  ['Linked', 'Long'].forEach((name) => {
    const f = itemNamed(document, name).children.find((c) => c.classList && c.classList.contains('ios-todo-note-fold'));
    assert.ok(f, name);
    assert.match(f.children[0].textContent, /备注（展开）/);
  });
  const short = itemNamed(document, 'Short');
  assert.equal(short.children.length, 3);
  assert.equal(short.children[2].textContent, '已核验 但没有冒号');
});

function splitSample(type, date, overrides) {
  const o = overrides || {};
  return reportVm(type, date, {
    holdings: [blockedRow('TSM', o.blockers || 'TSM-32-S1、TSM-32-S2')],
    todos: [
      { 待办ID: 'TSM-32', 待办: type + ' TSM-32 parent', 状态: '待处理', 跟进类型: '可执行', 备注: o.parentNote || '拆分：TSM-32-S1=13周行情、TSM-32-S2=产能利用；已核验：10月营收与 Q3 先进制程占比' },
      { 待办ID: 'TSM-32-S1', 待办: type + ' 4/13 周背景', 状态: o.s1Status || '待处理', 跟进类型: '可执行', 备注: '父待办：TSM-32；步骤键：13周行情；已核验：11/09–13 OHLCV；剩余：补 13 周同口径行情' },
      { 待办ID: 'TSM-32-S2', 待办: type + ' 产能利用', 状态: '待处理', 跟进类型: '等待证据', 备注: '父待办：TSM-32；步骤键：' + (o.s2Key || '产能利用') + '；剩余：实际产能利用；下一验证点：11 月月报 https://example.com/' + 'x'.repeat(200) }
    ].concat(o.extra || [])
  });
}

function splitBlock(li) {
  return li.children.find((c) => c.classList && c.classList.contains('ios-todo-split'));
}

test('Issue #403 split: a blocker naming split children shows the parent once, first screen 现在能做 / 等待什么 / 已核验, children folded', () => {
  const { document } = loadTodos(latestBootstrap(splitSample('daily', '2026-11-14'), null), 'daily', {});
  const blocked = todoSection(document, 'ios-todo-blocked');
  const asset = blocked.children.filter((c) => c.classList.contains('ios-todo-asset'))[0];
  const top = asset.children[1].children;
  assert.equal(top.length, 1, 'both child blockers resolve to one parent card');
  assert.equal(top[0].children[0].children[1].textContent, 'daily TSM-32 parent');
  const split = splitBlock(top[0]);
  const groups = split.children.map((g) => g.children[0].textContent);
  assert.deepEqual(groups, ['现在能做（1）', '等待什么（1）', '已核验（1）']);
  assert.match(split.children[0].textContent, /TSM-32-S1[\s\S]*剩余：补 13 周同口径行情/);
  assert.match(split.children[1].textContent, /TSM-32-S2[\s\S]*剩余：实际产能利用[\s\S]*下一验证点：11 月月报/);
  assert.match(split.children[2].textContent, /10月营收与 Q3 先进制程占比/);
  const fold = top[0].children.find((c) => c.classList && c.classList.contains('ios-todo-split-fold'));
  assert.equal(fold.getAttribute('open'), null);
  assert.match(fold.textContent, /子待办原条目 2 条[\s\S]*daily 4\/13 周背景[\s\S]*daily 产能利用/);
  assert.equal(todoSection(document, 'ios-todo-others').textContent.indexOf('TSM-32-S'), -1, 'children never repeat under 其他待办');
  assert.match(todoSection(document, 'ios-todo-overview').textContent, /卡住买入 1 项 · 其他待办 0 项/);
});

test('Issue #403 split: a half-done parent lists the finished child under 已核验 and stays open', () => {
  const { document } = loadTodos(latestBootstrap(splitSample('daily', '2026-11-14', { s1Status: '已完成' }), null), 'daily', {});
  const parent = itemNamed(document, 'daily TSM-32 parent');
  assert.ok(parent.classList.contains('ios-todo-open'));
  const groups = splitBlock(parent).children.map((g) => g.children[0].textContent);
  assert.deepEqual(groups, ['等待什么（1）', '已核验（2）']);
  assert.match(splitBlock(parent).children[1].textContent, /TSM-32-S1[\s\S]*已核验：11\/09–13 OHLCV/);
});

test('Issue #403 split: the same parent in Daily and Weekly is one item; the other report keeps its own children in the fold', () => {
  const { document } = loadTodos(latestBootstrap(splitSample('daily', '2026-11-14'), splitSample('weekly', '2026-11-15')), 'daily', {});
  const asset = todoSection(document, 'ios-todo-blocked').children.filter((c) => c.classList.contains('ios-todo-asset'))[0];
  const top = asset.children[1].children;
  assert.equal(top.length, 1);
  assert.equal(top[0].children[0].children[1].textContent, 'weekly TSM-32 parent', 'the newer report leads');
  const copyFold = top[0].children.find((c) => c.classList && c.classList.contains('ios-todo-copy-fold') && !c.classList.contains('ios-todo-split-fold'));
  assert.match(copyFold.textContent, /daily TSM-32 parent[\s\S]*子待办原条目 2 条[\s\S]*daily 4\/13 周背景/);
});

test('Issue #403 split: an unknown parent, a one-sided link, a duplicated child ID or a contradicting 步骤键 is never nested, and no row is hidden', () => {
  const cases = [
    ['unlisted child', [{ 待办ID: 'P-1', 待办: 'Parent', 备注: '拆分：P-1-S1=a；已核验：x' }, { 待办ID: 'P-1-S1', 待办: 'Child one', 备注: '父待办：P-1；步骤键：a' },
      { 待办ID: 'P-1-S2', 待办: 'Child two', 备注: '父待办：P-1；步骤键：b' }]],
    ['unknown parent', [{ 待办ID: 'Q-1-S1', 待办: 'Child one', 备注: '父待办：Q-1；步骤键：a' }]],
    ['duplicate child ID', [{ 待办ID: 'R-1', 待办: 'Parent', 备注: '拆分：R-1-S1=a' }, { 待办ID: 'R-1-S1', 待办: 'Child one', 备注: '父待办：R-1；步骤键：a' },
      { 待办ID: 'R-1-S1', 待办: 'Child two', 备注: '父待办：R-1；步骤键：a' }]],
    ['contradicting 步骤键', [{ 待办ID: 'S-1', 待办: 'Parent', 备注: '拆分：S-1-S1=a、S-1-S2=b' }, { 待办ID: 'S-1-S1', 待办: 'Child one', 备注: '父待办：S-1；步骤键：b' },
      { 待办ID: 'S-1-S2', 待办: 'Child two', 备注: '父待办：S-1；步骤键：a' }]],
    ['missing 步骤键', [{ 待办ID: 'T-1', 待办: 'Parent', 备注: '拆分：T-1-S1=a' }, { 待办ID: 'T-1-S1', 待办: 'Child one', 备注: '父待办：T-1；剩余：x' }]],
    ['list without keys', [{ 待办ID: 'U-1', 待办: 'Parent', 备注: '拆分：U-1-S1、U-1-S2' }, { 待办ID: 'U-1-S1', 待办: 'Child one', 备注: '父待办：U-1；步骤键：a' },
      { 待办ID: 'U-1-S2', 待办: 'Child two', 备注: '父待办：U-1；步骤键：b' }]],
    ['repeated key', [{ 待办ID: 'V-1', 待办: 'Parent', 备注: '拆分：V-1-S1=a、V-1-S2=a' }, { 待办ID: 'V-1-S1', 待办: 'Child one', 备注: '父待办：V-1；步骤键：a' },
      { 待办ID: 'V-1-S2', 待办: 'Child two', 备注: '父待办：V-1；步骤键：a' }]],
    ['listed child missing', [{ 待办ID: 'W-1', 待办: 'Parent', 备注: '拆分：W-1-S1=a、W-1-S2=b' }, { 待办ID: 'W-1-S1', 待办: 'Child one', 备注: '父待办：W-1；步骤键：a' }]],
    ['key with separator', [{ 待办ID: 'X-1', 待办: 'Parent', 备注: '拆分：X-1-S1=a b' }, { 待办ID: 'X-1-S1', 待办: 'Child one', 备注: '父待办：X-1；步骤键：a b' }]]
  ];
  cases.forEach(([label, todos]) => {
    const rows = todos.map((t) => Object.assign({ 状态: '待处理' }, t));
    const { document } = loadTodos(latestBootstrap(reportVm('daily', '2026-11-14', { todos: rows }), null), 'daily', {});
    const names = todoNames(todoSection(document, 'ios-todo-others'));
    assert.equal(names.length, rows.length, label + ': every row stays on its own');
    assert.equal(allElements(document.getElementById('ios-tab-content')).filter((n) => n.classList && n.classList.contains('ios-todo-split')).length, 0, label);
  });
});

test('Issue #403 split: Unicode 步骤键 nest; Daily and Weekly lists that bind one child ID to different 步骤键 are not folded together', () => {
  const uni = splitSample('daily', '2026-11-14', { parentNote: '拆分：TSM-32-S1=13周行情、TSM-32-S2=産能·利用；已核验：x', s2Key: '産能·利用' });
  let { document } = loadTodos(latestBootstrap(uni, null), 'daily', {});
  assert.ok(splitBlock(itemNamed(document, 'daily TSM-32 parent')), 'a Unicode key round-trips');
  const weekly = splitSample('weekly', '2026-11-15', { parentNote: '拆分：TSM-32-S1=13周行情、TSM-32-S2=月报；已核验：x', s2Key: '月报' });
  ({ document } = loadTodos(latestBootstrap(splitSample('daily', '2026-11-14'), weekly), 'daily', {}));
  const asset = todoSection(document, 'ios-todo-blocked').children.filter((c) => c.classList.contains('ios-todo-asset'))[0];
  const top = asset.children[1].children;
  assert.equal(top.length, 2, 'both parents shown, never folded into one');
  top.forEach((li) => assert.match(li.textContent, /拆分清单不一致（子ID与步骤键对不上），两份报告分开显示/));
  assert.ok(top.every((li) => splitBlock(li)), 'each report still nests its own consistent children');
});

test('Issue #403 split: the shared 步骤键 grammar (fixtures/todo-split/step-keys.json) decides nesting exactly as the writer spec does', () => {
  const cases = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', 'fixtures', 'todo-split', 'step-keys.json'), 'utf8')).cases;
  assert.ok(cases.length >= 30);
  cases.forEach((c) => {
    const todos = [
      { 待办ID: 'K-1', 待办: 'Parent', 状态: '待处理', 备注: '拆分：K-1-S1=' + c.key + '、K-1-S2=wait；已核验：x' },
      { 待办ID: 'K-1-S1', 待办: 'Now', 状态: '待处理', 跟进类型: '可执行', 备注: '父待办：K-1；步骤键：' + c.key + '；剩余：x' },
      { 待办ID: 'K-1-S2', 待办: 'Wait', 状态: '待处理', 跟进类型: '等待证据', 备注: '父待办：K-1；步骤键：wait；剩余：y' }
    ];
    const { document } = loadTodos(latestBootstrap(reportVm('daily', '2026-11-14', { todos }), null), 'daily', {});
    const nested = allElements(document.getElementById('ios-tab-content')).some((n) => n.classList && n.classList.contains('ios-todo-split'));
    assert.equal(nested, c.valid, c.why + ' ' + JSON.stringify(c.key));
    assert.equal(todoNames(todoSection(document, 'ios-todo-others')).length, c.valid ? 1 + 2 : 3, c.why + ': no row is hidden');
  });
});

test('Issue #403 split: two Now steps and one Wait step nest under one parent, in list order', () => {
  const daily = reportVm('daily', '2026-11-14', { todos: [
    { 待办ID: 'P', 待办: 'Parent', 状态: '待处理', 跟进类型: '可执行', 备注: '拆分：P-S1=乙、P-S2=甲、P-S3=等；已核验：x' },
    { 待办ID: 'P-S1', 待办: 'Now B', 状态: '待处理', 跟进类型: '可执行', 备注: '父待办：P；步骤键：乙；剩余：b' },
    { 待办ID: 'P-S2', 待办: 'Now A', 状态: '待处理', 跟进类型: '可执行', 备注: '父待办：P；步骤键：甲；剩余：a' },
    { 待办ID: 'P-S3', 待办: 'Wait', 状态: '待处理', 跟进类型: '等待证据', 备注: '父待办：P；步骤键：等；剩余：w' }
  ] });
  const { document } = loadTodos(latestBootstrap(daily, null), 'daily', {});
  const split = splitBlock(itemNamed(document, 'Parent'));
  assert.deepEqual(split.children.map((g) => g.children[0].textContent), ['现在能做（2）', '等待什么（1）', '已核验（1）']);
  assert.match(split.children[0].textContent, /P-S1[\s\S]*P-S2/);
});

test('Issue #403 split: writer rows (fixtures/todo-split/continued-rows.json) keep 已核验, 下一验证点 and sources on the parent card', () => {
  const rows = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', 'fixtures', 'todo-split', 'continued-rows.json'), 'utf8')).rows;
  const daily = reportVm('weekly', '2026-11-15', { holdings: [blockedRow('CEG', 'CEG-Q3-S2、CEG-Q3-S3')], todos: rows });
  const { document } = loadTodos(latestBootstrap(null, daily), 'weekly', {});
  const asset = todoSection(document, 'ios-todo-blocked').children.filter((c) => c.classList.contains('ios-todo-asset'))[0];
  const top = asset.children[1].children;
  assert.equal(top.length, 1);
  const split = splitBlock(top[0]);
  assert.deepEqual(split.children.map((g) => g.children[0].textContent), ['现在能做（1）', '等待什么（1）', '已核验（2）']);
  assert.match(split.children[0].textContent, /CEG-Q3-S3[\s\S]*剩余：RISEC 交割条款核对/);
  assert.match(split.children[1].textContent, /CEG-Q3-S2[\s\S]*剩余：项目级核燃料\/PPA 现金成本[\s\S]*下一验证点：2026 10-K/);
  assert.match(split.children[2].textContent, /9M CFO\/CapEx[\s\S]*CEG-Q3-S1[\s\S]*已核验：Q3 10-Q，现金桥 v1/);
  const fold = top[0].children.find((c) => c.classList && c.classList.contains('ios-todo-split-fold'));
  assert.match(fold.textContent, /来源：https:\/\/www\.sec\.gov\//, 'the source link is kept in the folded child row');
});

test('Issue #403 split: a blocker link to a child opens the parent\'s child fold', () => {
  const daily = splitSample('daily', '2026-11-14', { blockers: 'TSM-32-S2' });
  const { document } = loadTodos(latestBootstrap(daily, null), 'daily', {});
  const parent = itemNamed(document, 'daily TSM-32 parent');
  assert.ok(parent, 'a single child blocker still shows the parent');
  assert.equal(splitBlock(parent).children[0].children[0].textContent, '现在能做（1）', 'all children are shown, not only the blocking one');
});

test('todos: one todo named by two rows of the same report is listed once, the second asset points to it', () => {
  const daily = reportVm('daily', '2026-11-11', {
    holdings: [blockedRow('AAA', 'X-1'), blockedRow('BBB', 'X-1')],
    todos: [{ 待办ID: 'X-1', 待办: 'Shared blocker', 状态: '待处理' }]
  });
  const { document } = loadTodos(latestBootstrap(daily, null), 'daily', {});
  const blocked = todoSection(document, 'ios-todo-blocked');
  assert.equal(todoNames(blocked).length, 1);
  assert.match(blocked.textContent, /BBB[\s\S]*与 AAA 共用同一条阻塞待办/);
  assert.match(todoSection(document, 'ios-todo-overview').textContent, /卡住买入 1 项/);
});

test('todos: a blocker link on the latest report highlights that report\'s todo, even when the other report reuses the same 待办ID', () => {
  const daily = reportVm('daily', '2026-11-11', {
    holdings: [blockedRow('AAA', 'T-1', { 当前阻碍: 'x' })],
    todos: [{ 待办ID: 'T-1', 待办: 'Daily T-1', 状态: '待处理' }]
  });
  const weekly = reportVm('weekly', '2026-11-09', {
    holdings: [blockedRow('AAA', 'T-1', { 当前阻碍: 'x' })],
    todos: [{ 待办ID: 'T-1', 待办: 'Weekly T-1', 状态: '待处理' }]
  });
  const { document, window } = loadDashboard(latestBootstrap(daily, weekly), 'daily', {});
  window.selectTab('weekly');
  const link = allElements(document.getElementById('ios-summary-content')).find((n) => n.classList && n.classList.contains('ios-blocker-link'));
  link.click();
  assert.ok(segmentOpen(document, 'todos'));
  const highlighted = todoItems(document.getElementById('ios-tab-content')).filter((li) => li.classList.contains('ios-todo-highlight'));
  assert.deepEqual(highlighted.map((li) => li.getAttribute('data-todo-key')), ['weekly|T-1']);
});

test('todos: a history report never changes the 待办 tab; its own blocker links open its own 本期待办 on its page', () => {
  const latest = reportVm('daily', '2026-11-11', { todos: [{ 待办ID: 'N-1', 待办: 'Latest todo', 状态: '待处理' }] });
  const history = Object.assign(reportVm('daily', '2026-11-01', {
    holdings: [blockedRow('AAA', 'H-1', { 当前阻碍: 'old blocker' })],
    todos: [{ 待办ID: 'H-1', 待办: 'History todo', 状态: '待处理' }]
  }), { error: null });
  const { document, window } = loadDashboard(latestBootstrap(latest, null), 'daily', { getReport: () => history });
  window.selectHistoryReport('daily-2026-11-01');
  assert.ok((document.getElementById('ios-tab-report').classList.contains('active') && document.getElementById('ios-seg-daily').getAttribute('aria-pressed') === 'true'));
  assert.match(document.getElementById('ios-history-banner').textContent, /待办与风险 tab 仍是最新日报 \+ 最新周报的合并结果/);
  const panel = () => document.getElementById('ios-summary-content').children.find((c) => c.classList.contains('ios-period-panel'));
  assert.equal(panel(), undefined, 'the period list stays closed until asked for (#396 PR B)');
  const link = allElements(document.getElementById('ios-summary-content')).find((n) => n.classList && n.classList.contains('ios-blocker-link'));
  link.click();
  assert.ok((document.getElementById('ios-tab-report').classList.contains('active') && document.getElementById('ios-seg-daily').getAttribute('aria-pressed') === 'true'), 'a history link stays on the history page');
  assert.equal(panel().getAttribute('data-panel'), 'todos');
  assert.match(panel().textContent, /只显示日报 11\/01这一期自己的待办/);
  assert.deepEqual(todoItems(panel()).filter((li) => li.classList.contains('ios-todo-highlight')).map((li) => li.getAttribute('data-todo-id')), ['H-1']);
  window.selectTab('todos');
  assert.match(tabText(document), /Latest todo/);
  assert.doesNotMatch(tabText(document), /History todo/);
  assert.equal(document.getElementById('ios-history-banner').hidden, true);
});

test('todos: when a report was written twice, only the generation its 报告摘要 points to is listed (filterLiveDetailRows_)', () => {
  const sheet = JSON.parse(JSON.stringify(demoSheet));
  sheet['报告待办'].push({
    报告ID: 'daily-2026-08-15', 生成ID: 'gen-daily-0815-a', 报告类型: 'daily', 报告日期: '2026-08-15', 排序: 1, 分类: '',
    待办: 'Orphaned first write', 状态: '待处理', 跟进类型: '可执行', 备注: ''
  });
  sheet['报告待办'].push({
    报告ID: 'weekly-2026-08-15', 生成ID: 'gen-weekly-0815-old', 报告类型: 'weekly', 报告日期: '2026-08-15', 排序: 1, 分类: '',
    待办: 'Orphaned weekly write', 状态: '待处理', 跟进类型: '可执行', 备注: ''
  });
  sheet['报告待办'].push({
    报告ID: 'weekly-2026-08-15', 生成ID: 'gen-weekly-0815-a', 报告类型: 'weekly', 报告日期: '2026-08-15', 排序: 1, 分类: '',
    待办: 'Current weekly write', 状态: '待处理', 跟进类型: '可执行', 备注: ''
  });
  const { document } = loadTodos(logic.buildDashboardBootstrap_(sheet), 'daily', {});
  const page = tabText(document);
  assert.doesNotMatch(page, /Orphaned/);
  assert.match(page, /Current weekly write/);
  assert.equal(todoItems(todoSection(document, 'ios-todo-others')).filter((li) => /跟踪 Demo Cloud Systems/.test(li.textContent)).length, 1);
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
  const section = portfolioSection(document, '本期观察候选');
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
  const cardText = portfolioSection(document, '本期观察候选').children[2].children[0].textContent;
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
  return portfolioSection(document, '当前持仓').children[1].children[0];
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

test('Issue #388 PR E: entry plan IDs and FUND-SLEEVE read as names in todos, explanations and the history list; 技术信息 keeps the raw value', () => {
  const bootstrap = buildBootstrapWithTodos([
    { 排序: 1, 分类: '估值', 待办: '补齐 ep-20261101-NVDA-v3 与 ep-20261020-BRK-B-v12 的估值；核对 FUND-SLEEVE', 状态: '待处理', 备注: '见 ep-20261101-NVDA-v3' }
  ]);
  bootstrap.dailyHistory = [{ reportId: 'daily-2026-11-09', reportDate: '2026-11-09', headline: 'FUND-SLEEVE 先核对缺项' }];
  bootstrap.daily.holdings = [{
    报告ID: 'daily-2026-08-20', 报告类型: 'daily', 资产类型: 'holding', 代码: 'FUND-SLEEVE', 名称: '', IOS状态: '',
    今日行动: '先核对缺项', 当前阻碍: '估值缺失：ep-20261101-NVDA-v3 未写长期买入上限', 入场计划ID: 'ep-20261101-NVDA-v3', 入场计划版本: 3
  }];
  const { document, window } = loadDashboard(bootstrap, 'daily', {});
  const options = document.getElementById('ios-history-select').children.map((o) => o.textContent);
  assert.ok(options.some((t) => t.includes('基金定投（合计） 先核对缺项')), options.join('|'));
  assert.ok(!options.some((t) => t.includes('FUND-SLEEVE')));
  window.selectTab('todos');
  const todos = tabText(document);
  assert.match(todos, /补齐 入场计划 v3 与 入场计划 v12 的估值；核对 基金定投（合计）/);
  assert.match(todos, /见 入场计划 v3/);
  assert.doesNotMatch(todos, /ep-2026/);
  window.selectTab('daily');
  const card = portfolioSection(document, '当前持仓');
  const tech = findAllNodes(card, (n) => n.tagName === 'DETAILS' && n.children[0].textContent === '技术信息');
  const techText = tech.map((n) => n.textContent).join('');
  const visible = card.textContent.replace(techText, '');
  assert.match(visible, /估值缺失：入场计划 v3 未写长期买入上限/);
  assert.doesNotMatch(visible, /ep-20261101|FUND-SLEEVE/);
  assert.match(techText, /FUND-SLEEVE/, '技术信息 keeps the raw code');
  assert.match(techText, /ep-20261101-NVDA-v3/, '技术信息 keeps the raw plan ID');
});

function findAllNodes(node, pred, out = []) {
  if (node.children) {
    node.children.forEach((child) => {
      if (child.tagName && pred(child)) out.push(child);
      findAllNodes(child, pred, out);
    });
  }
  return out;
}

// -- Issue #409 P1: 今天 and the shared action model --

function todayFixture() {
  const daily = reportVm('daily', '2026-11-15', {
    summary: { 报告ID: 'daily-2026-11-15', 报告日期: '2026-11-15', 一句话结论: 'Daily headline' },
    holdings: [blockedRow('AAA', 'AAA-1', { 变化标记: '有变化' }), { 代码: 'EEE', 名称: 'EEE Co.', 资产类型: 'holding', 今日行动: '等待价格', 变化标记: '无变化' }],
    risks: [{ 风险: '集中度', 风险键: 'portfolio|K1', 风险评估: '触发', 严重度: '高' }],
    todos: [
      { 待办ID: 'AAA-1', 待办: 'Check guidance', 状态: '待处理', 跟进类型: '可执行' },
      { 待办ID: 'X-1', 待办: 'Fund debit check', 状态: '待处理', 跟进类型: '可执行' },
      { 待办ID: 'DONE-1', 待办: 'Finished', 状态: '已完成' }
    ]
  });
  const weekly = reportVm('weekly', '2026-11-14', {
    summary: { 报告ID: 'weekly-2026-11-14', 报告日期: '2026-11-14', 一句话结论: 'Weekly headline' },
    holdings: [blockedRow('AAA', 'AAA-1')],
    risks: [{ 风险: '集中度', 风险键: 'portfolio|K1', 风险评估: '触发', 严重度: '高' }, { 风险: 'No key risk', 风险评估: '触发', 严重度: '中' }],
    todos: [
      { 待办ID: 'AAA-1', 待办: 'Check guidance', 状态: '待处理', 跟进类型: '等待证据' },
      { 待办ID: 'X-1', 待办: 'Fund debit check', 状态: '待处理', 跟进类型: '可执行' },
      { 待办ID: 'W-2', 待办: 'Wait for filing', 状态: '待处理', 跟进类型: '等待证据' }
    ]
  });
  return latestBootstrap(daily, weekly);
}

function todayCount(document, key) {
  const node = allElements(document.getElementById('ios-tab-content')).find((n) => n.getAttribute && n.getAttribute('data-count') === key);
  return Number(node.children[0].textContent);
}

test('Issue #409 P1: 今天 counts equal the 待办 and 风险 views; the same work in Daily and Weekly and the same 风险键 count once', () => {
  const { document, window } = loadDashboard(todayFixture(), 'daily', {});
  const counts = { blocked: todayCount(document, 'blocked'), others: todayCount(document, 'others'),
    invest: todayCount(document, 'invest'), maintenance: todayCount(document, 'maintenance') };
  assert.deepEqual(counts, { blocked: 1, others: 2, invest: 2, maintenance: 0 },
    'AAA-1 is one item (Daily + Weekly fold), X-1 is one item, K1 is one risk; the keyless risk stands alone');
  window.selectTab('todos');
  assert.match(todoSection(document, 'ios-todo-overview').textContent, new RegExp('卡住买入 ' + counts.blocked + ' 项 · 其他待办 ' + counts.others + ' 项'));
  window.selectTab('risks');
  assert.match(tabText(document), new RegExp('投资风险 \\(' + counts.invest + '\\)'));
  assert.match(tabText(document), new RegExp('数据维护 \\(' + counts.maintenance + '\\)'));
  window.selectTab('daily');
  const cards = document.getElementById('ios-summary-content').children.find((c) => c.classList.contains('ios-count-cards'));
  assert.match(cards.textContent, new RegExp('卡住买入 ' + counts.blocked + ' / 其他待办 ' + counts.others));
  assert.match(cards.textContent, new RegExp('风险 ' + counts.invest + ' 项'));
});

test('Issue #409 P1: 今天 shows each latest report\'s own headline, the open work with its source, triggered risks, buy groups and changes', () => {
  const { document } = loadDashboard(todayFixture(), 'daily', {});
  const content = document.getElementById('ios-tab-content');
  const section = (cls) => content.children.find((c) => c.classList.contains(cls));
  assert.deepEqual(content.children.map((c) => c.className), ['ios-card ios-today-conclusions', 'ios-today-counts-section',
    'ios-card ios-today-actions', 'ios-card ios-today-buy', 'ios-card ios-today-changes']);
  assert.match(section('ios-today-conclusions').textContent, /最新周报 11\/14[\s\S]*Weekly headline[\s\S]*最新日报 11\/15[\s\S]*Daily headline/);
  const actions = section('ios-today-actions').textContent;
  assert.match(actions, /卡住买入 \(1\)[\s\S]*AAA[\s\S]*Check guidance日报 11\/15 \+ 周报 11\/14/, 'the folded blocker names both reports');
  assert.match(actions, /其他待办 \(2\)[\s\S]*Fund debit check[\s\S]*Wait for filing/);
  assert.doesNotMatch(actions, /Finished/, 'a completed todo is not work to do');
  assert.match(actions, /触发风险 \(2\)[\s\S]*集中度[\s\S]*来源：周报 11\/14、日报 11\/15/);
  assert.match(section('ios-today-buy').textContent, /最新日报 11\/15[\s\S]*等待 1：EEE/);
  assert.match(section('ios-today-changes').textContent, /最新日报 11\/15[\s\S]*有变化 1：AAA[\s\S]*无变化 1 · 未比较 0/);
});

test('Issue #409 P1: every 今天 count and link opens its own view; a history report never changes 今天', () => {
  const { document, window } = loadDashboard(todayFixture(), 'daily', {});
  const targets = allElements(document.getElementById('ios-tab-content')).filter((n) => n.getAttribute && n.getAttribute('data-target'));
  assert.ok(targets.length >= 8);
  targets.forEach((node) => {
    window.selectTab('today');
    const target = node.getAttribute('data-target');
    const fresh = allElements(document.getElementById('ios-tab-content')).find((n) => n.getAttribute && n.getAttribute('data-target') === target);
    fresh.click();
    const view = target === 'daily' || target === 'weekly' ? 'report' : (target === 'todos' || target === 'risks' ? 'actions' : target);
    assert.ok(document.getElementById('ios-tab-' + view).classList.contains('active'), target);
    if (view === 'actions') assert.ok(segmentOpen(document, target), target);
    if (view === 'report') assert.equal(document.getElementById('ios-seg-' + target).getAttribute('aria-pressed'), 'true', target);
  });
  assert.equal(document.getElementById('ios-view-banner').hidden, true, 'the fixture reports are current: no reader banner');
});

test('Issue #409 P1: with nothing open 今天 says 本期无需操作, and with no report at all it says so', () => {
  const quiet = latestBootstrap(reportVm('daily', '2026-11-15', { todos: [{ 待办ID: 'D', 待办: 'Done', 状态: '已完成' }] }), null);
  let { document } = loadDashboard(quiet, 'daily', {});
  assert.match(tabText(document), /需要你处理本期无需操作/);
  ({ document } = loadDashboard(latestBootstrap(null, null), 'daily', {}));
  assert.match(tabText(document), /暂无报告[\s\S]*「今天」的内容来自报告/);
});

// -- PR #411 review: 今天 never shows 本期无需操作 while anything it counts or a mapping fault is open --

function todayActionsText(document) {
  return document.getElementById('ios-tab-content').children.find((c) => c.classList.contains('ios-today-actions')).textContent;
}

function todayCounts(document) {
  return ['blocked', 'others', 'invest', 'maintenance'].reduce((out, key) => Object.assign(out, { [key]: todayCount(document, key) }), {});
}

test('PR #411 review: maintenance only (a pause carried over) is not 本期无需操作; the tile and the listed entries agree with 风险', () => {
  const paused = { 代码: 'PPP', 名称: 'PPP Co.', 资产类型: 'holding', 今日行动: '暂停新增待复核', 变化标记: '无变化', 当前阻碍: '等待复核' };
  const { document, window } = loadDashboard(latestBootstrap(reportVm('daily', '2026-11-15', { holdings: [paused] }), null), 'daily', {});
  assert.deepEqual(todayCounts(document), { blocked: 0, others: 0, invest: 0, maintenance: 1 });
  const text = todayActionsText(document);
  assert.doesNotMatch(text, /本期无需操作/);
  assert.match(text, /数据维护 \(1\)[\s\S]*延续暂停PPP[\s\S]*日报 11\/15：暂停新增待复核，本期无变化（等待复核）/);
  window.selectTab('risks');
  assert.match(tabText(document), /数据维护 \(1\)/);
});

test('PR #411 review: a 阻塞待办ID the report does not list is shown as a mapping fault on 今天, never as 本期无需操作', () => {
  const daily = reportVm('daily', '2026-11-15', { holdings: [blockedRow('AAA', 'GONE-1')] });
  const { document, window } = loadDashboard(latestBootstrap(daily, null), 'daily', {});
  assert.deepEqual(todayCounts(document), { blocked: 0, others: 0, invest: 0, maintenance: 0 }, 'a missing todo is not an open todo');
  const text = todayActionsText(document);
  assert.doesNotMatch(text, /本期无需操作/);
  assert.match(text, /阻塞待办未找到 \(1\)[\s\S]*AAA：日报 11\/15 的买入判断引用了待办ID GONE-1，该报告中没有这条待办/);
  assert.match(tabText(document), /另有 1 条阻塞待办未找到/);
  window.selectTab('todos');
  assert.match(tabText(document), /阻塞待办未找到：日报 11\/15 的买入判断引用了待办ID GONE-1/, 'the 待办 page shows the same fault');
});

test('PR #411 review: missing mappings in both reports are both listed; one never hides the other', () => {
  const daily = reportVm('daily', '2026-11-15', { holdings: [blockedRow('AAA', 'D-GONE')] });
  const weekly = reportVm('weekly', '2026-11-14', { holdings: [blockedRow('AAA', 'W-GONE'), blockedRow('BBB', 'B-GONE')] });
  const { document } = loadDashboard(latestBootstrap(daily, weekly), 'daily', {});
  const text = todayActionsText(document);
  assert.match(text, /阻塞待办未找到 \(3\)/);
  ['D-GONE', 'W-GONE', 'B-GONE'].forEach((id) => assert.match(text, new RegExp('待办ID ' + id)));
});

test('PR #411 review: a one-to-many key is not folded on 今天 either; its count matches the 待办 page', () => {
  const daily = reportVm('daily', '2026-11-15', { todos: [{ 待办ID: 'D-1', 待办: 'Daily one', 状态: '待处理', 复核键: 'K' }] });
  const weekly = reportVm('weekly', '2026-11-14', { todos: [
    { 待办ID: 'W-1', 待办: 'Weekly one', 状态: '待处理', 复核键: 'K' },
    { 待办ID: 'W-2', 待办: 'Weekly two', 状态: '待处理', 复核键: 'K' }
  ] });
  const { document, window } = loadDashboard(latestBootstrap(daily, weekly), 'daily', {});
  assert.equal(todayCount(document, 'others'), 3, 'an ambiguous key merges nothing');
  ['Daily one', 'Weekly one', 'Weekly two'].forEach((name) => assert.match(todayActionsText(document), new RegExp(name)));
  window.selectTab('todos');
  assert.match(todoSection(document, 'ios-todo-overview').textContent, /其他待办 3 项/);
});

test('PR #411 review: a Daily open / newer Weekly 已完成 conflict is led by the Weekly on 今天 and the 待办 page alike', () => {
  const daily = reportVm('daily', '2026-11-13', { todos: [{ 待办ID: 'T-1', 待办: 'Check filing', 状态: '待处理' }] });
  const weekly = reportVm('weekly', '2026-11-14', { todos: [{ 待办ID: 'T-1', 待办: 'Check filing', 状态: '已完成' }] });
  const { document, window } = loadDashboard(latestBootstrap(daily, weekly), 'daily', {});
  assert.equal(todayCount(document, 'others'), 0, 'the newer report says done; the older open snapshot is not work to do now');
  assert.match(todayActionsText(document), /本期无需操作/);
  window.selectTab('todos');
  assert.match(tabText(document), /已完成 1 项/);
  assert.match(tabText(document), /同一工作也见于日报 11\/13：待处理/, 'the other source and its differing status stay visible on the 待办 page');
});

test('PR #411 review: 今天 degrades with only a Daily or only a Weekly, and a history selection never changes it', () => {
  const daily = reportVm('daily', '2026-11-15', { summary: { 报告ID: 'daily-2026-11-15', 报告日期: '2026-11-15', 一句话结论: 'Only daily' },
    todos: [{ 待办ID: 'N-1', 待办: 'Latest todo', 状态: '待处理' }] });
  const history = Object.assign(reportVm('daily', '2026-11-01', { todos: [{ 待办ID: 'H-1', 待办: 'History todo', 状态: '待处理' },
    { 待办ID: 'H-2', 待办: 'History two', 状态: '待处理' }] }), { error: null });
  const { document, window } = loadDashboard(latestBootstrap(daily, null), 'daily', { getReport: () => history });
  const conclusions = () => document.getElementById('ios-tab-content').children[0].textContent;
  assert.match(conclusions(), /最新日报 11\/15[\s\S]*Only daily/);
  assert.doesNotMatch(conclusions(), /周报/);
  const before = todayCounts(document);
  window.selectHistoryReport('daily-2026-11-01');
  window.selectTab('today');
  assert.deepEqual(todayCounts(document), before);
  assert.match(todayActionsText(document), /Latest todo/);
  assert.doesNotMatch(todayActionsText(document), /History/);
  assert.equal(document.getElementById('ios-history-banner').hidden, true, '今天 is not a history page');
  const weeklyOnly = loadDashboard(latestBootstrap(null, reportVm('weekly', '2026-11-14')), 'daily', {}).document;
  assert.match(weeklyOnly.getElementById('ios-tab-content').children[0].textContent, /最新周报 11\/14/);
});
