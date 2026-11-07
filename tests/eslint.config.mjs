// 린트 설정(ESLint 9 flat config). 실행: `npm run lint` (tests 폴더에서) 또는 `node tests/lint.cjs`
import js from '@eslint/js';
import globals from 'globals';

const rules = {
  ...js.configs.recommended.rules,
  'no-empty': ['error', { allowEmptyCatch: true }], // 저장소·브라우저 API 실패를 조용히 넘기는 catch(e){} 는 이 앱의 의도된 방식
  'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
};

export default [
  { ignores: ['**/node_modules/**', 'tests/.out/*.json', 'tests/golden/**'] },
  // 브라우저에서 도는 앱 코드
  { files: ['tts.js', 'pwa.js', 'combo_check.js', 'tests/.out/logic.js'], languageOptions: { ecmaVersion: 2022, sourceType: 'script', globals: { ...globals.browser, React: 'readonly', DCLogic: 'readonly', StreamableLogic: 'readonly' } }, rules },
  // 서비스 워커
  { files: ['tests/.out/logic.js'], rules: { 'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^Component$' }] } },
  { files: ['sw.js'], languageOptions: { ecmaVersion: 2022, sourceType: 'script', globals: { ...globals.serviceworker } }, rules },
  // Node에서 도는 테스트·스크립트
  { files: ['tests/**/*.cjs'], languageOptions: { ecmaVersion: 2022, sourceType: 'commonjs', globals: { ...globals.node, ...globals.browser } }, rules },
  { files: ['scripts/*.mjs', 'data/lib/build*.mjs'], languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.node } }, rules },
];
