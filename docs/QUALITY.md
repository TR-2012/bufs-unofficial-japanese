# 품질 기준표 (QUALITY)

「코드가 좋다」를 말이 아니라 **명령 하나로 확인되는 10개 항목**으로 정의합니다. 각 항목은 아래 명령으로 누구나 다시 검증할 수 있습니다.

> 이 표의 점수는 **객관 검사를 통과한 항목 수**입니다. 사람이 읽고 느끼는 총평(설계의 우아함 등)과는 별개입니다. 이 앱은 자체 런타임(`support.js`) 위에서 동작하므로, 총평 기준으로는 이 표가 모두 통과해도 최고 점수는 아닙니다.

| # | 항목 | 통과 기준 | 확인 명령 | 상태 |
|---|---|---|---|---|
| 1 | 자동 테스트 | 골든 마스터·PWA·보안 테스트 전체 통과 | `node tests/run.cjs` | ✅ |
| 2 | CI | 푸시·PR마다 GitHub Actions가 항목 1을 실행해 통과 | `.github/workflows/test.yml` + Actions 탭 | 🔶 설정됨, 첫 실행 확인 필요 |
| 3 | 단위 테스트 | 순수 로직 단위 테스트 40개 이상 통과 | `node tests/run.cjs unit` | ✅ (81개, 변이 테스트 6/6 검출) |
| 4 | 린트 | ESLint 오류 0 | `npx eslint` (tests 폴더에서) | ⬜ |
| 5 | 타입 점검 | JSDoc 기반 `tsc --checkJs` 오류 0(분리한 모듈 대상) | `npx tsc -p tests/tsconfig.json` | ⬜ |
| 6 | 접근성 | axe-core 자동 검사 심각·중대 위반 0 (9개 화면 × 라이트·다크) | `node tests/run.cjs a11y` | ⬜ |
| 7 | 문서 | 구조(ARCHITECTURE)·품질(QUALITY)·기여(CONTRIBUTING) 문서 존재, 링크 유효 | `node tests/quality.cjs` | 🔶 |
| 8 | 보안 | 보안 헤더·XSS 테스트 통과, 테스트 도구 `npm audit` 중대 취약점 0 | `node tests/run.cjs security` + `npm audit` | ✅ (감사 0건, 2026-11) |
| 9 | 구조 | 앱 JS 파일 하나당 600줄 이하 | `node tests/quality.cjs` | ⬜ |
| 10 | 재현성 | 외부 CDN 0, 잠금 파일(`tests/package-lock.json`) 있음, 빌드 없이 실행 | `node tests/quality.cjs` | 🔶 |

상태 표시: ✅ 통과 · 🔶 일부 · ⬜ 아직. 마지막에 `node tests/quality.cjs`가 위 항목을 한 화면에 출력합니다.

## 이 표가 말해 주지 않는 것
- 학습 내용(어휘·문법 데이터)의 정확성은 이 표 밖입니다. 데이터는 `data/README.md`, `docs/data-sources.md`를 보세요.
- 실제 기기(아이폰·안드로이드)에서의 체감은 자동 검사로 확인하지 못합니다.
