// lib/mailer.js — Gmail SMTP 발송 (Node 내장 tls 사용, 무외부의존)
//
// 환경변수:
//   GMAIL_USER          발송 Gmail 주소 (예: you@gmail.com)
//   GMAIL_APP_PASSWORD  Google 2단계 인증 후 발급한 16자리 앱 비밀번호
//   MAIL_FROM           (선택) From 표시. 없으면 "BUFS 비공식 일본어 학습 <GMAIL_USER>".
//
// SMTPS(465, 암묵적 TLS)로 접속해 AUTH LOGIN → MAIL FROM → RCPT TO → DATA 순으로 전송.

const tls = require('tls');
const { cleanEnv } = require('./auth');

function b64(s) { return Buffer.from(String(s), 'utf8').toString('base64'); }
function mimeWord(s) { return '=?UTF-8?B?' + b64(s) + '?='; }

function smtpSend({ host, port, user, pass, from, to, subject, html }) {
  return new Promise((resolve, reject) => {
    const bodyB64 = (Buffer.from(html, 'utf8').toString('base64').match(/.{1,76}/g) || []).join('\r\n');
    const message =
      'From: ' + from + '\r\n' +
      'To: ' + to + '\r\n' +
      'Subject: ' + mimeWord(subject) + '\r\n' +
      'Date: ' + new Date().toUTCString() + '\r\n' +
      'MIME-Version: 1.0\r\n' +
      'Content-Type: text/html; charset=UTF-8\r\n' +
      'Content-Transfer-Encoding: base64\r\n' +
      '\r\n' + bodyB64 + '\r\n';

    // [기대응답코드, 보낼 명령] — 서버 인사(220)부터 시작.
    const steps = [
      [220, 'EHLO localhost\r\n'],
      [250, 'AUTH LOGIN\r\n'],
      [334, b64(user) + '\r\n'],
      [334, b64(pass) + '\r\n'],
      [235, 'MAIL FROM:<' + user + '>\r\n'],
      [250, 'RCPT TO:<' + to + '>\r\n'],
      [250, 'DATA\r\n'],
      [354, message + '.\r\n'],
      [250, 'QUIT\r\n'],
      [221, null],
    ];

    let idx = 0, buf = '', done = false;
    const socket = tls.connect({ host, port, servername: host });
    const timer = setTimeout(() => fail(new Error('SMTP timeout')), 20000);

    function fail(e) { if (done) return; done = true; clearTimeout(timer); try { socket.destroy(); } catch {} reject(e); }
    function finish() { if (done) return; done = true; clearTimeout(timer); try { socket.end(); } catch {} resolve(true); }

    function pump() {
      // 응답 완결 판정: "코드 + 공백"으로 시작하는 줄이 있으면 완료(멀티라인 '코드-' 제외).
      let code = null;
      for (const ln of buf.split('\r\n')) if (/^\d{3} /.test(ln)) code = parseInt(ln.slice(0, 3), 10);
      if (code == null) return;
      const [expect, cmd] = steps[idx];
      buf = '';
      if (code !== expect) {
        // 535 = Gmail이 AUTH LOGIN 자격증명을 거부(비밀번호 오류가 아니라 설정 문제인 경우가 대부분).
        const hint = code === 535
          ? ' — GMAIL_APP_PASSWORD가 Google 계정 2단계 인증 후 발급한 16자리 앱 비밀번호인지, GMAIL_USER와 같은 계정인지 확인하세요(일반 로그인 비밀번호는 사용 불가).'
          : '';
        fail(new Error('SMTP ' + code + ' (expected ' + expect + ')' + hint));
        return;
      }
      if (cmd == null) { finish(); return; }
      socket.write(cmd);
      idx++;
    }

    socket.on('data', d => { buf += d.toString('utf8'); pump(); });
    socket.on('error', fail);
    socket.on('end', () => { if (!done) finish(); });
  });
}

async function sendMail({ to, subject, html }) {
  const user = cleanEnv(process.env.GMAIL_USER || process.env.SMTP_USER);
  // Google 앱 비밀번호는 화면에 "abcd efgh ijkl mnop"처럼 4자리씩 띄어서 표시되지만
  // 실제 값은 공백이 없는 16자다. 복사 시 공백이 섞여 들어오면 535(인증 실패)로
  // 이어지므로, 내부 공백까지 전부 제거한다(이메일 주소·앱 비밀번호 모두 공백을 갖지 않음).
  const pass = cleanEnv(process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASS).replace(/\s+/g, '');
  if (!user || !pass) throw new Error('GMAIL_USER / GMAIL_APP_PASSWORD not set');
  const from = cleanEnv(process.env.MAIL_FROM) || (mimeWord('BUFS 비공식 일본어 학습') + ' <' + user + '>');
  return smtpSend({ host: 'smtp.gmail.com', port: 465, user, pass, from, to, subject, html });
}

module.exports = { sendMail };
