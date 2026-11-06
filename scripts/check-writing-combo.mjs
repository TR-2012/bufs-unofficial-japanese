// data/writing_combo.json 무결성 검사 + 모범/예시 답안이 자체 판정기를 통과하는지 확인.
//   node scripts/check-writing-combo.mjs
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { check } = createRequire(import.meta.url)(path.join(root, 'combo_check.js'));
const data = JSON.parse(readFileSync(path.join(root, 'data/writing_combo.json'), 'utf8')).combo;

// 어휘 수준 가드: 문제마다 해당 등급 단어가 한 개 이상 있어야 한다(N3: N3 이상 / N2: N2·N1 / N1: N1).
// 나머지 단어는 일상어(어느 등급이든)를 허용하되, 앱 어휘 데이터(words.json)에 있어야 읽기·뜻을 보장할 수 있다.
const level = {};
for (const x of JSON.parse(readFileSync(path.join(root, 'data/words.json'), 'utf8'))) (level[x.word] = level[x.word] || new Set()).add(x.jlpt);
const target = { n5: /^N5$/, n4: /^N4$/, n3: /^(N3|N2|N1)$/, n2: /^(N2|N1)$/, n1: /^N1$/ };

let bad = 0;
const models = new Set();
const fail = (lv, i, msg) => { bad++; console.error(`[${lv} #${i + 1}] ${msg}`); };

for (const lv of Object.keys(data)) {
  const seen = new Set();
  data[lv].forEach((it, i) => {
    if (!Array.isArray(it.words) || it.words.length < 2 || it.words.length > 4) fail(lv, i, 'words는 2~4개');
    (it.words || []).forEach(w => { if (!w.w || !w.r || !w.m || !w.k || !w.k.length) fail(lv, i, `단어 필드 누락: ${JSON.stringify(w)}`); });
    (it.words || []).forEach(w => { if (!level[w.w]) fail(lv, i, `words.json에 없는 단어: ${w.w}`); });
    if (target[lv] && !(it.words || []).some(w => [...(level[w.w] || [])].some(l => target[lv].test(l)))) fail(lv, i, `${lv.toUpperCase()} 등급 단어가 하나도 없음`);
    if (!it.model || !it.note) fail(lv, i, 'model/note 누락');
    if (!Array.isArray(it.alts) || !it.alts.length) fail(lv, i, 'alts 누락');
    if (it.cond) { try { new RegExp(it.cond.re); } catch (e) { fail(lv, i, '조건 정규식 오류: ' + it.cond.re); } if (!it.cond.t) fail(lv, i, '조건 라벨 누락'); }
    const key = it.words.map(w => w.w).join('+') + '|' + (it.cond ? it.cond.t : '');
    if (seen.has(key)) fail(lv, i, '중복 문제: ' + key);
    seen.add(key);
    if (models.has(it.model)) fail(lv, i, '모범 답안 중복: ' + it.model);
    models.add(it.model);
    [it.model, ...(it.alts || [])].forEach((s, j) => {
      const r = check(it, s);
      if (!r.all) fail(lv, i, `${j ? '예시' : '모범'} 답안이 자체 판정을 통과하지 못함: ${s} → ${r.checks.filter(c => !c.ok).map(c => c.text).join(' / ')}`);
    });
    // 단어만 나열한 답이 만점이 되면 안 된다
    const lazy = check(it, it.words.map(w => w.w).join('、'));
    if (lazy.all) fail(lv, i, '단어 나열만으로 만점 처리됨');
  });
  const withCond = data[lv].filter(x => x.cond).length;
  console.log(`${lv.toUpperCase()}: ${data[lv].length}문제 (문법 조건 ${withCond} · 자유 ${data[lv].length - withCond})`);
}
if (bad) { console.error(`\n실패 ${bad}건`); process.exit(1); }
console.log('OK — 모든 문제가 검사를 통과했습니다.');
