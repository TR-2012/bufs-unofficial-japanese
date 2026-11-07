/* 보안·접근성 테스트 — 사용자 입력/저장 데이터를 통한 스크립트 주입(XSS) 0건, 글자 대비, 알려진 위험 API 사용 점검 */
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, startServer, loadPlaywright, reporter, MENUS, goto } = require('./lib.cjs');

const P1 = '<img src=x onerror="window.__xss=1">', P2 = '"><svg onload="window.__xss=2">', P3 = '</script><script>window.__xss=3</script>';

async function main() {
  const { chromium } = loadPlaywright();
  const { server, base } = await startServer();
  const browser = await chromium.launch();
  const r = reporter('보안·대비');

  // 1) XSS: 악성 문자열을 저장값·주소·검색칸·작문 입력에 넣어 본다
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
    const p = await ctx.newPage(); let dialogs = 0; const errs = [];
    p.on('dialog', (d) => { dialogs++; d.dismiss(); }); p.on('pageerror', (e) => errs.push(e.message.slice(0, 80)));
    await p.addInitScript(([a, b, c]) => {
      if (localStorage.getItem('seeded')) return; localStorage.setItem('seeded', '1');
      for (const k of ['tj.xp', 'tj.solved', 'tj.streak', 'tj.today', 'tj.mn.known', 'tj.rev.k', 'tj.rev.w', 'tj.quiz.level', 'tj.seen.k', 'tj.seen.w', 'tj.day.quiz', 'tj.nudge.firstAt', 'tj.dark']) localStorage.setItem(k, a);
      localStorage.setItem('tj.solved', JSON.stringify({ [b]: 1, [c]: 2 }));
      localStorage.setItem('tj.today', JSON.stringify({ d: a, k: b, w: c, q: a }));
    }, [P1, P2, P3]);
    await p.goto(base + '#/' + encodeURIComponent(P1)); await p.waitForTimeout(3000);
    const alive = await p.evaluate(() => document.body.innerText.includes('BUFS 비공식'));
    await goto(p, '단어 카드'); const i1 = p.locator('input').first(); if (await i1.count()) { await i1.fill(P1 + P2 + P3); await p.waitForTimeout(600); }
    await goto(p, '작문 연습'); const ta = p.locator('textarea').first();
    if (await ta.count()) { await ta.fill(P1 + P2 + P3); for (const t of ['채점하기', '모범 답안 보기']) { const b = p.locator('button', { hasText: t }).first(); if (await b.count()) { await b.click(); await p.waitForTimeout(500); } } }
    await goto(p, '한자 카드'); const i2 = p.locator('input').first(); if (await i2.count()) { await i2.fill(P1 + P2); await p.waitForTimeout(500); }
    const x = await p.evaluate(() => ({ xss: window.__xss || 0, img: document.querySelectorAll('img[src="x"]').length, svg: document.querySelectorAll('svg[onload]').length, scr: [...document.scripts].filter((s) => s.textContent.includes('__xss')).length }));
    r.ok('악성 저장값·주소에도 앱이 열림', alive);
    r.ok('스크립트 실행 0건(XSS)', x.xss === 0 && x.img === 0 && x.svg === 0 && x.scr === 0 && dialogs === 0, JSON.stringify({ ...x, dialogs }));
    r.ok('주입 중 콘솔 오류 0', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  // 2) 글자 대비(WCAG 3.2 이상이 아닌 텍스트 0건) — 라이트·다크
  for (const theme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
    const p = await ctx.newPage();
    await p.addInitScript((t) => localStorage.setItem('tj.dark', t === 'dark' ? '1' : '0'), theme);
    await p.goto(base); await p.waitForTimeout(2500);
    const low = [];
    for (const m of MENUS) {
      await goto(p, m);
      low.push(...await p.evaluate(() => {
        const parse = (c) => { const m = c.match(/[\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 }; };
        const lum = (c) => { const f = (v) => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(c.r) + .7152 * f(c.g) + .0722 * f(c.b); };
        const bgOf = (e) => { let x = e; while (x) { const c = parse(getComputedStyle(x).backgroundColor); if (c.a > .5) return c; x = x.parentElement; } return { r: 255, g: 255, b: 255, a: 1 }; };
        const out = [];
        document.querySelectorAll('.hh-root *').forEach((e) => {
          if (!e.offsetParent) return; let t = ''; e.childNodes.forEach((n) => { if (n.nodeType === 3) t += n.textContent; }); t = t.trim(); if (!t) return;
          const a = lum(parse(getComputedStyle(e).color)), b = lum(bgOf(e)); const cr = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
          if (cr < 3.2) out.push(t.slice(0, 12) + ' ' + cr.toFixed(1));
        });
        return out;
      }));
    }
    r.ok(`${theme} 모드: 대비 3.2 미만 글자 0건`, low.length === 0, [...new Set(low)].slice(0, 4).join(', '));
    await ctx.close();
  }

  // 3) 정적 점검: 위험 API·외부 주소
  {
    const files = ['index.html', 'tts.js', 'combo_check.js', 'pwa.js', 'sw.js'];
    const bad = [];
    for (const f of files) {
      const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
      for (const [re, name] of [[/dangerouslySetInnerHTML/, 'dangerouslySetInnerHTML'], [/\beval\s*\(/, 'eval('], [/document\.write\s*\(/, 'document.write'], [/https?:\/\/(?!www\.edrdg|creativecommons)[a-z0-9.-]+\.[a-z]{2,}/i, '외부 주소']]) if (re.test(s)) bad.push(`${f}: ${name}`);
    }
    r.ok('앱 코드에 위험 API·외부 주소 없음', bad.length === 0, bad.join(', '));
    const v = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
    const keys = new Set(v.headers.flatMap((h) => h.headers.map((x) => x.key)));
    r.ok('보안 헤더 설정(nosniff·Referrer-Policy·CSP)', ['X-Content-Type-Options', 'Referrer-Policy', 'Content-Security-Policy'].every((k) => keys.has(k)));
  }

  await browser.close(); server.close();
  return r.done();
}
main().then((f) => process.exit(f ? 1 : 0)).catch((e) => { console.error(e); process.exit(1); });
