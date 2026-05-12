// ── TMDB API WRAPPER ──────────────────────────────────────────────────────────
// Depende de: js/config.js (CONFIG.TMDB_TOKEN, CONFIG.TMDB_BASE)

var _TMDB_CACHE_TTL = 30 * 60 * 1000; // 30 min

function _tmdbCacheGet(key) {
  try {
    var raw = sessionStorage.getItem(key);
    if (!raw) return null;
    var entry = JSON.parse(raw);
    if (Date.now() > entry.exp) { sessionStorage.removeItem(key); return null; }
    return entry.data;
  } catch(e) { return null; }
}

function _tmdbCacheSet(key, data) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ data: data, exp: Date.now() + _TMDB_CACHE_TTL }));
  } catch(e) {} // ignora QuotaExceededError
}

/**
 * Requisição genérica ao TMDb com cache sessionStorage (30 min).
 * path: ex '/movie/123?language=pt-BR'
 * params: objeto com query params adicionais (opcional)
 */
async function tmdbGet(path, params) {
  var cacheKey = 'tmdb|' + path + (params ? '|' + JSON.stringify(params) : '');
  var cached = _tmdbCacheGet(cacheKey);
  if (cached) return cached;

  var url = CONFIG.TMDB_BASE + path;
  if (params) {
    var qs = Object.keys(params).map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
    }).join('&');
    url += (url.includes('?') ? '&' : '?') + qs;
  }
  var r = await fetch(url, {
    headers: {
      'Authorization': 'Bearer ' + CONFIG.TMDB_TOKEN,
      'accept': 'application/json',
    },
  });
  if (!r.ok) throw new Error('TMDb HTTP ' + r.status + ' for ' + path);
  var data = await r.json();
  _tmdbCacheSet(cacheKey, data);
  return data;
}

/**
 * Busca detalhes completos de um filme pelo ID TMDb.
 * Inclui credits, release_dates e videos num único request.
 */
async function getMovie(tmdbId) {
  return tmdbGet('/movie/' + tmdbId, {
    language: 'pt-BR',
    append_to_response: 'credits,release_dates,videos',
  });
}

/**
 * Busca filmes no TMDb por título.
 * Retorna o array results (pode ser vazio).
 */
async function searchMovie(title) {
  var data = await tmdbGet('/search/movie', {
    query: title,
    language: 'pt-BR',
    region: 'BR',
  });
  return data.results || [];
}

/**
 * Busca provedores de streaming do filme no Brasil.
 * Retorna o objeto results.BR (pode ser undefined).
 */
async function getWatchProviders(tmdbId) {
  var data = await tmdbGet('/movie/' + tmdbId + '/watch/providers');
  return (data.results && data.results.BR) || null;
}
