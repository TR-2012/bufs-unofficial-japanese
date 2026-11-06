// GET/POST /api/auth/logout — 세션 쿠키를 지우고 로그인 페이지로 이동.

const { clearCookie } = require('../../lib/auth');

module.exports = async function handler(req, res) {
  res.statusCode = 302;
  res.setHeader('Set-Cookie', clearCookie());
  res.setHeader('Location', '/login.html?e=out');
  res.end();
};
