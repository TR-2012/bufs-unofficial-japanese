#!/usr/bin/env node
/* 전체 테스트 실행: node tests/run.cjs [lint|types|unit|assets|golden|pwa|security|a11y] */
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const only = process.argv[2];
const FILES = { lint: 'lint.cjs', types: 'typecheck.cjs', unit: 'unit/logic.test.cjs', assets: 'assets.cjs', golden: 'golden.cjs', pwa: 'pwa.cjs', security: 'security.cjs', a11y: 'a11y.cjs' };
const suites = Object.keys(FILES).filter((s) => !only || s === only);
let failed = 0;
for (const s of suites) {
  const r = spawnSync(process.execPath, [path.join(__dirname, FILES[s])], { stdio: 'inherit' });
  if (r.status !== 0) failed++;
}
console.log('\n' + (failed ? `✗ 실패한 묶음 ${failed}개` : '✓ 전체 통과'));
process.exit(failed ? 1 : 0);
