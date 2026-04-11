// Netlify Edge Function — catalog
// Uses Netlify Blobs REST API directly (no npm imports needed)

const ADMIN_KEY = 'acesso2025';

export default async function handler(request, context) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key',
  };

  if (request.method === 'OPTIONS') {
    return new Response('', { status: 200, headers });
  }

  // Build Netlify Blobs REST endpoint
  // Context provides siteID and token automatically in Edge Functions
  const siteId  = context.site?.id || Netlify.env.get('SITE_ID') || '';
  const token   = Netlify.env.get('NETLIFY_BLOBS_TOKEN') || context.token || '';
  const blobUrl = `https://blobs.netlify.com/api/v1/sites/${siteId}/catalog`;

  const blobHeaders = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  // ── GET — public ──────────────────────────────────────────────────────────
  if (request.method === 'GET') {
    try {
      const res = await fetch(blobUrl, { headers: blobHeaders });
      if (res.status === 404) {
        return new Response('[]', { status: 200, headers });
      }
      const text = await res.text();
      const data = JSON.parse(text || '[]');
      return new Response(JSON.stringify(data), { status: 200, headers });
    } catch (e) {
      return new Response('[]', { status: 200, headers });
    }
  }

  // ── POST — requires admin key ─────────────────────────────────────────────
  const adminKey = request.headers.get('X-Admin-Key');
  if (adminKey !== ADMIN_KEY) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers });
  }

  if (request.method === 'POST') {
    try {
      const body = await request.json();

      // Get current list
      let list = [];
      try {
        const res = await fetch(blobUrl, { headers: blobHeaders });
        if (res.ok) {
          const text = await res.text();
          list = JSON.parse(text || '[]');
          if (!Array.isArray(list)) list = [];
        }
      } catch (e) { list = []; }

      if (body.action === 'save') {
        const filme = body.filme;
        if (!filme || !filme.id) {
          return new Response(JSON.stringify({ error: 'Invalid data' }), { status: 400, headers });
        }
        const idx = list.findIndex(f => f.id === filme.id);
        if (idx > -1) list[idx] = filme;
        else list.push(filme);

        await fetch(blobUrl, {
          method: 'PUT',
          headers: blobHeaders,
          body: JSON.stringify(list),
        });
        return new Response(JSON.stringify({ ok: true, total: list.length }), { status: 200, headers });
      }

      if (body.action === 'delete') {
        const updated = list.filter(f => f.id !== body.id);
        await fetch(blobUrl, {
          method: 'PUT',
          headers: blobHeaders,
          body: JSON.stringify(updated),
        });
        return new Response(JSON.stringify({ ok: true, total: updated.length }), { status: 200, headers });
      }

      return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
    }
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });
}

export const config = { path: '/api/catalog' };
