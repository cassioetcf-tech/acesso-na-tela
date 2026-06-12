// ── newsletter-weekly — Newsletter semanal (Resend) ──────────────────────────
// Netlify Scheduled Function: roda toda SEGUNDA às 11h UTC (08h de Brasília).
// (schedule definido em netlify.toml)
//
// Pega na tabela `filmes` os lançamentos com data DESTA semana (seg→dom) que já
// têm app de acessibilidade confirmado, monta a lista e envia por e-mail (Resend)
// para todos os inscritos com aceita_email = true. Se não houver lançamentos na
// semana, NÃO envia (evita e-mail vazio).
//
// Env vars (Netlify):
//   RESEND_API_KEY        chave do Resend
//   SUPA_SERVICE_KEY      service_role key do Supabase (lê a lista de inscritos — PII, server-side)
//   WELCOME_FROM          remetente verificado (reusa o do boas-vindas)
//   WELCOME_REPLY_TO      (opcional) e-mail de resposta

const SUPA_URL         = process.env.SUPA_URL || 'https://gpwmmvaetokgrzekepbk.supabase.co';
const SUPA_SERVICE_KEY = process.env.SUPA_SERVICE_KEY
  || process.env.SUPABASE_SERVICE_KEY
  || process.env.SUPABASE_SERVICE_ROLE_KEY
  || process.env.SUPA_SERVICE_ROLE_KEY
  || process.env.SERVICE_ROLE_KEY
  || '';
const RESEND_API_KEY   = process.env.RESEND_API_KEY || '';
const FROM             = process.env.WELCOME_FROM || 'Acesso na Tela <boasvindas@acessonatela.com>';
const REPLY_TO         = process.env.WELCOME_REPLY_TO || '';
const SITE_URL         = 'https://acessonatela.com';
const TMDB_IMG         = 'https://image.tmdb.org/t/p/w154';

function _esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function _firstName(nome) {
  if (!nome) return '';
  return String(nome).trim().split(/\s+/)[0];
}
function _unsubUrl(email) {
  return SITE_URL + '/descadastro.html?email=' + encodeURIComponent(email || '');
}
function _fmt(d) {
  return ('0' + d.getUTCDate()).slice(-2) + '/' + ('0' + (d.getUTCMonth() + 1)).slice(-2);
}

// Segunda (00:00) → domingo (23:59) da semana corrente, em UTC.
function _weekRange() {
  const now = new Date();
  const day = now.getUTCDay(); // 0=dom ... 1=seg
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() + (day === 0 ? -6 : 1 - day));
  monday.setUTCHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  sunday.setUTCHours(23, 59, 59, 999);
  return { monday, sunday };
}

const SUPA_HEADERS = {
  'apikey': SUPA_SERVICE_KEY,
  'Authorization': 'Bearer ' + SUPA_SERVICE_KEY,
  'Accept': 'application/json',
};
async function _supaGet(table, query) {
  const r = await fetch(SUPA_URL + '/rest/v1/' + table + (query ? '?' + query : ''), { headers: SUPA_HEADERS });
  if (!r.ok) throw new Error('Supabase GET ' + table + ' HTTP ' + r.status + ': ' + (await r.text()));
  return r.json();
}

// Badges de acessibilidade a partir do objeto a11y
function _badges(a11y) {
  const a = a11y || {};
  const items = [];
  if (a.ad     !== false) items.push(['AD', '#005C2E']);
  if (a.lse    !== false) items.push(['LSE', '#003D8F']);
  if (a.libras !== false) items.push(['Libras', '#3D0070']);
  return items.map(function (b) {
    return '<span style="display:inline-block;background:' + b[1] + ';color:#fff;font-size:11px;font-weight:bold;border-radius:4px;padding:2px 7px;margin:0 4px 4px 0;">' + b[0] + '</span>';
  }).join('');
}

// Card de um filme (linha com pôster + infos)
function _filmCard(f) {
  const ig     = f.ingresso_data || {};
  const titulo = _esc(ig.title || f.titulo || '');
  const poster = ig.poster || '';
  const href   = f.url_key ? (SITE_URL + '/filme.html?urlKey=' + encodeURIComponent(f.url_key)) : SITE_URL;
  const app    = f.app ? '<div style="font-size:12px;color:#D4500F;font-weight:bold;margin:2px 0 6px;">' + _esc(f.app) + '</div>' : '';
  const posterCell = poster
    ? '<td width="78" valign="top" style="padding-right:14px;"><a href="' + href + '"><img src="' + poster + '" width="70" alt="" style="display:block;border-radius:8px;border:0;"></a></td>'
    : '';
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-bottom:1px solid #EDEBE6;"><tr>' +
    posterCell +
    '<td valign="top" style="padding:14px 0;">' +
      '<a href="' + href + '" style="font-size:16px;font-weight:bold;color:#1A1A1A;text-decoration:none;">' + titulo + '</a>' +
      app +
      '<div style="margin:4px 0 8px;">' + _badges(f.a11y) + '</div>' +
      '<a href="' + href + '" style="font-size:13px;color:#D4500F;text-decoration:none;font-weight:bold;">Ver detalhes →</a>' +
    '</td>' +
  '</tr></table>';
}

function _emailHtml(nome, email, filmsHtml, label) {
  const ola = nome ? ('Olá, ' + _esc(nome) + '!') : 'Olá!';
  const unsub = _unsubUrl(email);
  return '<!DOCTYPE html><html lang="pt-BR"><body style="margin:0;padding:0;background:#F7F6F3;font-family:Arial,Helvetica,sans-serif;color:#1A1A1A;">' +
    '<div style="max-width:560px;margin:0 auto;padding:24px 16px;">' +
      '<div style="text-align:center;padding:6px 0 18px;"><a href="' + SITE_URL + '"><img src="' + SITE_URL + '/assets/logo.png" alt="Acesso na Tela" width="180" style="max-width:62%;height:auto;border:0;display:inline-block;"></a></div>' +
      '<div style="background:#D4500F;border-radius:14px 14px 0 0;padding:26px 28px 20px;">' +
        '<h1 style="margin:0;color:#fff;font-size:21px;line-height:1.25;">Lançamentos acessíveis da semana 🎬</h1>' +
        '<p style="margin:8px 0 0;color:#FFE5B0;font-size:13px;">' + label + '</p>' +
      '</div>' +
      '<div style="background:#fff;border:1px solid #E8E6E1;border-top:none;border-radius:0 0 14px 14px;padding:24px 28px;">' +
        '<p style="font-size:15px;line-height:1.6;margin:0 0 6px;">' + ola + '</p>' +
        '<p style="font-size:14px;line-height:1.6;margin:0 0 14px;color:#444;">Estes são os filmes que estreiam nesta semana com <strong>audiodescrição</strong>, <strong>legenda descritiva</strong> e <strong>Libras</strong> nos cinemas:</p>' +
        filmsHtml +
        '<p style="text-align:center;margin:24px 0 6px;"><a href="' + SITE_URL + '" style="background:#1A1A1A;color:#fff;text-decoration:none;font-weight:bold;font-size:15px;padding:13px 26px;border-radius:8px;display:inline-block;">Ver tudo no site</a></p>' +
        '<p style="font-size:13px;line-height:1.6;margin:18px 0 0;color:#777;border-top:1px solid #EDEBE6;padding-top:16px;">' +
          'Você recebe este e-mail toda segunda-feira porque se cadastrou no <a href="' + SITE_URL + '" style="color:#D4500F;">acessonatela.com</a>. ' +
          'Este é um e-mail automático — por favor, <strong>não responda</strong>. Para deixar de receber, <a href="' + unsub + '" style="color:#D4500F;">descadastre-se aqui</a>.' +
        '</p>' +
      '</div>' +
    '</div></body></html>';
}

async function _sendBatch(emails) {
  const r = await fetch('https://api.resend.com/emails/batch', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(emails),
  });
  if (!r.ok) console.error('[newsletter] Resend batch HTTP ' + r.status + ': ' + (await r.text()));
  return r.ok;
}

exports.handler = async function () {
  if (!RESEND_API_KEY)   { console.warn('[newsletter] RESEND_API_KEY ausente');   return { statusCode: 200, body: 'sem RESEND_API_KEY' }; }
  if (!SUPA_SERVICE_KEY) { console.warn('[newsletter] SUPA_SERVICE_KEY ausente'); return { statusCode: 200, body: 'sem SUPA_SERVICE_KEY' }; }

  const { monday, sunday } = _weekRange();
  const label = 'Semana de ' + _fmt(monday) + ' a ' + _fmt(sunday);

  // 1. Filmes com app confirmado e lançamento nesta semana (dados do Ingresso)
  let filmes = [];
  try {
    filmes = await _supaGet('filmes', 'app_status=eq.confirmado&select=titulo,url_key,app,a11y,ingresso_data&limit=300');
  } catch (e) { console.error('[newsletter] erro filmes: ' + e.message); return { statusCode: 200, body: 'erro filmes' }; }

  const _rd = function (f) { return (f.ingresso_data && f.ingresso_data.premiereDate) || ''; };
  const daSemana = filmes.filter(function (f) {
    const rd = _rd(f);
    if (!rd) return false;
    const d = new Date(rd);
    return !isNaN(d) && d >= monday && d <= sunday;
  }).sort(function (a, b) {
    return _rd(a).localeCompare(_rd(b));
  });

  if (!daSemana.length) {
    console.log('[newsletter] nenhum lançamento acessível nesta semana — não envia');
    return { statusCode: 200, body: 'sem lançamentos na semana' };
  }

  const filmsHtml = daSemana.map(_filmCard).join('');

  // 2. Inscritos que aceitam e-mail
  let inscritos = [];
  try {
    inscritos = await _supaGet('newsletter', 'aceita_email=eq.true&select=nome,email');
  } catch (e) { console.error('[newsletter] erro inscritos: ' + e.message); return { statusCode: 200, body: 'erro inscritos' }; }

  const vistos = {};
  const dests = inscritos.filter(function (s) {
    const e = (s.email || '').trim().toLowerCase();
    if (!e || vistos[e]) return false;
    vistos[e] = 1; s.email = e; return true;
  });

  if (!dests.length) { console.log('[newsletter] nenhum inscrito'); return { statusCode: 200, body: 'sem inscritos' }; }

  // 3. Envia em lotes de 100 (Resend batch), 1 e-mail por destinatário
  const subject = '🎬 Lançamentos acessíveis da semana — ' + label;
  let enviados = 0;
  for (let i = 0; i < dests.length; i += 100) {
    const lote = dests.slice(i, i + 100).map(function (s) {
      const msg = {
        from: FROM,
        to: [s.email],
        subject: subject,
        html: _emailHtml(_firstName(s.nome), s.email, filmsHtml, label),
        headers: { 'List-Unsubscribe': '<' + _unsubUrl(s.email) + '>' },
      };
      if (REPLY_TO) msg.reply_to = REPLY_TO;
      return msg;
    });
    const ok = await _sendBatch(lote);
    if (ok) enviados += lote.length;
  }

  const resumo = '[newsletter] ' + daSemana.length + ' filme(s) · ' + enviados + '/' + dests.length + ' e-mail(s) enviados · ' + label;
  console.log(resumo);
  return { statusCode: 200, body: JSON.stringify({ filmes: daSemana.length, enviados: enviados, destinatarios: dests.length }) };
};
