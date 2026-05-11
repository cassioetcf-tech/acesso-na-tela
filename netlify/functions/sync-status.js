// ── sync-status v2 — Discovery + Sync Engine ─────────────────────────────────
// Netlify Scheduled Function: roda diariamente às 6h UTC (netlify.toml)
//
// FASE 1 — Discovery via TMDb /movie/now_playing?region=BR
//   → todos os filmes em cartaz no Brasil, com metadados completos (poster, sinopse…)
//   → filmes novos criados no Supabase com app_status='pendente'
//   → urlKey derivado do título em português (padrão Ingresso.com)
//
// FASE 2 — Sync de status via Ingresso.com sessions
//   → sem sessões nos próximos 7 dias → move para CATALOGO
//   → breve com sessões → move para CARTAZ

const SUPA_URL    = process.env.SUPA_URL  || 'https://gpwmmvaetokgrzekepbk.supabase.co';
const SUPA_KEY    = process.env.SUPA_KEY  || 'sb_publishable_lbKSyHwh8nNINEef-0Hi5Q_oPF5qt-P';
const TMDB_TOKEN  = process.env.TMDB_TOKEN || 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiIxMzcyNWY2YTUzYzRkNmRlOWIwNmIwZTFjYjllN2Q2NyIsIm5iZiI6MTc3NTc3NDQ0Ny4yMDk5OTk4LCJzdWIiOiI2OWQ4MmFlZjFjNTc0MjQxNWY0NGEyNGUiLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.cYtmprLIfaLsEpA_YcOxIGdpfF8BffGlubFf0qQ0U1I';

const INGRESSO_BASE = 'https://api-content.ingresso.com/v0';
const INGRESSO_PART = 'locomotivadigital';
const TMDB_BASE     = 'https://api.themoviedb.org/3';

const ING_HEADERS = {
  'Accept': 'application/json',
  'User-Agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36',
  'Origin': 'https://www.ingresso.com',
  'Referer': 'https://www.ingresso.com/',
};

// Converte título em urlKey no padrão da Ingresso.com (ex: "O Velho Fusca" → "o-velho-fusca")
function titleToUrlKey(title) {
  return (title || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

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

const TMDB_HEADERS = {
  'Authorization': `Bearer ${TMDB_TOKEN}`,
  'Accept': 'application/json',
};

/**
 * Busca todos os filmes em cartaz no Brasil via TMDb /movie/now_playing?region=BR.
 * Retorna array com { tmdb_id, title, urlKey, tmdb_data } — sem chamada extra ao TMDb.
 */
async function fetchNowPlaying() {
  const seen  = new Set();
  const films = [];
  let   page  = 1;
  let   total = 1;

  do {
    try {
      const r = await fetch(
        `${TMDB_BASE}/movie/now_playing?language=pt-BR&region=BR&page=${page}`,
        { headers: TMDB_HEADERS }
      );
      if (!r.ok) { console.error('[discovery] TMDb HTTP', r.status); break; }

      const data = await r.json();
      total = Math.min(data.total_pages || 1, 5); // máximo 5 páginas (~100 filmes)

      for (const movie of (data.results || [])) {
        const title  = movie.title || movie.original_title || '';
        const urlKey = titleToUrlKey(title);
        if (!urlKey || seen.has(urlKey)) continue;
        seen.add(urlKey);
        films.push({
          tmdb_id:   movie.id,
          title,
          urlKey,
          tmdb_data: movie, // já temos os dados, sem busca extra
        });
      }
    } catch (e) {
      console.error('[discovery] erro página', page, e.message);
      break;
    }
    page++;
  } while (page <= total);

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

  // ── FASE 1: Discovery via TMDb now_playing ────────────────────────────────
  log.push('[sync] FASE 1 — Discovery via TMDb /movie/now_playing?region=BR');

  let nowPlayingFilms = [];
  try {
    nowPlayingFilms = await fetchNowPlaying();
    log.push(`[sync] TMDb retornou ${nowPlayingFilms.length} filmes em cartaz no Brasil`);
  } catch (e) {
    log.push(`[sync] ERRO ao buscar TMDb nowplaying: ${e.message} — pula fase 1`);
  }

  if (nowPlayingFilms.length > 0) {
    // Busca url_keys e tmdb_ids já no Supabase
    let existentes = [];
    try {
      existentes = await supaGet('filmes', 'select=url_key,tmdb_id&limit=500');
    } catch (e) {
      log.push(`[sync] ERRO ao buscar filmes existentes: ${e.message}`);
    }

    const keysExistentes  = new Set(existentes.map(f => f.url_key).filter(Boolean));
    const tmdbsExistentes = new Set(existentes.map(f => String(f.tmdb_id)).filter(Boolean));

    let ingressoVerified = 0;
    let ingressoSkipped  = 0;

    for (const film of nowPlayingFilms) {
      // Pula se já existe pelo urlKey ou pelo tmdb_id
      if (keysExistentes.has(film.urlKey) || tmdbsExistentes.has(String(film.tmdb_id))) continue;
      if (!film.title) continue;

      // ── Verifica se o filme existe no Ingresso.com ─────────────────────────
      // Só importa filmes que o Ingresso reconhece via url-key.
      // Isso garante que só entram filmes realmente em cartaz no Brasil segundo
      // o Ingresso (evita divergências com a lista TMDb).
      const eventId = await getEventId(film.urlKey);
      if (!eventId) {
        log.push(`SKIP  ${film.title} — urlKey "${film.urlKey}" não encontrado na Ingresso`);
        ingressoSkipped++;
        continue;
      }
      ingressoVerified++;

      try {
        const novoFilme = {
          id:           `film_${film.urlKey}`,
          titulo:       film.title,
          url_key:      film.urlKey,
          ingresso_url: `https://www.ingresso.com/filme/${film.urlKey}`,
          status:       'CARTAZ',
          app_status:   'pendente',
          app:          null,
          a11y:         { ad: false, lse: false, libras: false },
          tmdb_id:      film.tmdb_id,
          tmdb_data:    film.tmdb_data,
          created_at:   now,
          updated_at:   now,
        };

        await supaInsert(novoFilme);
        log.push(`NEW   ${film.title} (TMDb: ${film.tmdb_id}, Ingresso: ${eventId})`);
        created++;
      } catch (e) {
        log.push(`ERR   ${film.title} — ${e.message}`);
        errors++;
      }
    }

    log.push(`[sync] Ingresso check: ${ingressoVerified} verificados, ${ingressoSkipped} ignorados (sem urlKey no Ingresso)`);
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
