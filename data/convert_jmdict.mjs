// convert_jmdict.mjs — JMdict → data/words.json (어휘 약 20만+)
//
// 1) 원본 내려받기 (CC BY-SA 4.0, EDRDG):
//      JMdict_e.gz (영어판) 또는 한국어 글로스 포함판
//      https://www.edrdg.org/jmdict/edict_doc.html
// 2) 실행:  node convert_jmdict.mjs JMdict_e > words.json
//    (대용량이므로 N5~N1 우선순위 어휘만 필터링하고 싶으면 LIMIT 조정)
//
import { readFileSync } from 'node:fs';

const LIMIT = parseInt(process.env.LIMIT || '0', 10); // 0 = 전체
const xml = readFileSync(process.argv[2] || 'JMdict_e', 'utf-8');
const posMap = {
  'noun': '명사', 'verb': '동사', 'adjective': '형용사',
  'adverb': '부사', 'expressions': '표현',
};
const out = [];
for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
  const e = m[1];
  const word = (e.match(/<keb>(.*?)<\/keb>/) || e.match(/<reb>(.*?)<\/reb>/) || [])[1];
  const reading = (e.match(/<reb>(.*?)<\/reb>/) || [])[1] || '';
  if (!word) continue;
  // 한국어 글로스 우선, 없으면 영어
  const ko = [...e.matchAll(/<gloss xml:lang="kor">(.*?)<\/gloss>/g)].map(x => x[1]);
  const en = [...e.matchAll(/<gloss(?: xml:lang="eng")?>(.*?)<\/gloss>/g)].map(x => x[1]);
  const meaning = (ko[0] || en[0] || '').trim();
  if (!meaning) continue;
  let pos = '기타';
  const posTag = (e.match(/<pos>&(.*?);<\/pos>/) || [])[1] || '';
  if (/^n/.test(posTag)) pos = '명사';
  else if (/^v/.test(posTag)) pos = '동사';
  else if (/^adj/.test(posTag)) pos = '형용사';
  else if (/^adv/.test(posTag)) pos = '부사';
  out.push({ word, reading, meaning, pos, jlpt: '' }); // JLPT 등급은 별도 빈도표로 보강
  if (LIMIT && out.length >= LIMIT) break;
}
process.stdout.write(JSON.stringify(out));
console.error(`변환 완료: ${out.length}개`);
