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
    // Scraping AdoroCinema — HTML server-side renderizado, sem CORS
    // Busca todas as páginas em paralelo
    try {
      const BASE_URL = 'https://www.adorocinema.com/filmes/numero-cinemas/';
      const HEADERS = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Language': 'pt-BR,pt;q=0.9',
        'Accept': 'text/html',
        'Referer': 'https://www.adorocinema.com/',
      };

      // Fetch página 1 primeiro para descobrir total de páginas
      const page1 = await fetch(BASE_URL, { headers: HEADERS });
      const html1 = await page1.text();

      // Descobre número total de páginas
      const pageNums = [...html1.matchAll(/[?&]page=(\d+)/g)].map(m => parseInt(m[1]));
      const totalPages = pageNums.length ? Math.max(...pageNums) : 1;

      // Busca demais páginas em paralelo
      const extraFetches = [];
      for (let p = 2; p <= totalPages; p++) {
        extraFetches.push(
          fetch(BASE_URL + '?page=' + p, { headers: HEADERS }).then(r => r.text())
        );
      }
      const extraHtmls = await Promise.all(extraFetches);
      const allHtmls = [html1, ...extraHtmls];

      // Extrai filmes de todas as páginas
      const seen = new Set();
      const films = [];
      const re = /href="\/filmes\/(filme-[\d]+)\/"[^>]*>([^<]+)<\/a>/g;

      for (const html of allHtmls) {
        let m;
        re.lastIndex = 0;
        while ((m = re.exec(html)) !== null) {
          const adoroId = m[1];
          const title   = m[2].trim();
          if (seen.has(adoroId) || title.length < 2) continue;
          seen.add(adoroId);

          const urlKey = title.toLowerCase()
            .replace(/[áàãâä]/g,'a').replace(/[éèêë]/g,'e')
            .replace(/[íìîï]/g,'i').replace(/[óòõôö]/g,'o')
            .replace(/[úùûü]/g,'u').replace(/[ç]/g,'c')
            .replace(/[^a-z0-9\s]/g,'').trim().replace(/\s+/g,'-');

          films.push({ id: adoroId, adoroId, title, urlKey });
        }
      }

      console.log('[AdoroCinema] pages:', totalPages, 'films:', films.length);

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
