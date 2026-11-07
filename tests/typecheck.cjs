#!/usr/bin/env node
/* 타입 점검(JSDoc + tsc --checkJs): 브라우저용 파일(DOM)과 서비스 워커(WebWorker)를 각각 검사한다.
 * 인라인 로직(index.html)은 아직 대상이 아니다 — 파일로 분리되면 tsconfig.json의 include에 추가한다. */
const path = require('node:path');
const { spawnSync } = require('node:child_process');
// .bin/tsc는 Windows에서 tsc.cmd라 spawnSync로 바로 실행되지 않는다 → node로 JS 진입점을 직접 실행한다.
const tsc = path.join(__dirname, 'node_modules', 'typescript', 'bin', 'tsc');
let fail = 0;
for (const cfg of ['tsconfig.json', 'tsconfig.sw.json']) {
  const r = spawnSync(process.execPath, [tsc, '-p', path.join(__dirname, cfg)], { cwd: __dirname, stdio: 'inherit' });
  console.log(`  ${r.status === 0 ? '✓' : '✗'} ${cfg}`);
  if (r.status !== 0) fail++;
}
process.exit(fail ? 1 : 0);
