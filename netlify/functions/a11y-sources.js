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

async function fetchMload() {
  const titles = [];
  const seen   = new Set();

  // URL muda a cada semestre (ex: filmes-2026-1, filmes-2026-2).
  // Descobre a URL atual pela homepage do GoMAV.
  let pageUrl = '';
  try {
    const homeR  = await fetchWithTimeout('https://gomav.co/', FETCH_TIMEOUT_MS);
    const homeHtml = homeR.ok ? await homeR.text() : '';
    // href pode ser relativo ("/filmes-...") ou absoluto ("https://gomav.co/filmes-...")
    const m = homeHtml.match(/filmes-(\d{4}-\d+)/);
    if (m) pageUrl = `https://gomav.co/filmes-${m[1]}/`;
  } catch (e) {}

  // Fallback: semestre atual baseado na data
  if (!pageUrl) {
    const now = new Date();
    const sem = now.getMonth() < 6 ? '1' : '2';
    pageUrl   = `https://gomav.co/filmes-${now.getFullYear()}-${sem}/`;
  }

  console.log(`[a11y-sources] MLOAD URL: ${pageUrl}`);

  const r = await fetchWithTimeout(pageUrl, FETCH_TIMEOUT_MS).catch(() => null);
  if (!r || !r.ok) return titles;
  const html = await r.text();

  for (const m of html.matchAll(/<h4[^>]*>([^<]+)<\/h4>/g)) {
    const text = m[1].trim();
    if (/^\d{2}\/\d{2}/.test(text)) continue;
    if (/^(janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)/i.test(text)) continue;
    if (text.length < 3) continue;

    const norm = normalizeTitle(text);
    if (norm && !seen.has(norm)) {
      seen.add(norm);
      titles.push(text);
    }
  }

  console.log(`[a11y-sources] MLOAD: ${titles.length} títulos`);
  return titles;
}

async function fetchPingPlay() {
  const titles = [];
  const seen   = new Set();
  // Busca em lotes paralelos para não estourar o timeout da função (10s)
  const BATCH  = 8;
  const MAX    = 40; // 40 páginas × 40 por página = até 1600 filmes

  let page = 1;
  while (page <= MAX) {
    const pageNums = Array.from({ length: BATCH }, (_, i) => page + i);
    const htmls    = await Promise.all(
      pageNums.map(p =>
        fetchWithTimeout(`https://pingplay.com.br/catalogo.php?pagina=${p}&por_pagina=40`, FETCH_TIMEOUT_MS)
          .then(r => r.ok ? r.text() : '')
          .catch(() => '')
      )
    );

    let found = 0;
    for (const html of htmls) {
      if (!html) continue;
      for (const m of html.matchAll(/<h3[^>]*>([^<]+)<\/h3>/g)) {
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

  console.log(`[a11y-sources] PingPlay: ${titles.length} títulos`);
  return titles;
}

exports.handler = async function () {
  try {
    // Todas as 3 fontes em paralelo — cada fetch individual já tem timeout de 4s
    const [moviereading, mload, pingplay] = await Promise.all([
      fetchMovieReading().catch(e => { console.error('MR error:',  e.message); return []; }),
      fetchMload().catch(e        => { console.error('ML error:',  e.message); return []; }),
      fetchPingPlay().catch(e     => { console.error('PP error:',  e.message); return []; }),
    ]);

    console.log(`[a11y-sources] total: MR=${moviereading.length} ML=${mload.length} PP=${pingplay.length}`);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ moviereading, mload, pingplay }),
    };
  } catch (e) {
    console.error('[a11y-sources] erro geral:', e.message);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ moviereading: [], mload: [], pingplay: [], error: e.message }),
    };
  }
};
