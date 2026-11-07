/* PWA 테스트 — 오프라인 동작, 설치 가능성, 설치 카드, 백업 불러오기 검사, 외부 요청 0건 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { startServer, loadPlaywright, reporter, goto, launchOptions } = require('./lib.cjs');

const FAKE = `window.__fire=()=>{const e=new Event('beforeinstallprompt');e.prompt=()=>{window.__prompted=(window.__prompted||0)+1;return Promise.resolve()};e.userChoice=Promise.resolve({outcome:'accepted'});window.dispatchEvent(e)};`;
const cards = (p) => p.evaluate(() => ({ install: document.body.innerText.includes('앱으로 설치해서'), a2hs: document.body.innerText.includes('홈 화면에 추가해서') }));

async function main() {
  const { chromium, devices } = loadPlaywright();
  const { server, base } = await startServer();
  const origin = new URL(base).origin;
  const browser = await chromium.launch(launchOptions());
  const r = reporter('PWA(오프라인·설치·백업)');
  const mk = async (opts, init) => {
    const ctx = await browser.newContext({ serviceWorkers: 'block', ...opts });
    const p = await ctx.newPage(); const errs = []; const ext = [];
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 90)));
    p.on('request', (q) => { const u = q.url(); if (!u.startsWith(origin) && !/^(data|blob):/.test(u)) ext.push(u); });
    if (init) await p.addInitScript(init);
    return { ctx, p, errs, ext };
  };

  // 1) 오프라인
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'allow' });
    const p = await ctx.newPage(); const ext = []; const errs = [];
    p.on('request', (q) => { const u = q.url(); if (!u.startsWith(origin) && !/^(data|blob):/.test(u)) ext.push(u); });
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 90)));
    await p.goto(base); await p.waitForTimeout(3500);
    r.ok('첫 방문에 앱 표시', (await p.evaluate(() => document.body.innerText)).includes('BUFS 비공식'));
    const homeText = await p.evaluate(() => document.body.innerText);
    r.ok('홈에 안내 3줄 표시(무료·개인정보·오픈소스·학교와 무관)', ['무료. 개인정보 불필요. 계정 및 로그인 불필요.', '오픈소스. 학습 기록은 각자의 기기에만 저장됩니다.', 'BUFS 대학 본부와는 상관이 없는 재학생 제작 프로젝트입니다.'].every((x) => homeText.includes(x)));
    r.ok('외부 요청 0건', ext.length === 0, ext.join(', '));
    await p.evaluate(() => navigator.serviceWorker.ready); await p.waitForTimeout(2500);
    const info = await p.evaluate(async () => { const names = await caches.keys(); const n = names.find((k) => k.startsWith('bufs-v')); return { names, shell: n ? (await (await caches.open(n)).keys()).length : 0 }; });
    r.ok('서비스 워커가 화면·데이터를 미리 저장(20개 이상)', info.shell >= 20, JSON.stringify(info));
    await p.evaluate(async () => { await window.harukoSpeak('机の上にペンや消しゴムがあります。'); }); await p.waitForTimeout(800);
    const cdp = await ctx.newCDPSession(p);
    const ie = await cdp.send('Page.getInstallabilityErrors');
    // in-incognito: 테스트용 임시 브라우저 창 때문에 생기는 것이라 앱(매니페스트·아이콘)의 문제가 아니다
    const instErrs = ie.installabilityErrors.filter((e) => e.errorId !== 'in-incognito');
    r.ok('설치 가능 판정 오류 0', instErrs.length === 0, JSON.stringify(instErrs));
    await ctx.setOffline(true); await p.reload(); await p.waitForTimeout(4500);
    const txt = async () => p.evaluate(() => document.body.innerText);
    let t = await txt();
    r.ok('오프라인 홈 표시', t.includes('BUFS 비공식') && t.includes('열심히 힘내서 N1'));
    await goto(p, '단어 카드'); t = await txt(); r.ok('오프라인 단어 카드 7,680개', /7680/.test(t.replace(/,/g, '')));
    await goto(p, '한자 카드'); t = await txt(); r.ok('오프라인 한자 카드 2,136자', /2136/.test(t.replace(/,/g, '')));
    await goto(p, '일본어 문법'); t = await txt(); r.ok('오프라인 문법 N1 54단원', /N1 단원 · 전체 54개/.test(t));
    await goto(p, '퀴즈 코너'); t = await txt(); r.ok('오프라인 퀴즈 4,552문항', /4,?552/.test(t));
    const again = await p.evaluate(async () => await window.harukoSpeak('机の上にペンや消しゴムがあります。'));
    r.ok('들어 본 음성은 오프라인에서 재생', again === true);
    r.ok('오프라인 중 콘솔 오류 0', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  // 2) 설치 카드
  {
    const t1 = await mk({ viewport: { width: 1280, height: 800 } }, FAKE + "document.addEventListener('DOMContentLoaded',()=>window.__fire());");
    await t1.p.goto(base); await t1.p.waitForTimeout(3500);
    r.ok('PC: 이벤트가 시작 직후 와도 설치 카드 표시', (await cards(t1.p)).install);
    await t1.p.locator('button', { hasText: '설치하기' }).click(); await t1.p.waitForTimeout(500);
    r.ok('설치하기 → 설치 창 호출 후 카드 숨김', (await t1.p.evaluate(() => window.__prompted)) === 1 && !(await cards(t1.p)).install);
    await t1.ctx.close();

    const t2 = await mk({ viewport: { width: 412, height: 860 }, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36' }, FAKE);
    await t2.p.goto(base); await t2.p.waitForTimeout(3000);
    r.ok('안드로이드: 이벤트 전에는 카드 없음', !(await cards(t2.p)).install);
    await t2.p.evaluate(() => window.__fire()); await t2.p.waitForTimeout(700);
    r.ok('안드로이드: 이벤트 후 카드 표시', (await cards(t2.p)).install);
    await t2.p.locator('button', { hasText: '나중에' }).first().click(); await t2.p.waitForTimeout(500);
    await t2.p.reload(); await t2.p.waitForTimeout(3000); await t2.p.evaluate(() => window.__fire()); await t2.p.waitForTimeout(600);
    r.ok('「나중에」 후 새로고침해도 다시 안 뜸', !(await cards(t2.p)).install);
    await t2.ctx.close();

    const t3 = await mk({ ...devices['iPhone 13'] });
    await t3.p.goto(base); await t3.p.waitForTimeout(3000);
    const c3 = await cards(t3.p); r.ok('아이폰 Safari: 홈 화면 추가 안내만 표시', c3.a2hs && !c3.install);
    await t3.ctx.close();

    const t4 = await mk({ viewport: { width: 1280, height: 800 } }, FAKE + "Object.defineProperty(navigator,'standalone',{get:()=>true});document.addEventListener('DOMContentLoaded',()=>window.__fire());");
    await t4.p.goto(base); await t4.p.waitForTimeout(3000);
    const c4 = await cards(t4.p); r.ok('이미 설치된 앱에는 카드 없음', !c4.install && !c4.a2hs);
    await t4.ctx.close();
  }

  // 3) 백업 불러오기 검사
  {
    const t = await mk({ viewport: { width: 1280, height: 800 } });
    await t.p.goto(base); await t.p.waitForTimeout(3000);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bufs-'));
    const write = (n, o) => { const f = path.join(tmp, n); fs.writeFileSync(f, JSON.stringify(o)); return f; };
    const files = {
      big: write('big.json', { app: 'bufs-japanese', data: { 'tj.x': 'a'.repeat(6 * 1024 * 1024) } }),
      bad: write('bad.json', { app: 'bufs-japanese', data: { 'tj.xp': 123 } }),
      ok: write('ok.json', { app: 'bufs-japanese', data: { 'tj.xp': '777' } }),
    };
    const pick = async (f) => { const [fc] = await Promise.all([t.p.waitForEvent('filechooser'), t.p.locator('button', { hasText: '백업 불러오기' }).click()]); await fc.setFiles(f); await t.p.waitForTimeout(800); };
    await pick(files.big); r.ok('5MB 초과 파일 거부', (await t.p.evaluate(() => document.body.innerText)).includes('너무 커요') && (await t.p.evaluate(() => localStorage.getItem('tj.xp'))) === null);
    await pick(files.bad); r.ok('형식이 틀린 파일 거부', (await t.p.evaluate(() => document.body.innerText)).includes('이 앱의 백업 파일이 아니에요') && (await t.p.evaluate(() => localStorage.getItem('tj.xp'))) === null);
    await pick(files.ok); await t.p.waitForTimeout(1800); r.ok('정상 파일은 불러와짐', (await t.p.evaluate(() => localStorage.getItem('tj.xp'))) === '777');
    await t.ctx.close();
  }

  // 4) 저장 형식 버전(tj.schema)
  {
    const t = await mk({ viewport: { width: 1280, height: 800 }, acceptDownloads: true }, "if(!localStorage.getItem('seeded')){localStorage.setItem('seeded','1');localStorage.setItem('tj.xp','123');localStorage.setItem('tj.mn.known','{\"日\":1}');}");
    await t.p.goto(base); await t.p.waitForTimeout(3000);
    const ls = (k) => t.p.evaluate((x) => localStorage.getItem(x), k);
    r.ok('첫 실행에 tj.schema=1 기록', (await ls('tj.schema')) === '1');
    r.ok('기존 기록(경험치·연상 암기 기록)은 그대로', (await ls('tj.xp')) === '123' && (await ls('tj.mn.known')) === '{"日":1}');
    const [dl] = await Promise.all([t.p.waitForEvent('download'), t.p.locator('button', { hasText: '백업 파일 받기' }).first().click()]);
    const j = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
    r.ok('백업 파일에 schema=1 포함', j.schema === 1 && j.data['tj.schema'] === '1');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bufs-'));
    const newer = path.join(tmp, 'newer.json'); fs.writeFileSync(newer, JSON.stringify({ app: 'bufs-japanese', schema: 2, data: { 'tj.xp': '999', 'tj.schema': '2' } }));
    const [fc] = await Promise.all([t.p.waitForEvent('filechooser'), t.p.locator('button', { hasText: '백업 불러오기' }).click()]); await fc.setFiles(newer); await t.p.waitForTimeout(800);
    r.ok('더 새로운 버전의 백업은 거부(기록 변경 없음)', (await t.p.evaluate(() => document.body.innerText)).includes('더 새로운 버전') && (await ls('tj.xp')) === '123' && (await ls('tj.schema')) === '1');
    const same = path.join(tmp, 'same.json'); fs.writeFileSync(same, JSON.stringify({ app: 'bufs-japanese', schema: 1, data: { 'tj.xp': '555', 'tj.schema': '1' } }));
    const [fc2] = await Promise.all([t.p.waitForEvent('filechooser'), t.p.locator('button', { hasText: '백업 불러오기' }).click()]); await fc2.setFiles(same); await t.p.waitForTimeout(1800);
    r.ok('같은 버전의 백업은 불러와짐', (await ls('tj.xp')) === '555' && (await ls('tj.schema')) === '1');
    await t.ctx.close();
  }

  await browser.close(); server.close();
  return r.done();
}
main().then((f) => process.exit(f ? 1 : 0)).catch((e) => { console.error(e); process.exit(1); });
