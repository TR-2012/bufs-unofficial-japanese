/* 작문 모범 답안(model)에 후리가나(ruby)를 붙인다 — 개발할 때만 실행, 앱은 결과 JSON만 읽는다.
 *
 * 결과 형식: item.ruby = ["오쿠리가나 등 그대로 쓸 글자", ["漢字", "かんじ"], ...]
 *   문자열 = 읽기 없이 그대로 표시, [본문, 읽기] = 본문 위에 읽기를 작게 표시
 * 읽기는 형태소 분석기(kuromoji, IPADIC)로 뽑고, 틀리기 쉬운 것은 아래 FIX 표로 바로잡는다.
 * 사람이 고친 읽기를 지키려면 이 스크립트를 다시 돌리기 전에 FIX에 넣는다.
 *
 * 실행(저장소에 kuromoji를 넣지 않는다 — 다른 폴더에 설치해 경로만 알려 준다):
 *   npm install --prefix <폴더> kuromoji@0.1.2
 *   KUROMOJI_DIR=<폴더>/node_modules/kuromoji node scripts/build_writing_ruby.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const DIR = process.env.KUROMOJI_DIR;
if (!DIR) { console.error('KUROMOJI_DIR 환경변수에 kuromoji 설치 경로를 지정하세요.'); process.exit(2); }
const kuromoji = createRequire(import.meta.url)(DIR);

/* 분석기가 틀리기 쉬운 읽기: 본문(토큰 하나 또는 붙은 여러 토큰) → 읽기. 긴 것부터 맞춘다. */
export const FIX = {
  '今日': 'きょう', '明日': 'あした', '昨日': 'きのう', '一人': 'ひとり', '二人': 'ふたり', '一日': 'いちにち',
  '大人': 'おとな', '今年': 'ことし', '今朝': 'けさ', '上手': 'じょうず', '下手': 'へた', '一緒': 'いっしょ',
  '日本': 'にほん', '日本人': 'にほんじん', '山道': 'やまみち',
};

/* 여러 토큰에 걸쳐 틀리는 읽기(문맥): 문장 속 구절 → 구절 전체의 읽기, 또는 조각 배열. 검수(2026-11)에서 찾은 것. */
export const PHRASE_FIX = {
  '一人': 'ひとり', '一か月': 'いっかげつ', '30分': 'さんじゅっぷん', '10分': 'じゅっぷん',
  'た後': 'たあと', 'お書き': 'おかき', '明朝': 'みょうちょう', '避難所': 'ひなんじょ',
  '雨が降': [['雨', 'あめ'], 'が', ['降', 'ふ']],
  '今出発': [['今', 'いま'], ['出発', 'しゅっぱつ']], '今投資': [['今', 'いま'], ['投資', 'とうし']],
  '日本本社': [['日本', 'にほん'], ['本社', 'ほんしゃ']],
  '何時': [['何', 'なん'], ['時', 'じ']], '何度': [['何', 'なん'], ['度', 'ど']],
  '洗濯物': [['洗濯', 'せんたく'], ['物', 'もの']],
  '完治': 'かんち', '一匹': 'いっぴき', '三日': 'みっか', '一週間': 'いっしゅうかん', '一日中': 'いちにちじゅう',
  '誤情報': 'ごじょうほう', '一社': 'いっしゃ',
  '何です': [['何', 'なん'], 'です'], '何と言': [['何', 'なん'], 'と', ['言', 'い']], '米の': [['米', 'こめ'], 'の'],
};

const kata2hira = (s) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
const KANJI = /[㐀-鿿々〆ヶ]/; // 々·〆·ヶ 포함
const isKana = (c) => /[぀-ゟ゠-ヿ]/.test(c);

/* 「食べ」+「たべ」→ [["食","た"],"べ"] : 앞뒤 가나를 읽기에서 떼어 한자 부분에만 읽기를 단다 */
export function splitOkurigana(surface, reading) {
  let s = surface, r = reading, head = '', tail = '';
  while (s && r && isKana(s[s.length - 1]) && kata2hira(s[s.length - 1]) === r[r.length - 1]) { tail = s[s.length - 1] + tail; s = s.slice(0, -1); r = r.slice(0, -1); }
  while (s && r && isKana(s[0]) && kata2hira(s[0]) === r[0]) { head += s[0]; s = s.slice(1); r = r.slice(1); }
  const out = [];
  if (head) out.push(head);
  if (s) out.push(r && KANJI.test(s) ? [s, r] : s);
  if (tail) out.push(tail);
  return out;
}

function toRuby(tokens) {
  const out = [];
  const push = (x) => { if (typeof x === 'string' && typeof out[out.length - 1] === 'string') out[out.length - 1] += x; else out.push(x); };
  for (const t of tokens) {
    const surface = t.surface_form;
    if (!KANJI.test(surface)) { push(surface); continue; }
    const fixed = FIX[surface];
    const reading = fixed || (t.reading && t.reading !== '*' ? kata2hira(t.reading) : '');
    if (!reading) { push(surface); continue; } // 사전에 없는 한자 — 읽기 없이 둔다(검수 목록에 뜸)
    for (const p of splitOkurigana(surface, reading)) push(p);
  }
  return out;
}

/* PHRASE_FIX 적용: 구절이 조각 경계와 맞으면 그 조각들을 구절 전체 읽기로 바꾼다 */
const segText = (p) => (typeof p === 'string' ? p : p[0]);
function applyPhraseFix(ruby) {
  // 문자열 조각은 한 글자씩 쪼개 둔다(구절 경계가 문자열 중간에 걸려도 맞도록)
  let out = ruby.flatMap((p) => (typeof p === 'string' ? [...p] : [p]));
  for (const [phrase, reading] of Object.entries(PHRASE_FIX)) {
    const text = out.map(segText).join('');
    let at = text.indexOf(phrase);
    while (at >= 0) {
      let pos = 0, i = 0;
      while (i < out.length && pos < at) pos += segText(out[i++]).length;
      let j = i, end = pos;
      while (j < out.length && end < at + phrase.length) end += segText(out[j++]).length;
      if (pos === at && end === at + phrase.length) {
        const fixed = Array.isArray(reading) ? reading : splitOkurigana(phrase, reading);
        out = [...out.slice(0, i), ...fixed, ...out.slice(j)];
      } else console.warn('[warn] 조각 경계가 안 맞아 고치지 못함: ' + text + ' / ' + phrase);
      at = out.map(segText).join('').indexOf(phrase, at + phrase.length);
    }
  }
  // 이웃한 문자열 조각 합치기
  return out.reduce((a, p) => { if (typeof p === 'string' && typeof a[a.length - 1] === 'string') a[a.length - 1] += p; else a.push(p); return a; }, []);
}

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const files = { w: path.join(ROOT, 'data/writing.json'), c: path.join(ROOT, 'data/writing_combo.json') };

kuromoji.builder({ dicPath: path.join(DIR, 'dict') }).build((err, tk) => {
  if (err) throw err;
  const w = JSON.parse(fs.readFileSync(files.w, 'utf8'));
  const c = JSON.parse(fs.readFileSync(files.c, 'utf8'));
  const items = [];
  for (const k of Object.keys(w)) for (const s of Object.keys(w[k])) items.push(...w[k][s]);
  for (const s of Object.keys(c.combo)) items.push(...c.combo[s]);
  const missing = [];
  for (const it of items) {
    it.ruby = applyPhraseFix(toRuby(tk.tokenize(it.model)));
    if (it.ruby.map(segText).join('') !== it.model) throw new Error('후리가나 본문이 원문과 다름: ' + it.model);
    // 읽기를 못 단 한자가 남았는지 검사
    for (const p of it.ruby) if (typeof p === 'string' && KANJI.test(p)) missing.push(it.model + ' → ' + p);
  }
  // 기존 파일 모양 유지(build_writing.mjs와 같은 형식)
  fs.writeFileSync(files.w, JSON.stringify(w));
  fs.writeFileSync(files.c, '{"combo":{\n' + Object.keys(c.combo).map((k) => JSON.stringify(k) + ':[\n' + c.combo[k].map((x) => JSON.stringify(x)).join(',\n') + '\n]').join(',\n') + '\n}}\n');
  console.log(`후리가나: ${items.length}개 문장 처리, 읽기 없는 한자 ${missing.length}건`);
  for (const m of missing.slice(0, 50)) console.log('  ' + m);
});
