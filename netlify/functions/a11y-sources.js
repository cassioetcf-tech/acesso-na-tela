// ── a11y-sources — Fontes de acessibilidade por app ──────────────────────────
// GET /.netlify/functions/a11y-sources
// Retorna { moviereading: [...títulos], mload: [...títulos], mload_details: [...],
//           pingplay: [...títulos], pingplay_details: [...] }
//
// Fontes (apenas filmes recentes — em cartaz):
//   MovieReading → cineacessivel.com.br/em-cartaz  (scraping HTML, página 1 somente)
//   MLOAD        → app.mobiload.net/rest/v2         (API REST oficial)
//   PingPlay     → locomotiva.dev.br/api/v1         (API REST oficial)
//
// Estratégia: busca apenas os filmes mais recentes de cada fonte (em cartaz),
// sem percorrer catálogos históricos completos. Isso mantém a função rápida
// e focada nos filmes que realmente precisam de classificação.

const FETCH_TIMEOUT_MS = 7000;

function normalizeTitle(title) {
  return (title || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Fetch com timeout via AbortController
function fetchWithTimeout(url, ms) {
  const ctrl = new AbortController();
  const id   = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { signal: ctrl.signal })
    .finally(() => clearTimeout(id));
}

// MovieReading: scraping da página 1 do cineacessivel.com.br
// A página lista os filmes mais recentes (em cartaz) — apenas página 1 é suficiente
// para cobrir os lançamentos da semana sem percorrer o catálogo histórico inteiro.
async function fetchMovieReading() {
  const titles = [];
  const seen   = new Set();

  // Busca as 3 primeiras páginas em paralelo (cobre ~30 filmes recentes)
  const PAGES = [1, 2, 3];
  const htmls = await Promise.all(
    PAGES.map(p =>
      fetchWithTimeout(`https://cineacessivel.com.br/em-cartaz?page=${p}`, FETCH_TIMEOUT_MS)
        .then(r => r.ok ? r.text() : '')
        .catch(() => '')
    )
  );

  for (const html of htmls) {
    if (!html) continue;
    for (const m of html.matchAll(/<h2[^>]*>([^<]+)<\/h2>/g)) {
      const orig = m[1].trim();
      const norm = normalizeTitle(orig);
      if (norm && !seen.has(norm)) {
        seen.add(norm);
        titles.push(orig);
      }
    }
  }

  console.log(`[a11y-sources] MovieReading: ${titles.length} títulos (págs 1-3)`);
  return titles;
}

// MLOAD: usa a API REST oficial em vez de scraping do GoMAV
// Fluxo: POST /auth/login (anon) → token → POST /search → filmes com available[]
//   available pode conter: "ad" | "srt" | "libras"
// firstToken e x-auth-token-x são constantes públicas extraídas do bundle do app
const MLOAD_BASE       = 'https://app.mobiload.net/rest/v2';
const MLOAD_FIRST_TOKEN = 'efe031b155f4c451eac53909a5e620adaaf9dca598a184926594f06481161639';

async function fetchMloadAPI() {
  // 1. Login anônimo
  let loginR;
  try {
    loginR = await fetchWithTimeout(MLOAD_BASE + '/auth/login', FETCH_TIMEOUT_MS);
    // login requer POST com headers e body — fetchWithTimeout só faz GET; usa fetch diretamente
    loginR = null; // descarta — faz POST manual abaixo
  } catch (e) {}

  let authToken = '';
  try {
    const loginResp = await fetch(MLOAD_BASE + '/auth/login', {
      method: 'POST',
      headers: {
        'x-auth-token-x': MLOAD_FIRST_TOKEN,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        deviceId: 'netlify-func-001',
        token:    MLOAD_FIRST_TOKEN,
        email:    '%NOLOGIN%',
        pass:     '%NOLOGIN%',
        os:       'android',
        sv:       '11',
        jb:       'N',
        ml:       'N',
      }),
    });
    if (!loginResp.ok) {
      console.log('[a11y-sources] MLOAD login HTTP ' + loginResp.status);
      return { titles: [], details: [] };
    }
    const loginJson = await loginResp.json();
    authToken = loginJson.token || '';
  } catch (e) {
    console.log('[a11y-sources] MLOAD login error: ' + e.message);
    return { titles: [], details: [] };
  }

  if (!authToken) {
    console.log('[a11y-sources] MLOAD: token vazio após login');
    return { titles: [], details: [] };
  }

  // 2. Busca catálogo completo (todos os filmes numa única chamada)
  let searchResp;
  try {
    searchResp = await fetch(MLOAD_BASE + '/search/?userLang=pt', {
      method: 'POST',
      headers: {
        'x-auth-token-x': authToken,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({}),
    });
  } catch (e) {
    console.log('[a11y-sources] MLOAD search error: ' + e.message);
    return { titles: [], details: [] };
  }

  if (!searchResp.ok) {
    console.log('[a11y-sources] MLOAD search HTTP ' + searchResp.status);
    return { titles: [], details: [] };
  }

  const films = await searchResp.json();
  if (!Array.isArray(films)) {
    console.log('[a11y-sources] MLOAD search: resposta não é array');
    return { titles: [], details: [] };
  }

  // 3. Ordena por ID desc (mais recentes), pega os 15 primeiros, deduplica
  const sorted = films
    .filter(function (f) { return f.nome && f.nome.trim(); })
    .sort(function (a, b) { return (b.id || 0) - (a.id || 0); })
    .slice(0, 15);

  const seen    = new Set();
  const details = [];
  for (var i = 0; i < sorted.length; i++) {
    var f    = sorted[i];
    var nome = f.nome.trim();
    var norm = normalizeTitle(nome);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    var avail = Array.isArray(f.available) ? f.available : [];
    details.push({
      name:   nome,
      id:     f.id || null,
      ad:     avail.indexOf('ad')     > -1,
      libras: avail.indexOf('libras') > -1,
      srt:    avail.indexOf('srt')    > -1,
    });
  }

  var adCount     = details.filter(function (d) { return d.ad; }).length;
  var librasCount = details.filter(function (d) { return d.libras; }).length;
  console.log('[a11y-sources] MLOAD API: ' + details.length + ' filmes recentes — AD: ' + adCount + ' · Libras: ' + librasCount);

  return { titles: details.map(function (d) { return d.name; }), details: details };
}

// PingPlay: usa a API REST oficial em vez de scraping HTML
// GET /api/v1/catalog?all=true&limit=500  → lista com IDs
// GET /api/v1/catalog/{id}                → detalhes com acessibilityContents
//   type 1 = Legenda  |  type 2 = Audiodescrição  |  type 3 = Libras
async function fetchPingPlayAPI() {
  const BASE = 'https://etc.prod.api.locomotiva.dev.br/api/v1';

  // 1. Catálogo recente — filmes com IDs mais altos são os mais recentes
  //    Buscamos 50 e ordenamos por ID desc para pegar os lançamentos atuais.
  //    Isso evita percorrer centenas de filmes históricos.
  let listR;
  try {
    listR = await fetchWithTimeout(BASE + '/catalog?all=true&limit=50', FETCH_TIMEOUT_MS);
  } catch (e) {
    console.log('[a11y-sources] PingPlay API list error: ' + e.message);
    return { titles: [], details: [] };
  }
  if (!listR || !listR.ok) {
    console.log('[a11y-sources] PingPlay API list HTTP ' + (listR ? listR.status : 'fail'));
    return { titles: [], details: [] };
  }

  const listJson = await listR.json();
  const allFilms = (listJson.content && Array.isArray(listJson.content.data) ? listJson.content.data : null)
    || (Array.isArray(listJson.data) ? listJson.data : null)
    || (Array.isArray(listJson) ? listJson : []);

  // Ordena por ID decrescente (mais recentes primeiro) e pega os 15 mais novos
  const films = allFilms
    .slice()
    .sort(function (a, b) { return (b.id || 0) - (a.id || 0); })
    .slice(0, 15);

  console.log('[a11y-sources] PingPlay API: ' + films.length + ' filmes recentes (de ' + allFilms.length + ' total)');
  if (!films.length) return { titles: [], details: [] };

  // 2. Detalhes individuais em paralelo
  const rawResults = await Promise.all(
    films.map(function (f) {
      return fetchWithTimeout(BASE + '/catalog/' + f.id, 5000)
        .then(function (r) { return r.ok ? r.json() : null; })
        .catch(function () { return null; });
    })
  );

  const details = [];
  for (var i = 0; i < rawResults.length; i++) {
    var res = rawResults[i];
    if (!res) continue;
    var d = (res.content && res.content.data) || res.data || res;
    if (!d || !d.name) continue;
    var contents = Array.isArray(d.acessibilityContents) ? d.acessibilityContents : [];
    details.push({
      name:        d.name,
      id:          d.id,
      ad:          contents.some(function (c) { return c.type === 2; }),
      libras:      contents.some(function (c) { return c.type === 3; }),
      legenda:     contents.some(function (c) { return c.type === 1; }),
      ingressoUrl: d.ingressoUrl || null,
    });
  }

  var adCount     = details.filter(function (d) { return d.ad; }).length;
  var librasCount = details.filter(function (d) { return d.libras; }).length;
  console.log('[a11y-sources] PingPlay API: ' + details.length + ' filmes — AD: ' + adCount + ' · Libras: ' + librasCount);

  return { titles: details.map(function (d) { return d.name; }), details: details };
}

exports.handler = async function () {
  try {
    // Todas as 3 fontes em paralelo
    const [moviereading, mloadResult, pingplayResult] = await Promise.all([
      fetchMovieReading().catch(function (e) { console.error('MR error:',  e.message); return []; }),
      fetchMloadAPI().catch(function (e)     { console.error('ML error:',  e.message); return { titles: [], details: [] }; }),
      fetchPingPlayAPI().catch(function (e)  { console.error('PP error:',  e.message); return { titles: [], details: [] }; }),
    ]);

    console.log('[a11y-sources] total: MR=' + moviereading.length + ' ML=' + mloadResult.titles.length + ' PP=' + pingplayResult.titles.length);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        moviereading,
        mload:            mloadResult.titles,      // lista plana (compatibilidade)
        mload_details:    mloadResult.details,     // dados ricos com AD/Libras/SRT
        pingplay:         pingplayResult.titles,   // lista plana (compatibilidade)
        pingplay_details: pingplayResult.details,  // dados ricos com AD/Libras/ingressoUrl
      }),
    };
  } catch (e) {
    console.error('[a11y-sources] erro geral:', e.message);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ moviereading: [], mload: [], mload_details: [], pingplay: [], pingplay_details: [], error: e.message }),
    };
  }
};
