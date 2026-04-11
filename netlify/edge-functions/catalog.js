import { getStore } from '@netlify/blobs';

const ADMIN_KEY = 'acesso2025';

export default async function handler(request) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key',
  };

  if (request.method === 'OPTIONS') {
    return new Response('', { status: 200, headers });
  }

  const store = getStore('filmes');

  if (request.method === 'GET') {
    try {
      const data = await store.get('catalog', { type: 'json' });
      return new Response(JSON.stringify(data || []), { status: 200, headers });
    } catch (e) {
      return new Response(JSON.stringify([]), { status: 200, headers });
    }
  }

  const adminKey = request.headers.get('X-Admin-Key');
  if (adminKey !== ADMIN_KEY) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers });
  }

  if (request.method === 'POST') {
    try {
      const body = await request.json();
      const current = await store.get('catalog', { type: 'json' }).catch(() => []);
      const list = Array.isArray(current) ? current : [];

      if (body.action === 'save') {
        const filme = body.filme;
        if (!filme || !filme.id) {
          return new Response(JSON.stringify({ error: 'Invalid data' }), { status: 400, headers });
        }
        const idx = list.findIndex(f => f.id === filme.id);
        if (idx > -1) list[idx] = filme;
        else list.push(filme);
        await store.setJSON('catalog', list);
        return new Response(JSON.stringify({ ok: true, total: list.length }), { status: 200, headers });
      }
