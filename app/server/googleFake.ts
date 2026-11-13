// Chỉ để chạy thử trên máy (GOOGLE_FAKE=1, google.ts không bao giờ nạp file này trên Railway): giả trang chọn tài khoản của Google,
// ký id_token bằng khoá RSA tự sinh rồi form POST về callback y như Google. Bộ xác minh vẫn là verifyIdToken thật, chỉ đổi nguồn khoá.
import express from 'express';
import { generateKeyPairSync, sign } from 'node:crypto';
import type { Jwk, KeySource } from './googleVerify.ts';

const KID = 'fake-dev';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk: Jwk = { ...(publicKey.export({ format: 'jwk' }) as Jwk), kid: KID, alg: 'RS256', use: 'sig' };
export const fakeKeys: KeySource = async (kid) => (kid === KID ? jwk : null);

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
export function fakeIdToken(claims: Record<string, unknown>) {
  const head = b64({ alg: 'RS256', kid: KID, typ: 'JWT' });
  const body = b64(claims);
  return `${head}.${body}.${sign('RSA-SHA256', Buffer.from(`${head}.${body}`), privateKey).toString('base64url')}`;
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const page = (body: string) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Fake Google</title>
<body style="font:16px system-ui;max-width:420px;margin:40px auto;padding:0 16px">${body}</body>`;

export function fakeRouter(clientId: () => string) {
  const r = express.Router();
  r.get('/google/fake', (req, res) => {
    const q = req.query as Record<string, string>;
    const hidden = ['state', 'nonce', 'redirect_uri'].map((k) => `<input type="hidden" name="${k}" value="${esc(q[k])}">`).join('');
    res.type('html').send(page(`<h3>Fake Google (dev)</h3><form method="post">${hidden}
      <p><label>sub <input name="sub" value="dev-1001"></label></p>
      <p><label>email <input name="email" value="dev@example.com"></label></p>
      <p><label>name <input name="name" value="Dev Tester"></label></p>
      <button>Sign in</button> <button name="cancel" value="1">Cancel</button></form>`));
  });
  r.post('/google/fake', express.urlencoded({ extended: false }), (req, res) => {
    const b = req.body as Record<string, string>;
    const now = Math.floor(Date.now() / 1000);
    const fields: Record<string, string> = b.cancel
      ? { error: 'access_denied', state: b.state }
      : { state: b.state, id_token: fakeIdToken({ iss: 'https://accounts.google.com', aud: clientId(), azp: clientId(), sub: b.sub, email: b.email, email_verified: true, name: b.name, given_name: String(b.name || '').split(' ')[0], nonce: b.nonce, iat: now, exp: now + 3600 }) };
    const inputs = Object.entries(fields).map(([k, v]) => `<input type="hidden" name="${k}" value="${esc(v)}">`).join('');
    res.type('html').send(page(`<form method="post" action="${esc(b.redirect_uri)}">${inputs}<noscript><button>Continue</button></noscript></form><script>document.forms[0].submit()</script>`));
  });
  return r;
}
