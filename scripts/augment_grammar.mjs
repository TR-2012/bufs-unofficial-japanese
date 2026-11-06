/* 문법 보강 — data/lib/grammar_supplement.mjs를 data/grammar.json에 합친다(재실행해도 중복 없음).
 *  · 예문이 1개뿐인 단원에 두 번째 예문 추가
 *  · JLPT 빈출인데 빠진 문형(N3·N2·N1 각 5개) 추가
 *  · 규칙 문구 오타 수정
 * data/lib/build.mjs로 grammar.json을 다시 만든 뒤에도 이 스크립트를 실행한다.
 * 실행: node scripts/augment_grammar.mjs
 */
import fs from 'node:fs';
import { EXTRA_EX, NEW_UNITS } from '../data/lib/grammar_supplement.mjs';

const P = 'data/grammar.json';
const g = JSON.parse(fs.readFileSync(P, 'utf8'));
let addEx = 0, addUnit = 0, miss = [];
const used = new Set();
for (const lv of Object.keys(g)) for (const u of g[lv]) {
  const k = lv + '|' + u.pattern;
  u.rules = (u.rules || []).map((r) => r.replace('反면', '反面'));
  if (!EXTRA_EX[k]) continue;
  used.add(k);
  const [jp, kr] = EXTRA_EX[k];
  u.examples = u.examples || [];
  if (u.examples.length < 2 && !u.examples.some((e) => e.jp === jp)) { u.examples.push({ jp, kr }); addEx++; }
}
for (const k of Object.keys(EXTRA_EX)) if (!used.has(k)) miss.push(k);
for (const lv of Object.keys(NEW_UNITS)) for (const [pattern, gloss, explain, rules, ex, ck] of NEW_UNITS[lv]) {
  if (g[lv].some((u) => u.pattern === pattern)) continue;
  g[lv].push({ pattern, gloss, explain, rules,
    examples: ex.map(([jp, kr]) => ({ jp, kr })),
    checks: ck.map(([q, options, a]) => ({ q, options, a })) });
  addUnit++;
}
fs.writeFileSync(P, JSON.stringify(g));
const total = Object.values(g).reduce((a, u) => a + u.length, 0);
const one = Object.values(g).flat().filter((u) => (u.examples || []).length < 2).length;
console.log(`예문 +${addEx} · 단원 +${addUnit} → 총 ${total}단원 · 예문 1개 남은 단원 ${one}`);
if (miss.length) console.log('매칭 안 된 키:', miss.join(', '));
