# 학습 데이터 가이드

이 앱은 `data/*.json`을 앱 시작 시 `fetch`로 읽어 한자·단어·문법·작문 풀(pool)을 채웁니다.
아래 4개 파일이 핵심 데이터이며, **`data/lib/`의 빌드 파이프라인으로 생성**됩니다.

## 현재 번들된 데이터 규모

| 파일 | 규모 | 내용 |
|---|---|---|
| `kanji.json` | **2,136자** | 상용한자(常用漢字) N5~N1. 음독·훈독·획수·학년, 한국어 뜻, 연상법. 4년 커리큘럼용 `day`(1~712)·`year` |
| `words.json` | **7,680개** | 4년 커리큘럼 어휘(학년당 1,920). `year`(1~4)·`day`(1~960)·`practical`(=학년)·`level`("n학년"), 한국어 뜻, `cognate`, `mnemonic`. `scripts/build_curriculum.mjs`가 전체 70,000어휘에서 선별 |
| `grammar.json` | **212단원 / 636문항** | JLPT **N5~N1 전 영역 문법**(핵심뿐 아니라 조사·활용·보조·관용 문형까지). 단원마다 설명·규칙·예문·확인문제 |
| `writing.json` | **730문항** | 문장 일작(기초·중급·고급 각 150) · 경어(존경어·겸양어·접객 각 40) · 비즈니스(메일 50·보고 30) · 주제 작문(일상 30·의견문 30·취업 ES 20). `scripts/build_writing.mjs`가 선별 |

### 한국어 뜻 생성 방식 (어휘)
공개 일본어-한국어 대량 사전이 없으므로, 우선순위를 두어 한국어 뜻을 생성합니다.
1. **교정사전**(`words_corrections_ko.mjs`, **약 60,000개**): 한자음·한자 직역과 실제 뜻이 다른 빈출어를 직접 교정 — 大丈夫→괜찮음, 直取引→직거래(직취인❌), 両替→환전(양체❌), けい線→괘선, 立ち上げる→시작하다, データ→데이터 등. N5~N2 일상 어휘부터 JLPT N1·JPT 990점권 고급 어휘(복합동사·사자성어·관용구·전문 용어), 한자+히라가나·お/ご 경어형, 카타카나 외래어, **kun독 한자 합성어(직역 오류 교정)**까지 포괄. 뜻은 모두 한국어(영어 표기 없음).
2. **큐레이션**(`words_extra_ko.mjs`, `words_seed_ko.json`): 분야별 직접 작성 어휘.
3. **한자음 변환**: 한자어(전부 한자)는 한자별 한국어 음을 이어 붙이고 **두음법칙** 적용 — 経済→경제, 銀行→은행, 来年→내년, 旅行→여행.
4. **단일 한자·훈독 용언**: 한자의 한국어 뜻 사용 — 食べる→먹다.
5. **고유명사**(JMnedict): (이번 버전부터는 고유명사 제외 — JLPT 시험 어휘 위주 6만개).
- 한국어 음 출처: **KANJIDIC2**(`korean_h`).
- 분류: `level`은 JLPT 환산(N5·N4→초등, N3→중등, N2→고등, N1→대학, 고급→대학원), `field`는 JMdict 분야 태그 → 15개 한국어 분야 환산(태그 없으면 「생활 전문 분야」).
- 한계: 6만 규모에서는 한자음 근사 뜻이 다수입니다(공개 일→한 사전 부재). 자주 노출되는 단어는 교정사전으로 계속 보강합니다.

## 4년 커리큘럼 선별 기준 (`scripts/build_curriculum.mjs`)

- 1년 = 240학습일, 4년 = DAY 1~960. 어휘 하루 8개, 한자 하루 3자.
- 1학년 N5 900 + N4 1,020 / 2학년 N3 1,920 / 3학년 N2 1,920 / 4학년 N1 실전 약 1,620 + N2 심화 약 300.
- 등급 안 우선순위: ① 이전 퀴즈 코어(앱 예문 코퍼스에 실제로 등장한 말) ② 이전 실전 트랙(`practical` 1~3) ③ 나머지.
  한국어 뜻이 깨진 항목, `quiz_core_deny.json`, 같은 읽기+뜻의 이표기는 제외.
- 한자는 상용 2,136자만 N5→N1 순서로 하루 3자(DAY 712 완료).
- 입력은 커리큘럼 도입 이전의 전체 데이터(70,000어휘·3,000자)입니다. `data/lib/build.mjs`로 다시 만든 뒤 이 스크립트를 돌리세요.

## 어휘 연상법 생성 기준 (words.json의 `mnemonic` 필드)

어휘 중 한자가 들어간 항목에 한국어 연상법이 붙어 있습니다(4년 트랙 카드의 뜻 공개 패널에 표시).
원본은 이전 「실전 트랙」 기준으로 만들어졌고,
`node scripts/build_word_mnemonics.mjs`로 재생성합니다(재실행 가능).

- **실행 순서**: `build_practical.mjs`(practical 태그) → `build_word_mnemonics.mjs`.
- **전략 — 한자 훈음 사슬**(한자 자산 재활용): kanji.json의 교정된 뜻과 한자음
  테이블(비어두 우선 다수결, `build_mnemonics.mjs`와 동일)로 단어를 글자 사슬로 푼다.
  - 인지 가능 어휘(cognate): 「経(경)+済(제) = 경제 — 한국 한자음 그대로.」
  - 그 외: 「大(크다·대)+丈(어른·장)+夫(사내·부) → 「괜찮음」.」 오쿠리가나는 사이에
    그대로: 「食(먹다·식)べる → 「먹다」.」
  - 가나 단독어·카타카나 외래어는 분해 불가라 생략(필드 없음).
- **검증 게이트**: 한자 포함 practical 어휘 커버리지 95% 이상(현재 99.9%),
  깨진 문자·비한국어 검출(단어 표기에서 온 로마자는 허용: 生成AI 등), 길이 상한
  초과 시 음만으로 축약, 표본 30개 출력. 용량 증가 약 +0.6MB(별도 파일 대신
  원본 필드 추가 — 추가 fetch 없음·drift 없음).

## 한자 연상법 생성 기준 (`mnemonic` 필드)

`kanji.json` 3,000자 **전체**에 한국어 연상법 문장(`mnemonic`)이 붙어 있습니다.
앱의 「연상 암기」 메뉴와 한자 카드가 이 필드를 사용하며,
`node scripts/build_mnemonics.mjs`로 재생성합니다(재실행 가능 — 기존 필드를 지우고 다시 생성).

- **품질 계층**
  1. 수제(320자): N5·N4 전 글자 — `data/lib/kanji_mnemonics_ko.mjs`(직접 작성).
     부품으로 장면을 만들고 자전(字典)식 「훈+음」(쉴 휴)으로 끝나 한국 한자음까지 정착.
  2. 부품 생성(약 2,600자): [kanji npm 패키지](https://www.npmjs.com/package/kanji)
     (MPL-2.0, KanjiVG 파생 분해 트리)의 부품을 `data/lib/kanji_parts_ko.mjs`
     (부품→한국어 키워드 약 300개, 직접 작성)로 바꿔 「부품1 + 부품2 → 뜻·음」 문장 생성.
     kanji 패키지 미설치 시 이 단계 없이 폴백만으로 동작(`npm i --no-save kanji` 권장).
  3. 폴백(약 85자): 분해 데이터가 없는 글자(주로 구자체·국자)는 「모양째 외우기 + 뜻·음」.
- **한국 한자음**: `words.json` 한자어 정렬에서 다수결 학습(두음법칙 왜곡을 피해
  비어두 출현 우선 집계) + 비교육 한자는 뜻 자체가 한자음(軌→궤)인 점을 이용.
- **뜻 교정**: 영어 뜻이 남아 있던 구자체·이체자·국자 74자(神 U+FA19 같은 유니코드
  호환 한자 포함)는 `MEANING_FIX_KO` 테이블(자전 훈음, 직접 작성)로 한국어로 교정.
- **검증 게이트**: 3,000자 전수 커버리지(누락 시 실패), 한국어 아님/로마자 검출,
  길이 상한(80자), 중복 문장 수 보고, 표본 30자 출력.

## 빌드 방법 (데이터 재생성)

```bash
cd data
node lib/build.mjs      # kanji.json / words.json / grammar.json / writing.json 재생성
```

`build.mjs`는 필요한 오픈 데이터 원본을 **자동으로 내려받아**(없을 때만) 한국어 큐레이션과 병합합니다.
원본 대용량 파일(`kanji_full.json`, `jg_n*.json`)은 `.gitignore` 처리되어 저장소에 포함되지 않습니다(재생성 가능).

### `data/lib/` 구성

| 파일 | 역할 |
|---|---|
| `build.mjs` | kanji/grammar/writing 생성 + `build_words.mjs` 호출 |
| `build_words.mjs` | **6만 어휘 생성**(JMdict 전 표기형 + JMnedict 고유명사 + KANJIDIC2 한국어 음 + 두음법칙 + 교정사전 + 큐레이션, `level`/`field` 부여) |
| `joyo_kanji.mjs`, `joyo_kanji_4_6.mjs` | 1~6학년 교육한자 한국어 훈음 오버레이(직접 작성) |
| `words_extra_ko.mjs` | 분야별 한국어 어휘 큐레이션(직접 작성) |
| `words_corrections_ko.mjs` | 한자음≠뜻 빈출어 교정사전(직접 작성) |
| `words_seed_ko.json` | 기존 한국어 어휘 시드(보존용) |
| `grammar_n5.mjs` … `grammar_n1.mjs` | 레벨별 문법 단원(직접 작성) |
| `gram.mjs` | 문법 단원 생성 헬퍼 |
| `writing_extra.mjs` | 작문 문제(직접 작성) |

## 출처 및 라이선스

- **한자/한국어 음**: **KANJIDIC2** © EDRDG, **CC BY-SA 4.0** ([scriptin/jmdict-simplified](https://github.com/scriptin/jmdict-simplified) JSON 빌드의 `kanjidic2-all`, `korean_h` 필드). 학년/빈도는 [davidluzgouveia/kanji-data](https://github.com/davidluzgouveia/kanji-data)(MIT).
- **어휘 표제어**: **JMdict** © EDRDG, **CC BY-SA 4.0** (jmdict-simplified `jmdict-eng` / `jmdict-eng-common`). JLPT 등급은 [mistval/kotoba](https://github.com/mistval/kotoba)(MIT) 셋.
- **한국어 뜻**: 한자음 변환(두음법칙) + 직접 작성 큐레이션.

> 대용량 원본(`kanjidic2-all-*.json`, `jmdict-eng-*.json`)은 `.gitignore` 처리되며 `build_words.mjs`가 최신 릴리스에서 자동 내려받습니다(없을 때만). 네트워크가 막힌 환경에서는 [jmdict-simplified 릴리스](https://github.com/scriptin/jmdict-simplified/releases/latest)에서 해당 `.json.zip`을 `data/`에 풀어두면 됩니다.
- **한국어 훈음·어휘·문법·작문**: 본 저장소에서 직접 작성.

## 더 큰 규모로 확장하기 (JMdict 20만 어휘 / 전체 한자)

대량 일괄 적재가 필요하면 공개 사전을 변환해 같은 스키마로 떨어뜨리면 됩니다(추가 코드 수정 불필요).

- **JMdict / JMnedict** (EDRDG, CC BY-SA 4.0) — 어휘 20만+ → `convert_jmdict.mjs`
- **KANJIDIC2** (EDRDG, CC BY-SA 4.0) — 한자 13,000+ → `convert_kanjidic.mjs`

```bash
node convert_jmdict.mjs JMdict_e > words.json       # 또는 words_ext.json 등으로 병합
node convert_kanjidic.mjs kanjidic2.xml > kanji.json
```

## 스키마

### `kanji.json`
```json
[{ "char":"推","on":"スイ","kun":"お(す)","meaning":"밀다·추측","strokes":11,"jlpt":"N3","example":"推理","reading":"すいり","grade":6 }]
```

### `words.json`
```json
[{ "word":"推理","reading":"すいり","meaning":"추리","pos":"명사","jlpt":"N1","level":"대학","field":"생활 전문 분야" }]
```
`level`: 초등·중등·고등·대학·대학원 / `field`: 15개 분야 중 하나(앱의 어휘 필터에 사용).

### `grammar.json`
```json
{ "N1": [ {
  "pattern":"〜を余儀なくされる","gloss":"어쩔 수 없이 ~하게 되다","explain":"…",
  "rules":["명사 + を余儀なくされる"],
  "examples":[{ "jp":"…","kr":"…" }],
  "checks":[{ "q":"…","options":["a","b","c"],"a":0 }]
} ] }
```

### `writing.json`
```json
{ "sentence":{"basic":[]}, "keigo":{"sonkei":[]}, "biz":{"mail":[]}, "free":{"daily":[{ "prompt":"한국어 지시문","model":"일본어 모범답안","note":"메모" }]} }
```

이 키들은 앱 로직(`index.html`의 `kanjiFile/wordFile/grammarFile/writeFile`, `writeData`)과 1:1 대응합니다.

### `writing_combo.json` (단어 조합 작문)
직접 작성한 N5/N4/N3/N2/N1 문제입니다(N5~N1 각 100, 총 500 — 4년 어휘 안의 단어만)(외부 교재·문제집 복제 없음). 앱이 `writeFile.combo`로 병합합니다.
```json
{ "combo": { "n3": [ {
  "words": [ { "w":"約束", "r":"やくそく", "m":"약속", "k":["約束","やくそく"] } ],
  "cond":  { "t":"〜ように (목적: ~하도록)", "re":"ように" },
  "model": "일본어 모범 답안",
  "alts":  ["다른 예시 답안"],
  "note":  "호응·문법 메모"
} ], "n2": [], "n1": [] } }
```
- `k`: 이 중 하나라도 답안에 들어 있으면 그 단어를 쓴 것으로 인정(활용형 대응: 食べる → `["食べ"]`).
- `cond`(선택): `re`는 JS 정규식 문자열이며 `combo_check.js`가 공백 제거·NFKC 정규화한 답안에 적용합니다.
- 판정 로직은 `combo_check.js`(브라우저·Node 공용)에 있고, `node scripts/check-writing-combo.mjs`가 스키마·정규식·모범/예시 답안의 자체 통과·단어 나열 답안의 만점 방지를 검사합니다. 일본어 검수용 Excel은 `python3 scripts/export_writing_combo_review.py`로 `docs/writing_combo_review.xlsx`에 다시 만들 수 있습니다(openpyxl 필요). 추가로 **어휘 수준**도 검사합니다(N3 문제의 단어는 `words.json` 라벨이 N3 이상, N2 문제는 N2/N1, N1 문제는 N1 단어를 한 개 이상 포함하고 나머지는 일상어). 문제를 추가·수정한 뒤에는 이 검사를 돌려 주세요.

> 이전의 「AI로 … 가져오기」 실시간 로더는 제거되었습니다. 모든 학습 데이터는 위 정적 JSON으로 제공됩니다.
