export default async function handler(request) {
  const url = new URL(request.url);
  const path = url.searchParams.get('path') || '/films';
  
  const params = new URLSearchParams();
  params.set('partnership', 'locomotivadigital');
  
  const city = url.searchParams.get('city');
  const date = url.searchParams.get('date');
  const types = url.searchParams.get('types');
  
  if (city) params.set('city', city);
  if (date) params.set('date', date);
  if (types) params.set('types', types);

  const target = `https://api-content.ingresso.com/v0${path}?${params.toString()}`;

  try {
    const resp = await fetch(target, {
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36',
        'Origin': 'https://www.ingresso.com',
        'Referer': 'https://www.ingresso.com/',
      }
    });

    const body = await resp.text();
    console.log(`[Ingresso] ${resp.status} ${target} (${body.length} bytes)`);
    console.log(`[Ingresso] body: ${body.substring(0, 500)}`);

    const out = body.trim() 
      ? body 
      : JSON.stringify({debug:true, status:resp.status, url:target});

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
