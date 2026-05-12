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
    // Usa o endpoint oficial da Ingresso.com para listar filmes em cartaz/em breve.
    // GET /v0/events/city/1/partnership/locomotivadigital
    // Retorna { items: [...] } com title, urlKey, isPlaying, isComingSoon — sem paginação.
    try {
      const ingressoUrl = `${BASE}/events/city/1/partnership/${PART}`;
      const r = await fetch(ingressoUrl, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36',
          'Origin': 'https://www.ingresso.com',
          'Referer': 'https://www.ingresso.com/',
        },
      });

      if (!r.ok) throw new Error(`Ingresso HTTP ${r.status}`);
      const data = await r.json();
      const items = Array.isArray(data.items) ? data.items : [];

      // Filtra apenas filmes (exclui peças de teatro, shows, etc.)
      const films = items
        .filter(m => (m.type || '').toLowerCase() === 'filme')
        .map(m => ({
          title:       m.title        || '',
          urlKey:      m.urlKey       || '',
          isComingSoon: !!m.isComingSoon,
        }))
        .filter(m => m.title && m.urlKey);

      console.log('[nowplaying] Ingresso retornou', films.length, 'filmes');

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
