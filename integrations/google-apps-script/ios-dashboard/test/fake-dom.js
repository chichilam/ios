// A minimal, hand-rolled DOM stand-in for testing Script.html without a
// real browser or a third-party dependency (this repository ships no
// package.json/node_modules for the GAS Dashboard package -- see
// README.md's "no dependencies" discipline, the same one
// test/dashboard-logic.test.js already follows for Code.gs). Implements
// only the exact DOM surface Script.html actually calls: createElement/
// createTextNode/getElementById, appendChild/removeChild/firstChild,
// classList.add/remove/toggle/contains, className, textContent (get/set),
// setAttribute/getAttribute/removeAttribute, and addEventListener/click
// (addEventListener stores the listener; click() invokes every listener
// registered for 'click', so a test can dispatch a real click on an
// element built via el(...,{onclick:...}) -- e.g. the summary metric
// cards, which have no other exposed entry point -- rather than only
// driving interaction through window.switchView/selectHistoryReport/
// refresh, which remains the simpler path for everything that does have
// one).

'use strict';

class FakeNode {
  constructor() {
    this.parentNode = null;
    this.children = [];
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) this.children.splice(idx, 1);
    child.parentNode = null;
    return child;
  }

  get firstChild() {
    return this.children.length ? this.children[0] : null;
  }
}

class FakeTextNode extends FakeNode {
  constructor(value) {
    super();
    this.nodeType = 3;
    this.textContent = value == null ? '' : String(value);
  }
}

class FakeElement extends FakeNode {
  constructor(tag) {
    super();
    this.nodeType = 1;
    this.tagName = String(tag).toUpperCase();
    this._attrs = {};
    this._classes = new Set();
    this._ownText = '';
    this._listeners = {};
    this.disabled = false;
    this.hidden = false;
    const self = this;
    this.classList = {
      add(c) { self._classes.add(c); },
      remove(c) { self._classes.delete(c); },
      toggle(c, force) {
        if (force === undefined) {
          if (self._classes.has(c)) self._classes.delete(c); else self._classes.add(c);
        } else if (force) {
          self._classes.add(c);
        } else {
          self._classes.delete(c);
        }
      },
      contains(c) { return self._classes.has(c); }
    };
  }

  get className() { return Array.from(this._classes).join(' '); }
  set className(value) { this._classes = new Set(String(value || '').split(/\s+/).filter(Boolean)); }

  get textContent() {
    if (this.children.length === 0) return this._ownText;
    return this.children.map((c) => c.textContent).join('');
  }
  set textContent(value) {
    this.children = [];
    this._ownText = value == null ? '' : String(value);
  }

  setAttribute(name, value) { this._attrs[name] = String(value); }
  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this._attrs, name) ? this._attrs[name] : null;
  }
  removeAttribute(name) { delete this._attrs[name]; }

  addEventListener(type, listener) {
    (this._listeners[type] || (this._listeners[type] = [])).push(listener);
  }

  /** Test-only helper: invokes every listener registered for 'click', simulating a real click dispatch. */
  click() {
    (this._listeners.click || []).forEach((listener) => listener());
  }
}

/**
 * Builds a fresh fake `document` with every element id Index.html's
 * static shell declares already registered under document.body -- the
 * same ids Script.html's getElementById calls expect to find, so a typo'd
 * id in either file would make a test fail with "cannot read properties
 * of null" instead of silently doing nothing, exactly as it would in a
 * real browser.
 */
function createFakeDocument() {
  const STATIC_IDS = [
    'ios-nav-daily', 'ios-nav-weekly', 'ios-refresh-btn', 'ios-history-select',
    'ios-status-banner', 'ios-history-banner',
    'ios-summary-content',
    'ios-tab-portfolio', 'ios-tab-allocation', 'ios-tab-risks', 'ios-tab-todos',
    'ios-tab-content'
  ];
  const registry = {};
  const body = new FakeElement('body');
  STATIC_IDS.forEach((id) => {
    var tag = id === 'ios-history-select' ? 'select' : (id.indexOf('btn') !== -1 ? 'button' : 'div');
    const node = new FakeElement(tag);
    node.setAttribute('id', id);
    registry[id] = node;
    body.appendChild(node);
  });
  return {
    body,
    createElement: (tag) => new FakeElement(tag),
    createTextNode: (value) => new FakeTextNode(value),
    getElementById: (id) => registry[id] || null
  };
}

/**
 * A google.script.run stand-in. `handlers` maps server function names
 * (`getReport`, `getDashboardBootstrap`) to functions that either return a
 * result (routed to the success handler, matching a real successful
 * server call) or throw (routed to the failure handler, matching a real
 * server-side exception reaching the client's withFailureHandler).
 */
function createGoogleScriptRunStub(handlers) {
  function callable(name) {
    return function (...args) {
      throw new Error(`google.script.run.${name}() called before withSuccessHandler/withFailureHandler`);
    };
  }
  return {
    script: {
      run: {
        withSuccessHandler(onSuccess) {
          return {
            withFailureHandler(onFailure) {
              const proxy = {};
              Object.keys(handlers).forEach((name) => {
                proxy[name] = (...args) => {
                  try {
                    onSuccess(handlers[name](...args));
                  } catch (err) {
                    onFailure(err);
                  }
                };
              });
              return proxy;
            }
          };
        }
      }
    }
  };
}

module.exports = { FakeElement, FakeTextNode, createFakeDocument, createGoogleScriptRunStub };
