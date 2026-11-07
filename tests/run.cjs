#!/usr/bin/env node
/* 전체 테스트 실행: node tests/run.cjs [golden|pwa|security] */
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const only = process.argv[2];
const suites = ['golden', 'pwa', 'security'].filter((s) => !only || s === only);
let failed = 0;
for (const s of suites) {
  const r = spawnSync(process.execPath, [path.join(__dirname, s + '.cjs')], { stdio: 'inherit' });
  if (r.status !== 0) failed++;
}
console.log('\n' + (failed ? `✗ 실패한 묶음 ${failed}개` : '✓ 전체 통과'));
process.exit(failed ? 1 : 0);
