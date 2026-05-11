// Netlify Scheduled Function — sync-status
// Roda diariamente às 6h UTC (configurado em netlify.toml).
// Para cada filme em cartaz/breve:
//   - Consulta Ingresso.com (próximos 7 dias)
//   - cartaz sem sessões  → CATALOGO
//   - breve com sessões   → CARTAZ
// Filmes sem tmdb_id nunca aparecem no público (filtro nas queries do frontend).

const SUPA_URL     = process.env.SUPA_URL || 'https://gpwmmvaetokgrzekepbk.supabase.co';
const SUPA_KEY     = process.env.SUPA_KEY || 'sb_publishable_lbKSyHwh8nNINEef-0Hi5Q_oPF5qt-P';
const INGRESSO_BASE = 'https://api-content.ingresso.com/v0';
const PARTNERSHIP   = 'locomotivadigital';

const INGRESSO_HEADERS = {
  'Accept': 'application/json',
  'User-Agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36',
  'Origin': 'https://www.ingresso.com',
  'Referer': 'https://www.ingresso.com/',
};

// ── Supabase helpers ──────────────────────────────────────────────────────────

async function supaGet(table, query) {
  const url = `${SUPA_URL}/rest/v1/${table}${query ? '?' + query : ''}`;
  const r = await fetch(url, {
    headers: {
      'apikey': SUPA_KEY,
      'Authorization': `Bearer ${SUPA_KEY}`,
      'Accept': 'application/json',
    },
  });
  if (!r.ok) throw new Error(`Supabase GET ${table} HTTP ${r.status}`);
  return r.json();
}

async function supaPatch(id, body) {
  const url = `${SUPA_URL}/rest/v1/filmes?id=eq.${encodeURIComponent(id)}`;
  const r = await fetch(url, {
    method: 'PATCH',
    headers: {
      'apikey': SUPA_KEY,
      'Authorization': `Bearer ${SUPA_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Supabase PATCH filmes/${id} HTTP ${r.status}`);
}

// ── Ingresso.com helpers ──────────────────────────────────────────────────────

async function getEventId(urlKey) {
  const url = `${INGRESSO_BASE}/events/url-key/${urlKey}/partnership/${PARTNERSHIP}`;
  try {
    const r = await fetch(url, { headers: INGRESSO_HEADERS });
    const data = await r.json();
    return (data && data.id) ? data.id : null;
  } catch (e) {
    return null;
  }
}

async function checkHasSessions(eventId) {
  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const date = d.toISOString().slice(0, 10);
    try {
      const url = `${INGRESSO_BASE}/sessions/city/1/event/${eventId}/partnership/${PARTNERSHIP}` +
                  `?date=${date}&includeOperationPolicies=false`;
      const r    = await fetch(url, { headers: INGRESSO_HEADERS });
      const data = await r.json();
      if (Array.isArray(data) && data.length > 0) return true;
      if (data && Array.isArray(data.theaters) && data.theaters.length > 0) return true;
    } catch (e) { /* tenta próxima data */ }
  }
  return false;
}

// ── Handler ───────────────────────────────────────────────────────────────────

exports.handler = async function () {
  const log     = [];
  let   changed = 0;
  let   errors  = 0;

  // Busca todos os filmes em cartaz ou em breve
  let filmes;
  try {
    filmes = await supaGet(
      'filmes',
      'or=(status.ilike.cartaz,status.ilike.breve)&order=titulo'
    );
  } catch (e) {
    console.error('[sync-status] Erro ao buscar filmes:', e.message);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }

  log.push(`[sync-status] ${filmes.length} filmes para verificar`);

  for (const f of filmes) {
    const status = (f.status || '').toLowerCase();

    // Sem url_key: não tem como verificar sessões — pula
    if (!f.url_key) {
      log.push(`SKIP  ${f.titulo} — sem url_key`);
      continue;
    }

    try {
      const eventId = await getEventId(f.url_key);

      if (!eventId) {
        // Evento não encontrado na Ingresso → sai de cartaz
        if (status === 'cartaz') {
          await supaPatch(f.id, { status: 'CATALOGO', updated_at: new Date().toISOString() });
          log.push(`→CAT  ${f.titulo} — sem evento na Ingresso`);
          changed++;
        } else {
          log.push(`SKIP  ${f.titulo} — sem evento (breve, aguardando)`);
        }
        continue;
      }

      const sessions = await checkHasSessions(eventId);

      if (status === 'cartaz' && !sessions) {
        await supaPatch(f.id, { status: 'CATALOGO', updated_at: new Date().toISOString() });
        log.push(`→CAT  ${f.titulo} — sem sessões nos próximos 7 dias`);
        changed++;
      } else if (status === 'breve' && sessions) {
        await supaPatch(f.id, { status: 'CARTAZ', updated_at: new Date().toISOString() });
        log.push(`→CAR  ${f.titulo} — sessões encontradas`);
        changed++;
      } else {
        log.push(`OK    ${f.titulo} — status correto (${status})`);
      }

    } catch (e) {
      log.push(`ERR   ${f.titulo} — ${e.message}`);
      errors++;
    }
  }

  const summary = `[sync-status] concluído: ${changed} alteração(ões), ${errors} erro(s)`;
  log.push(summary);
  console.log(log.join('\n'));

  return {
    statusCode: 200,
    body: JSON.stringify({ changed, errors, total: filmes.length, log }),
  };
};
