// ── CINEMA DETAIL PAGE ───────────────────────────────────────────────────────
// Lê parâmetros da URL, exibe info do cinema e busca filmes em cartaz
// usando a API da Ingresso para o teatro correspondente.

(function () {
  'use strict';

  var API = '/api/ingresso';

  // ── HELPERS ──────────────────────────────────────────────────────────────────
  function _qs(key) {
    return decodeURIComponent((new URLSearchParams(window.location.search).get(key) || ''));
  }

  // Converte nome em slug (igual ao titleToUrlKey da edge function)
  function _slug(name) {
    return (name || '')
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  }

  function _esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── DADOS DA URL ─────────────────────────────────────────────────────────────
  var cinemaId       = _qs('id');
  var cinemaName     = _qs('name')     || 'Cinema';
  var cinemaAddress  = _qs('address')  || '';
  var cityName       = _qs('city')     || '';
  var citySlug       = _qs('citySlug') || _slug(cityName);
  var cinemaSlug     = _slug(cinemaName);

  // URL para Ingresso.com (sessões e ingressos)
  var ingressoUrl = 'https://www.ingresso.com/cinema/' + cinemaSlug +
                    (citySlug ? '?city=' + citySlug : '');

  // URL Google Maps
  var mapsQuery  = encodeURIComponent(cinemaName + (cinemaAddress ? ' ' + cinemaAddress : '') + (cityName ? ' ' + cityName : ''));
  var mapsUrl    = 'https://www.google.com/maps/search/?api=1&query=' + mapsQuery;

  // ── ELEMENTOS ────────────────────────────────────────────────────────────────
  var elTitle       = document.getElementById('cinema-h1');
  var elAddress     = document.getElementById('cinema-address');
  var elActions     = document.getElementById('cinema-hero-actions');
  var elBcName      = document.getElementById('bc-name');
  var elInfoList    = document.getElementById('cinema-info-list');
  var elLoading     = document.getElementById('cinema-filmes-loading');
  var elNone        = document.getElementById('cinema-filmes-none');
  var elGrid        = document.getElementById('cinema-filmes-grid');
  var elIngressoLnk = document.getElementById('cinema-ingresso-link');

  // ── POPULAR INFO ─────────────────────────────────────────────────────────────
  function _populateInfo() {
    document.title = cinemaName + ' — Acesso na Tela';
    elTitle.textContent   = cinemaName;
    elBcName.textContent  = cinemaName;
    elAddress.textContent = cinemaAddress || (cityName ? cityName : '');
    if (elIngressoLnk) elIngressoLnk.href = ingressoUrl;

    // Botões de ação no hero
    elActions.innerHTML =
      '<a class="cinema-btn" href="' + _esc(ingressoUrl) + '" target="_blank" rel="noopener noreferrer">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' +
        'Ver sessões no Ingresso.com' +
      '</a>' +
      '<a class="cinema-btn cinema-btn--outline" href="' + _esc(mapsUrl) + '" target="_blank" rel="noopener noreferrer">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>' +
        'Ver no mapa' +
      '</a>';

    // Lista de informações
    var items = [];
    if (cinemaAddress) items.push({ icon: '📍', label: 'Endereço', value: cinemaAddress });
    if (cityName)      items.push({ icon: '🏙️', label: 'Cidade',   value: cityName });
    items.push({ icon: '♿', label: 'Acessibilidade', value: 'Consulte a programação para ver quais sessões têm audiodescrição, LSE ou Libras.' });

    elInfoList.innerHTML = items.map(function (item) {
      return '<li class="cinema-info-item">' +
        '<span class="cinema-info-icon" aria-hidden="true">' + item.icon + '</span>' +
        '<div><strong>' + _esc(item.label) + '</strong><p>' + _esc(item.value) + '</p></div>' +
      '</li>';
    }).join('');
  }

  // ── BUSCAR FILMES ─────────────────────────────────────────────────────────────
  // Estratégia:
  // 1. Busca filmes em cartaz (nowplaying) do nosso catálogo no Supabase
  // 2. Para cada filme, tenta buscar sessões via Ingresso e filtra pelo teatro
  // Esta abordagem funciona sem chamar a API de theaters inexistente.
  function _loadFilmes() {
    // Busca filmes do Supabase que têm sessões registradas
    supabaseGet(
      'filmes?status=eq.cartaz&order=titulo&limit=50'
    ).then(function (filmes) {
      if (!filmes || !filmes.length) {
        _showNone();
        return;
      }
      // Filtra apenas filmes que têm ingresso_url (ou seja, estão na Ingresso)
      var comIngresso = filmes.filter(function (f) { return f.ingresso_url; });
      if (!comIngresso.length) { _showNone(); return; }

      // Busca sessões dos primeiros filmes para encontrar quais têm sessão neste cinema
      _fetchSessionsForCinema(comIngresso);
    }).catch(function () {
      _showNone();
    });
  }

  function _fetchSessionsForCinema(filmes) {
    var found    = [];
    var checked  = 0;
    var total    = Math.min(filmes.length, 8); // verifica até 8 filmes
    var today    = new Date().toISOString().slice(0, 10);

    function _checkNext() {
      if (checked >= total) {
        if (found.length) _renderFilmes(found);
        else              _showNone();
        return;
      }
      var filme = filmes[checked++];
      // Passo 1: pega o eventId
      fetch(API + '?urlKey=' + encodeURIComponent(filme.ingresso_url))
        .then(function (r) { return r.json(); })
        .then(function (ev) {
          if (!ev || !ev.id) { _checkNext(); return; }
          var city = '1011'; // SP padrão; expandir com mapa cidade→id quando necessário
          // Passo 2: busca sessões para o eventId na cidade
          return fetch(API + '?eventId=' + encodeURIComponent(ev.id) + '&city=' + city + '&date=' + today)
            .then(function (r) { return r.json(); })
            .then(function (days) {
              // Verifica se alguma sessão é neste cinema (compara pelo nome)
              var cinNorm = cinemaName.toLowerCase().replace(/\s+/g, '');
              var match   = false;
              (Array.isArray(days) ? days : []).forEach(function (day) {
                (day.theaters || []).forEach(function (th) {
                  var thNorm = (th.name || '').toLowerCase().replace(/\s+/g, '');
                  if (thNorm.indexOf(cinNorm.substring(0, 8)) !== -1 ||
                      cinNorm.indexOf(thNorm.substring(0, 8)) !== -1) {
                    match = true;
                  }
                });
              });
              if (match) found.push(filme);
              _checkNext();
            });
        })
        .catch(function () { _checkNext(); });
    }
    _checkNext();
  }

  function _renderFilmes(filmes) {
    elLoading.hidden = true;
    if (!filmes.length) { _showNone(); return; }

    elGrid.innerHTML = filmes.map(function (f) {
      var poster = (f.tmdb_data && f.tmdb_data.poster_path)
        ? 'https://image.tmdb.org/t/p/w300' + f.tmdb_data.poster_path
        : '';
      return (
        '<a class="film-card-link" href="filme.html?urlKey=' + _esc(f.url_key) + '">' +
          '<div class="film-card">' +
            '<div class="film-poster">' +
              (poster
                ? '<img src="' + _esc(poster) + '" alt="" loading="lazy">'
                : '<div class="poster-placeholder">🎬</div>') +
            '</div>' +
            '<div class="film-info">' +
              '<p class="film-title">' + _esc(f.titulo) + '</p>' +
            '</div>' +
          '</div>' +
        '</a>'
      );
    }).join('');

    elGrid.hidden = false;
  }

  function _showNone() {
    elLoading.hidden = true;
    elNone.hidden    = false;
    if (elIngressoLnk) elIngressoLnk.href = ingressoUrl;
  }

  // ── INIT ─────────────────────────────────────────────────────────────────────
  function init() {
    renderHeader('cinemas');
    renderFooter();
    _populateInfo();
    _loadFilmes();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
