// ── TMDB API WRAPPER ──────────────────────────────────────────────────────────
// Depende de: js/config.js (CONFIG.TMDB_TOKEN, CONFIG.TMDB_BASE)

/**
 * Requisição genérica ao TMDb.
 * path: ex '/movie/123?language=pt-BR'
 * params: objeto com query params adicionais (opcional)
 */
async function tmdbGet(path, params) {
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
  return r.json();
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
