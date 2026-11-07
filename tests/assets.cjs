/* 배포 자산·저장소 점검 (브라우저 불필요)
 *  1) .assetsignore 를 적용한 「Cloudflare 업로드 목록」에 앱 필수 파일(서비스 워커 미리 저장 목록 포함)·_headers·라이선스 고지가 있고,
 *     개발 전용 폴더는 빠졌으며, 파일 수가 한도(20,000) 이하인지
 *  2) 저장소 텍스트 파일에 개인 식별 정보(이메일·계정 이름이 들어간 배포 주소)가 없는지 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { ROOT, reporter } = require('./lib.cjs');

const r = reporter('배포 자산·저장소 점검');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

/* .assetsignore (gitignore 단순형: 이름 또는 폴더 접두사) */
const rules = read('.assetsignore').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
const ignored = (p) => rules.some((i) => p === i || p.startsWith(i + '/'));
const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const p = dir ? `${dir}/${e.name}` : e.name;
    if (ignored(p)) continue;
    if (e.isDirectory()) walk(p); else files.push(p);
  }
})('');
const has = (p) => files.includes(p);

/* 필수 파일: 서비스 워커 SHELL 목록 + 앱 실행·고지 파일 */
const sw = read('sw.js');
const shell = [...(sw.match(/const SHELL = \[([\s\S]*?)\];/) || ['', ''])[1].matchAll(/'([^']+)'/g)].map((m) => m[1]).filter((p) => p !== './');
const required = [...new Set([...shell, 'index.html', 'support.js', 'tts.js', 'pwa.js', 'combo_check.js', 'sw.js', 'manifest.webmanifest', 'haruko.jpg', '_headers', 'NOTICE.md', 'LICENSE'])];
const missing = required.filter((p) => !has(p));
r.ok(`필수 파일 ${required.length}개가 업로드 목록에 포함`, missing.length === 0, '빠진 파일: ' + missing.join(', '));

const devLeak = ['tests/run.cjs', 'scripts/build_voice.mjs', 'data/lib/build.mjs', 'docs/ARCHITECTURE.md', 'wrangler.jsonc', 'README.md', '.github/workflows/test.yml'].filter(has);
r.ok('개발·문서·설정 파일은 업로드에서 제외', devLeak.length === 0, '올라가는 파일: ' + devLeak.join(', '));
r.ok(`업로드 파일 수 ${files.length}개 ≤ 20,000(Cloudflare 정적 배포 한도)`, files.length <= 20000);
const big = files.filter((p) => fs.statSync(path.join(ROOT, p)).size > 25 * 1024 * 1024);
r.ok('파일당 25MB 이하', big.length === 0, big.join(', '));

/* wrangler.jsonc 형식(주석 제거 후 JSON) */
try {
  const w = JSON.parse(read('wrangler.jsonc').replace(/^\s*\/\/.*$/gm, ''));
  r.ok('wrangler.jsonc: name·assets.directory 지정', !!w.name && w.assets && w.assets.directory === '.', JSON.stringify(w));
} catch (e) { r.ok('wrangler.jsonc 해석', false, String(e.message)); }

/* 개인 식별 정보: git 추적 파일 전체에서 검사 */
const tracked = spawnSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' }).stdout.split('\0').filter(Boolean);
const PII = /titalike|@pm\.me|sekkenkun|\.workers\.dev|\.pages\.dev/i;
const hits = [];
for (const f of tracked) {
  if (/\.(png|jpg|mp3|woff2?)$/i.test(f) || f.startsWith('audio/') || f.startsWith('tests/node_modules/') || f === 'tests/package-lock.json') continue;
  if (f === 'tests/assets.cjs') continue; // 이 검사 자체
  let s; try { s = fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { continue; }
  const m = s.match(PII); if (m) hits.push(`${f}(${m[0]})`);
}
r.ok(`저장소 ${tracked.length}개 파일에 개인 식별 정보 없음(이메일·계정명이 든 배포 주소 포함)`, hits.length === 0, hits.slice(0, 5).join(', '));

process.exit(r.done() ? 1 : 0);
