/* 실전 일본어 어휘 연상법 생성기 — 재실행 가능(idempotent).
 *
 * 목적
 *  data/words.json 중 「실전 일본어」 트랙(practical 태그, 약 10,100개) 항목에
 *  한국어 연상법 문장(mnemonic)을 덧붙인다. 실전 단어 카드의 뜻 공개 패널과
 *  필기 노트 실전 탭이 이 필드를 사용한다.
 *
 *  ※ 실행 순서: scripts/build_practical.mjs(practical 태그 부여) → 이 스크립트.
 *    words.json을 다시 빌드했다면 두 스크립트를 순서대로 재실행해야 한다.
 *
 * 전략 — 한자 훈음 체인 (새로 짓지 않고 한자 자산을 재활용)
 *  kanji.json(3,000자, 뜻 교정 완료)과 words.json 정렬 기반 한자음 테이블
 *  (scripts/build_mnemonics.mjs와 같은 비어두 우선 다수결)을 이용해,
 *  단어를 구성 한자의 「훈·음」 사슬로 풀어 뜻에 잇는다.
 *   ① 인지 가능 어휘(cognate): 「한국 한자음 그대로」가 곧 연상법.
 *      예: 経(경)+済(제) = 경제 — 한국 한자음 그대로.
 *   ② 그 외 한자 포함 어휘: 훈음 사슬 → 뜻.
 *      예: 大(크다·대)+丈(어른·장)+夫(사내·부) → 「괜찮음」.
 *      오쿠리가나는 사이에 그대로 끼운다: 食(먹다·식)べる → 「먹다」.
 *   ③ 가나 단독어·카타카나 외래어: 한자 분해가 불가하므로 생략(필드 없음).
 *
 * 품질 게이트: 한자 포함 practical 어휘의 연상법 커버리지 95% 이상(미만이면 실패),
 *  로마자·깨진 문자 검출, 길이 상한(대략 70자, 초과 시 음만으로 축약), 표본 30개 출력.
 *
 * 실행:  node scripts/build_word_mnemonics.mjs   (저장소 루트에서)
 */
import fs from 'node:fs';
import { MEANING_FIX_KO } from '../data/lib/kanji_mnemonics_ko.mjs';

const FILE = 'data/words.json';
const MAX_LEN = 70;

const isKanjiCh = (ch) => /[㐀-䶿一-鿿々]/.test(ch);
const pureHangul = (s) => /^[가-힣]+$/.test(s);
const firstSense = (m) => String(m || '').split(/[·/,(（]/)[0].trim();

const words = JSON.parse(fs.readFileSync(FILE, 'utf8'));
for (const w of words) delete w.mnemonic; // 재실행 대비

// ── 1) 한자 정보(훈·음) — kanji.json + 한자음 테이블(비어두 우선 다수결) ──
const kanjiList = JSON.parse(fs.readFileSync('data/kanji.json', 'utf8'));
const fixOf = (ch) => MEANING_FIX_KO[ch] || MEANING_FIX_KO[ch.normalize('NFC')];
const eumTable = (() => {
  const nonInit = new Map(), init = new Map();
  const bump = (m, ch, syl) => { let c = m.get(ch); if (!c) m.set(ch, (c = new Map())); c.set(syl, (c.get(syl) || 0) + 1); };
  for (const w of words) {
    const m = firstSense(w.meaning);
    const chars = [...String(w.word || '')];
    if (!chars.length || !chars.every(isKanjiCh)) continue;
    if (!pureHangul(m) || m.length !== chars.length) continue;
    chars.forEach((ch, i) => bump(i === 0 ? init : nonInit, ch, m[i]));
  }
  const table = new Map();
  const pick = (c) => {
    let best = '', bn = 0, total = 0;
    for (const [syl, n] of c) { total += n; if (n > bn) { bn = n; best = syl; } }
    return total >= 2 && bn / total >= 0.6 ? best : null;
  };
  for (const [ch, c] of nonInit) { const b = pick(c); if (b) table.set(ch, b); }
  for (const [ch, c] of init) { if (!table.has(ch)) { const b = pick(c); if (b) table.set(ch, b); } }
  return table;
})();
const kinfo = new Map(); // char -> { hun, eum } (훈이 곧 음인 글자는 hun===eum)
for (const k of kanjiList) {
  const fix = fixOf(k.char);
  const hun = firstSense(fix ? fix[0] : k.meaning);
  const eum = fix ? fix[1] : (eumTable.get(k.char) || (/^[가-힣]$/.test(hun) ? hun : null));
  const info = { hun: hun || null, eum };
  kinfo.set(k.char, info);
  const nfc = k.char.normalize('NFC');
  if (nfc !== k.char && !kinfo.has(nfc)) kinfo.set(nfc, info);
}

// ── 2) 문장 조립 ──
// 글자 라벨: 인지형은 뜻의 해당 음절(=한자음), 그 외엔 「훈·음」.
const labelOf = (ch, full) => {
  const info = kinfo.get(ch) || kinfo.get(ch.normalize('NFC'));
  if (!info || (!info.hun && !info.eum)) return null;
  if (full && info.hun && info.eum && info.hun !== info.eum) return `${ch}(${info.hun}·${info.eum})`;
  return `${ch}(${info.eum || info.hun})`;
};
function compose(w) {
  const chars = [...w.word];
  const kanjiChars = chars.filter(isKanjiCh);
  if (!kanjiChars.length) return { s: null, tier: 'kana' };
  const meaning = firstSense(w.meaning);
  // ① 인지 가능 어휘: 뜻 음절이 곧 글자별 한자음
  if (w.cognate && pureHangul(meaning) && meaning.length === chars.length && chars.every(isKanjiCh)) {
    const chain = chars.map((ch, i) => `${ch}(${meaning[i]})`).join('+');
    const s = `${chain} = ${meaning} — 한국 한자음 그대로.`;
    if (s.length <= MAX_LEN) return { s, tier: 'cognate' };
  }
  // ② 훈음 사슬: 한자는 라벨, 가나는 그대로 이어 붙인다
  const build = (full) => {
    let chain = '', prevKanji = false, missing = 0;
    for (const ch of chars) {
      if (isKanjiCh(ch)) {
        const label = labelOf(ch, full);
        if (!label) missing++;
        chain += (prevKanji ? '+' : '') + (label || ch);
        prevKanji = true;
      } else { chain += ch; prevKanji = false; }
    }
    return { chain, missing };
  };
  let { chain, missing } = build(true);
  if (missing === kanjiChars.length) return { s: null, tier: 'noinfo' }; // 아는 한자가 하나도 없음
  let s = `${chain} → 「${meaning}」.`;
  if (s.length > MAX_LEN) { chain = build(false).chain; s = `${chain} → 「${meaning}」.`; } // 음만으로 축약
  if (s.length > MAX_LEN + 20) return { s: null, tier: 'noinfo' }; // 그래도 길면 포기(극단적 복합어)
  return { s, tier: 'chain' };
}

// ── 3) 적용 + 통계 ──
const stats = { cognate: 0, chain: 0, kana: 0, noinfo: 0 };
let kanjiBearing = 0;
const sizeBefore = fs.statSync(FILE).size;
for (const w of words) {
  if (!w.practical) continue;
  const hasKanji = [...w.word].some(isKanjiCh);
  if (hasKanji) kanjiBearing++;
  const { s, tier } = compose(w);
  stats[tier]++;
  if (s) w.mnemonic = s;
}

// ── 4) 검증 게이트 ──
const covered = stats.cognate + stats.chain;
const coverage = covered / Math.max(1, kanjiBearing);
// 로마자는 단어 표기 자체에서 온 경우(生成AI 등)만 허용
const bad = words.filter((w) => w.mnemonic && (/�/.test(w.mnemonic) || !/[가-힣]/.test(w.mnemonic) || (/[A-Za-z]/.test(w.mnemonic) && !/[A-Za-z]/.test(w.word))));
if (bad.length) { console.error('불량 문장:', bad.slice(0, 10).map((w) => w.word).join(' ')); process.exit(1); }
console.log(`── 통계: 인지형 ${stats.cognate} · 훈음 사슬 ${stats.chain} · 가나 생략 ${stats.kana} · 정보 부족 생략 ${stats.noinfo}`);
console.log(`한자 포함 어휘 커버리지: ${covered}/${kanjiBearing} (${(coverage * 100).toFixed(1)}%)`);
if (coverage < 0.95) { console.error('커버리지 95% 미만 — 한자 정보원을 보강하세요.'); process.exit(1); }

const pr = words.filter((w) => w.mnemonic);
const step = Math.floor(pr.length / 30);
console.log('── 표본 30개 ──');
for (let i = 0; i < 30; i++) { const w = pr[i * step]; console.log(` ${w.word} [${w.jlpt}] ${w.mnemonic}`); }

fs.writeFileSync(FILE, JSON.stringify(words));
const sizeAfter = fs.statSync(FILE).size;
console.log(`${FILE} 갱신 완료 — 연상법 ${covered}개, 용량 ${(sizeBefore / 1e6).toFixed(1)}MB → ${(sizeAfter / 1e6).toFixed(1)}MB (+${((sizeAfter - sizeBefore) / 1e6).toFixed(2)}MB)`);
