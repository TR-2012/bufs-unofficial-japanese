// convert_kanjidic.mjs — KANJIDIC2 → data/kanji.json (전체 한자, 약 13,000자)
//
// 1) 원본 내려받기 (CC BY-SA 4.0, EDRDG):
//      https://www.edrdg.org/kanjidic/kanjidic2.xml.gz  →  압축 해제 → kanjidic2.xml
// 2) 한국어 의미가 필요하면 별도 글로스가 없으므로 영어 의미를 채우거나
//    번역 단계를 추가하세요 (KANJIDIC 기본 글로스는 영어).
// 3) 실행:  node convert_kanjidic.mjs kanjidic2.xml > kanji.json
//
// 의존성 없이 정규식으로 파싱합니다(대용량이지만 단순).
import { readFileSync } from 'node:fs';

const xml = readFileSync(process.argv[2] || 'kanjidic2.xml', 'utf-8');
const out = [];
for (const m of xml.matchAll(/<character>([\s\S]*?)<\/character>/g)) {
  const c = m[1];
  const char = (c.match(/<literal>(.*?)<\/literal>/) || [])[1];
  if (!char) continue;
  const strokes = parseInt((c.match(/<stroke_count>(\d+)<\/stroke_count>/) || [])[1] || '0', 10);
  const grade = parseInt((c.match(/<grade>(\d+)<\/grade>/) || [])[1] || '0', 10);
  const jlptOld = (c.match(/<jlpt>(\d)<\/jlpt>/) || [])[1]; // 1..4 (구 JLPT)
  const on = [...c.matchAll(/<reading r_type="ja_on">(.*?)<\/reading>/g)].map(x => x[1]);
  const kun = [...c.matchAll(/<reading r_type="ja_kun">(.*?)<\/reading>/g)].map(x => x[1]);
  // 기본 글로스는 영어. ko 글로스가 있으면 우선 사용.
  const ko = [...c.matchAll(/<meaning m_lang="ko">(.*?)<\/meaning>/g)].map(x => x[1]);
  const en = [...c.matchAll(/<meaning>(.*?)<\/meaning>/g)].map(x => x[1]);
  const jlptMap = { '4': 'N5', '3': 'N4', '2': 'N2', '1': 'N1' };
  out.push({
    char,
    on: on[0] || '',
    kun: kun[0] || '',
    meaning: (ko[0] || en.slice(0, 2).join(', ') || ''),
    strokes,
    jlpt: jlptMap[jlptOld] || (grade && grade <= 2 ? 'N5' : grade <= 4 ? 'N4' : 'N2'),
    example: '',
    reading: '',
    grade: grade || undefined,
  });
}
process.stdout.write(JSON.stringify(out));
console.error(`변환 완료: ${out.length}자`);
