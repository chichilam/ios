// Issue #409 prod (PR #416): the 报告 page scrolled sideways on an iPhone while
// the Chrome overflow test (no-horizontal-overflow.test.js) stayed green. The
// cause only exists in WebKit: a <select> lays its whole option text (a long
// 一句话结论) out past its own box and counts it as scrollable overflow of every
// ancestor, so the page grew to the longest option's width even though the
// select itself was held to 100%.
//
// This test renders the real Index/Styles/Script in WebKit (WebKitGTK through
// its WebDriver, the same engine as iOS Safari) at 320/375/390/430px, for the
// latest and a history Daily and Weekly, with realistic and with lengthened
// data, and asserts behaviour, not CSS text:
//   - the document never scrolls sideways;
//   - every report block (segments, picker, buttons, banner, headline, rows,
//     technical info) lies inside the viewport;
//   - any element that does extend past the viewport sits inside a local
//     horizontal scroll box (overflow-x auto/scroll), so it stays reachable --
//     nothing is cut off by a page-level clip.
//
// Zero npm dependencies: WebDriver over fetch, pages served by node:http.
// Needs WEBKIT_DRIVER (path to WebKitWebDriver) and a display (xvfb-run in CI).
// Without it the test is skipped, unless WEBKIT_REQUIRED=1 (CI), where that fails.
//
// Run: xvfb-run -a env WEBKIT_DRIVER=WebKitWebDriver node integrations/google-apps-script/ios-dashboard/test/webkit-report-overflow.test.js

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const DIR = path.join(__dirname, '..');
const logic = require(path.join(DIR, 'Code.gs'));

const WIDTHS = [320, 375, 390, 430];
const DRIVER = process.env.WEBKIT_DRIVER || '';
const REQUIRED = process.env.WEBKIT_REQUIRED === '1';
const BROWSER_BINARY = process.env.WEBKIT_BROWSER || '';
const HEADLINE = '本期计划列明的BLS 10月CPI、CEG Q3业绩与TSMC 10月营收落地，13个个股暂停新增待复核，基金定投沿用；无可准备订单，不构成买卖指令。';
const LONG = '-https://example.com/a/very/long/source/path/without/spaces-' + 'A'.repeat(80);

function tabsOf(rel) {
  const tabs = JSON.parse(fs.readFileSync(path.join(DIR, rel), 'utf8'));
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

// Demo Daily + the layered Weekly fixture. Each type lists its latest and one
// history report; the history report's own summary carries a UTC timestamp for
// 报告日期 that falls on the day before the listed date (the prod shape).
function bootstrapAndReports(long) {
  const boot = JSON.parse(JSON.stringify(logic.buildDashboardBootstrap_(tabsOf('demo/demo-sheet.json'))));
  boot.weekly = JSON.parse(JSON.stringify(logic.buildDashboardBootstrap_(tabsOf('test/report-layering-fixture.json')).weekly));
  const reports = {};
  ['daily', 'weekly'].forEach((type) => {
    const latestId = boot[type].summary['报告ID'];
    const historyId = type + '-history-demo';
    const history = JSON.parse(JSON.stringify(boot[type]));
    history.summary['报告ID'] = historyId;
    history.summary['报告日期'] = '2026-11-11T15:00:00.000Z';
    // Identity fields stay as written: they route the report, they are not display text.
    const identity = { 报告ID: historyId, 报告类型: history.summary['报告类型'], 报告日期: history.summary['报告日期'] };
    reports[historyId] = long ? lengthen(history) : history;
    Object.assign(reports[historyId].summary, identity);
    reports[historyId].reportType = type;
    boot[type + 'History'] = [
      { reportId: latestId, reportDate: '2026-11-14', headline: HEADLINE },
      { reportId: historyId, reportDate: '2026-11-12', headline: HEADLINE + HEADLINE }
    ];
  });
  if (long) {
    ['daily', 'weekly'].forEach((type) => {
      const keep = { reportType: boot[type].reportType, summary: Object.assign({}, boot[type].summary) };
      boot[type] = lengthen(boot[type]);
      boot[type].reportType = keep.reportType;
      ['报告ID', '报告类型', '报告日期'].forEach((k) => { boot[type].summary[k] = keep.summary[k]; });
    });
  }
  return { boot, reports };
}

function dashboardHtml(data, view) {
  const index = fs.readFileSync(path.join(DIR, 'Index.html'), 'utf8');
  // getReport answers from the prepared history reports, synchronously.
  const stub = '<script>window.__reports=' + logic.escapeJsonForScriptContext_(JSON.stringify(data.reports)) + ';' +
    'window.google={script:{run:(function(){var ok=null;var api=new Proxy({},{get:function(t,k){' +
    'if(k==="withSuccessHandler"){return function(fn){ok=fn;return api;};}' +
    'if(k==="withFailureHandler"){return function(){return api;};}' +
    'if(k==="getReport"){return function(id){var r=window.__reports[id];if(ok){ok(r?Object.assign({found:true},r):{found:false});}};}' +
    'return function(){};}});return api;})()}};</script>';
  return index
    .replace("<?!= include('Styles') ?>", () => fs.readFileSync(path.join(DIR, 'Styles.html'), 'utf8'))
    .replace("<?!= include('Script') ?>", () => fs.readFileSync(path.join(DIR, 'Script.html'), 'utf8'))
    .replace('<?!= bootstrapJson ?>', () => logic.escapeJsonForScriptContext_(JSON.stringify(data.boot)))
    .replace('<?!= JSON.stringify(activeView) ?>', () => JSON.stringify(view))
    .replace('<meta charset="utf-8">', '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">')
    .replace('<script>', () => stub + '<script>');
}

// Runs inside the outer page: one same-origin iframe per width.
function measureScript() {
  var BLOCKS = ['#ios-report-toolbar', '.ios-segmented', '#ios-history-select', '#ios-report-prev', '#ios-report-next',
    '#ios-report-refresh', '#ios-history-banner', '.ios-headline-card', '.ios-report-asset-list', '.ios-report-technical'];
  function inLocalScroll(node, doc) {
    for (var p = node.parentElement; p && p !== doc.body; p = p.parentElement) {
      var ox = doc.defaultView.getComputedStyle(p).overflowX;
      if (ox === 'auto' || ox === 'scroll') return true;
    }
    return false;
  }
  var out = [];
  Array.prototype.forEach.call(document.querySelectorAll('iframe'), function (frame) {
    var win = frame.contentWindow;
    var doc = win.document;
    var width = Number(frame.getAttribute('data-width'));
    ['daily', 'weekly'].forEach(function (view) {
      ['latest', 'history'].forEach(function (which) {
        win.switchView(view);
        win.selectTab('report');
        if (which === 'history') { win.selectHistoryReport(view + '-history-demo'); }
        Array.prototype.forEach.call(doc.querySelectorAll('details'), function (d) { d.open = true; });
        Array.prototype.forEach.call(doc.querySelectorAll('.ios-report-asset:not(.active) > .ios-report-asset-head'), function (b) { b.click(); });
        var W = doc.documentElement.clientWidth;
        var blocks = [];
        BLOCKS.forEach(function (sel) {
          var node = doc.querySelector(sel);
          if (!node || node.hidden) return;
          var r = node.getBoundingClientRect();
          if (r.width === 0) return;
          blocks.push({ sel: sel, left: Math.round(r.left), right: Math.round(r.right) });
        });
        var cut = [];
        Array.prototype.forEach.call(doc.querySelectorAll('.ios-main *'), function (node) {
          var r = node.getBoundingClientRect();
          if (r.width > 0 && r.right > W + 1 && !inLocalScroll(node, doc)) {
            cut.push(node.tagName + '.' + String(node.className).slice(0, 50));
          }
        });
        var banner = doc.getElementById('ios-history-banner');
        out.push({ width: width, view: view, which: which, W: W, scrollWidth: doc.documentElement.scrollWidth,
          blocks: blocks, cut: cut.slice(0, 5), banner: banner && !banner.hidden ? banner.textContent : '' });
        if (which === 'history') { win.selectHistoryReport(''); win.switchView(view); }
      });
    });
  });
  return JSON.stringify(out);
}

async function webdriver(port, method, route, body) {
  const res = await fetch('http://127.0.0.1:' + port + route, {
    method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(90000)
  });
  const json = await res.json();
  if (json.value && json.value.error) throw new Error(json.value.error + ': ' + json.value.message);
  return json.value;
}

async function waitForDriver(port) {
  for (let i = 0; i < 100; i++) {
    try { await webdriver(port, 'GET', '/status'); return; } catch (e) { await new Promise((r) => setTimeout(r, 100)); }
  }
  throw new Error('WebKitWebDriver did not start');
}

async function renderAll() {
  const pages = {};
  [false, true].forEach((long) => {
    const data = bootstrapAndReports(long);
    const name = long ? 'long' : 'real';
    pages['/' + name + '.html'] = dashboardHtml(data, 'daily');
    pages['/' + name + '-outer.html'] = '<!doctype html><body style="margin:0">' + WIDTHS.map((w) =>
      '<iframe data-width="' + w + '" src="' + name + '.html" style="width:' + w + 'px;height:900px;border:0;display:block"></iframe>').join('') + '</body>';
  });
  const server = http.createServer((req, res) => {
    const page = pages[req.url];
    res.writeHead(page ? 200 : 404, { 'content-type': 'text/html; charset=utf-8' });
    res.end(page || '');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = 4900 + Math.floor(Math.random() * 400);
  const driver = spawn(DRIVER, ['--port=' + port], { stdio: 'ignore' });
  const results = {};
  try {
    await waitForDriver(port);
    const options = { args: ['--automation'] };
    if (BROWSER_BINARY) options.binary = BROWSER_BINARY;
    const session = await webdriver(port, 'POST', '/session', { capabilities: { alwaysMatch: { 'webkitgtk:browserOptions': options } } });
    console.log('# WebKit ' + session.capabilities.browserName + ' ' + session.capabilities.browserVersion + ' via ' + DRIVER + (BROWSER_BINARY ? ' (' + BROWSER_BINARY + ')' : ''));
    try {
      for (const name of ['real', 'long']) {
        await webdriver(port, 'POST', '/session/' + session.sessionId + '/url', { url: 'http://127.0.0.1:' + server.address().port + '/' + name + '-outer.html' });
        await new Promise((r) => setTimeout(r, 1000));
        results[name] = JSON.parse(await webdriver(port, 'POST', '/session/' + session.sessionId + '/execute/sync',
          { script: 'return (' + measureScript.toString() + ')();', args: [] }));
      }
    } finally {
      await webdriver(port, 'DELETE', '/session/' + session.sessionId).catch(() => {});
    }
  } finally {
    driver.kill();
    server.close();
  }
  return results;
}

test('Issue #409 prod: in WebKit the 报告 page never scrolls sideways and every block stays reachable', { timeout: 240000, skip: !DRIVER && !REQUIRED && 'set WEBKIT_DRIVER (WebKitWebDriver) to run' }, async () => {
  assert.ok(DRIVER, 'WEBKIT_REQUIRED=1 but WEBKIT_DRIVER is not set');
  const results = await renderAll();
  ['real', 'long'].forEach((name) => {
    const rows = results[name];
    assert.equal(rows.length, WIDTHS.length * 4, name + ': every width x view x latest/history was measured');
    console.log('# ' + name + ': ' + rows.length + ' combinations measured in WebKit');
    rows.forEach((r) => {
      const where = `${name} ${r.width}px ${r.view}/${r.which}`;
      assert.equal(r.W, r.width, where + ': the frame is the phone width');
      assert.ok(r.scrollWidth <= r.W, `${where}: the page is ${r.scrollWidth}px wide in a ${r.W}px viewport`);
      assert.ok(r.blocks.length >= 7, `${where}: the report blocks rendered (${r.blocks.map((b) => b.sel).join(', ')})`);
      r.blocks.forEach((b) => assert.ok(b.left >= 0 && b.right <= r.W, `${where}: ${b.sel} spans ${b.left}-${b.right}`));
      assert.deepEqual(r.cut, [], `${where}: content past the viewport outside a local scroll box`);
      if (r.which === 'history') {
        assert.match(r.banner, /^正在查看历史(日报|周报)（2026-11-12）/, where + ': the banner names the listed business date');
      } else {
        assert.equal(r.banner, '', where + ': no history banner on the latest report');
      }
    });
  });
});
