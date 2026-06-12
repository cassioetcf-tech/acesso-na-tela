// ── welcome — E-mail de boas-vindas (Resend) ─────────────────────────────────
// Acionada pelo Database Webhook do Supabase no INSERT da tabela `newsletter`
// (ou seja, só em CADASTRO NOVO — upsert que atualiza não dispara INSERT).
//
// Envia o e-mail de boas-vindas via Resend, respeitando o consentimento
// (aceita_email). NÃO envia WhatsApp (fase futura).
//
// Variáveis de ambiente (Netlify → Site settings → Environment variables):
//   RESEND_API_KEY        (obrigatória) — chave da API do Resend
//   WELCOME_FROM          remetente verificado, ex: "Acesso na Tela <boasvindas@acessonatela.com>"
//   WELCOME_REPLY_TO      (opcional) e-mail para respostas, ex: cassio@etcfilmes.com.br
//   WELCOME_WEBHOOK_SECRET (recomendada) — segredo conferido contra o header do webhook

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const FROM           = process.env.WELCOME_FROM || 'Acesso na Tela <boasvindas@acessonatela.com>';
const REPLY_TO       = process.env.WELCOME_REPLY_TO || '';
const WEBHOOK_SECRET = process.env.WELCOME_WEBHOOK_SECRET || '';
const SITE_URL       = 'https://acessonatela.com';

function _firstName(nome) {
  if (!nome) return '';
  return String(nome).trim().split(/\s+/)[0];
}

function _unsubUrl(email) {
  return SITE_URL + '/descadastro.html?email=' + encodeURIComponent(email || '');
}

function _emailHtml(nome, email) {
  const ola = nome ? `Olá, ${nome}!` : 'Olá!';
  const unsub = _unsubUrl(email);
  return `<!DOCTYPE html>
<html lang="pt-BR">
<body style="margin:0;padding:0;background:#F7F6F3;font-family:Arial,Helvetica,sans-serif;color:#1A1A1A;">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px;">
    <div style="text-align:center;padding:6px 0 18px;">
      <a href="${SITE_URL}"><img src="${SITE_URL}/assets/logo.png" alt="Acesso na Tela" width="180" style="max-width:62%;height:auto;border:0;display:inline-block;"></a>
    </div>
    <div style="background:#D4500F;border-radius:14px 14px 0 0;padding:28px 28px 22px;">
      <h1 style="margin:0;color:#ffffff;font-size:22px;line-height:1.25;">Bem-vindo(a) ao Acesso na Tela 🎬</h1>
    </div>
    <div style="background:#ffffff;border:1px solid #E8E6E1;border-top:none;border-radius:0 0 14px 14px;padding:28px;">
      <p style="font-size:16px;line-height:1.6;margin:0 0 16px;">${ola}</p>
      <p style="font-size:15px;line-height:1.7;margin:0 0 16px;color:#444;">
        Que bom ter você por aqui! O <strong>Acesso na Tela</strong> é uma iniciativa sem fins lucrativos
        que reúne, num só lugar, os filmes com recursos de acessibilidade nos cinemas —
        <strong>audiodescrição</strong>, <strong>legenda descritiva</strong> e <strong>Libras</strong> —
        e os aplicativos que oferecem esses recursos.
      </p>
      <p style="font-size:15px;line-height:1.7;margin:0 0 16px;color:#444;">
        A partir de agora, <strong>toda segunda-feira</strong> você recebe um e-mail com os lançamentos da semana
        que têm audiodescrição, legenda descritiva e Libras nos cinemas. Você também pode compartilhar sua
        experiência nas páginas dos filmes — sua opinião ajuda a melhorar a acessibilidade para toda a comunidade.
      </p>
      <p style="text-align:center;margin:26px 0 22px;">
        <a href="${SITE_URL}" style="background:#1A1A1A;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;padding:13px 26px;border-radius:8px;display:inline-block;">Ver filmes em cartaz</a>
      </p>
      <p style="font-size:13px;line-height:1.6;margin:0;color:#777;border-top:1px solid #EDEBE6;padding-top:16px;">
        Você recebeu este e-mail porque se cadastrou no <a href="${SITE_URL}" style="color:#D4500F;">acessonatela.com</a>.
        Este é um e-mail automático — por favor, <strong>não responda</strong>.
        Para deixar de receber, <a href="${unsub}" style="color:#D4500F;">descadastre-se aqui</a>.
      </p>
      <p style="font-size:13px;line-height:1.5;margin:14px 0 0;color:#999;font-style:italic;">
        “Nada sobre nós, sem nós.”
      </p>
    </div>
  </div>
</body>
</html>`;
}

function _emailText(nome, email) {
  const ola = nome ? `Olá, ${nome}!` : 'Olá!';
  return ola + '\n\n' +
    'Que bom ter você por aqui! O Acesso na Tela é uma iniciativa sem fins lucrativos que reúne, ' +
    'num só lugar, os filmes com recursos de acessibilidade nos cinemas — audiodescrição, legenda ' +
    'descritiva e Libras — e os aplicativos que oferecem esses recursos.\n\n' +
    'A partir de agora, toda segunda-feira você recebe um e-mail com os lançamentos da semana que têm ' +
    'audiodescrição, legenda descritiva e Libras nos cinemas. Você também pode compartilhar sua experiência nas páginas dos filmes.\n\n' +
    'Ver filmes em cartaz: ' + SITE_URL + '\n\n' +
    'Você recebeu este e-mail porque se cadastrou no acessonatela.com. ' +
    'Este é um e-mail automático — por favor, não responda. ' +
    'Para deixar de receber, acesse: ' + _unsubUrl(email) + '\n\n' +
    '“Nada sobre nós, sem nós.”';
}

exports.handler = async function (event) {
  // Só POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // Validação do segredo do webhook (se configurado)
  if (WEBHOOK_SECRET) {
    const h = event.headers || {};
    const got = h['x-webhook-secret'] || h['X-Webhook-Secret'] || '';
    if (got !== WEBHOOK_SECRET) {
      console.warn('[welcome] segredo do webhook inválido');
      return { statusCode: 401, body: 'Unauthorized' };
    }
  }

  let payload = {};
  try { payload = JSON.parse(event.body || '{}'); } catch (e) {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  // Webhook do Supabase: { type, table, record, old_record, schema }
  const record = payload.record || payload || {};
  const tipo   = payload.type || 'INSERT';

  if (tipo !== 'INSERT') {
    return { statusCode: 200, body: 'ignorado (não é INSERT)' };
  }

  const email = (record.email || '').trim();
  const nome  = _firstName(record.nome);
  const aceitaEmail = record.aceita_email !== false; // default true

  if (!email) return { statusCode: 200, body: 'sem e-mail' };
  if (!aceitaEmail) {
    console.log('[welcome] ' + email + ' não aceitou e-mail — não enviado');
    return { statusCode: 200, body: 'sem consentimento de e-mail' };
  }

  if (!RESEND_API_KEY) {
    console.warn('[welcome] RESEND_API_KEY ausente — e-mail não enviado');
    return { statusCode: 200, body: 'RESEND_API_KEY ausente' };
  }

  const body = {
    from:    FROM,
    to:      [email],
    subject: 'Bem-vindo(a) ao Acesso na Tela 🎬',
    html:    _emailHtml(nome, email),
    text:    _emailText(nome, email),
  };
  if (REPLY_TO) body.reply_to = REPLY_TO;

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + RESEND_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const txt = await r.text();
    if (!r.ok) {
      console.error('[welcome] Resend HTTP ' + r.status + ': ' + txt);
      return { statusCode: 200, body: 'falha no envio (logada)' };
    }
    console.log('[welcome] enviado para ' + email);
    return { statusCode: 200, body: 'enviado' };
  } catch (e) {
    console.error('[welcome] erro: ' + e.message);
    return { statusCode: 200, body: 'erro (logado)' };
  }
};
