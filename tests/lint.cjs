#!/usr/bin/env node
/* 린트 실행: index.html의 로직(인라인 클래스)을 tests/.out/logic.js로 꺼낸 뒤 ESLint로 앱 코드·테스트·스크립트를 검사한다.
 * support.js는 별도 도구로 만든 런타임이라 대상에서 제외한다(docs/QUALITY.md). */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const h = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const TAG = '<script type="text/x-dc" data-dc-script>';
const a = h.indexOf(TAG) + TAG.length;
fs.mkdirSync(path.join(__dirname, '.out'), { recursive: true });
fs.writeFileSync(path.join(__dirname, '.out', 'logic.js'), h.slice(a, h.indexOf('</script>', a)));
const targets = ['tts.js', 'pwa.js', 'combo_check.js', 'sw.js', 'tests/.out/logic.js', 'tests/*.cjs', 'tests/unit/*.cjs', 'scripts/*.mjs'];
const bin = path.join(__dirname, 'node_modules', '.bin', 'eslint');
const r = spawnSync(bin, ['-c', path.join(__dirname, 'eslint.config.mjs'), ...(process.argv.slice(2)), ...targets], { cwd: root, stdio: 'inherit' });
process.exit(r.status === null ? 1 : r.status);
