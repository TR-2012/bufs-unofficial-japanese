/* 단위 테스트 하네스 — 브라우저 없이 index.html의 로직 클래스를 Node에서 인스턴스화한다.
 * localStorage·document·window 등은 가짜(메모리)로 대신하고, 데이터(JSON)는 data/에서 읽는다. */
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..', '..');
const TAG = '<script type="text/x-dc" data-dc-script>';

function logicSource() {
  const h = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const a = h.indexOf(TAG) + TAG.length;
  return h.slice(a, h.indexOf('</script>', a));
}

/* 메모리 localStorage */
function makeStorage(initial) {
  const m = new Map(Object.entries(initial || {}));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(String(k), String(v)); },
    removeItem: (k) => { m.delete(k); },
    key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
    dump: () => Object.fromEntries(m),
  };
}

/* opts: { storage: {키:값}, now: 밀리초, seed: 난수 시드, dark: 시스템 다크 여부 } */
function createApp(opts = {}) {
  const storage = makeStorage(opts.storage);
  let now = opts.now ?? Date.UTC(2026, 10, 7, 3, 0, 0);
  let seed = opts.seed ?? 12345;
  const classes = new Set();
  const g = globalThis;
  const saved = {};
  const set = (k, v) => { saved[k] = Object.getOwnPropertyDescriptor(g, k); Object.defineProperty(g, k, { value: v, configurable: true, writable: true }); };
  const RealDate = Date;
  class FakeDate extends RealDate {
    constructor(...a) { if (a.length === 0) super(now); else super(...a); }
    static now() { return now; }
  }
  set('localStorage', storage);
  set('window', { matchMedia: () => ({ matches: !!opts.dark }), addEventListener() {}, removeEventListener() {}, navigator: {} });
  set('document', { documentElement: { classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)), contains: (c) => classes.has(c) } }, createElement: () => ({ click() {}, remove() {}, style: {} }), body: { appendChild() {} }, addEventListener() {} });
  set('navigator', { userAgent: opts.ua || 'node', platform: 'linux', maxTouchPoints: 0, storage: {} });
  set('location', { hash: opts.hash || '', reload() {} });
  set('React', { createElement: (type, props, ...kids) => ({ type, props, kids }) });
  set('Date', FakeDate);
  const origRandom = Math.random;
  Math.random = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };

  class DCLogic {
    constructor(props) { this.props = props || {}; }
    setState(p) { if (typeof p === 'function') p = p(this.state); Object.assign(this.state, p); }
  }
  const Cls = new Function('DCLogic', 'StreamableLogic', logicSource().replace(/^\s*class/, 'return class'))(DCLogic, DCLogic);
  const app = new Cls({});

  const readData = (f, d) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8')); } catch (e) { return d; } };
  app.loadData = async () => {
    const files = { 'data/kanji.json': [], 'data/words.json': [], 'data/grammar.json': {}, 'data/writing.json': {}, 'data/writing_combo.json': {}, 'data/quiz_core.json': [] };
    set('fetch', async (u) => ({ ok: u in files, json: async () => readData(path.basename(u), files[u]) }));
    await app.loadBaseData();
  };
  app.storage = storage;
  app.advance = (ms) => { now += ms; };
  app.setNow = (ms) => { now = ms; };
  app.htmlClasses = classes;
  app.dispose = () => {
    Math.random = origRandom;
    for (const k of Object.keys(saved)) { if (saved[k]) Object.defineProperty(g, k, saved[k]); else delete g[k]; }
  };
  return app;
}

/* 아주 작은 테스트 러너 */
function suite(name) {
  const tests = [];
  return {
    test(title, fn) { tests.push([title, fn]); },
    async run() {
      let pass = 0, fail = 0;
      console.log('\n## 단위: ' + name);
      for (const [title, fn] of tests) {
        try { await fn(); pass++; console.log('  ✓ ' + title); }
        catch (e) { fail++; console.log('  ✗ ' + title + '  → ' + (e && e.message || e)); }
      }
      console.log(`  = ${pass} 통과 / ${fail} 실패`);
      return { pass, fail };
    },
  };
}

module.exports = { ROOT, createApp, suite, logicSource };
