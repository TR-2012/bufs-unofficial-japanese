#!/usr/bin/env node
/* 품질 기준표(docs/QUALITY.md) 10항목을 실제로 검사해 한 화면에 출력한다.
 *   node tests/quality.cjs          전체(브라우저 테스트 포함, 약 2~3분)
 *   node tests/quality.cjs --fast   브라우저가 필요 없는 항목만(문서·구조·재현성·린트·타입·단위)
 * 종료 코드: 통과하지 못한 항목이 있으면 1 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..');
const FAST = process.argv.includes('--fast');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(ROOT, f));
const run = (args) => spawnSync(process.execPath, [path.join(__dirname, 'run.cjs'), ...args], { encoding: 'utf8' });
const lines = (s) => s.split('\n').length;

/* index.html의 인라인 로직(<script type="text/x-dc">) 줄 수 */
function inlineLogicLines() {
  const h = read('index.html'); const T = '<script type="text/x-dc" data-dc-script>';
  const a = h.indexOf(T) + T.length; return lines(h.slice(a, h.indexOf('</script>', a)));
}

const items = [];
const add = (no, name, ok, detail) => items.push({ no, name, ok, detail });

/* 1·3·4·5·6·8: 묶음 실행 */
const suite = (no, name, key, skipFast) => {
  if (FAST && skipFast) { add(no, name, null, '--fast 에서는 건너뜀'); return; }
  const r = run([key]); const out = (r.stdout || '') + (r.stderr || '');
  const m = [...out.matchAll(/= (\d+) 통과 \/ (\d+) 실패/g)];
  const pass = m.reduce((a, x) => a + +x[1], 0);
  add(no, name, r.status === 0, m.length ? `${pass}개 검사 통과` : (r.status === 0 ? '통과' : '실패 — `node tests/run.cjs ' + key + '` 로 확인'));
};
suite(3, '단위 테스트', 'unit');
suite(4, '린트(ESLint)', 'lint');
suite(5, '타입 점검(tsc)', 'types');
suite(6, '접근성(axe-core)', 'a11y', true);
{
  /* 1: 골든·PWA·보안 */
  if (FAST) add(1, '자동 테스트(골든·PWA·보안)', null, '--fast 에서는 건너뜀');
  else {
    const g = run(['golden']), p = run(['pwa']), s = run(['security']);
    add(1, '자동 테스트(골든·PWA·보안)', g.status === 0 && p.status === 0 && s.status === 0, [g, p, s].map((r) => (r.status === 0 ? '✓' : '✗')).join(' '));
  }
}

/* 2: CI 워크플로 */
{
  const wf = exists('.github/workflows/test.yml') ? read('.github/workflows/test.yml') : '';
  add(2, 'CI(GitHub Actions)', /node tests\/run\.cjs/.test(wf), wf ? '워크플로가 전체 테스트를 실행(성공 여부는 GitHub Actions 탭에서 확인)' : '워크플로 없음');
}

/* 7: 문서 + 링크 */
{
  const docs = ['README.md', 'CONTRIBUTING.md', 'docs/ARCHITECTURE.md', 'docs/QUALITY.md', 'tests/README.md', 'NOTICE.md', 'LICENSE'];
  const missing = docs.filter((f) => !exists(f));
  const broken = [];
  for (const f of docs.filter((x) => x.endsWith('.md'))) {
    if (!exists(f)) continue;
    const dir = path.dirname(f);
    for (const m of read(f).matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/g)) {
      const t = m[1]; if (/^(https?:|mailto:)/.test(t)) continue;
      if (!fs.existsSync(path.join(ROOT, dir, t))) broken.push(`${f} → ${t}`);
    }
  }
  add(7, '문서(구조·품질·기여) + 링크 유효', missing.length === 0 && broken.length === 0, missing.length || broken.length ? `없는 문서: ${missing.join(', ') || '-'} / 깨진 링크: ${broken.slice(0, 3).join(', ') || '-'}` : `${docs.length}개 문서 존재, 상대 링크 모두 유효`);
}

/* 8: 보안 — 보안 테스트(위 묶음 1에 포함) + npm audit */
{
  const sec = FAST ? null : run(['security']).status === 0;
  // Windows의 npm은 npm.cmd라 셸을 거쳐야 실행된다(인자는 고정값이라 셸 사용이 안전). 실행 실패를 「취약점 있음」으로 오판하지 않게 한다.
  const au = spawnSync('npm', ['audit', '--audit-level=high'], { cwd: __dirname, encoding: 'utf8', shell: process.platform === 'win32' });
  const none = /found 0 vulnerabilities/.test(au.stdout + au.stderr);
  add(8, '보안(헤더·XSS 테스트 + npm audit)', (sec === null ? true : sec) && au.status === 0, `npm audit: ${none ? '취약점 0건' : (au.status === 0 ? '심각 취약점 없음' : '취약점 있음')}${sec === null ? ' / 보안 테스트는 --fast 에서 건너뜀' : ''}`);
}

/* 9: 구조 — 앱 JS 파일 600줄 이하 */
{
  const LIMIT = 600;
  const files = { 'tts.js': lines(read('tts.js')), 'pwa.js': lines(read('pwa.js')), 'combo_check.js': lines(read('combo_check.js')), 'sw.js': lines(read('sw.js')), 'index.html 인라인 로직': inlineLogicLines() };
  const over = Object.entries(files).filter(([, n]) => n > LIMIT);
  const detail = Object.entries(files).map(([f, n]) => `${f} ${n}`).join(' · ') + ' (제외: support.js — 별도 도구가 만든 화면 런타임)';
  add(9, `구조(앱 JS 파일당 ${LIMIT}줄 이하)`, over.length === 0, over.length ? `초과: ${over.map(([f, n]) => `${f} ${n}줄`).join(', ')} / ${detail}` : detail);
}

/* 10: 재현성·의존성 */
{
  const html = read('index.html') + read('support.js') + read('tts.js') + read('pwa.js');
  const ext = [...html.matchAll(/(?:src|href)\s*=\s*["'](https?:\/\/[^"']+)["']/g)].map((m) => m[1]).filter((u) => !/edrdg|creativecommons/.test(u));
  const hasLock = exists('tests/package-lock.json');
  const assetsOk = run(['assets']).status === 0;
  const noRootPkg = !exists('package.json');
  add(10, '재현성(외부 CDN 0 · 잠금 파일 · 빌드 없음 · 배포 자산)', ext.length === 0 && hasLock && noRootPkg && assetsOk, `외부 주소 ${ext.length}건 · tests/package-lock.json ${hasLock ? '있음' : '없음'} · 루트 package.json ${noRootPkg ? '없음(빌드 불필요)' : '있음'} · 배포 자산 점검 ${assetsOk ? '통과' : '실패'}`);
}

items.sort((a, b) => a.no - b.no);
let pass = 0, fail = 0, skip = 0;
console.log('\n# 품질 기준표 점검' + (FAST ? ' (--fast)' : '') + '\n');
for (const it of items) {
  const mark = it.ok === null ? '·' : it.ok ? '✓' : '✗';
  if (it.ok === null) skip++; else if (it.ok) pass++; else fail++;
  console.log(`${String(it.no).padStart(2)}. ${mark} ${it.name} — ${it.detail}`);
}
console.log(`\n기준표: ${pass}/10 통과${fail ? `, ${fail}개 미통과` : ''}${skip ? `, ${skip}개 건너뜀` : ''}`);
process.exit(fail ? 1 : 0);
