// GET /api/auth/verify?token=...
// 매직링크 토큰을 검증하고 세션 쿠키를 발급한 뒤 앱(/)으로 이동시킨다.

const { verify, isAllowed, sign, sessionCookie } = require('../../lib/auth');

const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30일

module.exports = async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const token = url.searchParams.get('token') || '';

  const p = verify(token, 'm');
  if (!p || !isAllowed(p.e)) {
    res.statusCode = 302;
    res.setHeader('Location', '/login.html?e=expired');
    res.end();
    return;
  }

  const session = sign({ e: p.e, typ: 's', exp: Date.now() + SESSION_MAX_AGE * 1000 });
  res.statusCode = 302;
  res.setHeader('Set-Cookie', sessionCookie(session, SESSION_MAX_AGE));
  res.setHeader('Location', '/');
  res.end();
};
