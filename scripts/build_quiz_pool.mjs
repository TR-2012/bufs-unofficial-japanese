/* 퀴즈 범위(data/quiz_core.json) 생성 — 하루 5문제 · 4년 약 4,500문항.
 *
 * DAY마다(1~960): 그날 단어 8개 중 4개 + 그날 한자 3자 중 1자(DAY 712까지).
 *   단어는 「암기 필요」(cognate 아님 = 한국 한자음과 달라 외워야 하는 말)를 먼저, 그다음 원래 순서.
 *   「인지 가능」 단어는 카드로 확인만 하면 되므로 퀴즈에서 뒤로 미룬다.
 * 출력: 단어 표기와 'k:'+한자 글자를 섞은 배열(앱은 Set으로 읽어 단어·한자 퀴즈 범위를 제한).
 * 실행: node scripts/build_quiz_pool.mjs
 */
import fs from 'node:fs';
const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const words = read('data/words.json'), kanji = read('data/kanji.json');
const W_PER_DAY = 4, K_PER_DAY = 1;
const byDay = new Map();
for (const w of words) (byDay.get(w.day) || byDay.set(w.day, []).get(w.day)).push(w);
const out = [];
let nw = 0, nk = 0;
for (const [, list] of [...byDay].sort((a, b) => a[0] - b[0])) {
  const pick = [...list.filter((w) => !w.cognate), ...list.filter((w) => w.cognate)].slice(0, W_PER_DAY);
  for (const w of pick) { out.push(w.word); nw++; }
}
const kDay = new Map();
for (const k of kanji) (kDay.get(k.day) || kDay.set(k.day, []).get(k.day)).push(k);
for (const [, list] of kDay) for (const k of list.slice(0, K_PER_DAY)) { out.push('k:' + k.char); nk++; }   // 한자는 'k:' 접두어(같은 표기의 단어와 구분)
fs.writeFileSync('data/quiz_core.json', JSON.stringify(out));
console.log(`퀴즈 범위: 단어 ${nw} + 한자 ${nk} = ${nw + nk}`);
