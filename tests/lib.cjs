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

const HEADERS_FILE = path.join(ROOT, '_headers');
// 테스트는 항상 방금 고친 파일을 받아야 하므로 _headers의 캐시 설정은 적용하지 않는다
const SKIPPED_HEADER = 'cache-control';

/* Cloudflare `_headers` 글 → [{ pattern, headers: [[이름, 값]] }] */
function parseHeadersFile(text) {
  const rules = [];
  let current = null;
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (!/^\s/.test(line)) { current = { pattern: trimmed, headers: [] }; rules.push(current); continue; }
    const colon = trimmed.indexOf(':');
    if (!current || colon < 0) continue;
    current.headers.push([trimmed.slice(0, colon).trim(), trimmed.slice(colon + 1).trim()]);
  }
  return rules;
}

function patternToRegExp(pattern) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp('^' + escaped + '$');
}

/* 한 주소에 걸리는 헤더를 모은다. Cloudflare처럼 같은 이름의 값은 쉼표로 이어 붙인다. */
function headersForPath(rules, pathname) {
  const merged = {};
  for (const rule of rules) {
    if (!patternToRegExp(rule.pattern).test(pathname)) continue;
    for (const [name, value] of rule.headers) merged[name] = merged[name] ? merged[name] + ', ' + value : value;
  }
  return merged;
}

/* 요청 주소 → { pathname, file }. 주소가 깨졌으면 null, 저장소 밖이거나 없는 파일이면 file이 null. */
function resolveRequest(requestUrl) {
  let pathname;
  try { pathname = decodeURIComponent(new URL(requestUrl, 'http://x').pathname); } catch (e) { return null; }
  const relative = pathname.endsWith('/') ? pathname + 'index.html' : pathname;
  const file = path.resolve(ROOT, '.' + relative);
  // ROOT 뒤에 구분자를 붙여 비교한다(이름이 같은 접두사로 시작하는 옆 폴더를 막는다)
  const inside = file.startsWith(ROOT + path.sep);
  const servable = inside && fs.existsSync(file) && !fs.statSync(file).isDirectory();
  return { pathname, file: servable ? file : null };
}

function startServer() {
  const rules = parseHeadersFile(fs.readFileSync(HEADERS_FILE, 'utf8'));
  const server = http.createServer((req, res) => {
    const target = resolveRequest(req.url);
    if (!target) { res.writeHead(400); res.end('bad request'); return; }
    if (!target.file) { res.writeHead(404); res.end('not found'); return; }
    const headers = { 'Content-Type': MIME[path.extname(target.file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' };
    for (const [name, value] of Object.entries(headersForPath(rules, target.pathname))) {
      if (name.toLowerCase() !== SKIPPED_HEADER) headers[name] = value;
    }
    res.writeHead(200, headers);
    fs.createReadStream(target.file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, base: 'http://127.0.0.1:' + server.address().port + '/' })));
}

// watchCsp가 남기는 줄 가운데 「인라인 이벤트 속성(onclick="…")이 막혔다」는 뜻의 줄.
// 템플릿(<x-dc>)의 onClick="{{ … }}" 자리표시를 브라우저가 페이지를 읽을 때 막으면서 생긴다(의도한 차단).
const TEMPLATE_HANDLER_BLOCK = 'script-src-attr ← inline';

/* 페이지에서 생긴 CSP 위반을 모은다. 반드시 page.goto 전에 부른다. 돌려준 배열에 「막힌 지시문 ← 막힌 주소」가 쌓인다. */
async function watchCsp(page) {
  const violations = [];
  await page.exposeFunction('__reportCsp', (line) => { violations.push(line); });
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => window.__reportCsp(e.violatedDirective + ' ← ' + (e.blockedURI || 'inline')));
  });
  return violations;
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

/* 결정적 실행: 난수·현재 시각 고정
 * Date.now()만 고정하면 인자 없는 new Date()(오늘 날짜·연속 출석 계산)는 실제 시계를 써서,
 * 날짜가 바뀌면 골든 「저장값」이 달라진다 → 인자 없는 new Date()도 같은 시각(T)을 쓰게 한다. */
const SEED = `(()=>{let a=123456789;Math.random=()=>{a=(a*1664525+1013904223)%4294967296;return a/4294967296};const T=1762400000000;`
  + `const R=Date;function F(...x){if(!new.target)return new R(T).toString();return x.length?new R(...x):new R(T);}`
  + `F.prototype=R.prototype;F.now=()=>T;F.parse=R.parse;F.UTC=R.UTC;globalThis.Date=F;})();`;

const MENUS = ['홈', '한자 카드', '연상 암기', '단어 카드', '4년 트랙', '필기 노트', '퀴즈 코너', '일본어 문법', '작문 연습'];
const goto = async (p, name) => { await p.locator('nav button', { hasText: name }).first().click(); await p.waitForTimeout(600); };

/* 브라우저 실행 옵션: 시스템에 설치된 크롬을 쓰려면 환경변수 CHROMIUM_PATH=/경로/chrome */
const launchOptions = () => (process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});

module.exports = { launchOptions, ROOT, HEADERS_FILE, startServer, parseHeadersFile, headersForPath, watchCsp, TEMPLATE_HANDLER_BLOCK, loadPlaywright, reporter, SEED, MENUS, goto };
