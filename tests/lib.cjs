/* 테스트 공용 도구: 저장소 루트를 서빙하는 작은 서버 + 브라우저 실행 + 검사 도우미.
 * 외부 네트워크를 쓰지 않는다(React는 vendor/에 있음). */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.css': 'text/css',
};

function startServer() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, base: 'http://127.0.0.1:' + server.address().port + '/' })));
}

function loadPlaywright() {
  try { return require('playwright'); }
  catch (e) {
    try { return require(path.join(require('node:child_process').execSync('npm root -g').toString().trim(), 'playwright')); }
    catch (e2) { console.error('playwright가 없습니다. `npm install` 후 `npx playwright install chromium`을 실행하세요.'); process.exit(2); }
  }
}

/* 결과 집계: ok(이름, 조건, 상세) */
function reporter(title) {
  let pass = 0, fail = 0;
  console.log('\n## ' + title);
  return {
    ok(name, cond, detail) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (detail ? '  → ' + detail : '')); } },
    done() { console.log(`  = ${pass} 통과 / ${fail} 실패`); return fail; },
  };
}

/* 결정적 실행: 난수·현재 시각 고정 */
const SEED = `(()=>{let a=123456789;Math.random=()=>{a=(a*1664525+1013904223)%4294967296;return a/4294967296};const T=1762400000000;Date.now=()=>T;})();`;

const MENUS = ['홈', '한자 카드', '연상 암기', '단어 카드', '4년 트랙', '필기 노트', '퀴즈 코너', '일본어 문법', '작문 연습'];
const goto = async (p, name) => { await p.locator('nav button', { hasText: name }).first().click(); await p.waitForTimeout(600); };

/* 브라우저 실행 옵션: 시스템에 설치된 크롬을 쓰려면 환경변수 CHROMIUM_PATH=/경로/chrome */
const launchOptions = () => (process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});

module.exports = { launchOptions, ROOT, startServer, loadPlaywright, reporter, SEED, MENUS, goto };
