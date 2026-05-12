// ── a11y-sources — Fontes de acessibilidade por app ──────────────────────────
// GET /.netlify/functions/a11y-sources
// Retorna { moviereading: [...títulos], mload: [...títulos] }
//
// Fontes:
//   MovieReading → https://cineacessivel.com.br/em-cartaz  (paginado, <h3>)
//   MLOAD        → https://gomav.co/filmes-2025-2/         (página única, <h4>)

function normalizeTitle(title) {
  return (title || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchMovieReading() {
  const titles = [];
  const seen   = new Set();
  const BATCH  = 5; // páginas em paralelo por vez

  let page = 1;
  while (page <= 40) { // limite de segurança: 40 páginas = 400 filmes
    const pageNums = Array.from({ length: BATCH }, (_, i) => page + i);
    const htmls    = await Promise.all(
      pageNums.map(p =>
        fetch(`https://cineacessivel.com.br/em-cartaz?page=${p}`)
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

    if (!found) break; // sem mais filmes
    page += BATCH;
  }

  console.log(`[a11y-sources] MovieReading: ${titles.length} títulos`);
  return titles;
}

async function fetchMload() {
  const titles = [];
  const seen   = new Set();

  const r = await fetch('https://gomav.co/filmes-2025-2/');
  if (!r.ok) return titles;
  const html = await r.text();

  for (const m of html.matchAll(/<h4[^>]*>([^<]+)<\/h4>/g)) {
    const text = m[1].trim();
    // Ignora datas (ex: "15/01/2025") e meses (ex: "Janeiro 2025")
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

exports.handler = async function () {
  try {
    const [moviereading, mload] = await Promise.all([
      fetchMovieReading().catch(e => { console.error('MR error:', e.message); return []; }),
      fetchMload().catch(e        => { console.error('ML error:', e.message); return []; }),
    ]);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ moviereading, mload }),
    };
  } catch (e) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ moviereading: [], mload: [], error: e.message }),
    };
  }
};
