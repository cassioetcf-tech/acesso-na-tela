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
    // PingPlay (API) + GRETA (Paramount/filmeb) em paralelo
    const [pingplayResult, greta] = await Promise.all([
      fetchPingPlayAPI().catch(function (e)    { console.error('PP error:',    e.message); return { titles: [], details: [] }; }),
      fetchGretaParamount().catch(function (e) { console.error('GRETA error:', e.message); return []; }),
    ]);

    console.log('[a11y-sources] total: PP=' + pingplayResult.titles.length + ' GRETA=' + greta.length);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        pingplay:         pingplayResult.titles,   // lista plana (compatibilidade)
        pingplay_details: pingplayResult.details,  // dados ricos com AD/Libras/ingressoUrl
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
