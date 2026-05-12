// ── SUPABASE REST WRAPPER ─────────────────────────────────────────────────────
// Depende de: js/config.js (CONFIG.SUPA_URL, CONFIG.SUPA_KEY)

function _supaHeaders(extra) {
  var h = {
    'apikey': CONFIG.SUPA_KEY,
    'Authorization': 'Bearer ' + CONFIG.SUPA_KEY,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
  };
  return Object.assign(h, extra || {});
}

/**
 * GET /rest/v1/{table}?{query}
 * query: string de query string ex: 'status=eq.cartaz&order=created_at.desc'
 */
async function supabaseGet(table, query) {
  var url = CONFIG.SUPA_URL + '/rest/v1/' + table + (query ? '?' + query : '');
  var r = await fetch(url, { headers: _supaHeaders() });
  if (!r.ok) throw new Error('Supabase GET ' + table + ' HTTP ' + r.status);
  return r.json();
}

/**
 * POST /rest/v1/{table}
 * body: object ou array
 */
async function supabasePost(table, body, prefer) {
  var url = CONFIG.SUPA_URL + '/rest/v1/' + table;
  var headers = _supaHeaders(prefer ? { 'Prefer': prefer } : {});
  var r = await fetch(url, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    var msg = await r.text();
    throw new Error('Supabase POST ' + table + ' HTTP ' + r.status + ': ' + msg);
  }
  var text = await r.text();
  return text ? JSON.parse(text) : null;
}

/**
 * PATCH /rest/v1/{table}?{query}
 * query: filtro ex: 'id=eq.abc123'
 * body: campos a atualizar
 */
async function supabasePatch(table, query, body) {
  var url = CONFIG.SUPA_URL + '/rest/v1/' + table + (query ? '?' + query : '');
  var r = await fetch(url, {
    method: 'PATCH',
    headers: _supaHeaders(),
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    var msg = await r.text();
    throw new Error('Supabase PATCH ' + table + ' HTTP ' + r.status + ': ' + msg);
  }
  var text = await r.text();
  return text ? JSON.parse(text) : null;
}

/**
 * DELETE /rest/v1/{table}?{query}
 * query: filtro ex: 'id=eq.abc123'
 */
async function supabaseDelete(table, query) {
  var url = CONFIG.SUPA_URL + '/rest/v1/' + table + (query ? '?' + query : '');
  var r = await fetch(url, {
    method: 'DELETE',
    headers: _supaHeaders(),
  });
  if (!r.ok) {
    var msg = await r.text();
    throw new Error('Supabase DELETE ' + table + ' HTTP ' + r.status + ': ' + msg);
  }
  return true;
}
