// ── a11y-sources — Fontes de acessibilidade por app ──────────────────────────
// GET /.netlify/functions/a11y-sources
// Retorna { pingplay: [...títulos], pingplay_details: [...], greta: [...títulos] }
//
// Fontes (apenas filmes recentes — em cartaz):
//   PingPlay → locomotiva.dev.br/api/v1            (API REST oficial)
//   GRETA    → filmeb.com.br (distribuidora Paramount Pictures, ID 310086)
//
// MovieReading, Conecta, MLOAD e Trio NÃO são buscados aqui — vêm da tabela
// `filmes_scaneados` no Supabase, lida diretamente pelo admin.js (Fase 3).
//
// Estratégia: busca apenas os filmes mais recentes (em cartaz), sem percorrer
// catálogos históricos completos. Mantém a função rápida.

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

// GRETA: filmes da distribuidora Paramount Pictures no filmeb.com.br.
// Regra de produto: Paramount no filmeb = filmes disponíveis no app GRETA.
// Janela de datas: ano anterior → ano seguinte. Títulos em <h2><a>...</a></h2>.
const FILMEB_PARAMOUNT_ID = '310086';

// Remove prefixos entre parênteses: "(13/05) (relançamento) Top Gun" → "Top Gun"
function cleanGretaTitle(t) {
  let s = (t || '').trim();
  while (/^\s*\([^)]*\)\s*/.test(s)) s = s.replace(/^\s*\([^)]*\)\s*/, '');
  return s.trim();
}

async function fetchGretaParamount() {
  const titles = [];
  const seen   = new Set();
  try {
    const y    = new Date().getFullYear();
    const min  = `${y - 1}-01-01`;
    const max  = `${y + 1}-12-31`;
    const base = `https://www.filmeb.com.br/calendario-de-estreias/distribuidora/${FILMEB_PARAMOUNT_ID}`;
    const dateParams =
      `field_estreia_data_estreia_value%5Bmin%5D%5Bdate%5D=${min}` +
      `&field_estreia_data_estreia_value%5Bmax%5D%5Bdate%5D=${max}`;

    for (let page = 0; page < 10; page++) {
      const url = `${base}?tp=d&${dateParams}${page ? `&page=${page}` : ''}`;
      const ctrl = new AbortController();
      const id   = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
      let html = '';
      try {
        const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0' } });
        html = r.ok ? await r.text() : '';
      } catch (e) { clearTimeout(id); break; }
      clearTimeout(id);
      if (!html) break;

      let found = 0;
      for (const m of html.matchAll(/<h2[^>]*>\s*<a[^>]*href="([^"]*)"[^>]*>([^<]+)<\/a>/gi)) {
        if (/\/distribuidora\//.test(m[1])) continue; // ignora o link da própria distribuidora
        const clean = cleanGretaTitle(m[2]);
        if (clean.length < 3) continue;
        const norm = normalizeTitle(clean);
        if (norm && !seen.has(norm)) { seen.add(norm); titles.push(clean); found++; }
      }
      if (!found) break; // sem títulos novos → última página
    }
    console.log(`[a11y-sources] GRETA (Paramount/filmeb): ${titles.length} títulos`);
  } catch (e) {
    console.log('[a11y-sources] GRETA error: ' + e.message);
  }
  return titles;
}

// PingPlay: usa a API REST oficial em vez de scraping HTML
// GET /api/v1/catalog?all=true&limit=500  → catálogo completo (name + ingressoUrl por item)
async function fetchPingPlayAPI() {
  const BASE = 'https://etc.prod.api.locomotiva.dev.br/api/v1';

  // 1. Catálogo COMPLETO (limit alto). Antes pegava limit=50 + slice(0,15) ordenado
  //    por id — mas id é UUID, então a "ordem por recência" era aleatória e filmes
  //    em cartaz ficavam de fora. Agora buscamos todos.
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
  const allFilms = (listJson.content && Array.isArray(listJson.content.data) ? listJson.content.data : null)
    || (Array.isArray(listJson.data) ? listJson.data : null)
    || (Array.isArray(listJson) ? listJson : []);

  // Usa TODOS os filmes do catálogo. O endpoint de lista já traz name + ingressoUrl;
  // NÃO corta em N (antes pegava só 15) e NÃO ordena por id (id é UUID — sort numérico
  // dava NaN). Sem chamadas de detalhe: a lista basta para o match por título e por URL.
  const seen    = new Set();
  const details = [];
  for (var i = 0; i < allFilms.length; i++) {
    var d = allFilms[i];
    if (!d || !d.name) continue;
    var norm = normalizeTitle(d.name);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    // Modelo do produto: 1 filme = 1 app = os 3 recursos (AD + LSE + Libras).
    details.push({
      name:        d.name,
      id:          d.id,
      ad:          true,
      libras:      true,
      legenda:     true,
      ingressoUrl: d.ingressoUrl || null,
    });
  }

  console.log('[a11y-sources] PingPlay API: ' + details.length + ' filmes (de ' + allFilms.length + ' no catálogo)');

  return { titles: details.map(function (d) { return d.name; }), details: details };
}

// PingPlay — catálogo público (catalogo.php). Mais completo que a API (213 vs 104),
// porém só com nomes (sem ingressoUrl). Usado em UNIÃO com a API: a API dá o match
// exato por slug; o catálogo amplia a cobertura por nome (ex.: "Os Peludos 2").
async function fetchPingPlayCatalog() {
  const names = [];
  try {
    const r = await fetchWithTimeout('https://pingplay.com.br/catalogo.php?qtdeItensPagina=1000&pagina=1', FETCH_TIMEOUT_MS);
    const html = (r && r.ok) ? await r.text() : '';
    for (const m of html.matchAll(/<h3[^>]*>([^<]+)<\/h3>/g)) {
      const t = m[1].trim();
      if (t) names.push(t);
    }
    console.log('[a11y-sources] PingPlay catálogo HTML: ' + names.length + ' títulos');
  } catch (e) {
    console.log('[a11y-sources] PingPlay catálogo error: ' + e.message);
  }
  return names;
}

exports.handler = async function () {
  try {
    // PingPlay (API + catálogo HTML) + GRETA (Paramount/filmeb) em paralelo
    const [pingplayResult, ppCatalog, greta] = await Promise.all([
      fetchPingPlayAPI().catch(function (e)     { console.error('PP error:',    e.message); return { titles: [], details: [] }; }),
      fetchPingPlayCatalog().catch(function (e) { console.error('PPcat error:', e.message); return []; }),
      fetchGretaParamount().catch(function (e)  { console.error('GRETA error:', e.message); return []; }),
    ]);

    // União de nomes: API (104, com slug) + catálogo HTML (213, só nome)
    const ppNames = Array.from(new Set([].concat(pingplayResult.titles, ppCatalog)));

    console.log('[a11y-sources] total: PP=' + ppNames.length + ' (API ' + pingplayResult.titles.length + ' + cat ' + ppCatalog.length + ') GRETA=' + greta.length);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        pingplay:         ppNames,                 // união API + catálogo (match por título)
        pingplay_details: pingplayResult.details,  // dados da API com ingressoUrl (match por slug)
        greta:            greta,                   // títulos da Paramount (GRETA)
      }),
    };
  } catch (e) {
    console.error('[a11y-sources] erro geral:', e.message);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ pingplay: [], pingplay_details: [], greta: [], error: e.message }),
    };
  }
};
