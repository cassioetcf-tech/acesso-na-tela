// ── sync-status v3 — Discovery + Sync Engine ─────────────────────────────────
// Netlify Scheduled Function: roda diariamente às 6h UTC (netlify.toml)
//
// FASE 1 — Ingresso: descoberta + verificação de sessões
//   → GET /v0/events/city/1/partnership/locomotivadigital — lista oficial do Ingresso
//   → filmes novos inseridos SEM tmdb_data (enriquecidos na Fase 2)
//   → usa isComingSoon para definir status inicial (CARTAZ ou BREVE)
//   → filmes já cadastrados em cartaz/breve: verifica sessões (cartaz ↔ catálogo)
//
// FASE 2 — TMDb: enriquecimento de dados
//   → filmes em cartaz sem tmdb_data → busca por título → atualiza tmdb_id + tmdb_data
//
// FASE 3 — Apps: auto-classificação
//   → scrape CineAcessivel (MovieReading) + GoMAV (MLOAD) + PingPlay
//   → cruza com filmes pendentes → atualiza app/app_status/a11y

const SUPA_URL    = process.env.SUPA_URL  || 'https://gpwmmvaetokgrzekepbk.supabase.co';
const SUPA_KEY    = process.env.SUPA_KEY  || 'sb_publishable_lbKSyHwh8nNINEef-0Hi5Q_oPF5qt-P';
const TMDB_TOKEN  = process.env.TMDB_TOKEN || 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiIxMzcyNWY2YTUzYzRkNmRlOWIwNmIwZTFjYjllN2Q2NyIsIm5iZiI6MTc3NTc3NDQ0Ny4yMDk5OTk4LCJzdWIiOiI2OWQ4MmFlZjFjNTc0MjQxNWY0NGEyNGUiLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.cYtmprLIfaLsEpA_YcOxIGdpfF8BffGlubFf0qQ0U1I';

const INGRESSO_BASE = 'https://api-content.ingresso.com/v0';
const INGRESSO_PART = 'locomotivadigital';
const TMDB_BASE     = 'https://api.themoviedb.org/3'; // usado apenas na Fase 2 (enriquecimento)

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

const TMDB_HEADERS = {
  'Authorization': `Bearer ${TMDB_TOKEN}`,
  'Accept': 'application/json',
};

/**
 * Busca filmes em cartaz/em breve diretamente do Ingresso.com.
 * GET /v0/events/city/1/partnership/locomotivadigital
 * Retorna array com { title, urlKey, isComingSoon } — sem chamada extra ao TMDb.
 * tmdb_data será preenchido na Fase 2.
 */
async function fetchIngressoMovies() {
  const r = await fetch(
    `${INGRESSO_BASE}/events/city/1/partnership/${INGRESSO_PART}`,
    { headers: ING_HEADERS }
  );
  if (!r.ok) throw new Error(`Ingresso listing HTTP ${r.status}`);
  const data  = await r.json();
  const items = Array.isArray(data.items) ? data.items : [];

  return items
    .filter(m => (m.type || '').toLowerCase() === 'filme')
    .map(m => ({
      title:        m.title        || '',
      urlKey:       m.urlKey       || '',
      isComingSoon: !!m.isComingSoon,
    }))
    .filter(m => m.title && m.urlKey);
}

/**
 * Busca filme por título no TMDb. Retorna array de resultados.
 */
async function searchMovie(title) {
  try {
    const r = await fetch(
      `${TMDB_BASE}/search/movie?language=pt-BR&query=${encodeURIComponent(title)}&page=1`,
      { headers: TMDB_HEADERS }
    );
    if (!r.ok) return [];
    const data = await r.json();
    return data.results || [];
  } catch (e) { return []; }
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

// ── Normalização de títulos ───────────────────────────────────────────────────
// Nível 1 — normT: remove acentos, pontuação, espaços extras, lowercase
// Nível 2 — normFuzzy: além disso, strip artigo inicial (O/A/Os/As/Um/Uma/The/An)
// titlesMatch: true se qualquer nível bater

function normT(t) {
  return (t || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ').trim();
}

function normFuzzy(t) {
  return normT(t).replace(/^(o|a|os|as|um|uma|the|an)\s+/, '');
}

function titlesMatch(a, b) {
  if (!a || !b) return false;
  const na = normT(a), nb = normT(b);
  if (na === nb) return true;
  const fa = normFuzzy(a), fb = normFuzzy(b);
  return fa.length >= 4 && fa === fb;
}

// ── Handler ───────────────────────────────────────────────────────────────────

exports.handler = async function () {
  const log            = [];
  const now            = new Date().toISOString();
  let   created        = 0;
  let   updated        = 0;
  let   enriched       = 0;
  let   autoClassified = 0;
  let   errors         = 0;

  // ── FASE 1: Ingresso — Descoberta + Verificação de sessões ───────────────────
  log.push('[sync] FASE 1 — Ingresso: descoberta + verificação de sessões');

  // 1a. Busca lista diretamente do Ingresso.com (fonte oficial)
  let ingressoFilms = [];
  try {
    ingressoFilms = await fetchIngressoMovies();
    log.push(`[sync] Ingresso retornou ${ingressoFilms.length} filmes`);
  } catch (e) {
    log.push(`[sync] ERRO ao buscar Ingresso: ${e.message} — pula descoberta`);
  }

  // 1b. Insere os filmes que ainda não estão na base
  // Não precisa verificar no Ingresso — a lista JÁ veio de lá
  if (ingressoFilms.length > 0) {
    let existentes = [];
    try {
      existentes = await supaGet('filmes', 'select=url_key&limit=500');
    } catch (e) {
      log.push(`[sync] ERRO ao buscar filmes existentes: ${e.message}`);
    }

    const keysExistentes = new Set(existentes.map(f => f.url_key).filter(Boolean));
    const novos = ingressoFilms.filter(f => f.urlKey && !keysExistentes.has(f.urlKey));

    log.push(`[sync] ${novos.length} filme(s) novo(s) para adicionar`);

    for (const film of novos) {
      try {
        const statusInicial = film.isComingSoon ? 'BREVE' : 'CARTAZ';
        // Inserido SEM tmdb_data — enriquecido na Fase 2
        await supaInsert({
          id:           `film_${film.urlKey}`,
          titulo:       film.title,
          url_key:      film.urlKey,
          ingresso_url: `https://www.ingresso.com/filme/${film.urlKey}`,
          status:       statusInicial,
          app_status:   'pendente',
          app:          null,
          a11y:         { ad: false, lse: false, libras: false },
          tmdb_id:      null,
          tmdb_data:    null,
          created_at:   now,
          updated_at:   now,
        });
        log.push(`NEW   ${film.title} [${statusInicial}]`);
        created++;
      } catch (e) {
        log.push(`ERR   ${film.title} — ${e.message}`);
        errors++;
      }
    }
  }

  log.push(`[sync] Fase 1a concluída: ${created} filme(s) novo(s)`);

  // 1c. Verifica sessões para filmes já em cartaz/breve
  let filmesAtivos = [];
  try {
    filmesAtivos = await supaGet(
      'filmes',
      'or=(status.ilike.cartaz,status.ilike.breve)&select=id,titulo,url_key,status&order=titulo&limit=500'
    );
  } catch (e) {
    log.push(`[sync] ERRO ao buscar filmes para verificação de sessões: ${e.message}`);
  }

  log.push(`[sync] ${filmesAtivos.length} filme(s) em cartaz/breve para verificar sessões`);

  for (const f of filmesAtivos) {
    const status = (f.status || '').toLowerCase();
    if (!f.url_key) { log.push(`SKIP  ${f.titulo} — sem url_key`); continue; }

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

  log.push(`[sync] Fase 1 concluída: ${created} novo(s), ${updated} sessão/status atualizado(s)`);

  // ── FASE 2: TMDb — Enriquecimento de dados ────────────────────────────────────
  log.push('[sync] FASE 2 — TMDb: buscando poster e dados dos filmes sem tmdb_data');

  let todosFilmes = [];
  try {
    todosFilmes = await supaGet('filmes', 'select=id,titulo,status,tmdb_id,tmdb_data&limit=500');
  } catch (e) {
    log.push(`[sync] ERRO ao buscar filmes para enriquecimento: ${e.message}`);
  }

  const semDados = todosFilmes.filter(f =>
    !f.tmdb_data && (f.status || '').toLowerCase() === 'cartaz'
  );

  log.push(`[sync] ${semDados.length} filme(s) em cartaz sem tmdb_data`);

  for (const f of semDados) {
    try {
      const results = await searchMovie(f.titulo || '');
      let   match   = results.find(r =>
        titlesMatch(r.title, f.titulo) || titlesMatch(r.original_title, f.titulo)
      );
      if (!match && results[0] && results[0].popularity > 1 && results[0].poster_path) match = results[0];

      if (match) {
        await supaPatch(f.id, { tmdb_id: match.id, tmdb_data: match, updated_at: now });
        log.push(`TMDB  ${f.titulo} — poster e dados atualizados (TMDb: ${match.id})`);
        enriched++;
      } else {
        log.push(`SKIP  ${f.titulo} — não encontrado no TMDb`);
      }
    } catch (e) {
      log.push(`ERR   ${f.titulo} — TMDb: ${e.message}`);
      errors++;
    }
  }

  log.push(`[sync] Fase 2 concluída: ${enriched} filme(s) enriquecido(s)`);

  // ── FASE 3: Auto-classificação por app ────────────────────────────────────────
  log.push('[sync] FASE 3 — Auto-classificação: MovieReading (CineAcessivel) + MLOAD (GoMAV) + PingPlay');

  // Busca todas as 3 fontes em paralelo
  const [mrTitles, mloadTitles, pingplayTitles] = await Promise.all([
    // MovieReading — cineacessivel.com.br (paginado)
    (async () => {
      const set = new Set();
      try {
        let page = 1;
        while (page <= 40) {
          const htmls = await Promise.all(
            [page, page+1, page+2, page+3, page+4].map(p =>
              fetch(`https://cineacessivel.com.br/em-cartaz?page=${p}`)
                .then(r => r.ok ? r.text() : '').catch(() => '')
            )
          );
          let found = 0;
          for (const html of htmls) {
            // Títulos em <h2> (não <h3>) — confirmado inspecionando o HTML do site
            for (const m of html.matchAll(/<h2[^>]*>([^<]+)<\/h2>/g)) {
              set.add(normT(m[1])); found++;
            }
          }
          if (!found) break;
          page += 5;
        }
        log.push(`[sync] MovieReading: ${set.size} títulos do CineAcessivel`);
      } catch (e) { log.push(`[sync] ERRO MovieReading scrape: ${e.message}`); }
      return set;
    })(),

    // MLOAD — gomav.co (página única, URL muda a cada semestre)
    (async () => {
      const set = new Set();
      try {
        // 1. Tenta descobrir URL pela homepage
        let mloadUrl = '';
        try {
          const homeR    = await fetch('https://gomav.co/');
          const homeHtml = homeR.ok ? await homeR.text() : '';
          const mloadM   = homeHtml.match(/filmes-(\d{4}-\d+)/);
          if (mloadM) mloadUrl = `https://gomav.co/filmes-${mloadM[1]}/`;
        } catch (e) { /* fallback abaixo */ }

        // 2. Fallback: testa últimos 4 semestres em ordem decrescente
        if (!mloadUrl) {
          const now2 = new Date();
          const candidates = [];
          for (let y = now2.getFullYear(); y >= now2.getFullYear() - 1; y--) {
            candidates.push(`https://gomav.co/filmes-${y}-2/`);
            candidates.push(`https://gomav.co/filmes-${y}-1/`);
          }
          for (const candidate of candidates) {
            try {
              const probe = await fetch(candidate);
              if (probe && probe.ok) { mloadUrl = candidate; break; }
            } catch (e) {}
          }
        }

        if (!mloadUrl) { log.push('[sync] MLOAD: URL não encontrada'); return set; }
        log.push(`[sync] MLOAD URL: ${mloadUrl}`);
        const r    = await fetch(mloadUrl);
        const html = await r.text();
        for (const m of html.matchAll(/<h4[^>]*>([^<]+)<\/h4>/g)) {
          const t = m[1].trim();
          // Filtra datas em qualquer formato: "09/04", "09 DE ABRIL DE 2026", "ABRIL 2026"
          if (/^\d{2}[\/\s]/.test(t) && /\b(de|jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez|\d{4})\b/i.test(t)) continue;
          if (/^(janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)/i.test(t)) continue;
          if (t.length >= 3) set.add(normT(t));
        }
        log.push(`[sync] MLOAD: ${set.size} títulos do GoMAV`);
      } catch (e) { log.push(`[sync] ERRO MLOAD scrape: ${e.message}`); }
      return set;
    })(),

    // PingPlay — pingplay.com.br (lotes paralelos)
    (async () => {
      const set   = new Set();
      const BATCH = 8;
      const MAX   = 40;
      try {
        let page = 1;
        while (page <= MAX) {
          const pageNums = Array.from({ length: BATCH }, (_, i) => page + i);
          const htmls    = await Promise.all(
            pageNums.map(p =>
              fetch(`https://pingplay.com.br/catalogo.php?pagina=${p}&por_pagina=40`)
                .then(r => r.ok ? r.text() : '').catch(() => '')
            )
          );
          let found = 0;
          for (const html of htmls) {
            for (const m of html.matchAll(/<h3[^>]*>([^<]+)<\/h3>/g)) {
              const norm = normT(m[1]);
              if (norm && !set.has(norm)) { set.add(norm); found++; }
            }
          }
          if (!found) break;
          page += BATCH;
        }
        log.push(`[sync] PingPlay: ${set.size} títulos do catalogo.php`);
      } catch (e) { log.push(`[sync] ERRO PingPlay scrape: ${e.message}`); }
      return set;
    })(),
  ]);

  // Cruza com filmes pendentes no Supabase
  // Constrói Sets de nível 2 (sem artigo inicial) para fuzzy matching
  const mrFuzzy       = new Set([...mrTitles].map(normFuzzy));
  const mloadFuzzy    = new Set([...mloadTitles].map(normFuzzy));
  const pingplayFuzzy = new Set([...pingplayTitles].map(normFuzzy));

  try {
    const pendentes = await supaGet('filmes', 'app_status=eq.pendente&select=id,titulo&limit=500');
    for (const f of pendentes) {
      const norm  = normT(f.titulo);
      const fuzzy = normFuzzy(f.titulo);
      let   app   = null;
      if      (mrTitles.has(norm)       || (fuzzy.length >= 4 && mrFuzzy.has(fuzzy)))       app = 'MovieReading';
      else if (mloadTitles.has(norm)    || (fuzzy.length >= 4 && mloadFuzzy.has(fuzzy)))    app = 'MLOAD';
      else if (pingplayTitles.has(norm) || (fuzzy.length >= 4 && pingplayFuzzy.has(fuzzy))) app = 'PingPlay';
      if (!app) continue;

      try {
        await supaPatch(f.id, {
          app:        app,
          app_status: 'confirmado',
          a11y:       { ad: true, lse: true, libras: true },
          updated_at: now,
        });
        log.push(`AUTO  ${f.titulo} → ${app}`);
        autoClassified++;
      } catch (e) {
        log.push(`ERR   ${f.titulo} auto-class: ${e.message}`);
        errors++;
      }
    }
    log.push(`[sync] Fase 3 concluída: ${autoClassified} filme(s) auto-classificado(s)`);
  } catch (e) {
    log.push(`[sync] ERRO Fase 3 match: ${e.message}`);
  }

  const summary = `[sync] concluído: ${created} novo(s), ${updated} sessão/status, ${enriched} enriquecido(s), ${autoClassified} auto-class, ${errors} erro(s)`;
  log.push(summary);
  console.log(log.join('\n'));

  return {
    statusCode: 200,
    body: JSON.stringify({ created, updated, enriched, autoClassified, errors, log }),
  };
};
