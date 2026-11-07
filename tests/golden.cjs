/* 골든 마스터 테스트 — 화면·상호작용 결과를 기준 파일(tests/golden/baseline.json)과 비교한다.
 *
 * 비교 대상(기기 글꼴과 무관하게 같은 값만): 요소의 태그·글자·색·배경·테두리색·글자 크기·글꼴 이름·display.
 *   9개 화면 × (라이트·다크) × (PC 1280 · 폰 390) + 퀴즈·작문·문법·카드·연상·필기 상호작용 + 저장된 학습 기록.
 * 사용:
 *   node tests/run.cjs                 (전체 테스트)
 *   node tests/golden.cjs --update     (의도한 화면 변경 후 기준 갱신)
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { startServer, loadPlaywright, reporter, SEED, MENUS, goto } = require('./lib.cjs');

const BASELINE = path.join(__dirname, 'golden', 'baseline.json');
const OUTDIR = path.join(__dirname, '.out');
const md5 = (x) => crypto.createHash('md5').update(JSON.stringify(x)).digest('hex').slice(0, 12);

const DUMP = () => {
  const o = [];
  document.querySelectorAll('.hh-root *').forEach((e) => {
    if (!e.offsetParent && e.tagName !== 'BODY') return;
    const c = getComputedStyle(e);
    const text = [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join('|');
    o.push([e.tagName, text, c.color, c.backgroundColor, c.borderTopColor, c.fontSize, c.fontFamily.slice(0, 30), c.display].join('~'));
  });
  return o;
};

async function collect(base) {
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  const res = {};
  for (const [theme, vw, vh] of [['light', 1280, 900], ['dark', 1280, 900], ['light', 390, 844], ['dark', 390, 844]]) {
    const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, serviceWorkers: 'block', hasTouch: vw < 800 });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 80)));
    await p.addInitScript(SEED);
    await p.addInitScript((t) => { localStorage.setItem('tj.dark', t === 'dark' ? '1' : '0'); localStorage.setItem('tj.nudge.firstAt', '1762400000000'); }, theme);
    await p.goto(base);
    await p.waitForTimeout(3000);
    const key = `${theme}-${vw}`;
    for (const m of MENUS) { await goto(p, m); res[`${key}|${m}`] = await p.evaluate(DUMP); }
    if (vw === 1280 && theme === 'light') {
      const snap = async (name) => { res[`${key}|상호작용:${name}`] = await p.evaluate(DUMP); };
      await goto(p, '퀴즈 코너');
      const opt = p.locator('button', { hasText: /^[A-D]/ }).first();
      if (await opt.count()) { await opt.click(); await p.waitForTimeout(400); await snap('퀴즈 선택'); }
      const nx = p.locator('button', { hasText: /다음/ }).first();
      if (await nx.count()) { await nx.click(); await p.waitForTimeout(400); await snap('퀴즈 다음'); }
      for (const lv of ['N3', 'N1']) { const c = p.locator('button', { hasText: new RegExp('^' + lv + '$') }).first(); if (await c.count()) { await c.click(); await p.waitForTimeout(400); await snap('퀴즈 ' + lv); } }
      await goto(p, '작문 연습');
      const ta = p.locator('textarea').first();
      if (await ta.count()) {
        await ta.fill('今日は天気がよくて気分がいいです。');
        for (const t of ['채점하기', '모범 답안 보기']) { const b = p.locator('button', { hasText: t }).first(); if (await b.count()) { await b.click(); await p.waitForTimeout(400); await snap('작문 ' + t); } }
      }
      for (const t of ['경어 · 접객', '단어 조합']) { const b = p.locator('button', { hasText: t }).first(); if (await b.count()) { await b.click(); await p.waitForTimeout(500); await snap('작문 탭 ' + t); } }
      await goto(p, '일본어 문법');
      for (const lv of ['N3', 'N5']) { const c = p.locator('button', { hasText: new RegExp('^' + lv + '$') }).first(); if (await c.count()) { await c.click(); await p.waitForTimeout(400); } }
      const unit = p.locator('button', { hasText: /^~/ }).first();
      if (await unit.count()) { await unit.click(); await p.waitForTimeout(500); await snap('문법 단원'); }
      await goto(p, '한자 카드');
      const ck = p.locator('text=탭하여 뜻 보기').first();
      if (await ck.count()) { await ck.click(); await p.waitForTimeout(400); await snap('한자 카드 펼침'); }
      await goto(p, '단어 카드');
      const cw = p.locator('text=탭하여 읽기').first();
      if (await cw.count()) { await cw.click(); await p.waitForTimeout(400); await snap('단어 카드 펼침'); }
      await goto(p, '연상 암기');
      for (const t of ['정답 보기', '외웠어요', '다시']) { const b = p.locator('button', { hasText: t }).first(); if (await b.count()) { await b.click(); await p.waitForTimeout(400); await snap('연상 ' + t); } }
      await goto(p, '필기 노트');
      const cv = p.locator('canvas').first();
      if (await cv.count()) {
        const bb = await cv.boundingBox();
        await p.mouse.move(bb.x + 80, bb.y + 80); await p.mouse.down(); await p.mouse.move(bb.x + 200, bb.y + 160, { steps: 5 }); await p.mouse.up();
        await snap('필기 한 획');
      }
      res['저장값'] = await p.evaluate(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith('tj.')) o[k] = localStorage.getItem(k); } return o; });
    }
    res[`${key}|오류`] = errs;
    await ctx.close();
  }
  await browser.close();
  return res;
}

async function main() {
  const update = process.argv.includes('--update');
  const { server, base } = await startServer();
  const res = await collect(base);
  server.close();
  const sums = {};
  for (const k of Object.keys(res)) sums[k] = md5(res[k]);
  if (update) {
    fs.mkdirSync(path.dirname(BASELINE), { recursive: true });
    fs.writeFileSync(BASELINE, JSON.stringify(sums, null, 1) + '\n');
    console.log('기준 갱신:', Object.keys(sums).length, '개 항목 →', path.relative(process.cwd(), BASELINE));
    return 0;
  }
  const r = reporter('골든 마스터(화면·상호작용·저장값)');
  if (!fs.existsSync(BASELINE)) { r.ok('기준 파일 존재', false, '`node tests/golden.cjs --update`로 먼저 만드세요'); return r.done(); }
  const base0 = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
  const diff = [];
  for (const k of new Set([...Object.keys(base0), ...Object.keys(sums)])) if (base0[k] !== sums[k]) diff.push(k);
  r.ok(`기준과 동일 (${Object.keys(base0).length}개 항목)`, diff.length === 0, '다른 항목: ' + diff.slice(0, 6).join(', ') + (diff.length > 6 ? ' …' : ''));
  const errs = Object.entries(res).filter(([k, v]) => k.endsWith('|오류') && v.length);
  r.ok('화면 이동 중 콘솔 오류 0', errs.length === 0, JSON.stringify(errs).slice(0, 160));
  if (diff.length) {
    fs.mkdirSync(OUTDIR, { recursive: true });
    fs.writeFileSync(path.join(OUTDIR, 'golden-current.json'), JSON.stringify(res));
    console.log('  (현재 덤프를 tests/.out/golden-current.json에 저장했습니다. 의도한 변경이면 --update)');
  }
  return r.done();
}
main().then((f) => process.exit(f ? 1 : 0)).catch((e) => { console.error(e); process.exit(1); });
