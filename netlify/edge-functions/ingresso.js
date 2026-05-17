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

  // ── TODAS AS CIDADES ─────────────────────────────────────────────────────────
  // Retorna todas as cidades disponíveis na Ingresso.
  // O frontend agrupa por estado e filtra localmente (sem endpoint por estado).
  if (type === 'cities') {
    try {
      const r = await fetch(`${BASE}/cities/partnership/${PART}`, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36',
          'Origin': 'https://www.ingresso.com',
          'Referer': 'https://www.ingresso.com/',
        },
      });
      const body = await r.text();
      console.log(`[cities] status=${r.status} len=${body.length} preview=${body.substring(0,200)}`);
      return new Response(body, {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
  }

  // ── CINEMAS — OpenStreetMap (Overpass API via GET + bbox) ────────────────────
  // Usa bounding box da cidade para query mais rápida e sem lookup de área.
  // Tenta 3 mirrors públicos do Overpass em sequência.
  if (type === 'theaters') {
    const bbox     = decodeURIComponent(url.searchParams.get('bbox') || '');
    const cityName = decodeURIComponent(url.searchParams.get('cityName') || 'São Paulo');

    // Query com bbox (preferido — mais rápido) ou fallback por nome
    const query = bbox
      ? `[out:json][timeout:25];(node["amenity"="cinema"](${bbox});way["amenity"="cinema"](${bbox}););out center tags;`
      : `[out:json][timeout:25];area["name"="${cityName}"]["admin_level"="8"]->.a;(node["amenity"="cinema"](area.a);way["amenity"="cinema"](area.a););out center tags;`;

    const mirrors = [
      'https://overpass-api.de/api/interpreter',
      'https://overpass.kumi.systems/api/interpreter',
      'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
    ];

    for (const mirror of mirrors) {
      try {
        const qUrl = mirror + '?data=' + encodeURIComponent(query);
        console.log(`[theaters-osm] tentando ${mirror} bbox=${bbox||'none'}`);
        const r = await fetch(qUrl, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'AcessoNaTela/1.0 (acessonatela.com)',
          },
        });
        if (!r.ok) { console.log(`[theaters-osm] ${mirror} → ${r.status}`); continue; }

        const data = await r.json();
        const els  = data.elements || [];
        console.log(`[theaters-osm] ${mirror} → ${els.length} elementos`);
        if (!els.length) continue;

        const theaters = els.map(function(el) {
          const t = el.tags || {};
          const street = t['addr:street']
            ? t['addr:street'] + (t['addr:housenumber'] ? ', ' + t['addr:housenumber'] : '')
            : '';
          const district = t['addr:suburb'] || t['addr:neighbourhood'] || t['addr:district'] || '';
          return {
            id:      String(el.id),
            name:    t.name || t['name:pt'] || '',
            address: [street, district].filter(Boolean).join(' — '),
            url:     t.website || t.url || t['contact:website'] || '',
          };
        }).filter(function(t) { return t.name; })
          .sort(function(a, b) { return a.name.localeCompare(b.name, 'pt-BR'); });

        console.log(`[theaters-osm] retornando ${theaters.length} cinemas`);
        return new Response(JSON.stringify(theaters), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      } catch (e) {
        console.log(`[theaters-osm] erro ${mirror}: ${e.message}`);
      }
    }

    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

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
