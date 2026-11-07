// data/lib/reclassify_difficulty.mjs
//
// 단어 카드·필기 노트 어휘(words.json)의 두 난이도 축을 재계산한다.
// 의미·읽기·품사·분야는 그대로 두고 jlpt/level만 다시 계산한다.
//   · jlpt  = JLPT 난이도(N5~N1·고급).
//   · level = 단계(초등~대학원) = 일본 학년(学年) 기준(아래 stageOf 참고). jlpt와 독립.
//
//   실행:  node data/lib/reclassify_difficulty.mjs
//
// JLPT 난이도 신호(신뢰도 순):
//   1) 권위 앵커 — JLPT 덱(jg_n1~n5) + 큐레이션 시드(words_seed_ko)에 있으면 그 레벨.
//   2) 빈도 — JMdict common 표기(자주 쓰는 어휘일수록 쉬움).
//   3) 한자 난이도 — 구성 한자의 최고 JLPT(kanji.json). 상용(3000자) 밖 한자가 있으면 '고급' 후보.
//
// 매핑(빈도가 난이도를 한 단계 이동):
//   · 가나만:      common → N4,           드묾 → N1
//   · 상용밖 한자: common → N2,           드묾 → 고급
//   · 상용 한자:   common → min(한자최고,N2),  드묾 → clamp(한자최고+1, N3..N1)
//
// 기존 버그(가나=무조건 N3, 상용밖 한자=무조건 고급)를 제거하고 빈도를 반영한다.

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dir, '..');

const words = JSON.parse(readFileSync(join(DATA, 'words.json'), 'utf8'));
const kanji = JSON.parse(readFileSync(join(DATA, 'kanji.json'), 'utf8'));

const kJlpt = {}, kGrade = {};
for (const k of kanji) { kJlpt[k.char] = k.jlpt; kGrade[k.char] = (k.grade == null ? 99 : k.grade); } // grade 99 = 상용외(hyogaiji)

const LV = { N5: 1, N4: 2, N3: 3, N2: 4, N1: 5, '고급': 6 };
const NAME = [null, 'N5', 'N4', 'N3', 'N2', 'N1', '고급'];

// 1) 권위 앵커: JLPT 덱 + 큐레이션 시드
const anchor = new Map();
for (let L = 5; L >= 1; L--) {
  try {
    const d = JSON.parse(readFileSync(join(DATA, `jg_n${L}.json`), 'utf8'));
    for (const c of (d.cards || [])) if (c.question && !anchor.has(c.question)) anchor.set(c.question, 'N' + L);
  } catch {}
}
try {
  for (const s of JSON.parse(readFileSync(join(__dir, 'words_seed_ko.json'), 'utf8'))) if (s.jlpt) anchor.set(s.word, s.jlpt);
} catch {}

// 2) 빈도: JMdict common 표기
const commonSet = new Set();
try {
  const jm = JSON.parse(readFileSync(join(DATA, 'jmdict-eng-common-3.6.2.json'), 'utf8'));
  for (const w of jm.words) {
    for (const k of (w.kanji || [])) if (k.common) commonSet.add(k.text);
    for (const r of (w.kana || [])) if (r.common) commonSet.add(r.text);
  }
} catch {}

const isKanji = ch => /[一-鿿㐀-䶿々]/.test(ch);

function classify(w) {
  if (anchor.has(w.word)) return anchor.get(w.word);
  const kj = [...w.word].filter(c => isKanji(c) && c !== '々'); // 々(반복부호)는 앞 한자를 따르므로 제외
  const kanaOnly = kj.length === 0;
  let kmax = 0, beyond = false;
  for (const ch of kj) {
    const lv = LV[kJlpt[ch]];
    if (lv === undefined) beyond = true;         // kanji.json(3000자) 밖
    else if (lv === 6) beyond = true;            // 한자 자체가 '고급'
    else if (lv > kmax) kmax = lv;
  }
  const isCommon = commonSet.has(w.word) || (w.reading && commonSet.has(w.reading));
  let lv;
  if (kanaOnly) lv = isCommon ? 2 : 5;
  else if (beyond) lv = isCommon ? 4 : 6;
  else lv = isCommon ? Math.min(kmax || 2, 4) : Math.min(Math.max((kmax || 2) + 1, 3), 5);
  return NAME[lv];
}

// ---------- 단계(학습 단계) : 일본 학년(学年) 기준 ----------
// 단어를 구성하는 한자를 일본에서 가장 늦게 배우는 학년으로 단계를 정한다.
//   小1~4 → 초등, 小5~6 → 중등, 中·高 상용(grade 8) → 고등,
//   인명용(grade 9~10) → 대학, 상용외(그 외) → 대학원.
//   한자가 없는 가나어는 빈도로 보정(흔하면 초등, 드물면 중등).
function stageOf(w) {
  const kj = [...w.word].filter(c => isKanji(c) && c !== '々'); // 々(반복부호)는 앞 한자를 따르므로 제외
  if (kj.length === 0) {
    const c = commonSet.has(w.word) || (w.reading && commonSet.has(w.reading));
    return c ? '초등' : '중등';
  }
  let g = 0;
  for (const ch of kj) { const v = (kGrade[ch] === undefined ? 99 : kGrade[ch]); if (v > g) g = v; }
  if (g <= 4) return '초등';
  if (g <= 6) return '중등';
  if (g === 8) return '고등';
  if (g === 9 || g === 10) return '대학';
  return '대학원';
}

const before = {}, after = {}, stageBefore = {}, stageAfter = {};
let changed = 0, stageChanged = 0;
const out = words.map(w => {
  const nj = classify(w);
  const st = stageOf(w);
  before[w.jlpt] = (before[w.jlpt] || 0) + 1;
  after[nj] = (after[nj] || 0) + 1;
  stageBefore[w.level] = (stageBefore[w.level] || 0) + 1;
  stageAfter[st] = (stageAfter[st] || 0) + 1;
  if (nj !== w.jlpt) changed++;
  if (st !== w.level) stageChanged++;
  // 필드 순서 유지(word, reading, meaning, pos, jlpt, level, field)
  return { word: w.word, reading: w.reading, meaning: w.meaning, pos: w.pos, jlpt: nj, level: st, field: w.field };
});

writeFileSync(join(DATA, 'words.json'), JSON.stringify(out));

const jOrder = ['N5', 'N4', 'N3', 'N2', 'N1', '고급'];
const sOrder = ['초등', '중등', '고등', '대학', '대학원'];
const fmt = (o, ord) => ord.map(k => k + ':' + (o[k] || 0)).join('  ');
console.log('총 어휘:', out.length);
console.log('[JLPT 난이도]  BEFORE', fmt(before, jOrder));
console.log('[JLPT 난이도]  AFTER ', fmt(after, jOrder), '· 변경', changed, '(' + (100 * changed / out.length).toFixed(1) + '%)');
console.log('[단계 学年]    BEFORE', fmt(stageBefore, sOrder));
console.log('[단계 学年]    AFTER ', fmt(stageAfter, sOrder), '· 변경', stageChanged, '(' + (100 * stageChanged / out.length).toFixed(1) + '%)');
