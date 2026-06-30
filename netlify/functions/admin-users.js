// ── admin-users — Lista de usuários cadastrados (newsletter) ──────────────────
// A tabela `newsletter` tem RLS que bloqueia leitura anônima (PII). Esta função
// lê server-side com a SUPA_SERVICE_KEY, mas SÓ devolve os dados se o requisitante
// apresentar um token de sessão de admin válido (mesmo token emitido pelo
// admin-login.js, assinado com ADMIN_TOKEN_SECRET).
//
// Env vars: SUPA_SERVICE_KEY, ADMIN_TOKEN_SECRET (ou ADMIN_PASSWORD como fallback).

const crypto = require('crypto');

const SUPA_URL = process.env.SUPA_URL || 'https://gpwmmvaetokgrzekepbk.supabase.co';
const SERVICE_KEY = process.env.SUPA_SERVICE_KEY
  || process.env.SUPABASE_SERVICE_KEY
  || process.env.SUPABASE_SERVICE_ROLE_KEY
  || process.env.SUPA_SERVICE_ROLE_KEY
  || process.env.SERVICE_ROLE_KEY
  || '';
const SECRET = process.env.ADMIN_TOKEN_SECRET || process.env.ADMIN_PASSWORD || '';

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Valida o token: assinatura HMAC confere E não expirou.
function verifyToken(token) {
  if (!token || !SECRET) return false;
  const parts = String(token).split('.');
  if (parts.length !== 2) return false;
  const expected = b64url(crypto.createHmac('sha256', SECRET).update(parts[0]).digest());
  const a = Buffer.from(parts[1]);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  let ok = false;
  try { ok = crypto.timingSafeEqual(a, b); } catch (e) { return false; }
  if (!ok) return false;
  try {
    const json = Buffer.from(parts[0].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const payload = JSON.parse(json);
    return !!payload.exp && payload.exp > Date.now();
  } catch (e) { return false; }
}

exports.handler = async function (event) {
  const h = event.headers || {};
  const token = h['x-admin-token'] || h['X-Admin-Token'] || '';

  if (!verifyToken(token)) {
    return { statusCode: 401, body: JSON.stringify({ ok: false, error: 'Não autorizado.' }) };
  }
  if (!SERVICE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: 'SUPA_SERVICE_KEY ausente no servidor.' }) };
  }

  try {
    const url = SUPA_URL + '/rest/v1/newsletter'
      + '?select=nome,email,celular,aceita_email,aceita_whatsapp,email_verificado,origem,created_at'
      + '&order=created_at.desc&limit=10000';
    const r = await fetch(url, {
      headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY, Accept: 'application/json' },
    });
    if (!r.ok) {
      const txt = await r.text();
      console.error('[admin-users] Supabase HTTP ' + r.status + ': ' + txt);
      return { statusCode: 502, body: JSON.stringify({ ok: false, error: 'Erro ao ler inscritos.' }) };
    }
    const rows = await r.json();
    return { statusCode: 200, body: JSON.stringify({ ok: true, users: rows }) };
  } catch (e) {
    console.error('[admin-users] erro: ' + e.message);
    return { statusCode: 502, body: JSON.stringify({ ok: false, error: 'Erro ao ler inscritos.' }) };
  }
};
