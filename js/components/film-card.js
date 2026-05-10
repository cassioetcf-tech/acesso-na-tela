// ── FILM CARD BUILDER ─────────────────────────────────────────────────────────
// Funções de construção de cards HTML para grades de filmes.
// Depende de: js/utils.js (escHtml), js/config.js (CONFIG.TMDB_IMG)

var _A11Y_FIELDS = {
  ad:     { label: 'AD',     cls: 'pb-ad'  },
  lse:    { label: 'LSE',    cls: 'pb-lse' },
  libras: { label: 'LIBRAS', cls: 'pb-lib' },
};

/**
 * Decide qual aplicativo listar com base nos recursos de acessibilidade.
 */
function _pickApp(a11y, appOverride) {
  if (appOverride) return appOverride;
  if (!a11y || (a11y.ad === false && a11y.lse === false && a11y.libras === false)) return '';
  if (a11y.ad !== false)     return 'MovieReading';
  if (a11y.lse !== false)    return 'GRETA';
  if (a11y.libras !== false) return 'PingPlay';
  return 'A confirmar';
}

/**
 * Monta as badges de acessibilidade em HTML.
 * a11y: objeto { ad, lse, libras } onde false = ausente, true/undefined = presente
 */
function _buildBadgesHtml(a11y) {
  if (a11y && a11y.ad === false && a11y.lse === false && a11y.libras === false) {
    return '<span class="pbadge pb-none"><span class="pb-none-x"></span>Sem acessibilidade</span>';
  }
  var html = '';
  if (!a11y || a11y.ad     !== false) html += '<span class="pbadge pb-ad" aria-label="Audiodescrição">AD</span>';
  if (!a11y || a11y.lse    !== false) html += '<span class="pbadge pb-lse" aria-label="Legenda para surdos">LSE</span>';
  if (!a11y || a11y.libras !== false) html += '<span class="pbadge pb-lib" aria-label="Libras">LIBRAS</span>';
  return html;
}

/**
 * Monta a linha de metadados (gênero · classificação · duração) a partir de dados TMDb.
 */
function _buildMeta(tmdb) {
  if (!tmdb) return '';
  var parts = [];
  var genre = (tmdb.genres || [])[0];
  if (genre) parts.push(genre.name);

  var cert = 'Livre';
  ((tmdb.release_dates || {}).results || []).forEach(function (r) {
    if (r.iso_3166_1 === 'BR') {
      r.release_dates.forEach(function (x) { if (x.certification) cert = x.certification + ' anos'; });
    }
  });
  parts.push(cert);

  if (tmdb.runtime) parts.push(tmdb.runtime + 'min');
  return parts.join(' · ');
}

/**
 * Constrói um card para filmes em cartaz / catálogo.
 * filme: registro do Supabase { titulo, url_key, a11y, app, ... }
 * tmdb:  dados do TMDb (pode ser null)
 */
function buildCard(filme, tmdb) {
  var title  = (tmdb && tmdb.title) || filme.titulo || '';
  var poster = (tmdb && tmdb.poster_path) ? CONFIG.TMDB_IMG + tmdb.poster_path : '';
  var meta   = _buildMeta(tmdb);
  var app    = _pickApp(filme.a11y, filme.app);
  var href   = filme.url_key
    ? 'acesso-na-tela-filme.html?urlKey=' + encodeURIComponent(filme.url_key)
    : '#';

  var a = document.createElement('a');
  a.href = href;
  a.className = 'film-card-link';
  a.setAttribute('aria-label', 'Saiba mais sobre ' + escHtml(title));

  a.innerHTML =
    '<article class="film-card" role="listitem" aria-label="' + escHtml(title) + '">' +
      '<div class="poster" style="' +
        (poster
          ? 'background-image:url(' + poster + ');background-size:cover;background-position:center top;'
          : 'background:#1A2E4A;') +
        '" aria-hidden="true">' +
        '<div class="poster-badges">' + _buildBadgesHtml(filme.a11y) + '</div>' +
        '<div class="poster-title">' + escHtml(title) + '</div>' +
      '</div>' +
      '<div class="film-body">' +
        '<div class="film-name">' + escHtml(title) + '</div>' +
        '<div class="film-meta">' + escHtml(meta) + '</div>' +
        (app ? '<div class="film-app"><span class="app-dot" aria-hidden="true"></span>' + escHtml(app) + '</div>' : '') +
        '<button class="btn-card">Saiba mais</button>' +
      '</div>' +
    '</article>';

  return a;
}

/**
 * Constrói um card para a seção "Em breve".
 * filme: registro do Supabase
 * tmdb:  dados do TMDb (pode ser null)
 */
function buildBreveCard(filme, tmdb) {
  var title   = (tmdb && tmdb.title) || filme.titulo || '';
  var poster  = (tmdb && tmdb.poster_path) ? CONFIG.TMDB_IMG + tmdb.poster_path : '';
  var release = (tmdb && tmdb.release_date)
    ? new Date(tmdb.release_date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
    : 'Em breve';
  var href = filme.url_key
    ? 'acesso-na-tela-filme.html?urlKey=' + encodeURIComponent(filme.url_key)
    : '#';

  var a = document.createElement('a');
  a.href = href;
  a.className = 'film-card-link';
  a.setAttribute('aria-label', 'Saiba mais sobre ' + escHtml(title));

  a.innerHTML =
    '<article class="film-card coming-card" role="listitem" aria-label="' + escHtml(title) + '">' +
      '<div class="poster" style="' +
        (poster
          ? 'background-image:url(' + poster + ');background-size:cover;background-position:center top;'
          : 'background:#1A2E4A;') +
        '" aria-hidden="true">' +
        '<div class="poster-badges">' +
          '<span class="pbadge pb-ad">AD</span>' +
          '<span class="pbadge pb-lse">LSE</span>' +
          '<span class="pbadge pb-lib">LIBRAS</span>' +
        '</div>' +
        '<div class="poster-title">' + escHtml(title) + '</div>' +
      '</div>' +
      '<div class="film-body">' +
        '<div class="film-name">' + escHtml(title) + '</div>' +
        '<div class="film-meta">' + escHtml(release) + '</div>' +
        '<div class="film-app"><span style="font-size:11px;color:var(--ink3)">Acessibilidade a confirmar</span></div>' +
        '<button class="btn-card">Saiba mais</button>' +
      '</div>' +
    '</article>';

  return a;
}
