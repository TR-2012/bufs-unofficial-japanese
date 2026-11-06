// Vercel Edge Middleware — 로그인하지 않은 접근 차단(서버 측).
//   기본값: 이메일 없이 누구나 이용 가능(통과). 환경변수 REQUIRE_LOGIN=1 일 때만 아래 차단을 적용.
//   · 앱 진입('/', '/index.html')        → 미로그인 시 /login.html 로 리다이렉트
//   · 과금 엔드포인트('/api/tts') → 미로그인 시 401
// 세션 쿠키(cjl_session)는 HMAC-SHA256 서명 토큰. Node 측(lib/auth.js)과 동일 규약.
// 무외부의존: 표준 Web API(Response, crypto.subtle)만 사용.

export const config = { matcher: ['/', '/index.html', '/api/tts'] };

const COOKIE = 'cjl_session';

function getCookie(req, name) {
  const h = req.headers.get('cookie');
  if (!h) return '';
  const m = h.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
  return m ? m[1] : '';
}

function b64urlToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function validSession(token, secret) {
  if (!token || !secret) return false;
  const i = token.lastIndexOf('.');
  if (i < 0) return false;
  const data = token.slice(0, i), sig = token.slice(i + 1);
  const enc = new TextEncoder();
  let ok = false;
  try {
    const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    ok = await crypto.subtle.verify('HMAC', key, b64urlToBytes(sig), enc.encode(data));
  } catch { return false; }
  if (!ok) return false;
  try {
    const p = JSON.parse(new TextDecoder().decode(b64urlToBytes(data)));
    if (p.typ !== 's') return false;
    if (!p.exp || Date.now() > p.exp) return false;
    return true;
  } catch { return false; }
}

export default async function middleware(request) {
  const pass = () => new Response(null, { headers: { 'x-middleware-next': '1' } });
  const required = /^(1|true|yes|on)$/i.test(String(process.env.REQUIRE_LOGIN || '').trim());
  if (!required) return pass(); // 로그인 없이 이용

  const secret = process.env.AUTH_SECRET;
  const url = new URL(request.url);
  const ok = await validSession(getCookie(request, COOKIE), secret);

  if (ok) return pass();

  if (url.pathname.startsWith('/api/')) {
    return new Response(JSON.stringify({ error: '인증이 필요합니다.' }), {
      status: 401, headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }
  return Response.redirect(new URL('/login.html', request.url).toString(), 302);
}
