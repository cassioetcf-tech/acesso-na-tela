// ── admin-login — Autenticação do painel admin ───────────────────────────────
// Valida a senha do admin contra uma variável de ambiente (NUNCA no repositório)
// e devolve um token de sessão assinado (HMAC) com expiração. O cliente guarda o
// token e libera a interface enquanto ele for válido.
//
// Variáveis de ambiente (Netlify → Site settings → Environment variables):
//   ADMIN_PASSWORD      (obrigatória) — a senha de acesso ao painel
//   ADMIN_TOKEN_SECRET  (recomendada) — segredo p/ assinar o token (cai p/ ADMIN_PASSWORD se ausente)
//
// Observação de segurança: as gravações no Supabase ainda usam a chave anônima
// (pública). Este login protege o ACESSO ao painel; proteger 100% os dados exige
// RLS + funções autenticadas (passo futuro).

const crypto = require('crypto');

const SESSION_HOURS = 8;

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function sign(payloadObj, secret) {
  const payload = b64url(JSON.stringify(payloadObj));
  const sig = b64url(crypto.createHmac('sha256', secret).update(payload).digest());
  return payload + '.' + sig;
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  try { return crypto.timingSafeEqual(ba, bb); } catch (e) { return false; }
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ ok: false, error: 'Method Not Allowed' }) };
  }

  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
  const SECRET = process.env.ADMIN_TOKEN_SECRET || ADMIN_PASSWORD;

  if (!ADMIN_PASSWORD) {
    console.warn('[admin-login] ADMIN_PASSWORD não configurada');
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: 'Login não configurado no servidor. Defina ADMIN_PASSWORD no Netlify.' }) };
  }

  let password = '';
  try { password = (JSON.parse(event.body || '{}').password || ''); } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'Requisição inválida.' }) };
  }

  if (!password || !safeEqual(password, ADMIN_PASSWORD)) {
    // Pequeno atraso para desacelerar tentativas de força-bruta.
    await new Promise(function (r) { setTimeout(r, 500); });
    return { statusCode: 401, body: JSON.stringify({ ok: false, error: 'Senha incorreta.' }) };
  }

  const exp = Date.now() + SESSION_HOURS * 3600 * 1000;
  const token = sign({ exp: exp }, SECRET);

  return { statusCode: 200, body: JSON.stringify({ ok: true, token: token, exp: exp }) };
};
