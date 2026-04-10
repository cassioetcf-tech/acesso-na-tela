export default async function handler(request) {
  const url = new URL(request.url);
  const path = url.searchParams.get('path') || '/films';
  const city = url.searchParams.get('city') || '1011';
  const date = url.searchParams.get('date') || '';
  const types = url.searchParams.get('types') || '';

  let target = `https://api-content.ingresso.com/v0${path}?partnership=locomotivadigital&city=${city}`;
  if (date) target += `&date=${date}`;
  if (types) target += `&types=${types}`;

  try {
    const resp = await fetch(target, {
      headers: {
        'Accept': 'application/json',
        'Accept-Language': 'pt-BR,pt;q=0.9',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Origin': 'https://www.ingresso.com',
        'Referer': 'https://www.ingresso.com/',
      }
    });

    const body = await resp.text();
    console.log('Ingresso status:', resp.status, 'length:', body.length, 'preview:', body.substring(0,100));

    const responseBody = body || JSON.stringify({debug:true, status:resp.status, message:'Empty response', url:target});

    return new Response(responseBody, {
      status: resp.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'X-Debug-Length': String(body.length),
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({error: err.message, url: target}), {
      status: 500,
      headers: {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'}
    });
  }
}
