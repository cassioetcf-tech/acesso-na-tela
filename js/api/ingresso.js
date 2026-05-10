// ── INGRESSO.COM — Edge Function proxy ───────────────────────────────────────
// Todas as chamadas passam pela Edge Function /api/ingresso para evitar CORS.
// Depende de: nada

/**
 * Busca o eventId do Ingresso a partir da url_key do filme.
 * GET /api/ingresso?urlKey={urlKey}
 * Retorna o objeto do evento (contém .id = eventId).
 */
async function getEventId(urlKey) {
  var r = await fetch('/api/ingresso?urlKey=' + encodeURIComponent(urlKey));
  if (!r.ok) throw new Error('Ingresso getEventId HTTP ' + r.status);
  return r.json();
}

/**
 * Busca sessões de um evento para uma cidade e data específicas.
 * GET /api/ingresso?eventId={eventId}&city={cityId}&date={date}
 * Retorna array de objetos de dia com theaters/rooms/sessions.
 */
async function getSessoes(eventId, cityId, date) {
  var params = 'eventId=' + encodeURIComponent(eventId) +
               '&city=' + encodeURIComponent(cityId) +
               '&date=' + encodeURIComponent(date);
  var r = await fetch('/api/ingresso?' + params);
  if (!r.ok) throw new Error('Ingresso getSessoes HTTP ' + r.status);
  return r.json();
}

/**
 * Busca lista de filmes em cartaz via Ingresso.
 * GET /api/ingresso?type=nowplaying
 */
async function getNowPlaying() {
  var r = await fetch('/api/ingresso?type=nowplaying');
  if (!r.ok) throw new Error('Ingresso getNowPlaying HTTP ' + r.status);
  return r.json();
}
