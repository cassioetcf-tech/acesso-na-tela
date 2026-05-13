// ── a11y-sources — Fontes de acessibilidade por app ──────────────────────────
// GET /.netlify/functions/a11y-sources
// Retorna { moviereading: [...títulos], mload: [...títulos], pingplay: [...títulos] }
//
// Fontes:
//   MovieReading → https://cineacessivel.com.br/em-cartaz       (paginado, <h3>)
//   MLOAD        → https://gomav.co/filmes-2025-2/              (página única, <h4>)
//   PingPlay     → https://pingplay.com.br/catalogo.php?pagina=N (paginado, <h3>)
//   GRETA        → paramountpictures.com.br/filmes — JS-rendered, não scrapeável
//
// Timeout: Netlify Functions têm limite de 10s (plano gratuito).
// Cada fetch externo tem AbortController com 4s. As 3 fontes rodam em paralelo.

const FETCH_TIMEOUT_MS = 7000; // 7s por requisição HTTP externa

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

async function fetchMovieReading() {
  const titles = [];
  const seen   = new Set();
  // Títulos estão em <h2> (não <h3>) — confirmado inspecionando o HTML do site
  const BATCH  = 8; // páginas em paralelo por vez
  const MAX    = 32; // máximo 32 páginas (site mostra até ~320 filmes)

  let page = 1;
  while (page <= MAX) {
    const pageNums = Array.from({ length: BATCH }, (_, i) => page + i);
    const htmls    = await Promise.all(
      pageNums.map(p =>
        fetchWithTimeout(`https://cineacessivel.com.br/em-cartaz?page=${p}`, FETCH_TIMEOUT_MS)
          .then(r => r.ok ? r.text() : '')
          .catch(() => '')
      )
    );

    let found = 0;
    for (const html of htmls) {
      if (!html) continue;
      for (const m of html.matchAll(/<h2[^>]*>([^<]+)<\/h2>/g)) {
        const orig = m[1].trim();
        const norm = normalizeTitle(orig);
        if (norm && !seen.has(norm)) {
          seen.add(norm);
          titles.push(orig);
          found++;
        }
      }
    }

    if (!found) break;
    page += BATCH;
  }

  console.log(`[a11y-sources] MovieReading: ${titles.length} títulos`);
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

  // 3. Deduplica e extrai dados de acessibilidade
  const seen    = new Set();
  const details = [];
  for (var i = 0; i < films.length; i++) {
    var f    = films[i];
    var nome = (f.nome || '').trim();
    if (!nome) continue;
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
  console.log('[a11y-sources] MLOAD API: ' + details.length + ' filmes — AD: ' + adCount + ' · Libras: ' + librasCount);

  return { titles: details.map(function (d) { return d.name; }), details: details };
}

// PingPlay: usa a API REST oficial em vez de scraping HTML
// GET /api/v1/catalog?all=true&limit=500  → lista com IDs
// GET /api/v1/catalog/{id}                → detalhes com acessibilityContents
//   type 1 = Legenda  |  type 2 = Audiodescrição  |  type 3 = Libras
async function fetchPingPlayAPI() {
  const BASE = 'https://etc.prod.api.locomotiva.dev.br/api/v1';

  // 1. Catálogo completo (sem detalhes de acessibilidade)
  let listR;
  try {
    listR = await fetchWithTimeout(BASE + '/catalog?all=true&limit=500', FETCH_TIMEOUT_MS);
  } catch (e) {
    console.log('[a11y-sources] PingPlay API list error: ' + e.message);
    return { titles: [], details: [] };
  }
  if (!listR || !listR.ok) {
    console.log('[a11y-sources] PingPlay API list HTTP ' + (listR ? listR.status : 'fail'));
    return { titles: [], details: [] };
  }

  const listJson = await listR.json();
  // Suporta envelope { content: { data: [...] } } e array direto
  const films = (listJson.content && Array.isArray(listJson.content.data) ? listJson.content.data : null)
    || (Array.isArray(listJson.data) ? listJson.data : null)
    || (Array.isArray(listJson) ? listJson : []);

  console.log('[a11y-sources] PingPlay API: ' + films.length + ' filmes na lista');
  if (!films.length) return { titles: [], details: [] };

  // 2. Detalhes individuais em paralelo (todos de uma vez — REST é rápido)
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
