/* 한자 3,000자 연상법(mnemonic) 생성기 — 재실행 가능(idempotent).
 *
 * 목적
 *  data/kanji.json 3,000자 전체에 한국어 연상법 문장을 붙인다(mnemonic 필드).
 *  「부품 → 이야기 → 뜻·음」 연상 사슬로 한자를 외우게 하는 것이 목표이며,
 *  한국 한자음(휴·청·간…)을 연상 고리로 함께 박아 넣는다.
 *
 * 품질 계층 (자세한 기준은 data/README.md 「한자 연상법 생성 기준」)
 *  ① 수제 오버라이드: data/lib/kanji_mnemonics_ko.mjs — N5·N4 전 글자(직접 작성).
 *  ② 템플릿 생성: kanji npm 패키지(MPL-2.0)의 분해 트리 + data/lib/kanji_parts_ko.mjs
 *     (부품→한국어 키워드, 직접 작성)로 「부품1 + 부품2 → 뜻·음」 문장을 만든다.
 *     kanji 패키지가 없으면 분해 신호 없이 폴백만으로 동작한다(경고 출력).
 *     설치: npm i --no-save kanji
 *  ③ 폴백: 분해 데이터가 없는 글자는 「모양째 외우기 + 뜻·음(+예시 단어)」 단순형.
 *
 * 한국 한자음 결정
 *  - words.json의 한자어(전부 한자 & 뜻이 순한글 & 글자 수 == 음절 수) 정렬에서
 *    다수결로 학습한다. 두음법칙 왜곡을 피하려고 「비어두(非語頭) 출현」을 우선 집계
 *    (동력→력, 상륙→륙처럼 비어두가 자전 기본형을 보존한다).
 *  - 폴백: kanji.json의 meaning이 순한글 1음절이면(비교육 한자: 軌→궤) 그것이 곧 음.
 *
 * 실행:  node scripts/build_mnemonics.mjs   (저장소 루트에서)
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { PARTS_KO, STROKE_PARTS } from '../data/lib/kanji_parts_ko.mjs';
import { MNEMONICS_KO, MEANING_FIX_KO } from '../data/lib/kanji_mnemonics_ko.mjs';

const FILE = 'data/kanji.json';
const MAX_LEN = 80;

const kanjiList = JSON.parse(fs.readFileSync(FILE, 'utf8'));
for (const k of kanjiList) delete k.mnemonic; // 재실행 대비

// 영어 뜻이 남아 있던 구자체·이체자·국자의 한국어 뜻 교정(자전 훈음, 직접 작성)
// 호환 한자(神 U+FA19 등)는 NFC 정규화 키로도 조회한다.
const fixOf = (ch) => MEANING_FIX_KO[ch] || MEANING_FIX_KO[ch.normalize('NFC')];
let fixed = 0;
for (const k of kanjiList) {
  const fix = fixOf(k.char);
  if (fix) { k.meaning = fix[0]; fixed++; }
}
if (fixed) console.log(`뜻 교정(영어→한국어): ${fixed}자`);

// ── 1) 한국 한자음 테이블 (words.json 정렬, 비어두 우선) ──
const isKanjiCh = (ch) => /[㐀-䶿一-鿿々]/.test(ch);
const eumOf = (() => {
  const nonInit = new Map(), init = new Map();
  const bump = (m, ch, syl) => { let c = m.get(ch); if (!c) m.set(ch, (c = new Map())); c.set(syl, (c.get(syl) || 0) + 1); };
  try {
    const words = JSON.parse(fs.readFileSync('data/words.json', 'utf8'));
    for (const w of words) {
      const m = String(w.meaning || '').split(/[·/,(（]/)[0].trim();
      const chars = [...String(w.word || '')];
      if (!chars.length || !chars.every(isKanjiCh)) continue;
      if (!/^[가-힣]+$/.test(m) || m.length !== chars.length) continue;
      chars.forEach((ch, i) => bump(i === 0 ? init : nonInit, ch, m[i]));
    }
  } catch (e) { console.warn('words.json 없음 — 한자음 테이블 생략'); }
  const table = new Map();
  const pick = (c) => {
    let best = '', bn = 0, total = 0;
    for (const [syl, n] of c) { total += n; if (n > bn) { bn = n; best = syl; } }
    return total >= 2 && bn / total >= 0.6 ? best : null;
  };
  for (const [ch, c] of nonInit) { const b = pick(c); if (b) table.set(ch, b); }
  for (const [ch, c] of init) { if (!table.has(ch)) { const b = pick(c); if (b) table.set(ch, b); } }
  return (k) => {
    const fix = fixOf(k.char);
    if (fix) return fix[1]; // 교정 테이블의 한자음(국자는 null)
    const t = table.get(k.char);
    if (t) return t;
    const m = String(k.meaning || '').split('·')[0].trim();
    return /^[가-힣]$/.test(m) ? m : null; // 비교육 한자: 뜻 자체가 한자음(軌→궤)
  };
})();

// ── 2) 분해 트리 (kanji npm, 선택적 의존성) ──
let kanjiTree = null;
try {
  const kanjiPkg = createRequire(import.meta.url)('kanji');
  kanjiTree = (ch) => { try { return kanjiPkg.kanjiTree(ch); } catch (e) { return null; } };
} catch (e) {
  console.warn('kanji 패키지 미설치 — 분해 신호 없이 폴백만 사용합니다 (권장: npm i --no-save kanji)');
}

// 트리를 부품 키워드 목록으로 평탄화: 키워드 있는 요소를 우선, 무명/미등재 노드는 자식으로 재귀
function flattenParts(node, self) {
  const named = [], strokes = [];
  const walk = (nodes) => {
    for (const n of nodes || []) {
      const el = n.element;
      if (el && el !== self && PARTS_KO[el]) { named.push(el); continue; }
      if (el && el !== self && STROKE_PARTS[el]) { strokes.push(el); if (!n.g) continue; }
      walk(n.g);
    }
  };
  walk(node && node.g);
  const parts = named.length ? named : strokes;
  const out = [], seen = new Map();
  for (const p of parts) { // 같은 부품 2개는 「둘」로 축약, 3종까지만
    if (seen.has(p)) { seen.set(p, seen.get(p) + 1); continue; }
    if (out.length >= 3) break;
    seen.set(p, 1); out.push(p);
  }
  return out.map((p) => ({ el: p, n: seen.get(p), kw: PARTS_KO[p] || STROKE_PARTS[p] }));
}

// ── 3) 문장 조립 ──
const firstSense = (m) => String(m || '').split('·')[0].trim();
function compose(k) {
  const eum = eumOf(k);
  const meaning = firstSense(k.meaning);
  const tail = eum
    ? (meaning === eum ? `뜻·음 「${eum}」.` : `뜻 「${meaning}」, 음 「${eum}」.`)
    : `뜻 「${meaning}」.`;
  const tree = kanjiTree ? kanjiTree(k.char) : null;
  const parts = tree ? flattenParts(tree, k.char) : [];
  if (parts.length) {
    const seg = parts.map((p) => `${p.kw}(${p.el})${p.n > 1 ? ' 둘' : ''}`).join(' + ');
    let s = parts.length === 1
      ? `「${seg}」가 뼈대인 글자 — ${tail}`
      : `「${seg}」를 한 그림으로 묶으면 — ${tail}`;
    if (s.length > MAX_LEN) s = `「${seg}」 — ${tail}`;
    if (s.length <= MAX_LEN) return { s, tier: 'parts' };
  }
  // 폴백: 모양째 + 예시 단어
  let s = `모양째 외우는 글자 — ${tail}`;
  if (k.example && (s + ` 예: ${k.example}.`).length <= MAX_LEN) s += ` 예: ${k.example}.`;
  return { s, tier: 'fallback' };
}

// ── 4) 적용 + 통계 ──
const stats = { curated: 0, parts: 0, fallback: 0 };
for (const k of kanjiList) {
  const curated = MNEMONICS_KO[k.char];
  if (curated) { k.mnemonic = curated; stats.curated++; continue; }
  const { s, tier } = compose(k);
  k.mnemonic = s;
  stats[tier]++;
}

// ── 5) 검증 게이트 ──
const missing = kanjiList.filter((k) => !k.mnemonic || !/[가-힣]/.test(k.mnemonic) || /[A-Za-z�]/.test(k.mnemonic));
if (missing.length) {
  console.error('연상법 누락/불량:', missing.slice(0, 20).map((k) => k.char).join(''));
  process.exit(1);
}
const tooLong = kanjiList.filter((k) => !MNEMONICS_KO[k.char] && [...k.mnemonic].length > MAX_LEN);
if (tooLong.length) console.warn(`길이 초과(자동 생성) ${tooLong.length}자:`, tooLong.slice(0, 10).map((k) => k.char).join(''));
const curatedMissing = kanjiList.filter((k) => (k.jlpt === 'N5' || k.jlpt === 'N4') && !MNEMONICS_KO[k.char]);
if (curatedMissing.length) console.warn(`N5·N4 수제 연상법 누락 ${curatedMissing.length}자:`, curatedMissing.map((k) => `${k.char}(${k.jlpt})`).join(' '));
const uniq = new Set(kanjiList.map((k) => k.mnemonic));
console.log(`── 통계: 수제 ${stats.curated} · 부품 생성 ${stats.parts} · 폴백 ${stats.fallback} / 총 ${kanjiList.length}`);
console.log(`중복 문장: ${kanjiList.length - uniq.size}개`);

// 무작위 표본 30자 (검수용) — Math.random 대신 결정적 샘플(간격 추출)
const step = Math.floor(kanjiList.length / 30);
console.log('── 표본 30자 ──');
for (let i = 0; i < 30; i++) { const k = kanjiList[i * step]; console.log(` ${k.char} [${k.jlpt}] ${k.mnemonic}`); }

fs.writeFileSync(FILE, JSON.stringify(kanjiList));
console.log(`${FILE} 갱신 완료 (${kanjiList.length}자 전체에 mnemonic 부여)`);
