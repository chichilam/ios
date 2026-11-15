// Issue #409 P3: full asset cards no longer sit in the report body; each one lives inside its row of
// 「本报告涉及标的（报告时快照）」. These helpers open every row of one kind and return the real
// card nodes, so card-level tests keep reading the same cards they read before.
'use strict';

function walk(node, pred, out) {
  (node.children || []).forEach((child) => {
    if (child.tagName && pred(child)) out.push(child);
    walk(child, pred, out);
  });
  return out;
}

function summary(document) {
  return document.getElementById('ios-summary-content');
}

function rows(document, kind) {
  return walk(summary(document), (n) => n.classList && n.classList.contains('ios-report-asset') && n.getAttribute('data-kind') === kind, []);
}

/** Opens every closed row of the kind ('holding' | 'watchlist'); each click re-renders, so rows are re-read. */
function openReportAssets(document, kind) {
  for (;;) {
    const closed = rows(document, kind).find((r) => !r.classList.contains('active'));
    if (!closed) return;
    closed.children[0].click();
  }
}

/** Returns the full cards of the kind, in report order, after opening their rows. */
function reportAssetCards(document, kind) {
  openReportAssets(document, kind);
  return rows(document, kind).map((r) => walk(r, (n) => n.classList && n.classList.contains('ios-asset-card'), [])[0]).filter(Boolean);
}

/**
 * Pre-P3 tests read `portfolioSection(document, '当前持仓')` as [h2, grid] and '本期观察候选' as
 * [h2, hint, grid]. Returns the same shape around the real card nodes, or undefined when the report
 * lists none of that kind.
 */
function portfolioSection(document, title) {
  const kind = title === '本期观察候选' ? 'watchlist' : 'holding';
  const cards = reportAssetCards(document, kind);
  if (!cards.length) return undefined;
  const grid = { tagName: 'DIV', children: cards, get textContent() { return cards.map((c) => c.textContent).join(''); } };
  const head = { tagName: 'H2', children: [], textContent: title + ' (' + cards.length + ')' };
  const parts = kind === 'watchlist' ? [head, { tagName: 'P', children: [], textContent: '' }, grid] : [head, grid];
  return { tagName: 'SECTION', children: parts, get textContent() { return grid.textContent; } };
}

module.exports = { openReportAssets, reportAssetCards, portfolioSection };
