// ── sync-status v2 — Discovery + Sync Engine ─────────────────────────────────
// Netlify Scheduled Function: roda diariamente às 6h UTC (netlify.toml)
//
// O que faz:
//   FASE 1 — Discovery: busca todos os filmes em cartaz no Ingresso.com
//            → filmes novos são criados no Supabase com app_status='pendente'
//            → metadados (poster, sinopse, trailer) buscados automaticamente no TMDb
//   FASE 2 — Sync de status: para cada filme no Supabase (cartaz/breve)
//            → verifica sessões nos próximos 7 dias
//            → sem sessões → move para CATALOGO
//            → breve com sessões → move para CARTAZ

const SUPA_URL    = process.env.SUPA_URL  || 'https://gpwmmvaetokgrzekepbk.supabase.co';
const SUPA_KEY    = process.env.SUPA_KEY  || 'sb_publishable_lbKSyHwh8nNINEef-0Hi5Q_oPF5qt-P';
const TMDB_TOKEN  = process.env.TMDB_TOKEN || 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiIxMzcyNWY2YTUzYzRkNmRlOWIwNmIwZTFjYjllN2Q2NyIsIm5iZiI6MTc3NTc3NDQ0Ny4yMDk5OTk4LCJzdWIiOiI2OWQ4MmFlZjFjNTc0MjQxNWY0NGEyNGUiLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.cYtmprLIfaLsEpA_YcOxIGdpfF8BffGlubFf0qQ0U1I';

const INGRESSO_BASE = 'https://api-content.ingresso.com/v0';
const INGRESSO_PART = 'locomotivadigital';
const TMDB_BASE     = 'https://api.themoviedb.org/3';

// Cidades para varrer filmes em cartaz (SP, RJ, BH, Curitiba, Porto Alegre, Fortaleza)
const INGRESSO_CITIES = ['1011', '9', '1', '2', '5', '3'];

const ING_HEADERS = {
  'Accept': 'application/json',
  'User-Agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36',
  'Origin': 'https://www.ingresso.com',
  'Referer': 'https://www.ingresso.com/',
};

// ── Supabase ──────────────────────────────────────────────────────────────────

const SUPA_HEADERS = {
  'apikey': SUPA_KEY,
  'Authorization': `Bearer ${SUPA_KEY}`,
  'Content-Type': 'application/json',
};

async function supaGet(table, query) {
  const url = `${SUPA_URL}/rest/v1/${table}${query ? '?' + query : ''}`;
  const r = await fetch(url, { headers: { ...SUPA_HEADERS, 'Prefer': 'return=representation' } });
  if (!r.ok) throw new Error(`Supabase GET ${table} HTTP ${r.status}: ${await r.text()}`);
  return r.json();
}

async function supaInsert(body) {
  const url = `${SUPA_URL}/rest/v1/filmes`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { ...SUPA_HEADERS, 'Prefer': 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Supabase INSERT filmes HTTP ${r.status}: ${await r.text()}`);
}

async function supaPatch(id, body) {
  const url = `${SUPA_URL}/rest/v1/filmes?id=eq.${encodeURIComponent(id)}`;
  const r = await fetch(url, {
    method: 'PATCH',
    headers: { ...SUPA_HEADERS, 'Prefer': 'return=minimal' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Supabase PATCH ${id} HTTP ${r.status}`);
}

// ── TMDb ──────────────────────────────────────────────────────────────────────

async function tmdbSearch(title) {
  try {
    const url = `${TMDB_BASE}/search/movie?query=${encodeURIComponent(title)}&language=pt-BR&region=BR`;
    const r = await fetch(url, {
      headers: { 'Authorization': `Bearer ${TMDB_TOKEN}`, 'Accept': 'application/json' },
    });
    if (!r.ok) return null;
    const data = await r.json();
    const results = data.results || [];
    if (!results.length) return null;

    // Tenta match exato de título primeiro
    const norm = title.toLowerCase().trim();
    const exact = results.find(x =>
      (x.title || '').toLowerCase().trim() === norm ||
      (x.original_title || '').toLowerCase().trim() === norm
    );
    if (exact) return exact;

    // Melhor resultado: tem poster e popularidade mínima
    return results.find(x => x.poster_path && x.popularity > 0.5) || results[0] || null;
  } catch (e) {
    return null;
  }
}

// ── Ingresso.com ──────────────────────────────────────────────────────────────

async function fetchNowPlaying() {
  const seen  = new Set();
  const films = [];

  const fetches = INGRESSO_CITIES.map(city =>
    fetch(`${INGRESSO_BASE}/templates/nowplaying/city/${city}/partnership/${INGRESSO_PART}`, {
      headers: ING_HEADERS,
    })
      .then(r => r.ok ? r.json() : [])
      .catch(() => [])
  );

  const results = await Promise.all(fetches);

  for (const data of results) {
    // A API pode retornar array direto ou objeto com .items / .events
    const list = Array.isArray(data) ? data : (data.items || data.events || []);
    for (const ev of list) {
      const key = ev.urlKey || ev.url_key || '';
      if (!key || seen.has(key)) continue;
      seen.add(key);
      films.push({
        ingressoId: ev.id || key,
        title:      ev.title || ev.originalTitle || '',
        urlKey:     key,
      });
    }
  }

  return films;
}

async function getEventId(urlKey) {
  try {
    const url = `${INGRESSO_BASE}/events/url-key/${urlKey}/partnership/${INGRESSO_PART}`;
    const r = await fetch(url, { headers: ING_HEADERS });
    const data = await r.json();
    return (data && data.id) ? data.id : null;
  } catch (e) { return null; }
}

async function checkHasSessions(eventId) {
  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const date = d.toISOString().slice(0, 10);
    try {
      const url = `${INGRESSO_BASE}/sessions/city/1/event/${eventId}/partnership/${INGRESSO_PART}` +
                  `?date=${date}&includeOperationPolicies=false`;
      const r    = await fetch(url, { headers: ING_HEADERS });
      const data = await r.json();
      if (Array.isArray(data) && data.length > 0) return true;
      if (data && Array.isArray(data.theaters) && data.theaters.length > 0) return true;
    } catch (e) { /* tenta próxima data */ }
  }
  return false;
}

// ── Handler ───────────────────────────────────────────────────────────────────

exports.handler = async function () {
  const log      = [];
  const now      = new Date().toISOString();
  let   created  = 0;
  let   updated  = 0;
  let   errors   = 0;

  // ── FASE 1: Discovery ──────────────────────────────────────────────────────
  log.push('[sync] FASE 1 — Discovery de filmes no Ingresso.com');

  let ingressoFilms = [];
  try {
    ingressoFilms = await fetchNowPlaying();
    log.push(`[sync] Ingresso retornou ${ingressoFilms.length} filmes`);
  } catch (e) {
    log.push(`[sync] ERRO ao buscar Ingresso: ${e.message} — pula fase 1`);
  }

  if (ingressoFilms.length > 0) {
    // Busca url_keys já cadastrados no Supabase
    let existentes = [];
    try {
      existentes = await supaGet('filmes', 'select=url_key&limit=500');
    } catch (e) {
      log.push(`[sync] ERRO ao buscar url_keys existentes: ${e.message}`);
    }

    const keysExistentes = new Set(existentes.map(f => f.url_key).filter(Boolean));

    // Insere apenas os filmes novos
    for (const film of ingressoFilms) {
      if (!film.urlKey || keysExistentes.has(film.urlKey)) continue;
      if (!film.title) { log.push(`SKIP  ${film.urlKey} — sem título`); continue; }

      try {
        // Busca dados no TMDb
        const tmdb = await tmdbSearch(film.title);

        const novoFilme = {
          id:           `film_${film.urlKey}`,
          titulo:       film.title,
          url_key:      film.urlKey,
          ingresso_url: `https://www.ingresso.com/filme/${film.urlKey}`,
          status:       'CARTAZ',
          app_status:   'pendente',
          app:          null,
          a11y:         { ad: false, lse: false, libras: false },
          tmdb_id:      tmdb ? tmdb.id   : null,
          tmdb_data:    tmdb ? tmdb      : null,
          created_at:   now,
          updated_at:   now,
        };

        await supaInsert(novoFilme);
        log.push(`NEW   ${film.title}${tmdb ? ` (TMDb: ${tmdb.id})` : ' (sem TMDb)'}`);
        created++;

        // Pequena pausa para não sobrecarregar TMDb
        await new Promise(res => setTimeout(res, 200));
      } catch (e) {
        log.push(`ERR   ${film.title} — ${e.message}`);
        errors++;
      }
    }
  }

  log.push(`[sync] Fase 1 concluída: ${created} filme(s) novo(s)`);

  // ── FASE 2: Sync de status ─────────────────────────────────────────────────
  log.push('[sync] FASE 2 — Sync de status (cartaz/catalogo)');

  let filmes = [];
  try {
    filmes = await supaGet(
      'filmes',
      'or=(status.ilike.cartaz,status.ilike.breve)&select=id,titulo,url_key,status&order=titulo&limit=500'
    );
  } catch (e) {
    log.push(`[sync] ERRO ao buscar filmes para sync: ${e.message}`);
    return { statusCode: 500, body: JSON.stringify({ error: e.message, log }) };
  }

  log.push(`[sync] ${filmes.length} filme(s) em cartaz/breve para verificar`);

  for (const f of filmes) {
    const status = (f.status || '').toLowerCase();

    if (!f.url_key) {
      log.push(`SKIP  ${f.titulo} — sem url_key`);
      continue;
    }

    try {
      const eventId = await getEventId(f.url_key);

      if (!eventId) {
        if (status === 'cartaz') {
          await supaPatch(f.id, { status: 'CATALOGO', updated_at: now });
          log.push(`→CAT  ${f.titulo} — sem evento na Ingresso`);
          updated++;
        } else {
          log.push(`SKIP  ${f.titulo} — sem evento (breve, aguardando)`);
        }
        continue;
      }

      const hasSessions = await checkHasSessions(eventId);

      if (status === 'cartaz' && !hasSessions) {
        await supaPatch(f.id, { status: 'CATALOGO', updated_at: now });
        log.push(`→CAT  ${f.titulo} — sem sessões (7 dias)`);
        updated++;
      } else if (status === 'breve' && hasSessions) {
        await supaPatch(f.id, { status: 'CARTAZ', updated_at: now });
        log.push(`→CAR  ${f.titulo} — sessões encontradas`);
        updated++;
      } else {
        log.push(`OK    ${f.titulo} — status correto (${status})`);
      }
    } catch (e) {
      log.push(`ERR   ${f.titulo} — ${e.message}`);
      errors++;
    }
  }

  const summary = `[sync] concluído: ${created} novo(s), ${updated} atualizado(s), ${errors} erro(s)`;
  log.push(summary);
  console.log(log.join('\n'));

  return {
    statusCode: 200,
    body: JSON.stringify({ created, updated, errors, total: filmes.length, log }),
  };
};
