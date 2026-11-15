// Issue #370: the Dashboard page must never scroll sideways on a phone. #332
// fixed this once; the #342/#364 sections added later used grids and flex
// rows that sized themselves to their longest unbroken token, and the page
// widened again. This test renders the real Index/Styles/Script in headless
// Chrome at 320/375/390/430px and desktop, with every report string made
// long and unbreakable (IDs, time ranges, source URLs), and asserts that no
// Daily or Weekly tab is wider than its viewport. Desktop keeps two columns.
// Issue #409 P0: it also checks the new shell -- a desktop sidebar left of
// the content, and on a phone a bottom nav fixed to the screen, 44px tall per
// item, whose height the page padding fully clears.
//
// Zero dependencies: it drives the system Chrome/Chromium binary with
// --dump-dom. Each width is an <iframe srcdoc> inside one desktop-sized page,
// because headless Chrome will not open a window narrower than 500px. Without
// a browser the browser test is skipped locally and fails under CI.
//
// Run: node integrations/google-apps-script/ios-dashboard/test/no-horizontal-overflow.test.js

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const DIR = path.join(__dirname, '..');
const logic = require(path.join(DIR, 'Code.gs'));
const STYLES_SRC = fs.readFileSync(path.join(DIR, 'Styles.html'), 'utf8');

const WIDTHS = [320, 375, 390, 430, 1280];
const EXECUTED_SUMMARY = '已执行：8项持仓、23项观察；30份周计划、36条周度研究；估值与行情缺口明确保留。';
const LONG = 'gen-weekly-20990101-demo0000-demo0000-EP-DEMO1-2026Q4-https://example.com/a/very/long/source/path/without/spaces-' + 'A'.repeat(80);

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(DIR, rel), 'utf8'));
}

function tabsOf(rel) {
  const tabs = readJson(rel);
  Object.keys(tabs).forEach((key) => { if (key.startsWith('_') && key !== '_安装状态') delete tabs[key]; });
  return tabs;
}

function lengthen(value) {
  if (Array.isArray(value)) return value.map(lengthen);
  if (value && typeof value === 'object') {
    Object.keys(value).forEach((key) => { value[key] = lengthen(value[key]); });
    return value;
  }
  return typeof value === 'string' && value.length >= 6 ? value + LONG : value;
}

// Demo Daily/Weekly cards, todos, risks and allocation; the #364 layering
// view for both report types; the #359 inline fair value line on holdings.
function stressBootstrap() {
  const boot = logic.buildDashboardBootstrap_(tabsOf('demo/demo-sheet.json'));
  const layered = logic.buildDashboardBootstrap_(tabsOf('test/report-layering-fixture.json'));
  boot.weekly = layered.weekly;
  boot.daily.layering = layered.daily.layering;
  boot.daily.externalFairValue = { state: '已写入' };
  // Code.gs binds the fair value before building the layering, so the Daily report's own cards carry it too.
  const layeredHoldings = ['changed', 'unchanged', 'noBaseline'].reduce((rows, group) =>
    rows.concat(boot.daily.layering.daily[group].filter((item) => item.kind === 'holding').map((item) => item.row)), []);
  boot.daily.holdings.concat(layeredHoldings).forEach((holding) => {
    holding._iosExternalFairValue = {
      记录状态: '已读取，最近一次采集失败', 采集新鲜度: '过期', 外部公允价值: '123.45', 报价币种: 'USD',
      来源名称: 'external-source', 值记录获取时间: '2026-10-31T09:00:00+09:00'
    };
  });
  // Issue #388 PR A: 持仓明细 rows with every group filled, on both views.
  const detail = logic.buildHoldingDetailRow_({
    代码: 'DEMO1', 名称: 'Demo Holding', 资产类型: 'holding', _iosThreeLayer: true,
    长期买入上限快照: 400, 长期合理价值: '420–480 USD', 估值研究日期快照: '2026-09-30', 入场计划版本: 3,
    当前价格: 365, 报价币种: 'USD', 周计划状态: '有效', 周计划结论: '有购买区间', 周计划适用周: '2026-10-19–2026-10-23 NYSE',
    计划买入下限: '350 USD（区间1，本周购买计划）', 计划买入上限: '380 USD（区间1，本周购买计划）', 暂停事件载荷: '',
    _iosExternalFairValue: { 记录状态: '已读取', 外部公允价值: '123.45', 报价币种: 'USD', 来源名称: 'external-source', 值记录获取时间: '2026-10-31T09:00:00+09:00' }
  }, { state: '已写入' });
  [boot.daily, boot.weekly].forEach((vm) => { vm.holdingDetail = [detail, Object.assign({}, detail, { kind: 'watchlist' })]; });
  // Issue #376: a real Weekly writes a whole sentence into 核心状态.
  [boot.daily, boot.weekly].forEach((vm) => {
    vm.summary['核心状态'] = EXECUTED_SUMMARY;
    vm.summary['Review状态'] = EXECUTED_SUMMARY;
  });
  // Issue #403: the same work in both latest reports folds into one item, with a labelled note and a source link.
  [['daily', '2026-11-14', '待处理', '可执行'], ['weekly', '2026-11-15', '待处理', '等待证据']].forEach(([type, date, status, kind]) => {
    boot[type].todos = (boot[type].todos || []).concat([{
      待办ID: 'DEMO-403', 待办: 'Demo cross-report todo', 状态: status, 跟进类型: kind, 报告日期: date,
      备注: '已核验：ep-20261113-DEMO-v9 https://example.com/filing；剩余：独立长期估值；下一验证点：2026-11-17 财报'
    }]);
  });
  // Issue #403 mixed-todo split: a parent with one 现在能做 and one 等待什么 child, a long unbroken URL in a child note.
  const out = lengthen(boot);
  // (added after lengthen: the IDs must stay exact; the note text and the URL are long on their own)
  out.daily.todos = out.daily.todos.concat([
    { 待办ID: 'DEMO-SPLIT', 待办: 'Demo split parent', 状态: '待处理', 跟进类型: '可执行', 备注: '拆分：DEMO-SPLIT-S1=现金桥、DEMO-SPLIT-S2=项目披露；已核验：Q3 10-Q 现金流' },
    { 待办ID: 'DEMO-SPLIT-S1', 待办: 'Demo now step', 状态: '待处理', 跟进类型: '可执行', 备注: '父待办：DEMO-SPLIT；步骤键：现金桥；剩余：现金桥' },
    { 待办ID: 'DEMO-SPLIT-S2', 待办: 'Demo waiting step', 状态: '待处理', 跟进类型: '等待证据',
      备注: '父待办：DEMO-SPLIT；步骤键：项目披露；剩余：项目级披露；下一验证点：https://example.com/' + 'a'.repeat(160) }
  ]);
  return out;
}

function dashboardHtml(boot, view) {
  const index = fs.readFileSync(path.join(DIR, 'Index.html'), 'utf8');
  const stub = '<script>window.google={script:{run:new Proxy({},{get:function(t,k){' +
    'return (k==="withSuccessHandler"||k==="withFailureHandler")?function(){return window.google.script.run;}:function(){};}})}};</script>';
  return index
    .replace("<?!= include('Styles') ?>", () => STYLES_SRC)
    .replace("<?!= include('Script') ?>", () => fs.readFileSync(path.join(DIR, 'Script.html'), 'utf8'))
    .replace('<?!= bootstrapJson ?>', () => logic.escapeJsonForScriptContext_(JSON.stringify(boot)))
    .replace('<?!= JSON.stringify(activeView) ?>', () => JSON.stringify(view))
    .replace('<meta charset="utf-8">', '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">')
    .replace('<script>', () => stub + '<script>');
}

// Runs inside the harness page: one iframe per width, every view and tab,
// every <details> open, then the page's own scrollWidth against clientWidth.
// An element inside a scrolling box (the tab bar, the allocation table) is
// not a page overflow.
function harnessScript() {
  var results = [];
  function measure(win, width) {
    var doc = win.document;
    ['daily', 'weekly'].forEach(function (view) {
      win.switchView(view);
      // Issue #396: 日报 / 周报 are views of their own; 持仓明细 and 风险 read the report chosen there.
      ['report', 'holdingDetail', 'risks', 'todos'].forEach(function (tab) {
        win.selectTab(tab === 'report' ? view : tab);
        Array.prototype.forEach.call(doc.querySelectorAll('details'), function (d) { d.open = true; });
        var root = doc.documentElement;
        var offenders = [];
        Array.prototype.forEach.call(doc.querySelectorAll('body *'), function (node) {
          var box = node.getBoundingClientRect();
          if (box.width === 0 || box.right <= root.clientWidth + 0.5) return;
          for (var up = node.parentElement; up; up = up.parentElement) {
            var ox = win.getComputedStyle(up).overflowX;
            if (ox === 'auto' || ox === 'scroll' || ox === 'hidden') return;
          }
          offenders.push(node.tagName.toLowerCase() + '.' + String(node.className).split(' ').join('.'));
        });
        var clipped = [];
        Array.prototype.forEach.call(doc.querySelectorAll('.ios-metric-card'), function (card) {
          var outer = card.getBoundingClientRect();
          Array.prototype.forEach.call(card.children, function (child) {
            var box = child.getBoundingClientRect();
            if (box.right > outer.right + 0.5 || box.bottom > outer.bottom + 0.5 || child.scrollWidth > child.clientWidth + 1) {
              clipped.push(child.className + ': ' + child.textContent.slice(0, 12));
            }
          });
        });
        // Issue #388 PR D: one view on the page at a time; hidden views measure nothing.
        var visible = function (node) { return node.getBoundingClientRect().width > 0; };
        var grid = Array.prototype.filter.call(doc.querySelectorAll('.ios-card-grid'), visible)[0];
        var bar = doc.getElementById('ios-tab-bar').getBoundingClientRect();
        var active = doc.querySelector('.ios-tab-bar .ios-tab-btn.active').getBoundingClientRect();
        results.push({
          width: width, view: view, tab: tab,
          clientWidth: root.clientWidth, scrollWidth: root.scrollWidth, offenders: offenders.slice(0, 5), clipped: clipped,
          activeTabVisible: active.left >= bar.left - 0.5 && active.right <= bar.right + 0.5 &&
            active.top >= bar.top - 0.5 && active.bottom <= bar.bottom + 0.5,
          // Issue #409 P0: desktop sidebar left of the content; phone nav fixed to the screen bottom,
          // with the page padded by its full height so no content ends up under it.
          navFixed: win.getComputedStyle(doc.getElementById('ios-tab-bar')).position === 'fixed',
          navAtBottom: Math.abs(bar.bottom - win.innerHeight) < 1,
          bottomClearance: parseFloat(win.getComputedStyle(doc.body).paddingBottom) - bar.height,
          navLeftOfContent: bar.right <= doc.querySelector('.ios-main').getBoundingClientRect().left + 0.5,
          minTabHeight: Math.min.apply(null, Array.prototype.map.call(doc.querySelectorAll('.ios-tab-bar .ios-tab-btn'), function (b) {
            return b.getBoundingClientRect().height;
          })),
          labelsFit: Array.prototype.every.call(doc.querySelectorAll('.ios-tab-label'), function (l) { return l.scrollWidth <= l.clientWidth + 1; }),
          pageTitle: doc.getElementById('ios-page-title').textContent,
          proseFullRow: Array.prototype.filter.call(doc.querySelectorAll('.ios-metric-card-prose'), visible).map(function (card) {
            return Math.abs(card.getBoundingClientRect().width - card.parentElement.getBoundingClientRect().width) < 1;
          }),
          cardColumns: grid ? win.getComputedStyle(grid).gridTemplateColumns.split(' ').length : 0,
          sections: ['.ios-layering', '.ios-layer-fact', '.ios-layer-verdict', '.ios-inline-fair-value', '.ios-asset-card',
            '.ios-checklist', '.ios-todo-copy', '.ios-todo-note-part', '.ios-todo-split', '.ios-list', '.ios-allocation-cards', '.ios-holding-detail-cards', '.ios-holding-detail-cards .ios-detail-group-ledger']
            .filter(function (sel) { return Array.prototype.some.call(doc.querySelectorAll(sel), visible); })
        });
      });
    });
  }
  window.IOS_WIDTHS.forEach(function (width) {
    var frame = document.createElement('iframe');
    frame.style.cssText = 'border:0;display:block;height:900px;width:' + width + 'px';
    frame.onload = function () {
      try { measure(frame.contentWindow, width); } catch (err) { results.push({ width: width, error: String(err) }); }
      document.getElementById('result').textContent = JSON.stringify(results);
    };
    frame.srcdoc = window.IOS_PAGE;
    document.body.appendChild(frame);
  });
}

function harnessHtml(page) {
  const json = (value) => JSON.stringify(value).replace(/</g, '\\u003c');
  return '<!doctype html><html><head><meta charset="utf-8"></head><body><pre id="result"></pre><script>' +
    'window.IOS_PAGE=' + json(page) + ';window.IOS_WIDTHS=' + json(WIDTHS) + ';(' + harnessScript.toString() + ')();' +
    '</script></body></html>';
}

function findChrome() {
  const candidates = [process.env.CHROME_BIN, 'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'];
  const pw = '/opt/pw-browsers';
  if (fs.existsSync(pw)) {
    fs.readdirSync(pw).filter((d) => d.startsWith('chromium-')).forEach((d) => {
      candidates.push(path.join(pw, d, 'chrome-linux64', 'chrome'), path.join(pw, d, 'chrome-linux', 'chrome'));
    });
  }
  for (const bin of candidates.filter(Boolean)) {
    try {
      execFileSync(bin, ['--version'], { stdio: 'ignore', timeout: 20000 });
      return bin;
    } catch (err) { /* try the next one */ }
  }
  return null;
}

function runInChrome(chrome, html) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ios-overflow-'));
  const file = path.join(dir, 'harness.html');
  fs.writeFileSync(file, html);
  try {
    const out = execFileSync(chrome, [
      '--headless', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--window-size=1400,1000',
      '--virtual-time-budget=10000', '--dump-dom', 'file://' + file
    ], { encoding: 'utf8', timeout: 60000, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
    const match = out.match(/<pre id="result">([\s\S]*?)<\/pre>/);
    assert.ok(match && match[1], 'the harness wrote its result');
    return JSON.parse(match[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('layering grids pin one shrinkable column and their items may shrink', () => {
  assert.match(STYLES_SRC, /\.ios-layering, \.ios-layer-group, \.ios-layer-unmarked, \.ios-layer-verdict \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  assert.match(STYLES_SRC, /\.ios-layering > \*, \.ios-layer-group > \*, \.ios-layer-unmarked > \*, \.ios-layer-verdict > \*, \.ios-layer-fact > \* \{ min-width: 0; \}/);
});

test('card and todo text never falls back to break-word, which cannot shrink a flex or grid item', () => {
  ['.ios-asset-name', '.ios-asset-line', '.ios-todo-text', '.ios-todo-note'].forEach((selector) => {
    const rule = STYLES_SRC.match(new RegExp(selector.replace('.', '\\.') + ' \\{([^}]*)\\}'));
    assert.ok(rule, selector);
    assert.match(rule[1], /overflow-wrap: anywhere;/, selector);
  });
});

test('free-text summary metrics wrap as prose and take a full row on a phone (Issue #376)', () => {
  assert.match(STYLES_SRC, /\.ios-metric-value \{[^}]*overflow-wrap: anywhere;/);
  assert.match(STYLES_SRC, /\.ios-metric-card-prose \{ align-items: stretch; \}/);
  assert.match(STYLES_SRC, /@media \(max-width: 600px\) \{[^@]*\.ios-metric-card-prose \{ grid-column: 1 \/ -1; \}/);
});

test('no Daily or Weekly tab scrolls sideways at 320-430px or desktop, and desktop keeps two columns', (t) => {
  const chrome = findChrome();
  if (!chrome) {
    if (process.env.CI) assert.fail('no Chrome/Chromium found; set CHROME_BIN');
    t.skip('no Chrome/Chromium found; set CHROME_BIN to run this test');
    return;
  }
  const boot = stressBootstrap();
  const results = runInChrome(chrome, harnessHtml(dashboardHtml(boot, 'daily')));
  assert.equal(results.length, WIDTHS.length * 8, JSON.stringify(results.filter((r) => r.error)));
  results.forEach((r) => {
    assert.ok(r.scrollWidth <= r.clientWidth,
      `${r.width}px ${r.view}/${r.tab}: scrollWidth ${r.scrollWidth} > clientWidth ${r.clientWidth}; widest: ${r.offenders.join(', ')}`);
  });
  results.forEach((r) => {
    assert.deepEqual(r.clipped, [], `${r.width}px ${r.view}/${r.tab}: summary card text clipped`);
    // Issue #396 PR A: the summary grid closes the report (the 组合 view is gone).
    assert.equal(r.proseFullRow.length, r.tab === 'report' ? 2 : 0, `${r.width}px ${r.view}/${r.tab}: 核心状态 and 数据检查 render as prose cards`);
    r.proseFullRow.forEach((full) => assert.equal(full, r.width < 600, `${r.width}px ${r.view}: prose cards take a full row only on a phone`));
    assert.ok(r.activeTabVisible, `${r.width}px ${r.view}/${r.tab}: the current view's tab is fully visible in the nav`);
    assert.ok(r.labelsFit, `${r.width}px ${r.view}/${r.tab}: every nav label shows in full`);
    assert.ok(r.pageTitle.length > 0, `${r.width}px ${r.view}/${r.tab}: the page carries its view title`);
    if (r.width < 900) {
      assert.ok(r.navFixed && r.navAtBottom, `${r.width}px ${r.view}/${r.tab}: the phone nav is fixed to the bottom of the screen`);
      assert.ok(r.bottomClearance >= -0.5, `${r.width}px ${r.view}/${r.tab}: the page bottom padding clears the nav (${r.bottomClearance})`);
      assert.ok(r.minTabHeight >= 44, `${r.width}px ${r.view}/${r.tab}: every nav item is at least 44px tall (${r.minTabHeight})`);
    } else {
      assert.ok(!r.navFixed && r.navLeftOfContent, `${r.width}px ${r.view}/${r.tab}: the desktop nav sits in the sidebar left of the content`);
    }
  });
  const at = (width, view, tab) => results.find((r) => r.width === width && r.view === view && r.tab === tab);
  ['daily', 'weekly'].forEach((view) => {
    assert.ok(at(390, view, 'report').sections.includes('.ios-layering'), `${view} renders the layering view`);
    assert.ok(at(390, view, 'report').sections.includes('.ios-layer-fact'), `${view} renders the layering facts`);
    assert.ok(!at(390, view, 'todos').sections.includes('.ios-layering'), `${view}: 待办 replaces the report on the page`);
  });
  assert.ok(at(390, 'daily', 'todos').sections.includes('.ios-todo-copy'), 'the 待办 tab renders the folded cross-report item (Issue #403)');
  assert.ok(at(390, 'daily', 'todos').sections.includes('.ios-todo-note-part'), 'the 待办 tab renders labelled note segments (Issue #403)');
  assert.ok(at(390, 'daily', 'todos').sections.includes('.ios-todo-split'), 'the 待办 tab renders the split 现在能做 / 等待什么 / 已核验 block (Issue #403)');
  // A Weekly's card grid closes its page (#396 PR A, formerly the 组合 view).
  assert.equal(at(1280, 'weekly', 'report').cardColumns, 2, 'weekly keeps two card columns on desktop');
  assert.equal(at(390, 'weekly', 'report').cardColumns, 1, 'weekly uses one card column on a phone');
  assert.ok(at(390, 'daily', 'report').sections.includes('.ios-asset-card'), 'the Daily report carries its asset cards');
  assert.ok(at(390, 'daily', 'report').sections.includes('.ios-inline-fair-value'), 'the inline fair value line is covered');
  assert.ok(at(390, 'weekly', 'report').sections.includes('.ios-layer-verdict'), 'the Weekly verdict rows are covered');
  ['daily', 'weekly'].forEach((view) => {
    const detail = results.find((r) => r.width === 390 && r.view === view && r.tab === 'holdingDetail');
    assert.ok(detail.sections.includes('.ios-holding-detail-cards'), `${view} renders the 持仓明细 cards`);
    // Issue #388 PR F: the live ledger group (former 资本配置) is inside each 持仓明细 card at 390px.
    assert.ok(detail.sections.includes('.ios-holding-detail-cards .ios-detail-group-ledger'), `${view} renders the 当前台账 group in the 持仓明细 cards`);
  });
});
