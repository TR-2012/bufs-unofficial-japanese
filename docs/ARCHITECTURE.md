# 구조 안내 (ARCHITECTURE)

BUFS 비공식 일본어 학습의 코드 구조 안내서입니다. 처음 기여하는 사람이 30분 안에 전체 흐름을 파악하는 것이 목적입니다. 줄 번호는 이 문서를 쓴 시점(2026-11)의 값이므로, 어긋나면 함수 이름으로 찾으세요.

## 1. 한눈에 보기

```
브라우저
  index.html ─ 템플릿(<x-dc>, 19~873줄) + 로직(<script type="text/x-dc">, 874줄~)
  pwa.js / support.js / combo_check.js (head)
  tts.js (147줄)
      │
      ├─ support.js — React 18.3.1(vendor/, SRI 검사), 템플릿 엔진(sc-* 클래스)
      ├─ data/*.json 6개 파일 — fetch로 로드(kanji, words, grammar, writing,
      │                    writing_combo, quiz_core)
      ├─ localStorage tj.* — 상태 저장
      └─ sw.js — 오프라인 캐시(네트워크 우선 4초 / 음성은 저장본 우선)
scripts/*.mjs — 데이터 재생성 · audio/*.mp3 — VOICEVOX 음성
```

규모: index.html 2,214줄, support.js 1,515줄, tts.js 162줄, sw.js 91줄, pwa.js 23줄, combo_check.js 59줄(총 4,064줄, 메서드 159개).

## 2. 실행 흐름

1. 브라우저가 `index.html`을 연다. head에서 `pwa.js`, `support.js`, `combo_check.js`를 순서대로 로드한다(각 14~16줄).
2. `support.js`가 React 18.3.1을 `vendor/`에서 SRI 해시 검사와 함께 로드한다.
3. 로직 클래스(`<script type="text/x-dc" data-dc-script>`, index.html 874줄~)의 `constructor`가 localStorage의 `tj.*` 키를 읽어 `this.state`를 만든다.
4. `componentDidMount`에서 `loadBaseData()`가 `data/*.json` 6개를 fetch로 읽는다. 실패하면 빈 값으로 계속 진행한다.
5. `support.js:929` — 화면을 그릴 때마다 `this.logic.renderVals()`를 불러 `{...userProps, ...renderVals()}`로 템플릿 값을 만든다.
6. 템플릿(`index.html` 19~873줄, `<x-dc>`~`</x-dc>`)의 `{{ 이름 }}`, `<sc-if>`, `<sc-for>`가 값으로 치환되어 화면이 그려진다.
7. `state.screen`은 주소 해시 `#/화면이름`과 동기화된다.

## 3. 폴더·파일 역할

| 경로 | 역할 |
|---|---|
| index.html | 템플릿(19~873줄) + 로직 클래스(874줄~), 화면 9개 정의 |
| support.js | 템플릿 엔진(sc-* CSS·클래스), React 로드(SRI), `evalDcLogic` |
| pwa.js | 서비스 워커 등록 + 「앱으로 설치」 이벤트 보관(head에서 가장 먼저 로드) |
| combo_check.js | 작문 「단어 조합」 문제의 규칙 점검(채점) |
| tts.js | 음성 계층: mp3 파일 → 브라우저 SpeechSynthesis 대체 |
| sw.js | 서비스 워커: 오프라인·설치 캐시 |
| data/ | JSON 데이터 + 빌드 스크립트(data/lib/), data/README.md 참고 |
| scripts/ | 데이터·음성 재생성 스크립트(.mjs, .py) |
| tests/ | golden, pwa, security 테스트 + golden/baseline.json |
| vendor/ | React 18.3.1 · React DOM(외부 CDN 없이 자체 포함) |
| audio/ | 미리 만든 mp3(VOICEVOX:春日部つむぎ) |
| icons/, screenshots/, haruko.jpg | 아이콘·이미지 |
| manifest.webmanifest, vercel.json | PWA 매니페스트, 배포 헤더 설정 |

## 4. 화면과 코드 위치

`state.screen` 9개(`screens` 객체). 각 화면은 `renderVals()`가 부르는 `_rv*` 구역 메서드가 값을 만든다.

| screen | 화면명 | 구역 메서드(index.html 줄) |
|---|---|---|
| home | 홈 · 대시보드 | `_rvHome` (1778) |
| kanji | 한자 카드 · KANJI | `_rvKanji` (1819) |
| mnemonic | 연상 암기 · KANJI MNEMONICS 2,136 | `_rvMnemonic` (1861) |
| word | 단어 카드 · VOCABULARY | `_rvWords` (1916) |
| practical | 4년 트랙 · 4-YEAR TRACK · DAY 1–960 | `_rvTrack` (1969) |
| notebook | 필기 노트 · HANDWRITING PRACTICE | `_rvNotebook` (2021) |
| quiz | 퀴즈 코너 · REVIEW QUIZ | `_rvQuiz` (2063) |
| grammar | 일본어 문법 · GRAMMAR N5–N1 | `_rvGrammar` (2107) |
| writing | 작문 연습 · COMPOSITION | `_rvWriting` (2149) |

공통 껍데기는 `_rvShell` (1730). 구역 간 값은 공유 객체 `c`로 주고받는다. 구역 함수가 돌려주는 객체의 키가 템플릿의 `{{ 이름 }}`이다.

## 5. 상태와 저장

생성자에서 localStorage `tj.*`을 읽는다. 형식 버전은 `tj.schema`(현재 1), `_schemaVersion()`, `_migrate(from)`.

| 키 | 용도 | 백업 포함 |
|---|---|---|
| tj.schema | 저장 형식 버전(현재 1) | 예 |
| tj.xp | 경험치(addXp, 계급 판정) | 예 |
| tj.streak | 연속 출석 `{last:마지막 방문일, n:연속 일수}`. 앱을 열 때마다 `_visitStreak()`가 다시 계산 | 예 |
| tj.today | 오늘의 진도 `{d:날짜, k:한자, w:단어, q:퀴즈, g:문법 확인}`. 날짜가 바뀌면 0으로 시작(`_loadToday`/`_bumpToday`) | 예 |
| tj.solved | 맞힌 퀴즈 수(숫자) | 예 |
| tj.seen.`<kind>` | XP를 이미 받은 항목 집합(`_firstSeen`: 같은 카드·문제는 XP를 처음 한 번만). kind: `k` 한자 카드, `w` 단어 카드, `m` 연상 암기, `g` 문법 확인 문제, `wm` 작문 모범 답안, `ws` 작문 채점 | 예 |
| tj.day | 퀴즈 코너 「오늘의 학습」 DAY(1~960). 퀴즈 난이도가 「전체」일 때 | 예 |
| tj.day.`<lv>` | 퀴즈 난이도(N5~N1 등)별 DAY(동적 키) | 예 |
| tj.rev.w / tj.rev.k | 카드를 눌러 뜻을 공개해 본 단어·한자 목록(배열) | 예 |
| tj.quiz.level | 선택한 퀴즈 난이도 | 예 |
| tj.mn.known | 연상 암기에서 「외웠어요」로 표시한 한자 맵(`_mnKnownMap`) | 예 |
| tj.dark | 다크 모드(`1`/`0`). 값이 없으면 기기의 시스템 설정을 따름 | 예 |
| tj.word.extra / tj.kanji.extra / tj.grammar.extra / tj.write.extra | **읽기만 하고 저장하는 코드가 없음** — 이전에 있던 기능의 잔재(현재 항상 비어 있음). 11절 참고 | 예 |
| tj.nudge.* (`firstAt` 첫 방문, `backupAt` 마지막 백업, `snooze` 알림 미룸, `install`·`a2hs` 설치 안내를 닫음) | 홈의 설치·백업 안내 카드용 | **제외** |

백업 파일 형식: `{app:'bufs-japanese', v:1, schema, at, data:{tj.*}}`. `tj.nudge.*`는 백업에서 제외한다.

## 6. 데이터 파이프라인

| 파일 | 크기(바이트) |
|---|---|
| data/words.json | 1,631,846 |
| data/kanji.json | 544,275 |
| data/writing_combo.json | 234,602 |
| data/writing.json | 110,630 |
| data/grammar.json | 149,505 |
| data/quiz_core.json | 48,615 |
| data/quiz_core_deny.json | 1,736 |
| data/manifest.json | 1,844 |

재생성 순서(README 「데이터 다시 만들기」):

```sh
data/lib/build.mjs
scripts/build_curriculum.mjs
scripts/build_quiz_pool.mjs
scripts/build_writing.mjs
scripts/augment_grammar.mjs
scripts/check-writing-combo.mjs
```

원본 데이터·직접 쓴 한국어 데이터는 `data/lib/`에 있다(`grammar_n1~n5.mjs`, `grammar_supplement.mjs`, `joyo_kanji.mjs`, `kanji_mnemonics_ko.mjs`, `words_extra_ko.mjs` 등). 전체 생성은 `data/lib/build.mjs`(`build_words.mjs` 포함)가 맡는다. 스키마는 `data/README.md`, 출처는 `docs/data-sources.md` 참고.

## 7. 음성

- 우선순위 0: 미리 만든 `audio/<앞2자리>/<키>.mp3`(VOICEVOX:春日部つむぎ, 단어·한자·문법 예문).
- 우선순위 1: 파일이 없으면 브라우저 SpeechSynthesis의 일본어 여성 음성(「Google 日本語」 우선).
- 키 생성: 문장을 `toJaOnly`로 정리한 뒤 FNV-1a 32비트 해시. `scripts/build_voice.mjs`가 같은 함수를 재사용한다(VOICEVOX 엔진 필요).

## 8. 오프라인·설치(서비스 워커)

- 같은 출처의 화면·스크립트·데이터: 네트워크 우선(4초) → 실패하면 저장본. 배포하면 항상 최신이 반영된다.
- 음성(`audio/*.mp3`): 저장본 우선 → 없으면 받아서 저장(재생한 문장만 쌓임, 상한 MAX_AUDIO = 800개).
- 외부 요청은 건드리지 않는다.
- `SHELL`(미리 저장할 파일 목록)을 바꾸면 CACHE 이름의 숫자를 올린다. activate에서 이전 캐시를 지운다.
- 비상 해제: sw.js 전체를 두 줄로 바꿔 배포하면 기기들이 새 sw.js를 받는 즉시 스스로 등록을 해제한다(sw.js 머리말 주석 참고).
- vercel.json이 `/sw.js`에 `Service-Worker-Allowed` 헤더를 지정한다.

## 9. 테스트와 변경 절차

```sh
node tests/run.cjs          # golden, pwa, security 전체
node tests/golden.cjs --update   # 의도한 화면 변경 후 baseline.json 갱신
```

변경 체크리스트:

1. 화면·스크립트·데이터를 `SHELL`에 추가했다면 sw.js의 CACHE 이름 숫자를 올렸는가?
2. 의도한 화면 변경인가? 골든 마스터 실패 시 `--update`로 갱신했는가?
3. 새 localStorage 키(`tj.*`)를 만들었다면 백업 포함 여부와 `tj.schema` 마이그레이션(`_migrate`)을 검토했는가?
4. 인라인 `<script>`에 camelCase 속성을 쓰지 않았는가? 새 JS는 외부 파일로.
5. 데이터 원본을 바꿨다면 6절의 재생성 순서를 전부 돌렸는가?

배포: Vercel 정적 배포(빌드 없음). vercel.json에 캐시·보안 헤더(CSP 등). `.vercelignore`로 tests/ 제외.

## 10. 함정

- **인라인 camelCase**: support.js가 HTML 속성을 `sc-camel-*`으로 변환한다. index.html 안의 인라인 `<script>`에 camelCase를 쓰면 깨진다. 새 JS는 `tts.js`, `pwa.js`처럼 외부 파일로 둔다.
- **골든 마스터**: 화면 출력이 `tests/golden/baseline.json`과 다르면 테스트가 실패한다. 의도한 변경이면 `--update`로 갱신해야 한다.
- **캐시 갱신 잊음**: `SHELL`에 파일을 추가하고 CACHE 이름을 안 올리면 이전 캐시가 남는다.
- **백업 키 분류**: `tj.nudge.*`(안내용)는 백업·복원에서 제외하고, 학습 기록 키는 모두 포함해야 한다. 키를 새로 만들면 어느 쪽인지 정하고 `exportData`/`importData`를 확인한다.
- **Babel 오해**: Babel은 `.jsx`를 x-import할 때만 쓰며 현재 미사용이다. 로직은 `evalDcLogic`의 `new Function`으로 실행된다.
- **데이터 읽기 실패는 조용히 지나간다**: `loadBaseData()`는 실패해도 빈 값으로 계속 진행한다. 데이터 오류가 화면에서 "비어 보이는" 것으로만 나타난다. 오프라인 테스트가 단어 7,680개 같은 숫자로 확인하는 이유다.

## 11. 한계와 앞으로의 과제

- 로직이 index.html 한 파일의 `<script type="text/x-dc">` 안에 있다(약 1,340줄). 화면 값은 구역 메서드 10개(`_rvShell` ~ `_rvWriting`, 약 480줄)로 나뉘어 있으나, 상태 변경·이벤트 처리 메서드는 여전히 한 클래스에 모여 있다.
- `tj.kanji.extra` · `tj.word.extra` · `tj.grammar.extra` · `tj.write.extra`는 읽기만 있는 잔재다. 지워도 현재 동작에는 영향이 없지만, 저장 형식에 관한 변경이므로 지울 때는 `tj.schema`를 올리고 `_migrate`에 정리 단계를 넣는 것을 권한다.
- 변경 전후의 `renderVals()` 반환값을 많은 상태에서 비교하는 검사는 일회성 스크립트로만 있고 저장소에 포함하지 않았다(골든 마스터가 대신 화면 결과를 지킨다).
- 데이터가 저장소에 커밋된 JSON으로 고정되어 있다(words.json 약 1.6MB). 재생성 순서가 README에 의존하며 스크립트 간 의존 검증은 수동이다.
- 데이터 출처·라이선스 세부는 `docs/data-sources.md`와 `NOTICE.md`를 참고한다(이 문서에서는 다루지 않음).
