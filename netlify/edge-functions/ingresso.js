export default async function handler(request) {
  const url = new URL(request.url);
  const path = url.searchParams.get('path') || '/films';
  const city = url.searchParams.get('city') || '1011';
  const date = url.searchParams.get('date') || '';
  const types = url.searchParams.get('types') || '';

  let target = `https://api-content.ingresso.com/v0${path}?partnership=locomotivadigital&city=${city}`;
  if (date) target += `&date=${date}`;
  if (types) target += `&types=${types}`;

  const resp = await fetch(target, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0',
      'Origin': 'https://www.ingresso.com',
      'Referer': 'https://www.ingresso.com/',
    }
  });

  const body = await resp.text();
  return new Response(body, {
    status: resp.status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    }
  });
}
