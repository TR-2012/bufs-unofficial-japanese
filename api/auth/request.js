// POST /api/auth/request  { email }
// 허용 목록(ALLOWED_EMAILS)에 있는 주소에만 매직링크 메일을 보낸다.
// 이메일 존재 여부 노출을 막기 위해 응답은 항상 동일(generic).

const { isAllowed, allowedEmails, normEmail, sign, getOrigin } = require('../../lib/auth');
const { sendMail } = require('../../lib/mailer');

function readJson(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => raw += c);
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

function emailHtml(link) {
  return [
    '<div style="font-family:system-ui,-apple-system,sans-serif; max-width:480px; margin:0 auto; padding:28px 24px; color:#1B2A3A;">',
    '<div style="font-size:20px; font-weight:800; color:#C24A33;">BUFS 비공식 일본어 학습</div>',
    '<p style="font-size:15px; line-height:1.7; margin:18px 0 8px;">BUFS 비공식 일본어 학습 로그인 링크예요. 아래 버튼을 누르면 로그인돼요.</p>',
    '<p style="margin:22px 0;"><a href="' + link + '" style="display:inline-block; background:#C24A33; color:#fff; text-decoration:none; font-weight:700; padding:13px 26px; border-radius:10px;">로그인하기</a></p>',
    '<p style="font-size:12.5px; color:#6C7C8B; line-height:1.6;">버튼이 안 되면 이 주소를 복사해서 열어줘:<br><span style="word-break:break-all; color:#3A5168;">' + link + '</span></p>',
    '<p style="font-size:12px; color:#9AAAB8; margin-top:18px;">이 링크는 15분 후 만료돼. 요청한 적이 없다면 무시하면 돼.</p>',
    '</div>',
  ].join('');
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }

  let body;
  try { body = await readJson(req); } catch { res.status(400).json({ error: 'bad json' }); return; }
  const email = normEmail(body && body.email);

  const generic = { ok: true, message: '등록된 주소라면 로그인 링크를 보냈어요. 메일함을 확인하세요.' };

  // 진단 로그(서버 측 비공개): 허용목록 적중 여부·환경변수 상태 파악용. 시크릿은 남기지 않음.
  const allow = isAllowed(email);
  console.log('[auth/request] email=%s allowed=%s allowCount=%d hasAuthSecret=%s hasGmailUser=%s hasGmailPass=%s',
    email, allow, allowedEmails().length,
    !!process.env.AUTH_SECRET, !!process.env.GMAIL_USER, !!process.env.GMAIL_APP_PASSWORD);

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { res.status(200).json(generic); return; }
  if (!allow) { res.status(200).json(generic); return; }

  try {
    const token = sign({ e: email, typ: 'm', exp: Date.now() + 15 * 60 * 1000 });
    const link = getOrigin(req) + '/api/auth/verify?token=' + encodeURIComponent(token);
    await sendMail({ to: email, subject: 'BUFS 비공식 일본어 학습 로그인 링크', html: emailHtml(link) });
    console.log('[auth/request] mail sent to %s', email);
  } catch (e) {
    console.error('[auth/request] mail FAILED:', String((e && e.message) || e));
    res.status(500).json({ error: 'mail failed', detail: String((e && e.message) || e) });
    return;
  }
  res.status(200).json(generic);
};
