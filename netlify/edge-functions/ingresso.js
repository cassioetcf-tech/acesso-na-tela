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

  // ── CINEMAS — scraping do ingresso.com/cinemas ───────────────────────────────
  // A API interna da Ingresso não expõe theaters via partnership locomotivadigital.
  // Fazemos scraping da página pública ingresso.com/cinemas (Next.js SSR).
  // O Next.js injeta os dados no __NEXT_DATA__ do HTML — extraímos a lista de cinemas.
  if (type === 'theaters') {
    const slug = url.searchParams.get('slug') || 'sao-paulo';

    // Tenta diferentes padrões de URL da Ingresso (slug na rota ou querystring)
    const pageUrls = [
      `https://www.ingresso.com/${slug}/cinemas`,
      `https://www.ingresso.com/cinemas?city=${slug}`,
      `https://www.ingresso.com/cinemas`,
    ];

    const hdrs = {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.9',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    };

    for (const pageUrl of pageUrls) {
      try {
        const r = await fetch(pageUrl, { headers: hdrs });
        if (!r.ok) { console.log(`[theaters] ${pageUrl} → ${r.status}`); continue; }

        const html = await r.text();
        console.log(`[theaters] ${pageUrl} → ${r.status}, len=${html.length}`);

        // Extrai __NEXT_DATA__ (injeção SSR do Next.js)
        const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
        if (!m) {
          console.log(`[theaters] __NEXT_DATA__ não encontrado em ${pageUrl}`);
          continue;
        }

        const nextData = JSON.parse(m[1]);
        const pp = nextData?.props?.pageProps || {};
        console.log(`[theaters] pageProps keys: ${JSON.stringify(Object.keys(pp))}`);

        // A Ingresso pode usar vários nomes para a lista de cinemas
        const raw = pp.theaters || pp.cinemas || pp.theaterList ||
                    pp.data?.theaters || pp.initialData?.theaters ||
                    pp.initialState?.theaters || [];

        if (raw.length) {
          // Normaliza os campos para o formato esperado pelo frontend
          const theaters = raw.map(function(t) {
            return {
              id:       t.id || t._id || t.theatherId || '',
              name:     t.name || t.nome || t.fantasyName || '',
              address:  [t.address, t.districtName, t.cityName].filter(Boolean).join(', '),
              url:      t.siteURL || t.siteUrl || t.url || '',
            };
          }).filter(function(t) { return t.name; });

          console.log(`[theaters] encontrados ${theaters.length} cinemas`);
          return new Response(JSON.stringify(theaters), {
            status: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }

        // __NEXT_DATA__ existe mas sem theaters — retorna debug
        const debugKeys = Object.keys(pp).slice(0, 20);
        console.log(`[theaters] pageProps sem theaters. keys: ${JSON.stringify(debugKeys)}`);
        return new Response(JSON.stringify({ theaters: [], _debug: { pagePropsKeys: debugKeys, slug } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });

      } catch (e) {
        console.log(`[theaters] erro ${pageUrl}: ${e.message}`);
      }
    }

    return new Response(JSON.stringify({ theaters: [], _debug: { error: 'all urls failed', slug } }), {
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
