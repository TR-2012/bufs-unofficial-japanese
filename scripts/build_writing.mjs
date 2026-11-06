/* 작문 코너 재구성 — 부산외대 일본어융합학부 4년 기준의 현실적인 분량.
 *
 * 기준: 4년 × 학기 30주 × 주 2~3편 ≈ 약 700편 + 단어 조합(등급별 100).
 *   문장 일작  기초(1학년) 150 · 중급(2학년) 150 · 고급(3~4학년) 150
 *   경어       존경어 40 · 겸양어 40 · 접객·전화 40
 *   비즈니스   메일 50 · 보고·문서 30              (IT 실무 삭제)
 *   주제 작문  일상·자기소개(1~2학년) 30 · 의견문(3~4학년) 30 · 취업 자기PR·ES(4학년) 20
 *              (학술 논문·15개 전문 분야 삭제)
 *   단어 조합  N5~N1 각 100 (문법 조건이 고르게 섞이도록 같은 간격으로 선별)
 *
 * 선별: 하위마다 원본의 앞쪽(사람이 쓴 시드)부터, 같은 문제(prompt) 중복 제외.
 * 실행: node scripts/build_writing.mjs [원본 writing.json] [원본 writing_combo.json]
 *   (기본은 data/의 현재 파일. 원본은 이 스크립트 도입 이전 커밋에 있음)
 */
import fs from 'node:fs';

const [SRC_W = 'data/writing.json', SRC_C = 'data/writing_combo.json'] = process.argv.slice(2);
const src = JSON.parse(fs.readFileSync(SRC_W, 'utf8'));
const combo = JSON.parse(fs.readFileSync(SRC_C, 'utf8')).combo;

function pick(list, n, skip) {
  const seen = new Set(), out = [];
  for (const x of list || []) {
    if (!x || !x.prompt || !x.model || seen.has(x.prompt)) continue;
    if (skip && skip.test(x.prompt)) continue;
    seen.add(x.prompt); out.push(x);
    if (out.length >= n) break;
  }
  if (out.length < n) console.warn(`[warn] ${out.length}/${n}`);
  return out;
}

const ES = [
  ['자기PR: 자신의 강점을 하나 정하고 경험과 함께 300자로 쓰세요.', '私の強みは、粘り強く取り組む力です。大学では日本語能力試験N1の合格を目標に、四年間毎日学習を続けました。この経験を生かし、貴社でも目標に向かって努力し続けます。', '強み·生かす'],
  ['학생 시절 가장 힘을 쏟은 일(ガクチカ)을 쓰세요.', '学生時代に最も力を入れたことは、日本人留学生との交流サークルの運営です。参加者を増やすため、イベントの内容を見直し、参加者を二倍に増やしました。', 'ガクチカ·力を入れる'],
  ['지원 동기를 쓰세요(일본계 기업 가정).', '貴社を志望した理由は、日韓の架け橋となる仕事に携わりたいと考えたからです。大学で学んだ日本語と異文化理解の経験を、貴社の海外事業で生かしたいと考えております。', '志望動機·携わる'],
  ['입사 후 하고 싶은 일을 쓰세요.', '入社後は、韓国市場向けの営業として、お客様の声を日本本社に正確に伝える役割を担いたいと考えております。', '入社後·担う'],
  ['자신의 단점과 극복 노력을 쓰세요.', '私の短所は、心配性なところです。しかし、事前に準備を重ねることで、ミスの少ない仕事につなげるよう心がけております。', '短所·心がける'],
  ['팀에서 맡았던 역할과 성과를 쓰세요.', 'ゼミの共同発表では、資料作成の担当として、メンバーの意見をまとめる役割を果たしました。その結果、発表は高い評価を受けました。', '役割を果たす'],
  ['실패한 경험과 거기서 배운 점을 쓰세요.', 'アルバイトで発注の数を間違えたことがあります。この失敗から、確認の大切さを学び、以後は必ず二重に確認するようにしています。', '失敗から学ぶ'],
  ['일본어를 공부하며 가장 어려웠던 점과 해결 방법을 쓰세요.', '敬語の使い分けが最も難しかったです。日本のドラマや会議の動画を見て、場面ごとの表現をノートにまとめることで克服しました。', '克服する'],
  ['리더십을 발휘한 경험을 쓰세요.', '学園祭の実行委員長として、三十人のメンバーをまとめました。役割分担を明確にし、毎週進捗を共有したことで、予定通り開催できました。', 'まとめる·進捗'],
  ['10년 후의 자신을 쓰세요.', '十年後には、日韓両国の取引を任される人材になっていたいです。そのために、語学力だけでなく業界の知識も身につけていきます。', '身につける'],
  ['어려운 상황을 극복한 경험을 쓰세요.', '留学中に体調を崩し、授業についていけなくなったことがあります。先生や友人に相談し、計画を立て直したことで、無事に単位を取得できました。', '立て直す'],
  ['지원 직종(통역·번역)에 맞는 자신의 자질을 쓰세요.', '私は相手の意図を正確にくみ取ることを大切にしています。通訳ボランティアの経験を通じて、言葉だけでなく文化の違いにも配慮する力を養いました。', 'くみ取る·養う'],
  ['존경하는 사람과 그 이유를 면접 답변처럼 쓰세요.', '尊敬する人は、大学のゼミの先生です。学生一人ひとりの意見を尊重し、最後まで支えてくださる姿勢から、多くを学びました。', '尊敬する'],
  ['아르바이트 경험에서 배운 점을 쓰세요.', 'カフェのアルバイトでは、お客様の立場に立って考えることの大切さを学びました。常連のお客様の好みを覚え、満足度の向上につなげました。', '立場に立つ'],
  ['당사(일본 기업)의 제품이나 서비스에 대한 인상을 쓰세요.', '貴社の製品は、使う人の立場に立った細やかな工夫が魅力だと感じております。韓国でもその魅力を広めたいと考えております。', '細やかな·魅力'],
  ['면접 첫인사와 30초 자기소개를 쓰세요.', '本日はお時間をいただき、ありがとうございます。釜山外国語大学日本語融合学部四年の〜と申します。日本語と異文化理解を強みに、貴社に貢献したいと考えております。', '申します·貢献'],
  ['역질문(면접 마지막 질문)을 정중하게 쓰세요.', '入社までに勉強しておくべきことがございましたら、教えていただけますでしょうか。', 'いただけますでしょうか'],
  ['일본에서 일하고 싶은 이유를 쓰세요.', '日本で働くことで、日本のビジネス文化を現場で学び、将来は両国をつなぐ仕事に生かしたいと考えております。', '現場で学ぶ'],
  ['스트레스 관리 방법을 면접 답변처럼 쓰세요.', 'ストレスを感じたときは、軽い運動をして気分を切り替えるようにしています。そのおかげで、忙しい時期でも落ち着いて取り組めます。', '切り替える'],
  ['입사 의지를 담은 마무리 문장을 쓰세요.', '以上の経験を生かし、一日も早く貴社の戦力となれるよう努力してまいります。何卒よろしくお願い申し上げます。', 'まいります·何卒'],
].map(([prompt, model, note]) => ({ prompt, model, note }));

const out = {
  sentence: {
    basic: pick(src.sentence.basic, 150),
    mid: pick(src.sentence.mid, 150),
    adv: pick(src.sentence.adv, 150),
  },
  keigo: {
    sonkei: pick(src.keigo.sonkei, 40),
    kenjo: pick(src.keigo.kenjo, 40),
    settai: pick(src.keigo.settai, 40),
  },
  biz: {
    mail: pick(src.biz.mail, 50),
    report: pick(src.biz.report, 30),
  },
  free: {
    daily: pick(src.free.f1, 30),
    opinion: pick(src.free.academic, 30, /연구|인용|실험|이론|논문|서론|선행/),
    es: ES,
  },
};
fs.writeFileSync('data/writing.json', JSON.stringify(out));

const PER = 100;
const newCombo = {};
for (const lv of Object.keys(combo)) {
  const a = combo[lv];
  if (a.length <= PER) { newCombo[lv] = a; continue; }
  const step = a.length / PER;
  newCombo[lv] = Array.from({ length: PER }, (_, i) => a[Math.floor(i * step)]);
}
fs.writeFileSync('data/writing_combo.json', '{"combo":{\n' + Object.keys(newCombo).map((k) => JSON.stringify(k) + ':[\n' + newCombo[k].map((x) => JSON.stringify(x)).join(',\n') + '\n]').join(',\n') + '\n}}\n');

let total = 0;
for (const t in out) for (const s in out[t]) { total += out[t][s].length; console.log(t, s, out[t][s].length); }
for (const k in newCombo) { total += newCombo[k].length; console.log('combo', k, newCombo[k].length); }
console.log('합계', total);
