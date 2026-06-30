// ── contato — Formulário de contato (Resend) ─────────────────────────────────
// Recebe o POST do formulário de contato.html e envia um e-mail via Resend para
// o endereço de destino (CONTACT_TO). O reply-to é o e-mail de quem escreveu,
// para que a resposta vá direto à pessoa.
//
// Variáveis de ambiente (Netlify → Site settings → Environment variables):
//   RESEND_API_KEY   (obrigatória) — chave da API do Resend
//   WELCOME_FROM     remetente verificado, ex: "Acesso na Tela <boasvindas@acessonatela.com>"
//   CONTACT_TO       (opcional) destino dos contatos — default: acessonatelaetc@gmail.com

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const FROM           = process.env.WELCOME_FROM || 'Acesso na Tela <boasvindas@acessonatela.com>';
// CONTACT_TO aceita múltiplos endereços separados por vírgula (env var opcional).
const TO             = (process.env.CONTACT_TO || 'acessonatelaetc@gmail.com')
  .split(',').map(function (s) { return s.trim(); }).filter(Boolean);
const SITE_URL       = 'https://acessonatela.com';

function _esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _validEmail(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '').trim());
}

function _emailHtml(nome, email, celular, mensagem) {
  return '<!DOCTYPE html><html lang="pt-BR"><body style="margin:0;padding:0;background:#F7F6F3;font-family:Arial,Helvetica,sans-serif;color:#1A1A1A;">' +
    '<div style="max-width:560px;margin:0 auto;padding:24px 16px;">' +
      '<div style="background:#CC4A0D;border-radius:14px 14px 0 0;padding:22px 28px;">' +
        '<h1 style="margin:0;color:#fff;font-size:19px;line-height:1.3;">Novo contato pelo site 📩</h1>' +
      '</div>' +
      '<div style="background:#fff;border:1px solid #E8E6E1;border-top:none;border-radius:0 0 14px 14px;padding:24px 28px;">' +
        '<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;font-size:14px;line-height:1.6;">' +
          '<tr><td style="padding:4px 0;color:#777;width:90px;">Nome</td><td style="padding:4px 0;font-weight:bold;">' + _esc(nome) + '</td></tr>' +
          '<tr><td style="padding:4px 0;color:#777;">E-mail</td><td style="padding:4px 0;"><a href="mailto:' + _esc(email) + '" style="color:#CC4A0D;">' + _esc(email) + '</a></td></tr>' +
          (celular ? '<tr><td style="padding:4px 0;color:#777;">Celular</td><td style="padding:4px 0;">' + _esc(celular) + '</td></tr>' : '') +
        '</table>' +
        '<p style="font-size:13px;color:#777;margin:18px 0 6px;border-top:1px solid #EDEBE6;padding-top:16px;">Mensagem</p>' +
        '<p style="font-size:15px;line-height:1.7;margin:0;white-space:pre-wrap;">' + _esc(mensagem) + '</p>' +
        '<p style="font-size:12px;color:#999;margin:20px 0 0;border-top:1px solid #EDEBE6;padding-top:14px;">' +
          'Enviado pelo formulário de contato do <a href="' + SITE_URL + '" style="color:#CC4A0D;">acessonatela.com</a>. ' +
          'Para responder, basta usar o botão de responder — a resposta vai direto para quem escreveu.' +
        '</p>' +
      '</div>' +
    '</div></body></html>';
}

function _emailText(nome, email, celular, mensagem) {
  return 'Novo contato pelo site\n\n' +
    'Nome: ' + nome + '\n' +
    'E-mail: ' + email + '\n' +
    (celular ? 'Celular: ' + celular + '\n' : '') +
    '\nMensagem:\n' + mensagem + '\n\n' +
    '— Enviado pelo formulário de contato do acessonatela.com';
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let payload = {};
  try { payload = JSON.parse(event.body || '{}'); } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'JSON inválido' }) };
  }

  // Honeypot anti-spam: se o campo oculto vier preenchido, é bot — finge sucesso.
  if ((payload.bot_field || '').trim()) {
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  }

  const nome     = String(payload.nome     || '').trim().slice(0, 120);
  const email    = String(payload.email    || '').trim().slice(0, 160);
  const celular  = String(payload.celular  || '').trim().slice(0, 40);
  const mensagem = String(payload.mensagem || '').trim().slice(0, 4000);

  if (!nome)            return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'Informe seu nome.' }) };
  if (!_validEmail(email)) return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'E-mail inválido.' }) };
  if (!mensagem)        return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'Escreva uma mensagem.' }) };

  if (!RESEND_API_KEY) {
    console.warn('[contato] RESEND_API_KEY ausente — e-mail não enviado');
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: 'Configuração de e-mail ausente.' }) };
  }

  const body = {
    from:     FROM,
    to:       TO,
    reply_to: email,
    subject:  'Novo contato pelo site — ' + nome,
    html:     _emailHtml(nome, email, celular, mensagem),
    text:     _emailText(nome, email, celular, mensagem),
  };

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const txt = await r.text();
    if (!r.ok) {
      console.error('[contato] Resend HTTP ' + r.status + ': ' + txt);
      return { statusCode: 502, body: JSON.stringify({ ok: false, error: 'Não foi possível enviar agora. Tente mais tarde.' }) };
    }
    console.log('[contato] enviado de ' + email + ' para ' + TO);
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    console.error('[contato] erro: ' + e.message);
    return { statusCode: 502, body: JSON.stringify({ ok: false, error: 'Erro ao enviar. Tente mais tarde.' }) };
  }
};
