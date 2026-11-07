/* 접근성 테스트 — axe-core(WCAG 2.x A·AA 규칙)를 9개 화면 × 라이트·다크 × PC·폰에서 실행한다.
 * 통과 기준: 심각(critical)·중대(serious) 위반 0건. 낮은 등급(moderate·minor)은 목록만 출력한다. */
const path = require('node:path');
const { startServer, loadPlaywright, reporter, MENUS, goto, launchOptions } = require('./lib.cjs');
const AXE = require.resolve('axe-core/axe.min.js', { paths: [__dirname] });
const SHOW = process.argv.includes('--all');

async function main() {
  const { chromium } = loadPlaywright();
  const { server, base } = await startServer();
  const browser = await chromium.launch(launchOptions());
  const r = reporter('접근성(axe-core WCAG 2.x A·AA)');
  const bad = new Map(); const minor = new Map();
  for (const [theme, vw, vh] of [['light', 1280, 900], ['dark', 1280, 900], ['light', 390, 844], ['dark', 390, 844]]) {
    const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, serviceWorkers: 'block', hasTouch: vw < 800 });
    const p = await ctx.newPage();
    await p.addInitScript((t) => localStorage.setItem('tj.dark', t === 'dark' ? '1' : '0'), theme);
    await p.goto(base); await p.waitForTimeout(2500);
    await p.addScriptTag({ path: AXE });
    for (const m of MENUS) {
      await goto(p, m);
      const res = await p.evaluate(async () => await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] }, resultTypes: ['violations'] }));
      for (const v of res.violations) {
        const key = `${v.id} (${v.impact})`;
        const map = ['critical', 'serious'].includes(v.impact) ? bad : minor;
        const e = map.get(key) || { help: v.help, nodes: 0, where: new Set(), sample: v.nodes[0] && v.nodes[0].html.slice(0, 90) };
        e.nodes += v.nodes.length; e.where.add(`${theme}-${vw}/${m}`); map.set(key, e);
      }
    }
    await ctx.close();
  }
  const fmt = (map) => [...map].map(([k, e]) => `${k}: ${e.help} — ${e.nodes}곳, 화면 ${e.where.size}개 예) ${e.sample}`);
  r.ok('심각·중대 위반 0건', bad.size === 0, '\n      ' + fmt(bad).join('\n      '));
  if (minor.size) { console.log(`  (참고) 낮은 등급 위반 ${minor.size}종`); if (SHOW) fmt(minor).forEach((l) => console.log('    - ' + l)); else console.log('    --all 로 목록 보기'); }
  await browser.close(); server.close();
  return r.done();
}
main().then((f) => process.exit(f ? 1 : 0)).catch((e) => { console.error(e); process.exit(1); });
