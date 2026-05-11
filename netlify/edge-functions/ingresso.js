export default async function handler(request) {
  const url = new URL(request.url);
  const path = url.searchParams.get('path') || '';
  const city = url.searchParams.get('city') || '1011';
  const date = url.searchParams.get('date') || new Date().toISOString().slice(0,10);
  const eventId = url.searchParams.get('eventId') || '';
  const urlKey = url.searchParams.get('urlKey') || '';
  const type   = url.searchParams.get('type')   || '';

  const PART = 'locomotivadigital';
  const BASE = 'https://api-content.ingresso.com/v0';

  let target;

  if (type === 'nowplaying') {
    // Busca direta na API da Ingresso.com — lista de filmes em cartaz por cidade
    // Tenta múltiplas cidades para cobrir todo o Brasil
    const CITIES = ['1011', '9', '1', '2', '3', '5']; // SP, RJ, BH, Curitiba, Fortaleza, Porto Alegre
    const ING_HEADERS = {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36',
      'Origin': 'https://www.ingresso.com',
      'Referer': 'https://www.ingresso.com/',
    };

    try {
      const seen  = new Set();
      const films = [];

      // Busca em paralelo nas principais cidades
      const fetches = CITIES.map(cityId =>
        fetch(`${BASE}/templates/nowplaying/city/${cityId}/partnership/${PART}`, { headers: ING_HEADERS })
          .then(r => r.ok ? r.json() : [])
          .catch(() => [])
      );
      const results = await Promise.all(fetches);

      for (const data of results) {
        const list = Array.isArray(data) ? data : (data.items || data.events || []);
        for (const ev of list) {
          const key = ev.urlKey || ev.url_key || '';
          if (!key || seen.has(key)) continue;
          seen.add(key);
          films.push({
            id:     ev.id || key,
            title:  ev.title || ev.originalTitle || '',
            urlKey: key,
          });
        }
      }

      console.log('[Ingresso nowplaying] total films:', films.length);

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
