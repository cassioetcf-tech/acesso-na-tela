export default async function handler(request) {
  const url = new URL(request.url);
  const path = url.searchParams.get('path') || '';
  const city = url.searchParams.get('city') || '1011';
  const date = url.searchParams.get('date') || new Date().toISOString().slice(0,10);
  const eventId = url.searchParams.get('eventId') || '';
  const urlKey = url.searchParams.get('urlKey') || '';
  const type   = url.searchParams.get('type')   || '';

  const PART       = 'locomotivadigital';
  const BASE       = 'https://api-content.ingresso.com/v0';
  const TMDB_TOKEN = Netlify.env.get('TMDB_TOKEN') ||
    'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiIxMzcyNWY2YTUzYzRkNmRlOWIwNmIwZTFjYjllN2Q2NyIsIm5iZiI6MTc3NTc3NDQ0Ny4yMDk5OTk4LCJzdWIiOiI2OWQ4MmFlZjFjNTc0MjQxNWY0NGEyNGUiLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.cYtmprLIfaLsEpA_YcOxIGdpfF8BffGlubFf0qQ0U1I';

  // Converte título em urlKey no padrão da Ingresso.com
  function titleToUrlKey(title) {
    return (title || '')
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '') // remove acentos
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  }

  let target;

  if (type === 'nowplaying') {
    // Usa TMDb /movie/now_playing?region=BR como fonte de filmes em cartaz no Brasil.
    // O endpoint de listagem da Ingresso não é público/documentado, então usamos TMDb
    // que é confiável e já temos credenciais. O urlKey é derivado do título em português.
    try {
      const seen  = new Set();
      const films = [];

      // Busca até 5 páginas (~100 filmes) para cobrir todo o Brasil
      let page = 1;
      let totalPages = 1;

      do {
        const tmdbUrl = `https://api.themoviedb.org/3/movie/now_playing?language=pt-BR&region=BR&page=${page}`;
        const r = await fetch(tmdbUrl, {
          headers: {
            'Authorization': `Bearer ${TMDB_TOKEN}`,
            'Accept': 'application/json',
          },
        });

        if (!r.ok) break;
        const data = await r.json();
        totalPages = Math.min(data.total_pages || 1, 5);

        for (const movie of (data.results || [])) {
          const title  = movie.title || movie.original_title || '';
          const urlKey = titleToUrlKey(title);
          if (!urlKey || seen.has(urlKey)) continue;
          seen.add(urlKey);
          films.push({ id: String(movie.id), title, urlKey });
        }

        page++;
      } while (page <= totalPages);

      console.log('[nowplaying] TMDb retornou', films.length, 'filmes');

      return new Response(JSON.stringify(films), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }
  } else if (urlKey) {
    // Step 1: get eventId from url-key (exact endpoint from PingPlay code)
    target = `${BASE}/events/url-key/${urlKey}/partnership/${PART}`;
  } else if (eventId) {
    // Step 2: get sessions by eventId (exact endpoint from PingPlay code)
    target = `${BASE}/sessions/city/${city}/event/${eventId}/partnership/${PART}?date=${date}&includeOperationPolicies=false`;
  } else if (path) {
    target = `${BASE}${path}?partnership=${PART}`;
  } else {
    return new Response(JSON.stringify({error:'urlKey or eventId required'}), {
      status: 400, headers: {'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}
    });
  }

  try {
    const resp = await fetch(target, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36',
        'Origin': 'https://www.ingresso.com',
        'Referer': 'https://www.ingresso.com/',
      }
    });

    const body = await resp.text();
    console.log(`[Ingresso] ${resp.status} ${target} (${body.length} bytes)`);
    console.log(`[Ingresso] preview: ${body.substring(0, 300)}`);

    const out = body.trim()
      ? body
      : JSON.stringify({debug:true, status:resp.status, url:target, message:'Empty response'});

    return new Response(out, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'X-Status': String(resp.status),
        'X-Url': target,
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({error: err.message, url: target}), {
      status: 200,
      headers: {'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}
    });
  }
}
