/* 하루코 음성 파일 생성기 — VOICEVOX:春日部つむぎ (스타일 ID 8, ノーマル)
 *
 * 앱이 재생하는 고정 문장(단어 읽기·한자 음/훈·문법 예문·작문 모범 답안)을 미리 mp3로 만들어 audio/<앞2자리>/<키>.mp3에 저장한다.
 * 앱(tts.js)은 같은 키로 이 파일을 먼저 찾고, 없을 때만 Google TTS → 브라우저 음성으로 넘어간다.
 * 파일 이름 키와 문장 정리는 tts.js의 window.harukoVoiceKey를 그대로 불러 쓴다(두 곳이 어긋나지 않게).
 *
 * 준비: VOICEVOX 엔진을 띄운다.
 *   docker run -d -p 50021:50021 voicevox/voicevox_engine:cpu-0.26.1
 * 실행: node scripts/build_voice.mjs            (이미 있는 파일은 건너뜀 — 중단 후 다시 실행해도 됨)
 * 옵션: VOICEVOX_URL(기본 http://localhost:50021), VOICEVOX_SPEAKER(기본 8), CONCURRENCY(기본 4)
 * 크레디트: VOICEVOX:春日部つむぎ — 앱 화면과 README에 표시해야 한다(캐릭터 이용규약).
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { spawn } from 'node:child_process';

const ENGINE = process.env.VOICEVOX_URL || 'http://localhost:50021';
const SPEAKER = parseInt(process.env.VOICEVOX_SPEAKER || '8', 10);
const CONC = parseInt(process.env.CONCURRENCY || '4', 10);
const OUT = 'audio';

// tts.js를 가짜 브라우저 환경에서 실행해 toJaOnly / harukoVoiceKey를 꺼낸다.
const win = {};
const ctx = { window: win, document: { addEventListener() {} }, console, Map, Promise, URL: {}, Audio: function () {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('tts.js', 'utf8'), ctx);
const norm = win.toJaOnly, key = win.harukoVoiceKey;

const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const texts = new Set();
const add = (t) => { const n = norm(t || ''); if (n) texts.add(n); };
for (const w of read('data/words.json')) add(w.reading);
for (const k of read('data/kanji.json')) {
  add(k.on); add(k.reading); add(k.kun); add((k.kun || '').replace(/[()（）]/g, ''));
}
const g = read('data/grammar.json');
for (const lv in g) for (const u of g[lv]) for (const e of u.examples || []) add(e.jp);
// 작문 모범 답안(작문 연습의 「듣기」)
const wr = read('data/writing.json');
for (const t in wr) for (const sub in wr[t]) for (const x of wr[t][sub]) add(x.model);
const cb = read('data/writing_combo.json').combo;
for (const lv in cb) for (const x of cb[lv]) add(x.model);

// 키 충돌 검사
const byKey = new Map();
for (const t of texts) {
  const k = key(t);
  if (byKey.has(k) && byKey.get(k) !== t) throw new Error(`키 충돌: ${t} / ${byKey.get(k)}`);
  byKey.set(k, t);
}
const fileOf = (k) => path.join(OUT, k.slice(0, 2), k + '.mp3');
const todo = [...byKey].filter(([k]) => !fs.existsSync(fileOf(k)));
console.log(`문장 ${byKey.size}개 · 남은 것 ${todo.length}개 · 화자 ${SPEAKER} · 동시 ${CONC}`);

async function synth(text) {
  const q = await fetch(`${ENGINE}/audio_query?speaker=${SPEAKER}&text=${encodeURIComponent(text)}`, { method: 'POST' });
  if (!q.ok) throw new Error('audio_query ' + q.status);
  const query = await q.json();
  query.outputSamplingRate = 24000;
  query.outputStereo = false;
  const s = await fetch(`${ENGINE}/synthesis?speaker=${SPEAKER}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(query) });
  if (!s.ok) throw new Error('synthesis ' + s.status);
  return Buffer.from(await s.arrayBuffer());
}
function toMp3(wav, file) {
  return new Promise((res, rej) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + '.part';
    const p = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-i', 'pipe:0', '-ac', '1', '-ar', '24000', '-b:a', '32k', '-f', 'mp3', tmp]);
    p.on('error', rej);
    p.on('close', (c) => { if (c === 0) { fs.renameSync(tmp, file); res(); } else rej(new Error('ffmpeg ' + c)); });
    p.stdin.end(wav);
  });
}

let done = 0, failed = 0;
const t0 = Date.now();
async function worker() {
  while (todo.length) {
    const [k, text] = todo.shift();
    try { await toMp3(await synth(text), fileOf(k)); }
    catch (e) { failed++; console.error(`실패 ${text}: ${e.message}`); }
    if (++done % 200 === 0) {
      const rate = done / ((Date.now() - t0) / 1000);
      console.log(`${done} 완료 · 남은 ${todo.length} · 약 ${Math.round(todo.length / rate / 60)}분 남음`);
    }
  }
}
await Promise.all(Array.from({ length: CONC }, worker));
console.log(`끝: ${done}개 처리, 실패 ${failed}개`);
if (failed) process.exit(1);
