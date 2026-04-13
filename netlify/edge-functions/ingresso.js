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
    // Busca filmes em cartaz direto da página pública da Ingresso
    // e extrai os urlKeys do HTML (usado pelo importador do admin)
    target = null;
    try {
      const pageResp = await fetch('https://www.ingresso.com/filmes/em-cartaz', {
        headers: {
          'Accept': 'text/html,application/xhtml+xml',
          'User-Agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36',
          'Referer': 'https://www.ingresso.com/',
        }
      });
      const html = await pageResp.text();
      // Extract urlKeys from href="/filme/URLKEY" patterns
      const matches = [...html.matchAll(/href="\/filme\/([a-z0-9\-]+)"/g)];
      const seen = new Set();
      const films = [];
      for (const m of matches) {
        const urlKey = m[1];
        if (!seen.has(urlKey) && urlKey.length > 2) {
          seen.add(urlKey);
          // Extract title from nearby text — look for the urlKey converted to title
          const title = urlKey.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
          films.push({ id: urlKey, urlKey, title });
        }
      }
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
