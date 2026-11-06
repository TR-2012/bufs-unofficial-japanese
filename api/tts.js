// /api/tts — Google Cloud Text-to-Speech 프록시 (서버리스, Node 런타임)
// 하루코 목소리: Google 기본 일본어 여성(젊은) 음성.
//
// 환경변수:
//   GOOGLE_TTS_API_KEY (필수) — Google Cloud API 키 (Cloud Text-to-Speech API 사용 설정 필요)
//   GOOGLE_TTS_VOICE   (선택) — 기본 'ja-JP-Neural2-B' (여성)
//   GOOGLE_TTS_RATE    (선택) — 말하기 속도, 기본 1.0 (0.5~1.5)
//   GOOGLE_TTS_PITCH   (선택) — 음 높이(semitone), 기본 1.0 (-5~5) — 약간 높여 젊은 톤
//
// 요청: POST /api/tts  Content-Type: application/json   { text: string, rate?: number }
// 응답: audio/mpeg (성공) / JSON {error} (실패). 키가 없으면 503 → 클라이언트는 브라우저 음성으로 폴백.

const DEFAULT_VOICE = 'ja-JP-Neural2-B';
const MAX_TEXT_LEN = 5000;

function cleanEnv(v) {
  if (typeof v !== 'string') return '';
  let s = v.replace(/[​-‍﻿ ⁠]/g, '').trim();
  if (s.length >= 2) {
    const a = s[0], b = s[s.length - 1];
    if ((a === '"' && b === '"') || (a === "'" && b === "'")) s = s.slice(1, -1).trim();
  }
  return s;
}

function envNumber(name, fallback, min, max) {
  const n = parseFloat(process.env[name]);
  if (!isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => raw += c);
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }
  const key = cleanEnv(process.env.GOOGLE_TTS_API_KEY);
  if (!key) { res.status(503).json({ error: 'server key not configured' }); return; }

  let body;
  try { body = await readJson(req); } catch { res.status(400).json({ error: 'bad json' }); return; }
  const text = (body && typeof body.text === 'string') ? body.text.trim() : '';
  if (!text) { res.status(400).json({ error: 'text required' }); return; }
  if (text.length > MAX_TEXT_LEN) { res.status(413).json({ error: 'text too long' }); return; }

  const voice = cleanEnv(process.env.GOOGLE_TTS_VOICE) || DEFAULT_VOICE;
  const envRate = envNumber('GOOGLE_TTS_RATE', 1.0, 0.5, 1.5);
  const rate = (body && typeof body.rate === 'number' && isFinite(body.rate))
    ? Math.min(1.5, Math.max(0.5, body.rate)) : envRate;
  const pitch = envNumber('GOOGLE_TTS_PITCH', 1.0, -5, 5);

  const payload = {
    input: { text },
    voice: { languageCode: 'ja-JP', name: voice },
    audioConfig: { audioEncoding: 'MP3', speakingRate: rate },
  };
  // Chirp3-HD 계열은 pitch를 지원하지 않으므로 그 외 음성에만 적용
  if (!/Chirp/i.test(voice)) payload.audioConfig.pitch = pitch;

  let r;
  try {
    r = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    res.status(502).json({ error: 'upstream fetch failed', detail: String(e && e.message || e) });
    return;
  }
  const raw = await r.text().catch(() => '');
  if (!r.ok) {
    console.error('[tts] google ' + r.status + ' ' + raw.slice(0, 400));
    res.status(r.status).json({ error: 'google tts error', detail: raw.slice(0, 400) });
    return;
  }
  let audio = '';
  try { audio = JSON.parse(raw).audioContent || ''; } catch {}
  if (!audio) { res.status(502).json({ error: 'empty audio' }); return; }
  const buf = Buffer.from(audio, 'base64');
  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.status(200).send(buf);
};
