// build.mjs — 오픈 데이터셋 + 한국어 큐레이션을 병합해 kanji.json / words.json 생성
//
// 입력(이미 data/ 에 내려받아 둠):
//   - kanji_full.json         davidluzgouveia/kanji-data (KANJIDIC2 파생, 13,108자)
//   - jg_n1..n5.json          SirGram/j-grader (kotoba 파생 JLPT 어휘 5,321개)
//   - lib/joyo_kanji*.mjs     직접 작성한 한국어 훈음 오버레이 (1~6학년)
//   - lib/words_extra_ko.mjs  직접 작성한 한국어 어휘 (비즈니스/경어/IT/학술/전문)
//
// 출력:
//   - kanji.json   상용한자 2,136 + 인명용/JLPT 포함 약 3,000자
//   - words.json   JLPT N5~N1 약 5,300 + 한국어 큐레이션
//
// 라이선스: KANJIDIC2/JMdict = CC BY-SA 4.0 (EDRDG). 출처 표기 필수.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JOYO } from './joyo_kanji.mjs';
import { JOYO_4_6 } from './joyo_kanji_4_6.mjs';
import { WORDS_KO } from './words_extra_ko.mjs';
import { N5 } from './grammar_n5.mjs';
import { N4 } from './grammar_n4.mjs';
import { N3 } from './grammar_n3.mjs';
import { N2 } from './grammar_n2.mjs';
import { N1 } from './grammar_n1.mjs';
import { WRITING } from './writing_extra.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dir, '..');

// 원본 오픈 데이터 자동 내려받기 (없을 때만). 출처/라이선스는 data/README.md 참조.
const SOURCES = {
  'kanji_full.json': 'https://raw.githubusercontent.com/davidluzgouveia/kanji-data/master/kanji.json',
  'jg_n1.json': 'https://raw.githubusercontent.com/SirGram/j-grader/master/frontend/src/decks/n1.json',
  'jg_n2.json': 'https://raw.githubusercontent.com/SirGram/j-grader/master/frontend/src/decks/n2.json',
  'jg_n3.json': 'https://raw.githubusercontent.com/SirGram/j-grader/master/frontend/src/decks/n3.json',
  'jg_n4.json': 'https://raw.githubusercontent.com/SirGram/j-grader/master/frontend/src/decks/n4.json',
  'jg_n5.json': 'https://raw.githubusercontent.com/SirGram/j-grader/master/frontend/src/decks/n5.json',
};
async function ensureSources() {
  const { existsSync } = await import('node:fs');
  for (const [name, url] of Object.entries(SOURCES)) {
    const p = join(DATA, name);
    if (existsSync(p)) continue;
    process.stderr.write(`내려받는 중: ${name} … `);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`다운로드 실패 ${name}: HTTP ${res.status}`);
    writeFileSync(p, Buffer.from(await res.arrayBuffer()));
    process.stderr.write('완료\n');
  }
}
await ensureSources();

const hira2kata = (s) => (s || '').replace(/[ぁ-ゖ]/g, c => String.fromCharCode(c.charCodeAt(0) + 0x60));
const cleanKun = (s) => {
  if (!s) return '';
  let r = s.replace(/^-+/, '').replace(/-+$/, '');     // 접두/접미 표시 제거
  r = r.replace(/\.(.+)$/, '($1)');                     // 送り仮名: お.す → お(す)
  return r;
};
const jlptFromNew = (n) => (n ? 'N' + n : '');
const jlptFromGrade = (g) => g <= 2 ? 'N5' : g <= 4 ? 'N4' : g <= 6 ? 'N3' : g === 8 ? 'N2' : 'N1';

// ---------- 한국어 한자 오버레이 ----------
const koKanji = {};
for (const row of [...JOYO, ...JOYO_4_6]) {
  const [char, on, kun, meaning, strokes, jlpt, example, reading, grade] = row;
  koKanji[char] = { on, kun, meaning, strokes, jlpt, example, reading, grade };
}

// ---------- KANJIDIC2: 한자 → 한국어 음(없으면 영어 뜻 폴백) ----------
const k2ko = {};
{
  const { existsSync, readdirSync } = await import('node:fs');
  const f = readdirSync(DATA).find(n => /^kanjidic2-all-.*\.json$/.test(n));
  if (f && existsSync(join(DATA, f))) {
    const kd = JSON.parse(readFileSync(join(DATA, f), 'utf8'));
    for (const c of kd.characters) {
      for (const g of (c.readingMeaning?.groups || []))
        for (const r of (g.readings || []))
          if (r.type === 'korean_h') (k2ko[c.literal] = k2ko[c.literal] || []).push(r.value);
    }
  }
}
const korReading = (ch) => (k2ko[ch] ? [...new Set(k2ko[ch])].slice(0, 2).join('·') : '');

// ---------- KANJIDIC2 파생 풀세트 ----------
const KANJI_TARGET = 3000;
const full = JSON.parse(readFileSync(join(DATA, 'kanji_full.json'), 'utf8'));
const kanjiOut = [];
const usedChar = new Set();

const isJoyo = (g) => g && g <= 8;                 // 1~6학년 + 중·고교(8) = 상용한자 2,136
const makeEntry = (char, e) => {
  const ko = koKanji[char];
  // 뜻: 큐레이션 한국어 > 한국어 음 > 영어(최후) — 퀴즈 한국어화를 위해 한국어 우선
  const meaning = ko?.meaning || korReading(char) || (e.meanings || []).slice(0, 3).join(', ');
  if (!meaning) return null;                       // 뜻 없는 이체자·희귀자 제외
  // 등급: 상용한자는 N5~N1, 상용 이상(인명용·확장)은 "고급"
  const jlpt = isJoyo(e.grade)
    ? (ko?.jlpt || jlptFromNew(e.jlpt_new) || jlptFromGrade(e.grade))
    : '고급';
  const o = {
    char,
    on: ko?.on ?? hira2kata(e.readings_on?.[0] || ''),
    kun: ko?.kun ?? cleanKun(e.readings_kun?.[0] || ''),
    meaning,
    strokes: e.strokes || ko?.strokes || 0,
    jlpt,
    example: ko?.example || '',
    reading: ko?.reading || '',
  };
  if (e.grade) o.grade = e.grade;
  return o;
};
const add = ([char, e]) => {
  if (usedChar.has(char)) return;
  const o = makeEntry(char, e);
  if (!o) return;
  usedChar.add(char);
  kanjiOut.push(o);
};

const all = Object.entries(full);
// 1) 상용(grade 1~8) + JLPT 등급 보유: 교육 순서(학년) → 빈도순
all.filter(([, e]) => (e.grade && e.grade <= 8) || e.jlpt_new)
  .sort((a, b) => ((a[1].grade || 99) - (b[1].grade || 99)) || ((a[1].freq || 99999) - (b[1].freq || 99999)))
  .forEach(add);
// 2) 인명용(grade 9~10) 중 뜻 보유분: 빈도순
all.filter(([, e]) => e.grade && e.grade >= 9)
  .sort((a, b) => (a[1].freq || 99999) - (b[1].freq || 99999))
  .forEach(add);
// 3) 목표(약 3,000자)까지 빈도 높은 일반 한자로 보충
all.filter(([, e]) => e.freq && !e.grade && !e.jlpt_new)
  .sort((a, b) => a[1].freq - b[1].freq)
  .forEach((x) => { if (kanjiOut.length < KANJI_TARGET) add(x); });

writeFileSync(join(DATA, 'kanji.json'), JSON.stringify(kanjiOut));
const joyoCount = kanjiOut.filter(x => x.grade && x.grade <= 8).length;
console.error(`kanji.json: ${kanjiOut.length}자 (상용 ${joyoCount} + 인명용/빈출 확장)`);

// ---------- 어휘(20,000): 별도 모듈에서 생성 (kanji.json 이후 실행) ----------
await import('./build_words.mjs');

// ---------- 문법: N5~N1 전 영역 ----------
const grammarOut = { N5, N4, N3, N2, N1 };
writeFileSync(join(DATA, 'grammar.json'), JSON.stringify(grammarOut));
const gTotal = Object.values(grammarOut).reduce((s, a) => s + a.length, 0);
console.error(`grammar.json: ${gTotal}개 단원 (N5:${N5.length} N4:${N4.length} N3:${N3.length} N2:${N2.length} N1:${N1.length})`);

// ---------- 작문: 비즈니스/경어/학술/자유 ----------
writeFileSync(join(DATA, 'writing.json'), JSON.stringify(WRITING));
const wCount = Object.values(WRITING).reduce((s, cat) => s + Object.values(cat).reduce((s2, arr) => s2 + arr.length, 0), 0);
console.error(`writing.json: ${wCount}개 문제`);
