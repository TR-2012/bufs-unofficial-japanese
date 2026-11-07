// build_words.mjs — 약 25만 어휘 생성 (한국어 뜻 + 레벨/분야 분류)
//   전략: ① 교정사전(CORRECTIONS)·큐레이션 한국어 우선
//         ② 한자어(漢字語)는 한자음으로 변환(두음법칙 적용)
//         ③ JMdict의 모든 한자 표기형을 카드로(이형 표기 포함) → 약 22만
//         ④ 부족분은 JMnedict 고유명사(인명·지명·회사)로 25만까지 보충
//   분류: level(초등~대학원) = JLPT 환산, field(15개 분야) = JMdict 분야 태그 환산
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { WORDS_KO } from './words_extra_ko.mjs';
import { CORRECTIONS } from './words_corrections_ko.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dir, '..');
const findFile = (re) => readdirSync(DATA).find(f => re.test(f));

// 대용량 원본(KANJIDIC2 한국어 음 + JMdict)이 없으면 최신 릴리스에서 자동 내려받기
function ensureBigSources() {
  const need = [/^kanjidic2-all-.*\.json$/, /^jmdict-eng-3.*\.json$/];
  if (need.every(re => findFile(re))) return;
  let tag;
  try {
    const url = execSync('curl -sSL -o /dev/null -w "%{url_effective}" "https://github.com/scriptin/jmdict-simplified/releases/latest"', { encoding: 'utf8' });
    tag = url.trim().split('/').pop();
  } catch { throw new Error('원본 다운로드 실패: 네트워크 불가. data/README.md의 수동 다운로드 안내를 참고하세요.'); }
  const enc = encodeURIComponent(tag);
  const assets = [`kanjidic2-all-${tag}.json.zip`, `jmdict-eng-${tag}.json.zip`, `jmnedict-all-${tag}.json.zip`];
  for (const a of assets) {
    process.stderr.write(`내려받는 중: ${a} … `);
    execSync(`curl -sSL --retry 3 -o "${join(DATA, 'tmp.zip')}" "https://github.com/scriptin/jmdict-simplified/releases/download/${enc}/${a}"`, { stdio: 'ignore' });
    execSync(`cd "${DATA}" && unzip -o -q tmp.zip && rm -f tmp.zip`, { stdio: 'ignore' });
    process.stderr.write('완료\n');
  }
}
ensureBigSources();

// ---------- 두음법칙 (어두 ㄹ/ㄴ 교정) ----------
const IOTA = new Set([2, 3, 6, 7, 12, 17, 20]); // ㅑㅒㅕㅖㅛㅠㅣ
function dueum(word) {
  if (!word) return word;
  const code = word.charCodeAt(0) - 0xAC00;
  if (code < 0 || code >= 11172) return word;
  const cho = Math.floor(code / 588), jung = Math.floor((code % 588) / 28), jong = code % 28;
  let nc = cho;
  if (cho === 5) nc = IOTA.has(jung) ? 11 : 2;      // ㄹ→ㅇ/ㄴ : 력→역, 라→나
  else if (cho === 2 && IOTA.has(jung)) nc = 11;     // ㄴ→ㅇ : 녀→여, 니→이
  if (nc === cho) return word;
  return String.fromCharCode(0xAC00 + (nc * 21 + jung) * 28 + jong) + word.slice(1);
}

// ---------- 한자 → 한국어 음 ----------
const kd = JSON.parse(readFileSync(join(DATA, findFile(/^kanjidic2-all-.*\.json$/)), 'utf8'));
const k2ko = {};
for (const c of kd.characters) {
  for (const g of (c.readingMeaning?.groups || [])) {
    for (const r of (g.readings || [])) {
      if (r.type === 'korean_h') (k2ko[c.literal] = k2ko[c.literal] || []).push(r.value);
    }
  }
}
const krOf = (ch) => (k2ko[ch] ? k2ko[ch][0] : null);

// ---------- 한자 → 한국어 뜻(큐레이션), 한자 → JLPT ----------
const kanji = JSON.parse(readFileSync(join(DATA, 'kanji.json'), 'utf8'));
const kMeanKo = {}, kJlpt = {};
const hasLatin = (s) => /[A-Za-z]/.test(s);
for (const k of kanji) {
  if (k.meaning && !hasLatin(k.meaning)) kMeanKo[k.char] = k.meaning;
  kJlpt[k.char] = k.jlpt;
}

// ---------- 큐레이션 한국어 ----------
const curated = new Map();
for (const w of JSON.parse(readFileSync(join(__dir, 'words_seed_ko.json'), 'utf8'))) curated.set(w.word, w);
for (const w of WORDS_KO) if (!curated.has(w.word)) curated.set(w.word, w);

// ---------- JLPT 등급(단어→레벨) ----------
const wordJlpt = {};
for (let L = 5; L >= 1; L--) {
  let deck; try { deck = JSON.parse(readFileSync(join(DATA, `jg_n${L}.json`), 'utf8')); } catch { continue; }
  for (const c of (deck.cards || [])) if (c.question && !wordJlpt[c.question]) wordJlpt[c.question] = 'N' + L;
}

// ---------- 의미 결정 ----------
const isKanji = (ch) => /[一-鿿㐀-䶿々]/.test(ch);
const hasKata = (s) => /[ァ-ヺー]/.test(s);
const transliterate = (w) => {
  const out = [...w].map(krOf);
  return out.every(Boolean) ? dueum(out.join('')) : null;
};
function meaningOf(word) {
  if (CORRECTIONS[word]) return CORRECTIONS[word];
  if (curated.has(word)) return curated.get(word).meaning;
  const kj = [...word].filter(isKanji);
  if (kj.length === 0) return null;                           // 순가나(和語)·외래어 — 큐레이션만
  // 카타카나가 섞인 복합어(예: データの先頭, Aコース) — 한자부만 변환하면 오역되므로 큐레이션만
  if (hasKata(word)) return null;
  const allKanji = [...word].every(isKanji);
  if (allKanji && kj.length >= 2) return transliterate(word); // 한자어 → 한자음
  if (kj.length === 1) {
    // 한자가 맨 앞(오쿠리가나형: 食べる·握り)일 때만 한자 뜻 사용.
    // けい線처럼 히라가나가 한자 앞에 오면 음차 합성어(罫線)이므로 한자만 변환하면 오역 → 큐레이션/교정사전만.
    if (isKanji([...word][0])) return kMeanKo[kj[0]] || krOf(kj[0]);
    return null;
  }
  // 한자 2개 이상 + 히라가나(예: 立ち上げる, 打ち合わせ) — 한자부만 변환하면 의미가 달라짐 → 큐레이션만
  return null;
}

// ---------- POS 매핑 ----------
const posOf = (tags = []) => {
  const t = tags[0] || '';
  if (/^n/.test(t) || t === 'pn') return t === 'pn' ? '대명사' : '명사';
  if (/^v/.test(t)) return '동사';
  if (t === 'adj-i' || t === 'adj-ix') return '형용사';
  if (t === 'adj-na') return '형용동사';
  if (/^adv/.test(t)) return '부사';
  if (t === 'exp') return '표현';
  if (t === 'int') return '감탄사';
  if (t === 'conj') return '접속사';
  return '명사';
};

// ---------- 등급 추정(큐레이션/jg → 한자 난이도) ----------
const LV = { N5: 0, N4: 1, N3: 2, N2: 3, N1: 4, '고급': 5 };
const jlptOf = (word) => {
  if (curated.has(word) && curated.get(word).jlpt) return curated.get(word).jlpt;
  if (wordJlpt[word]) return wordJlpt[word];
  const kj = [...word].filter(isKanji);
  if (!kj.length) return 'N3';
  let max = 0, advanced = false;
  for (const ch of kj) {
    const r = LV[kJlpt[ch]] ?? (kJlpt[ch] ? 4 : 5);
    if (kJlpt[ch] === undefined) advanced = true;
    if (r > max) max = r;
  }
  if (advanced) return '고급';
  return Object.keys(LV)[max];
};

// ---------- 레벨(초등~대학원) ----------
const LEVEL_OF = { N5: '초등', N4: '초등', N3: '중등', N2: '고등', N1: '대학', '고급': '대학원' };
const levelOf = (jlpt) => LEVEL_OF[jlpt] || '중등';

// ---------- 분야(15개) : JMdict field 태그 → 한국어 분야 ----------
const FIELD_MAP = {
  // 자연과학
  math:'자연과학 분야', physics:'자연과학 분야', chem:'자연과학 분야', biochem:'자연과학 분야',
  astron:'자연과학 분야', biol:'자연과학 분야', bot:'자연과학 분야', zool:'자연과학 분야',
  geol:'자연과학 분야', min:'자연과학 분야', genet:'자연과학 분야', geom:'자연과학 분야',
  met:'자연과학 분야', ecol:'자연과학 분야', ornith:'자연과학 분야', cryst:'자연과학 분야',
  paleo:'자연과학 분야', embryo:'자연과학 분야', stat:'자연과학 분야', logic:'자연과학 분야',
  // 공학·기술
  engr:'공학·기술 분야', mech:'공학·기술 분야', elec:'공학·기술 분야', electr:'공학·기술 분야',
  civeng:'공학·기술 분야', motor:'공학·기술 분야', mining:'공학·기술 분야', aviat:'공학·기술 분야',
  // 의학·보건
  med:'의학·보건 분야', anat:'의학·보건 분야', physiol:'의학·보건 분야', pharm:'의학·보건 분야',
  dent:'의학·보건 분야', surg:'의학·보건 분야', vet:'의학·보건 분야', pathol:'의학·보건 분야',
  psyanal:'의학·보건 분야', psy:'의학·보건 분야', psych:'의학·보건 분야',
  // 농림수산·식품
  food:'농림수산·식품 분야', agric:'농림수산·식품 분야', fish:'농림수산·식품 분야', gardn:'농림수산·식품 분야', hortic:'농림수산·식품 분야',
  // 사회과학
  econ:'사회과학 분야', geogr:'사회과학 분야', archeol:'사회과학 분야',
  // 인문학
  phil:'인문학 분야', Buddh:'인문학 분야', Christn:'인문학 분야', Shinto:'인문학 분야',
  grmyth:'인문학 분야', jpmyth:'인문학 분야', chmyth:'인문학 분야', rommyth:'인문학 분야',
  relig:'인문학 분야',
  // 예술·디자인·콘텐츠
  music:'예술·디자인·콘텐츠 분야', art:'예술·디자인·콘텐츠 분야', photo:'예술·디자인·콘텐츠 분야',
  print:'예술·디자인·콘텐츠 분야', archit:'예술·디자인·콘텐츠 분야', kabuki:'예술·디자인·콘텐츠 분야',
  noh:'예술·디자인·콘텐츠 분야', cloth:'예술·디자인·콘텐츠 분야',
  // 법률·행정·공공
  law:'법률·행정·공공 분야', mil:'법률·행정·공공 분야', politics:'법률·행정·공공 분야',
  // 산업·경제활동
  finc:'산업·경제활동 분야', stockm:'산업·경제활동 분야', tradem:'산업·경제활동 분야', horse:'산업·경제활동 분야',
  // 비즈니스·회사 실무
  bus:'비즈니스·회사 실무 분야',
  // IT·AI
  comp:'IT·AI 세부 분야', internet:'IT·AI 세부 분야', vidg:'IT·AI 세부 분야', telec:'IT·AI 세부 분야',
  // 문화·미디어·사회 트렌드
  film:'문화·미디어·사회 트렌드 분야', tv:'문화·미디어·사회 트렌드 분야', manga:'문화·미디어·사회 트렌드 분야',
  ent:'문화·미디어·사회 트렌드 분야', audvid:'문화·미디어·사회 트렌드 분야',
  // 국제·지역·언어
  ling:'국제·지역·언어 분야', gramm:'국제·지역·언어 분야',
  // 생활 전문(스포츠·취미·놀이 등) — 기본값도 여기로
  sports:'생활 전문 분야', baseb:'생활 전문 분야', sumo:'생활 전문 분야', mahj:'생활 전문 분야',
  go:'생활 전문 분야', MA:'생활 전문 분야', golf:'생활 전문 분야', cards:'생활 전문 분야',
  shogi:'생활 전문 분야', boxing:'생활 전문 분야', ski:'생활 전문 분야', prowres:'생활 전문 분야',
  hanaf:'생활 전문 분야', figskt:'생활 전문 분야', rail:'생활 전문 분야',
};
const DEFAULT_FIELD = '생활 전문 분야';
const fieldOf = (senses) => {
  for (const s of (senses || [])) for (const f of (s.field || [])) if (FIELD_MAP[f]) return FIELD_MAP[f];
  return DEFAULT_FIELD;
};

// ---------- 조립 ----------
// 목표: JLPT N1 합격권
//   common(상용) 표기형·JLPT 등재어를 우선 채우고, 부족분만 비-common으로 보충.
//   고유명사(JMnedict)는 시험 어휘가 아니므로 제외.
const TARGET = 70000;
const out = [];
const seen = new Set();
const push = (word, reading, meaning, pos, jlpt, field) => {
  if (!word || !meaning || seen.has(word)) return;
  seen.add(word);
  out.push({ word, reading, meaning, pos, jlpt, level: levelOf(jlpt), field: field || DEFAULT_FIELD });
};

// 1) 큐레이션(교정 반영) 우선
for (const w of curated.values()) {
  const m = CORRECTIONS[w.word] || w.meaning;
  push(w.word, w.reading, m, w.pos || '명사', w.jlpt || jlptOf(w.word), w.field);
}

// 2) JMdict — common(상용)·JLPT 등재어 우선, 부족분만 비-common으로 7만까지
const jmdict = JSON.parse(readFileSync(join(DATA, findFile(/^jmdict-eng-3.*\.json$/)), 'utf8'));
const preferredKana = (e) => { const k = (e.kana || []).find(x => x.common) || (e.kana || [])[0]; return k ? k.text : ''; };
const commonCards = [], rareCards = [];
for (const e of jmdict.words) {
  const reading = preferredKana(e);
  const pos = posOf(e.sense?.[0]?.partOfSpeech);
  const field = fieldOf(e.sense);
  const kanaCommon = (e.kana || []).some(k => k.common);
  // 한자 표기형(이형 포함) 각각을 카드로
  for (const kf of (e.kanji || [])) {
    const word = kf.text;
    if (![...word].some(isKanji)) continue;
    const m = meaningOf(word);
    if (!m) continue;
    const card = { word, reading, m, pos, jlpt: jlptOf(word), field };
    const isImportant = kf.common || !!wordJlpt[word] || curated.has(word) || CORRECTIONS[word];
    (isImportant ? commonCards : rareCards).push(card);
  }
  // 가나 표제어(한자 없음): 의미 생성 가능한 것
  if (!(e.kanji || []).length) {
    const word = reading;
    if (!word) continue;
    const m = meaningOf(word);
    if (!m) continue;
    const card = { word, reading: word, m, pos, jlpt: jlptOf(word), field };
    const isImportant = kanaCommon || !!wordJlpt[word] || curated.has(word) || CORRECTIONS[word];
    (isImportant ? commonCards : rareCards).push(card);
  }
}
jmdict.words.length = 0;   // 메모리 해제 힌트
// common 먼저, 그다음 rare로 7만까지
for (const c of commonCards) { if (out.length >= TARGET) break; push(c.word, c.reading, c.m, c.pos, c.jlpt, c.field); }
console.error(`common 어휘: ${out.length}개`);
for (const c of rareCards) { if (out.length >= TARGET) break; push(c.word, c.reading, c.m, c.pos, c.jlpt, c.field); }
console.error(`JMdict 어휘(7만 목표): ${out.length}개`);

// 등급 순 정렬(쉬운 것부터) — 일일 학습 DAY 배치용
out.sort((a, b) => (LV[a.jlpt] ?? 2) - (LV[b.jlpt] ?? 2));
writeFileSync(join(DATA, 'words.json'), JSON.stringify(out));
const byL = {}; out.forEach(w => byL[w.jlpt] = (byL[w.jlpt] || 0) + 1);
const byField = {}; out.forEach(w => byField[w.field] = (byField[w.field] || 0) + 1);
const koPure = out.filter(w => !hasLatin(w.meaning)).length;
console.error(`words.json: ${out.length}개 | 한국어뜻 ${koPure} (${Math.round(koPure / out.length * 100)}%)`);
console.error(`레벨: ${JSON.stringify(byL)}`);
console.error(`분야: ${JSON.stringify(byField)}`);
