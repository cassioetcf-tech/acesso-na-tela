// ── sync-status v3 — Discovery + Sync Engine ─────────────────────────────────
// Netlify Scheduled Function: roda diariamente às 6h UTC (netlify.toml)
//
// FASE 1 — Ingresso: descoberta + verificação de sessões
//   → GET /v0/events/city/1/partnership/locomotivadigital — lista oficial do Ingresso
//   → filmes novos inseridos SEM tmdb_data (enriquecidos na Fase 3)
//   → usa isComingSoon para definir status inicial (CARTAZ ou BREVE)
//   → filmes já cadastrados em cartaz/breve: verifica sessões (cartaz ↔ catálogo)
//
// FASE 2 — Apps: auto-classificação (varre TODOS os filmes com sessão na semana)
//   → MovieReading, Conecta, MLOAD, Trio: lê da tabela Supabase `filmes_scaneados`
//   → PingPlay: scrape pingplay.com.br (mantido)
//   → GRETA: filmeb.com.br, distribuidora Paramount Pictures (ID 310086)
//   → cruza com filmes em cartaz → atualiza app/app_status/a11y
//
// FASE 3 — TMDb: enriquecimento de dados (por último; não bloqueia os apps)
//   → filmes em cartaz sem tmdb_data → busca por título → atualiza tmdb_id + tmdb_data

const SUPA_URL    = process.env.SUPA_URL  || 'https://gpwmmvaetokgrzekepbk.supabase.co';
const SUPA_KEY    = process.env.SUPA_KEY  || 'sb_publishable_lbKSyHwh8nNINEef-0Hi5Q_oPF5qt-P';
const TMDB_TOKEN  = process.env.TMDB_TOKEN || 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiIxMzcyNWY2YTUzYzRkNmRlOWIwNmIwZTFjYjllN2Q2NyIsIm5iZiI6MTc3NTc3NDQ0Ny4yMDk5OTk4LCJzdWIiOiI2OWQ4MmFlZjFjNTc0MjQxNWY0NGEyNGUiLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.cYtmprLIfaLsEpA_YcOxIGdpfF8BffGlubFf0qQ0U1I';

const INGRESSO_BASE = 'https://api-content.ingresso.com/v0';
const INGRESSO_PART = 'locomotivadigital';
const TMDB_BASE     = 'https://api.themoviedb.org/3'; // usado apenas na Fase 2 (enriquecimento)

// GRETA — filmeb.com.br, distribuidora Paramount Pictures (fixo por enquanto)
const FILMEB_PARAMOUNT_ID = '310086';

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

// ── Apps (Fase 3) ───────────────────────────────────────────────────────────
// Normaliza o valor do campo `app` (tabela filmes_scaneados) para o nome
// canônico usado em filmes.app (consistente com a página de aplicativos).
function canonApp(a) {
  const k = normT(a);
  if (k === 'moviereading')   return 'MovieReading';
  if (k === 'mload')          return 'MLOAD';
  if (k === 'pingplay')       return 'PingPlay';
  if (k === 'greta')          return 'GRETA';
  if (k.startsWith('conecta')) return 'Conecta Acessibilidade';
  if (k.startsWith('trio'))    return 'Trio Cinema';
  return a; // fallback: mantém o valor original
}

// Remove prefixos entre parênteses dos títulos do filmeb
// Ex.: "(13/05) (relançamento) Top Gun: Ases indomáveis" → "Top Gun: Ases indomáveis"
function cleanGretaTitle(t) {
  let s = (t || '').trim();
  while (/^\s*\([^)]*\)\s*/.test(s)) s = s.replace(/^\s*\([^)]*\)\s*/, '');
  return s.trim();
}

/**
 * GRETA — raspa os filmes da distribuidora Paramount Pictures no filmeb.com.br.
 * Janela de datas: ano anterior → ano seguinte (cobre filmes que entram/saem do cartaz).
 * Títulos vêm em <h2><a href="/calendario-de-estreias/{slug}">Título</a></h2>.
 * Retorna Set de títulos normalizados (normT).
 */
async function fetchGretaTitles(log) {
  const set = new Set();
  try {
    const y   = new Date().getFullYear();
    const min = `${y - 1}-01-01`;
    const max = `${y + 1}-12-31`;
    const base = `https://www.filmeb.com.br/calendario-de-estreias/distribuidora/${FILMEB_PARAMOUNT_ID}`;
    const dateParams =
      `field_estreia_data_estreia_value%5Bmin%5D%5Bdate%5D=${min}` +
      `&field_estreia_data_estreia_value%5Bmax%5D%5Bdate%5D=${max}`;

    for (let page = 0; page < 10; page++) {
      const url = `${base}?tp=d&${dateParams}${page ? `&page=${page}` : ''}`;
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!r.ok) break;
      const html = await r.text();
      let found = 0;
      for (const m of html.matchAll(/<h2[^>]*>\s*<a[^>]*href="([^"]*)"[^>]*>([^<]+)<\/a>/gi)) {
        if (/\/distribuidora\//.test(m[1])) continue; // ignora o link da própria distribuidora
        const clean = cleanGretaTitle(m[2]);
        if (clean.length < 3) continue;
        const n = normT(clean);
        if (n && !set.has(n)) { set.add(n); found++; }
      }
      if (!found) break; // sem títulos novos → última página
    }
    log.push(`[sync] GRETA: ${set.size} títulos da Paramount (filmeb.com.br)`);
  } catch (e) {
    log.push(`[sync] ERRO GRETA scrape: ${e.message}`);
  }
  return set;
}

/**
 * PingPlay — catálogo completo via API oficial locomotiva.
 * O endpoint de lista traz todos os filmes (name + ingressoUrl). Antes usávamos
 * scraping HTML; a API é mais confiável e não pagina. Retorna Set de títulos normT.
 */
async function fetchPingPlayTitles(log) {
  const set = new Set();
  try {
    const r = await fetch(
      'https://etc.prod.api.locomotiva.dev.br/api/v1/catalog?all=true&limit=500',
      { headers: { 'Accept': 'application/json' } }
    );
    if (!r.ok) { log.push(`[sync] PingPlay API HTTP ${r.status}`); return set; }
    const j = await r.json();
    const films = (j.content && Array.isArray(j.content.data) ? j.content.data : null)
      || (Array.isArray(j.data) ? j.data : null)
      || (Array.isArray(j) ? j : []);
    for (const f of films) {
      if (!f || !f.name) continue;
      const n = normT(f.name);
      if (n) set.add(n);
    }
    log.push(`[sync] PingPlay: ${set.size} títulos da API (de ${films.length} no catálogo)`);
  } catch (e) {
    log.push(`[sync] ERRO PingPlay API: ${e.message}`);
  }
  return set;
}

/**
 * Busca o melhor match no TMDb em 3 níveis:
 *  1. normT/normFuzzy exato na lista de resultados
 *  2. busca com título base (sem subtítulo após ":" ou " - ")
 *  3. fallback: 1º resultado com poster (sem threshold de popularidade)
 */
async function searchMovieBest(titulo) {
  if (!titulo || titulo.length < 2) return null;
  try {
    const r1    = await searchMovie(titulo);
    const match = r1.find(r => titlesMatch(r.title, titulo) || titlesMatch(r.original_title, titulo));
    if (match) return match;

    const base = titulo.replace(/\s*[:\-–—]\s*.+$/, '').trim();
    if (base && base !== titulo && base.length >= 3) {
      const r2 = await searchMovie(base);
      const m2 = r2.find(r =>
        titlesMatch(r.title, titulo) || titlesMatch(r.original_title, titulo) ||
        titlesMatch(r.title, base)   || titlesMatch(r.original_title, base)
      );
      if (m2) return m2;
      if (r2[0] && r2[0].poster_path) return r2[0];
    }
    if (r1[0] && r1[0].poster_path) return r1[0];
  } catch (e) {}
  return null;
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
  // Métricas para o resumo final
  let   mIngresso      = 0; // filmes em cartaz no Ingresso.com
  let   mSessoes       = 0; // filmes com sessão nesta semana (status CARTAZ)
  let   mApps          = 0; // filmes encontrados nos apps
  let   mTmdb          = 0; // filmes encontrados no TMDb

  // ── FASE 1: Ingresso — Descoberta + Verificação de sessões ───────────────────
  log.push('[sync] FASE 1 — Ingresso: descoberta + verificação de sessões');

  // 1a. Busca lista diretamente do Ingresso.com (fonte oficial)
  let ingressoFilms = [];
  try {
    ingressoFilms = await fetchIngressoMovies();
    mIngresso = ingressoFilms.filter(f => !f.isComingSoon).length;
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

  // ── FASE 2: Auto-classificação por app ────────────────────────────────────────
  // Varre TODOS os filmes com sessão na semana (status CARTAZ). Roda ANTES do TMDb — não depende dele.
  log.push('[sync] FASE 2 — Auto-classificação: filmes_scaneados (MovieReading/Conecta/MLOAD/Trio) + PingPlay (scrape) + GRETA (Paramount/filmeb)');

  // 3a. Tabela filmes_scaneados — MovieReading, Conecta, MLOAD, Trio
  const scanNorm  = new Map(); // normT(titulo)     → app canônico
  const scanFuzzy = new Map(); // normFuzzy(titulo) → app canônico
  try {
    const scaneados = await supaGet('filmes_scaneados', 'select=titulo,app&limit=5000');
    for (const row of scaneados) {
      if (!row || !row.titulo || !row.app) continue;
      const app = canonApp(row.app);
      const n   = normT(row.titulo);
      const f   = normFuzzy(row.titulo);
      if (n && !scanNorm.has(n)) scanNorm.set(n, app);
      if (f.length >= 4 && !scanFuzzy.has(f)) scanFuzzy.set(f, app);
    }
    log.push(`[sync] filmes_scaneados: ${scaneados.length} registro(s) (${scanNorm.size} títulos únicos)`);
  } catch (e) {
    log.push(`[sync] ERRO filmes_scaneados: ${e.message}`);
  }

  // 3b. PingPlay (API oficial) + GRETA (filmeb) em paralelo
  const [pingplayTitles, gretaTitles] = await Promise.all([
    fetchPingPlayTitles(log),   // catálogo completo via API locomotiva
    fetchGretaTitles(log),      // filmeb.com.br, distribuidora Paramount Pictures
  ]);

  const pingplayFuzzy = new Set([...pingplayTitles].map(normFuzzy));
  const gretaFuzzy    = new Set([...gretaTitles].map(normFuzzy));

  // 3c. Cruza com TODOS os filmes em cartaz (com sessão na semana). Prioridade: filmes_scaneados → PingPlay → GRETA.
  try {
    const emCartaz = await supaGet('filmes', 'status=ilike.cartaz&select=id,titulo,app,app_status&limit=500');
    mSessoes = emCartaz.length; // filmes com sessão nesta semana
    for (const f of emCartaz) {
      const norm  = normT(f.titulo);
      const fuzzy = normFuzzy(f.titulo);
      let   app   = null;

      // 1. Tabela filmes_scaneados (MovieReading, Conecta, MLOAD, Trio)
      if      (scanNorm.has(norm))                        app = scanNorm.get(norm);
      else if (fuzzy.length >= 4 && scanFuzzy.has(fuzzy)) app = scanFuzzy.get(fuzzy);
      // 2. PingPlay (scrape)
      if (!app && (pingplayTitles.has(norm) || (fuzzy.length >= 4 && pingplayFuzzy.has(fuzzy)))) app = 'PingPlay';
      // 3. GRETA (Paramount/filmeb)
      if (!app && (gretaTitles.has(norm)    || (fuzzy.length >= 4 && gretaFuzzy.has(fuzzy))))    app = 'GRETA';

      if (!app) continue;
      mApps++; // encontrado em alguma fonte de app
      // Sem mudança real → pula regravação desnecessária
      if (f.app === app && (f.app_status || '').toLowerCase() === 'confirmado') continue;

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
    log.push(`[sync] Fase 2 concluída: ${autoClassified} filme(s) auto-classificado(s)`);
  } catch (e) {
    log.push(`[sync] ERRO Fase 2 match: ${e.message}`);
  }

  // ── FASE 3: TMDb — Enriquecimento de dados (por último; não bloqueia os apps) ─
  log.push('[sync] FASE 3 — TMDb: buscando poster e dados dos filmes sem tmdb_data');

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
      const match = await searchMovieBest(f.titulo || '');

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

  log.push(`[sync] Fase 3 concluída: ${enriched} filme(s) enriquecido(s)`);

  // filmes em cartaz com dados do TMDb (cacheados antes + enriquecidos agora)
  mTmdb = todosFilmes.filter(f => f.tmdb_data && (f.status || '').toLowerCase() === 'cartaz').length + enriched;

  log.push('[sync] RESUMO ───────────────────────────────');
  log.push(`[sync]   Em cartaz no Ingresso.com .. ${mIngresso}`);
  log.push(`[sync]   Com sessões nesta semana ... ${mSessoes}`);
  log.push(`[sync]   Encontrados nos apps ....... ${mApps}`);
  log.push(`[sync]   Encontrados no TMDb ........ ${mTmdb}`);

  const summary = `[sync] concluído: ${created} novo(s), ${updated} sessão/status, ${enriched} enriquecido(s), ${autoClassified} auto-class, ${errors} erro(s)`;
  log.push(summary);
  console.log(log.join('\n'));

  return {
    statusCode: 200,
    body: JSON.stringify({ created, updated, enriched, autoClassified, errors,
                           metrics: { ingresso: mIngresso, sessoes: mSessoes, apps: mApps, tmdb: mTmdb }, log }),
  };
};
