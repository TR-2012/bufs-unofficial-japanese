# 기여하기 (CONTRIBUTING)

BUFS 비공식 일본어 학습 앱에 기여해 주셔서 감사합니다. 처음 기여하시는 분도 아래 순서대로 따라 하면 됩니다.

## 시작하기

이 프로젝트는 빌드 과정이 없는 정적 웹앱입니다. 서버나 로그인도 없고, 학습 기록은 브라우저 localStorage의 `tj.*` 키에 저장됩니다.

```bash
# 실행 (빌드 없음)
python3 -m http.server 8000
```

```bash
# 테스트 준비(처음 한 번, 저장소 루트에서)
(cd tests && npm install && npx playwright install chromium)
```

```bash
# 테스트 실행 (golden, pwa, security)
node tests/run.cjs
```

```bash
# 화면을 일부러 바꿨다면 골든 기준 갱신
node tests/golden.cjs --update
```

더 알아보기:

- 구조: `docs/ARCHITECTURE.md`
- 테스트 안내: `tests/README.md`
- 품질 기준표: `docs/QUALITY.md`
- 라이선스: 코드는 MIT(`LICENSE`), 데이터는 CC BY-SA 4.0, 음성은 VOICEVOX:春日部つむぎ 크레디트 필수, 이미지는 CC BY 4.0(`NOTICE.md`)

## 변경 절차 체크리스트

1. 저장소를 포크하고 브랜치를 만든다
2. `python3 -m http.server 8000`으로 로컬에서 확인한다
3. `node tests/run.cjs`로 테스트가 모두 통과하는지 확인한다
4. 화면을 일부러 바꾼 경우 `node tests/golden.cjs --update`로 골든 기준을 갱신한다
5. 관련 문서(`docs/ARCHITECTURE.md`, `README`)를 함께 갱신한다
6. PR을 보낸다

## 지켜야 할 규칙

1. **인라인 `<script>`에는 camelCase를 쓰지 않는다.** `support.js`가 속성을 `sc-camel-*`로 바꿔서 동작이 깨진다. 새 JS는 외부 파일로 작성한다.
2. **`tj.*` 저장 키를 새로 만들거나 형식을 바꿀 때**는 `tj.schema`를 올리고 `_migrate`에 변환을 추가한다. 안내용 키는 `tj.nudge.*` 접두사를 쓴다(백업 대상에서 제외됨).
3. **`sw.js`의 미리 저장 목록(SHELL)을 바꾸면** CACHE 이름의 숫자를 올린다.
4. **외부 CDN·외부 요청은 금지.** 테스트가 외부 요청 0건을 검사한다.
5. **음성을 추가할 때는** `scripts/build_voice.mjs`로 만들고 크레디트 문구를 유지한다.
6. **데이터는** `data/lib`와 `scripts/*.mjs`로 재생성한다(README의 「데이터 다시 만들기」 순서). `data/*.json`을 손으로 고치지 않는다.
7. **비밀값·개인 이메일을 커밋하지 않는다.** 커밋 작성자는 GitHub noreply 주소 사용을 권장한다.
8. **이 앱은 부산외대 공식 서비스가 아님을 유지한다.**

## PR 체크리스트

PR을 보내기 전에 확인하세요:

- [ ] 테스트 전체 통과 (`node tests/run.cjs`)
- [ ] 의도한 화면 변경이라면 골든 기준을 갱신한 이유를 PR에 적음
- [ ] 문서(`docs/ARCHITECTURE.md`, `README`)를 필요에 따라 갱신함
