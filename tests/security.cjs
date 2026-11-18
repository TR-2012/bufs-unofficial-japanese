/* 보안·접근성 테스트 — 사용자 입력/저장 데이터를 통한 스크립트 주입(XSS) 0건, 글자 대비, 알려진 위험 API 사용 점검 */
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, HEADERS_FILE, startServer, parseHeadersFile, headersForPath, watchCsp, TEMPLATE_HANDLER_BLOCK, loadPlaywright, reporter, MENUS, goto, launchOptions } = require('./lib.cjs');

const ALL_PATHS = '/*';
const SECURITY_HEADERS = ['X-Content-Type-Options', 'X-Frame-Options', 'Referrer-Policy', 'Cross-Origin-Opener-Policy', 'Strict-Transport-Security', 'Content-Security-Policy'];
// script-src에 있으면 주입된 스크립트가 실행될 수 있는 값
const UNSAFE_SCRIPT_SOURCES = ["'unsafe-inline'", '*', 'data:', 'blob:', 'http:', 'https:'];
const APP_LOAD_MS = 2500;

/* CSP 글 → { 지시문: [값, …] } */
function parseCsp(csp) {
  const directives = {};
  for (const part of String(csp || '').split(';')) {
    const [name, ...values] = part.trim().split(/\s+/);
    if (name) directives[name] = values;
  }
  return directives;
}

/* 4) 헤더: _headers의 내용과, 테스트 서버가 그 헤더를 실제로 보내는지 */
async function checkHeaders(r, base) {
  const rules = parseHeadersFile(fs.readFileSync(HEADERS_FILE, 'utf8'));
  const everywhere = rules.filter((rule) => rule.pattern === ALL_PATHS).flatMap((rule) => rule.headers.map(([name]) => name));
  const missing = SECURITY_HEADERS.filter((name) => !everywhere.includes(name));
  r.ok('보안 헤더 설정(nosniff·XFO·Referrer-Policy·COOP·HSTS·CSP)', missing.length === 0, '없는 헤더: ' + missing.join(', '));
  r.ok('/sw.js에 Service-Worker-Allowed: / 헤더', headersForPath(rules, '/sw.js')['Service-Worker-Allowed'] === '/');
  r.ok('「/*」에는 Cache-Control을 두지 않음(Cloudflare는 같은 이름 헤더를 이어 붙임)', !everywhere.includes('Cache-Control'));

  const elsewhere = rules.filter((rule) => rule.pattern !== ALL_PATHS).flatMap((rule) => rule.headers.map(([name]) => name));
  const repeated = elsewhere.filter((name) => SECURITY_HEADERS.includes(name));
  r.ok('보안 헤더는 「/*」에만 있음(값이 이어 붙지 않게)', repeated.length === 0, repeated.join(', '));

  const csp = parseCsp(headersForPath(rules, '/')['Content-Security-Policy']);
  r.ok("CSP 기본값이 같은 출처만 허용(default-src 'self')", (csp['default-src'] || []).join(' ') === "'self'");
  const unsafe = (csp['script-src'] || ['*']).filter((value) => UNSAFE_SCRIPT_SOURCES.includes(value));
  r.ok('CSP가 인라인·외부 스크립트를 허용하지 않음', unsafe.length === 0, unsafe.join(' '));

  const served = (await fetch(base)).headers.get('content-security-policy') || '';
  r.ok('테스트 서버가 _headers의 CSP를 그대로 보냄', served.includes("default-src 'self'"), served.slice(0, 60));
}

/* 5) 실제 CSP 아래에서 앱을 써 본다: 위반 0건 + 주입된 인라인 스크립트는 실행되지 않음 */
async function checkCspViolations(r, browser, base) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'allow', acceptDownloads: true });
  const p = await ctx.newPage();
  const violations = await watchCsp(p);
  await p.goto(base); await p.waitForTimeout(APP_LOAD_MS);
  await p.evaluate(() => navigator.serviceWorker.ready);
  // 템플릿(<x-dc>)의 onClick="{{ … }}" 속성은 실행용이 아닌 자리표시다. 브라우저가 페이지를 읽을 때 이 속성들을 인라인 핸들러로 보고 막는다(의도한 차단).
  const other = violations.filter((line) => !line.startsWith(TEMPLATE_HANDLER_BLOCK));
  r.ok('앱을 여는 동안 CSP가 막은 것은 템플릿의 이벤트 속성 자리표시뿐', other.length === 0, [...new Set(other)].slice(0, 4).join(' | '));
  violations.length = 0;
  for (const m of MENUS) await goto(p, m);
  await p.evaluate(async () => { await window.harukoSpeak('机の上にペンや消しゴムがあります。'); });
  await goto(p, '홈');
  await Promise.all([p.waitForEvent('download'), p.locator('button', { hasText: '백업 파일 받기' }).first().click()]);
  await p.locator('.hh-darkbtn').click(); await p.waitForTimeout(300);
  r.ok('앱을 쓰는 동안 CSP 위반 0건(9개 화면·음성·백업 받기·다크 전환·서비스 워커)', violations.length === 0, [...new Set(violations)].slice(0, 4).join(' | '));

  const before = violations.length;
  const ran = await p.evaluate(() => {
    const s = document.createElement('script'); s.textContent = 'window.__inline=1'; document.head.appendChild(s);
    return window.__inline === 1;
  });
  await p.waitForTimeout(300);
  r.ok('주입된 인라인 스크립트는 CSP에 막힘', ran === false && violations.length > before, JSON.stringify({ ran, added: violations.length - before }));
  await ctx.close();
}

// 값이 JSON으로 저장되는 키 — 모양이 틀린 값이 들어와도 앱이 열려야 한다
const JSON_KEYS = ['tj.rev.k', 'tj.rev.w', 'tj.seen.k', 'tj.seen.w', 'tj.seen.m', 'tj.seen.g', 'tj.seen.wm', 'tj.seen.ws', 'tj.mn.known', 'tj.today', 'tj.streak', 'tj.kanji.extra', 'tj.word.extra', 'tj.grammar.extra', 'tj.write.extra'];
// JSON으로는 읽히지만 모양이 틀린 값. 오염 페이로드는 반드시 글 그대로 둔다(객체 리터럴로 쓰면 뜻이 달라진다).
const BAD_VALUES = ['5', '{}', '"x"', '[{}]', '{"__proto__":{"polluted":[1]}}', '{"constructor":{"keys":[1]}}'];
const TODAY = '__TODAY__';
const NESTED_CASES = [
  { 'tj.grammar.extra': '{"N1":5}' },
  { 'tj.write.extra': '{"sentence":{"basic":5}}' },
  { 'tj.streak': '{"last":"' + TODAY + '","n":[{}]}' },
  { 'tj.kanji.extra': '[{"char":"試","on":[{}],"meaning":"x"}]' },
  { 'tj.word.extra': '[{"word":"試験","reading":5,"meaning":["x"]}]' },
];
// 앱이 열릴 때마다 스스로 다시 쓰는 키(값이 그대로인지 비교하지 않는다)
const REWRITTEN_ON_LOAD = ['tj.streak'];

/* 저장값 한 벌을 넣고 앱을 열어 본다 → { broken: [문제 설명], changed: [바뀐 키] } */
async function openWithStored(browser, base, stored) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  // 페이지 안에서는 Object.keys 같은 전역 함수를 쓰지 않는다(오염되면 검사 자체가 죽는다) → [키, 값] 배열로 넘긴다
  const entries = Object.entries(stored);
  await p.addInitScript(([pairs, todayMark]) => {
    if (localStorage.getItem('seeded')) return;
    localStorage.setItem('seeded', '1');
    const d = new Date(); const today = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
    for (const [k, v] of pairs) localStorage.setItem(k, v.replace(todayMark, today));
  }, [entries, TODAY]);
  await p.goto(base); await p.waitForTimeout(APP_LOAD_MS);
  const compared = entries.filter(([k]) => !REWRITTEN_ON_LOAD.includes(k) && !stored[k].includes(TODAY));
  // 오염된 페이지에서는 객체를 돌려받는 것도 깨질 수 있다 → 페이지에서는 글자만 돌려받는다
  const changed = (await p.evaluate((pairs) => pairs.filter(([k, v]) => localStorage.getItem(k) !== v).map(([k]) => k).join(','), compared)) || '';
  const broken = [];
  const look = () => p.evaluate(() => {
    const content = document.querySelector('.hh-content');
    if (document.querySelectorAll('.sc-logic-error').length) return '오류 표시';
    return content && content.innerText.trim() ? '' : '빈 화면';
  });
  for (const m of MENUS) {
    if (!(await p.locator('nav button', { hasText: m }).count())) { broken.push(m + ': 메뉴 없음'); break; }
    await goto(p, m);
    const problem = await look();
    if (problem) broken.push(m + ': ' + problem);
  }
  const polluted = await p.evaluate(() => (({}).polluted !== undefined ? 'Object.prototype 오염 ' : '') + (typeof Object.keys === 'function' ? '' : 'Object.keys 덮어써짐'));
  if (polluted) broken.push('전역 객체 오염: ' + polluted);
  await ctx.close();
  return { broken, changed: changed ? changed.split(',') : [] };
}

/* 6) 잘못된 형식의 저장값(남이 준 백업 파일·손상된 저장소)에도 앱이 열리고, 전역 객체가 오염되지 않는다 */
async function checkBadStoredValues(r, browser, base) {
  const cases = BAD_VALUES.map((value) => Object.fromEntries(JSON_KEYS.map((k) => [k, value]))).concat(NESTED_CASES);
  const broken = []; const changed = [];
  for (const stored of cases) {
    const label = Object.keys(stored).length > 1 ? '전체 키=' + Object.values(stored)[0] : Object.keys(stored)[0] + '=' + Object.values(stored)[0];
    const seen = await openWithStored(browser, base, stored);
    if (seen.broken.length) broken.push(label + ' → ' + seen.broken[0]);
    if (seen.changed.length) changed.push(label + ' → ' + seen.changed.join(','));
  }
  r.ok(`잘못된 형식의 저장값 ${cases.length}종: 9개 화면이 모두 열리고 전역 객체 오염 없음`, broken.length === 0, '\n      ' + broken.slice(0, 6).join('\n      '));
  r.ok('잘못된 저장값을 열기만 해서는 고치거나 지우지 않음', changed.length === 0, changed.slice(0, 4).join(' | '));
}

const P1 ='<img src=x onerror="window.__xss=1">', P2 = '"><svg onload="window.__xss=2">', P3 = '</script><script>window.__xss=3</script>';

async function main() {
  const { chromium } = loadPlaywright();
  const { server, base } = await startServer();
  const browser = await chromium.launch(launchOptions());
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
    const files = ['index.html', 'support.js', 'tts.js', 'combo_check.js', 'storage_guard.js', 'pwa.js', 'sw.js'];
    const bad = [];
    for (const f of files) {
      const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
      for (const [re, name] of [[/dangerouslySetInnerHTML/, 'dangerouslySetInnerHTML'], [/\beval\s*\(/, 'eval('], [/document\.write\s*\(/, 'document.write'], [/https?:\/\/(?!www\.edrdg|creativecommons)[a-z0-9.-]+\.[a-z]{2,}/i, '외부 주소']]) if (re.test(s)) bad.push(`${f}: ${name}`);
    }
    r.ok('앱 코드에 위험 API·외부 주소 없음', bad.length === 0, bad.join(', '));
  }
  await checkHeaders(r, base);
  await checkCspViolations(r, browser, base);
  await checkBadStoredValues(r, browser, base);

  await browser.close(); server.close();
  return r.done();
}
main().then((f) => process.exit(f ? 1 : 0)).catch((e) => { console.error(e); process.exit(1); });
