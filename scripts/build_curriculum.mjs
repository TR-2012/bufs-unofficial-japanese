/* 4년 커리큘럼 생성기 — 부산외국어대학교 일본어융합학부 4년(8학기) 완주용.
 *
 * 기준: 1년 = 240학습일(주 5일 × 48주), 4년 = DAY 1~960.
 *   어휘: 하루 8개 × 960일 = 7,680개 (학년마다 1,920개)
 *     1학년 N5 900 + N4 1,020 / 2학년 N3 1,920 / 3학년 N2 1,920 / 4학년 N1 실전 약 1,630 + N2 심화 약 290
 *   한자: 상용한자 2,136자, 하루 3자 → DAY 712(3학년 2학기 말)에 완료, 4학년은 복습
 *
 * 선별(레벨 안 우선순위): ① 기존 퀴즈 코어(앱 예문 코퍼스에 실제로 등장한 말) ② 기존 실전 트랙(practical)
 *   ③ 나머지(큐레이션 → JMdict 순). 한국어 뜻이 깨진 항목·DENY 목록·같은 읽기+뜻의 이표기는 제외.
 *
 * 입력: data/words.json(전체 어휘), data/kanji.json, data/quiz_core.json, data/quiz_core_deny.json
 *   → 이 스크립트는 words.json/kanji.json/quiz_core.json을 덮어씁니다. 원본 70,000어휘가 필요하면
 *     git 기록(이 커밋 이전)에서 data/words.json을 복원한 뒤 다시 실행하세요.
 * 실행: node scripts/build_curriculum.mjs
 */
import fs from 'node:fs';

const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
// 원본 경로를 인자로 줄 수 있다: node scripts/build_curriculum.mjs <words_full.json> <kanji_full.json> <quiz_core_full.json>
const [SRC_W = 'data/words.json', SRC_K = 'data/kanji.json', SRC_Q = 'data/quiz_core.json'] = process.argv.slice(2);
const words = read(SRC_W);
const kanji = read(SRC_K);
const core = read(SRC_Q);
const DENY = new Set(read('data/quiz_core_deny.json'));

const DAYS_PER_YEAR = 240, WORDS_PER_DAY = 8, KANJI_PER_DAY = 3;
// levels: 앞 등급 우선. 실전 후보(tier 0·1)를 모든 등급에서 먼저 쓰고, 그래도 모자랄 때만 tier 2를 쓴다.
//   (N1 실전 후보는 약 1,630개 → 4학년 나머지는 3학년에서 남은 N2 실전 어휘로 채워 희귀어를 피한다)
const QUOTA = [
  { year: 1, levels: ['N5'], n: 900 }, { year: 1, levels: ['N4'], n: 1020 },
  { year: 2, levels: ['N3'], n: 1920 },
  { year: 3, levels: ['N2'], n: 1920 },
  { year: 4, levels: ['N1', 'N2'], n: 1920 },
];

const coreRank = new Map(core.map((w, i) => [w, i]));
const EXCLUDE = /探偵|名探偵/;
const okMeaning = (m) => typeof m === 'string' && /[가-힯]/.test(m) && !/[A-Za-z�]/.test(m);

const used = new Set(), usedRM = new Set();
const picked = [];
for (const q of QUOTA) {
  const cand = [];
  words.forEach((w, idx) => {
    const lvi = w ? q.levels.indexOf(w.jlpt) : -1;
    if (lvi < 0 || !w.word || !okMeaning(w.meaning)) return;
    if (DENY.has(w.word) || EXCLUDE.test(w.word)) return;
    const tier = coreRank.has(w.word) ? 0 : (w.practical ? 1 : 2);
    const sub = tier === 0 ? coreRank.get(w.word) : idx;
    cand.push({ w, tier, sub, grp: (tier > 1 ? 10 : 0) + lvi });
  });
  cand.sort((a, b) => a.grp - b.grp || a.tier - b.tier || a.sub - b.sub);
  const out = [];
  for (const c of cand) {
    if (out.length >= q.n) break;
    const rm = (c.w.reading || '') + '|' + c.w.meaning;
    if (used.has(c.w.word) || usedRM.has(rm)) continue;
    used.add(c.w.word); usedRM.add(rm); out.push(c.w);
  }
  if (out.length < q.n) console.warn(`[warn] ${q.levels}: ${out.length}/${q.n}`);
  picked.push(...out.map((w) => ({ w, year: q.year })));
}

const yearIdx = { 1: 0, 2: 0, 3: 0, 4: 0 };
const newWords = picked.map(({ w, year }) => {
  const i = yearIdx[year]++;
  const day = (year - 1) * DAYS_PER_YEAR + Math.floor(i / WORDS_PER_DAY) + 1;
  // practical·level은 앱 화면(4년 트랙·학년 필터)이 읽는 필드 — year와 같은 값
  const o = { word: w.word, reading: w.reading, meaning: w.meaning, pos: w.pos, jlpt: w.jlpt, year, day, practical: year, level: year + '학년' };
  if (w.cognate) o.cognate = true;
  if (w.mnemonic) o.mnemonic = w.mnemonic;
  return o;
});

const LV = ['N5', 'N4', 'N3', 'N2', 'N1'];
const joyo = LV.flatMap((lv) => kanji.filter((k) => k.jlpt === lv));
const newKanji = joyo.map((k, i) => {
  const day = Math.floor(i / KANJI_PER_DAY) + 1;
  return { ...k, day, year: Math.ceil(day / DAYS_PER_YEAR) };
});

fs.writeFileSync('data/words.json', '[\n' + newWords.map((o) => JSON.stringify(o)).join(',\n') + '\n]\n');
fs.writeFileSync('data/kanji.json', '[\n' + newKanji.map((o) => JSON.stringify(o)).join(',\n') + '\n]\n');
fs.writeFileSync('data/quiz_core.json', JSON.stringify(newWords.map((o) => o.word)));

const byYear = {}; newWords.forEach((o) => { byYear[o.year] = (byYear[o.year] || 0) + 1; });
console.log(`words ${words.length} → ${newWords.length}`, byYear, `max day ${newWords.at(-1).day}`);
console.log(`kanji ${kanji.length} → ${newKanji.length}, 완료 DAY ${newKanji.at(-1).day}`);
