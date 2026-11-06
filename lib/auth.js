// lib/auth.js — 회원/세션 공용 헬퍼 (Node 런타임, 무외부의존)
//
// 토큰 형식:  base64url(JSON payload) + "." + base64url(HMAC-SHA256)
//   payload = { e:이메일, typ:'m'(매직링크)|'s'(세션), exp:만료(ms) }
// HMAC 입력은 base64url 문자열(data)이며, Edge 미들웨어(crypto.subtle)와 동일 규약.
//
// 필요한 환경변수:
//   AUTH_SECRET      서명용 비밀키(랜덤 32바이트 이상 권장)
//   ALLOWED_EMAILS   허용할 이메일 목록(쉼표/공백 구분, 최대 4명)
//   APP_URL          (선택) 링크 베이스 URL. 없으면 요청 헤더로 추론.

const crypto = require('crypto');

const COOKIE_NAME = 'cjl_session';

function cleanEnv(v) {
  if (typeof v !== 'string') return '';
  let s = v.replace(/[​-‍﻿]/g, '').trim();
  if (s.length >= 2) {
    const a = s[0], b = s[s.length - 1];
    if ((a === '"' && b === '"') || (a === "'" && b === "'")) s = s.slice(1, -1).trim();
  }
  return s;
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlToBuf(s) {
  s = String(s).replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64');
}

function secret() { return cleanEnv(process.env.AUTH_SECRET); }

function sign(payload) {
  const s = secret();
  if (!s) throw new Error('AUTH_SECRET not set');
  const data = b64url(JSON.stringify(payload));
  const sig = b64url(crypto.createHmac('sha256', s).update(data).digest());
  return data + '.' + sig;
}

// 유효하면 payload 객체, 아니면 null. type 지정 시 typ 일치까지 확인.
function verify(token, type) {
  const s = secret();
  if (!s || !token) return null;
  const i = String(token).lastIndexOf('.');
  if (i < 0) return null;
  const data = token.slice(0, i), sig = token.slice(i + 1);
  const expect = b64url(crypto.createHmac('sha256', s).update(data).digest());
  const a = Buffer.from(sig), b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let p;
  try { p = JSON.parse(b64urlToBuf(data).toString('utf8')); } catch { return null; }
  if (type && p.typ !== type) return null;
  if (!p.exp || Date.now() > p.exp) return null;
  return p;
}

function normEmail(e) { return String(e || '').trim().toLowerCase(); }

function allowedEmails() {
  return cleanEnv(process.env.ALLOWED_EMAILS)
    .split(/[,\s;]+/).map(x => x.trim().toLowerCase()).filter(Boolean);
}
function isAllowed(email) { return allowedEmails().indexOf(normEmail(email)) >= 0; }

function getCookie(req, name) {
  const h = req && req.headers && (req.headers.cookie || req.headers.Cookie);
  if (!h) return '';
  const m = String(h).match(new RegExp('(?:^|;\\s*)' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : '';
}

function getOrigin(req) {
  const env = cleanEnv(process.env.APP_URL);
  if (env) return env.replace(/\/+$/, '');
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  return proto + '://' + host;
}

function sessionCookie(token, maxAgeSec) {
  return [COOKIE_NAME + '=' + token, 'Path=/', 'HttpOnly', 'Secure', 'SameSite=Lax', 'Max-Age=' + maxAgeSec].join('; ');
}
function clearCookie() {
  return [COOKIE_NAME + '=', 'Path=/', 'HttpOnly', 'Secure', 'SameSite=Lax', 'Max-Age=0'].join('; ');
}

module.exports = {
  COOKIE_NAME, cleanEnv, sign, verify, normEmail,
  allowedEmails, isAllowed, getCookie, getOrigin, sessionCookie, clearCookie,
};
