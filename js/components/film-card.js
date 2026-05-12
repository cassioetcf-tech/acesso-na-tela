// ── FILM CARD BUILDER ─────────────────────────────────────────────────────────
// Depende de: js/utils.js (escHtml), js/config.js (CONFIG.TMDB_IMG)

/**
 * Retorna o app_status efetivo do filme (suporta registros antigos sem o campo).
 */
function getAppStatus(filme) {
  if (filme.app_status) return filme.app_status;
  // Retrocompatibilidade
  if (filme.app) return 'confirmado';
  var a = filme.a11y || {};
  if (a.ad === false && a.lse === false && a.libras === false) return 'sem_acessibilidade';
  return 'pendente';
}

/**
 * Badges de acessibilidade conforme app_status.
 * confirmado         → AD / LSE / LIBRAS (conforme campos a11y)
 * pendente           → chip "A verificar"
 * sem_acessibilidade → chip "Sem acessibilidade"
 */
function _buildBadgesHtml(filme) {
  var status = getAppStatus(filme);

  if (status === 'pendente') {
    return '<span class="pbadge pb-pending">A verificar</span>';
  }
  if (status === 'sem_acessibilidade') {
    return '<span class="pbadge pb-none">Sem acessibilidade</span>';
  }

  // confirmado — mostra quais recursos estão disponíveis
  var a    = filme.a11y || {};
  var html = '';
  if (a.ad     !== false) html += '<span class="pbadge pb-ad"  aria-label="Audiodescrição">AD</span>';
  if (a.lse    !== false) html += '<span class="pbadge pb-lse" aria-label="Legenda para surdos">LSE</span>';
  if (a.libras !== false) html += '<span class="pbadge pb-lib" aria-label="Libras">LIBRAS</span>';
  return html || '<span class="pbadge pb-pending">A verificar</span>';
}

/**
 * Linha de metadados (gênero · classificação · duração) a partir do TMDb.
 */
function _buildMeta(tmdb) {
  if (!tmdb) return '';
  var parts = [];
  var genre = (tmdb.genres || [])[0];
  if (genre) parts.push(genre.name);

  var cert = '';
  ((tmdb.release_dates || {}).results || []).forEach(function (r) {
    if (r.iso_3166_1 === 'BR') {
      r.release_dates.forEach(function (x) { if (x.certification) cert = x.certification; });
    }
  });
  if (cert) parts.push(cert === 'L' ? 'Livre' : cert + ' anos');
  if (tmdb.runtime) parts.push(tmdb.runtime + 'min');
  return parts.join(' · ');
}

/**
 * Constrói o card de filme.
 * filme: registro Supabase { titulo, url_key, a11y, app, app_status, tmdb_data, ... }
 * tmdb:  dados TMDb enriquecidos (pode ser null — usa filme.tmdb_data como fallback)
 */
function buildCard(filme, tmdb) {
  var tmdbData  = tmdb || filme.tmdb_data || null;
  var title     = (tmdbData && tmdbData.title) || filme.titulo || '';
  var poster    = (tmdbData && tmdbData.poster_path)
    ? CONFIG.TMDB_IMG + tmdbData.poster_path
    : '';
  var meta      = _buildMeta(tmdbData);
  var appStatus = getAppStatus(filme);
  var href      = filme.url_key
    ? 'filme.html?urlKey=' + encodeURIComponent(filme.url_key)
    : '#';

  var cardCls = 'film-card';
  if (appStatus === 'sem_acessibilidade') cardCls += ' card-no-a11y';
  if (appStatus === 'pendente')           cardCls += ' card-pending';

  var appLine = '';
  if (appStatus === 'confirmado' && filme.app) {
    appLine = '<div class="film-app"><span class="app-dot" aria-hidden="true"></span>' + escHtml(filme.app) + '</div>';
  } else if (appStatus === 'pendente') {
    appLine = '<div class="film-app film-app-pending">Acessibilidade a confirmar</div>';
  }

  var a = document.createElement('a');
  a.href      = href;
  a.className = 'film-card-link';
  a.setAttribute('aria-label', 'Saiba mais sobre ' + escHtml(title));

  a.innerHTML =
    '<article class="' + cardCls + '" role="listitem" aria-label="' + escHtml(title) + '">' +
      '<div class="poster" aria-hidden="true">' +
        (poster
          ? '<img class="poster-img" src="' + poster + '" alt="" loading="lazy">'
          : '<div class="poster-placeholder"><span>' + escHtml((title || '??').slice(0, 2).toUpperCase()) + '</span></div>'
        ) +
        '<div class="poster-badges">' + _buildBadgesHtml(filme) + '</div>' +
      '</div>' +
      '<div class="film-body">' +
        '<div class="film-name">' + escHtml(title) + '</div>' +
        (meta ? '<div class="film-meta">' + escHtml(meta) + '</div>' : '') +
        appLine +
        '<span class="btn-card" aria-hidden="true">Saiba mais</span>' +
      '</div>' +
    '</article>';

  return a;
}

/**
 * Card para "Em breve" (mantido por compatibilidade).
 */
function buildBreveCard(filme, tmdb) {
  var tmdbData = tmdb || filme.tmdb_data || null;
  var title    = (tmdbData && tmdbData.title) || filme.titulo || '';
  var poster   = (tmdbData && tmdbData.poster_path) ? CONFIG.TMDB_IMG + tmdbData.poster_path : '';
  var release  = (tmdbData && tmdbData.release_date)
    ? new Date(tmdbData.release_date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
    : 'Em breve';
  var href = filme.url_key ? 'filme.html?urlKey=' + encodeURIComponent(filme.url_key) : '#';

  var a = document.createElement('a');
  a.href      = href;
  a.className = 'film-card-link';
  a.setAttribute('aria-label', 'Saiba mais sobre ' + escHtml(title));

  a.innerHTML =
    '<article class="film-card coming-card card-pending" role="listitem" aria-label="' + escHtml(title) + '">' +
      '<div class="poster" aria-hidden="true">' +
        (poster ? '<img class="poster-img" src="' + poster + '" alt="" loading="lazy">' : '') +
        '<div class="poster-badges"><span class="pbadge pb-pending">Em breve</span></div>' +
      '</div>' +
      '<div class="film-body">' +
        '<div class="film-name">' + escHtml(title) + '</div>' +
        '<div class="film-meta">' + escHtml(release) + '</div>' +
        '<div class="film-app film-app-pending">Acessibilidade a confirmar</div>' +
        '<span class="btn-card" aria-hidden="true">Saiba mais</span>' +
      '</div>' +
    '</article>';

  return a;
}
