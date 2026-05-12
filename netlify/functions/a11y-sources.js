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

const FETCH_TIMEOUT_MS = 4000; // 4s por requisição HTTP externa

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
  const BATCH  = 5; // páginas em paralelo por vez
  const MAX    = 20; // máximo 20 páginas (~200 filmes) — evita timeout

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

  console.log(`[a11y-sources] MovieReading: ${titles.length} títulos`);
  return titles;
}

async function fetchMload() {
  const titles = [];
  const seen   = new Set();

  const r = await fetchWithTimeout('https://gomav.co/filmes-2025-2/', FETCH_TIMEOUT_MS).catch(() => null);
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
  const MAX    = 20; // máximo 20 páginas × 40 = 800 filmes — evita timeout

  let page = 1;
  while (page <= MAX) {
    const r    = await fetchWithTimeout(
      `https://pingplay.com.br/catalogo.php?pagina=${page}&por_pagina=40`,
      FETCH_TIMEOUT_MS
    ).catch(() => null);
    const html = r && r.ok ? await r.text() : '';

    if (!html) break;

    const matches = [...html.matchAll(/<h3[^>]*>([^<]+)<\/h3>/g)];
    if (!matches.length) break;

    let found = 0;
    for (const m of matches) {
      const orig = m[1].trim();
      const norm = normalizeTitle(orig);
      if (norm && !seen.has(norm)) {
        seen.add(norm);
        titles.push(orig);
        found++;
      }
    }

    if (!found) break;
    page++;
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
