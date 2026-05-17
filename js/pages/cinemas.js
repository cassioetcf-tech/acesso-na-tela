// ── CINEMAS PAGE — v2 ────────────────────────────────────────────────────────
// Arquitetura: Film-Sessions Index
// 1. Carrega filmes acessíveis do Supabase (1 chamada) + pré-busca eventIds
// 2. Dropdown de estado/cidade: dados estáticos (sem API)
// 3. Quando cidade selecionada: busca sessões de todos os filmes em paralelo
// 4. Agrega por teatro → renderiza cards com filmes dentro
//
// IDs de cidade para a API de sessões da Ingresso:
// Mapeados manualmente; city=1 é o fallback genérico (retorna resultados
// para parceiros mesmo sem ID específico de cidade).

(function () {
  'use strict';

  var API     = '/api/ingresso';
  var FAV_KEY = 'antela_cinema_favs';

  // ── IDs DE CIDADE NA INGRESSO ─────────────────────────────────────────────────
  // Chave: nome normalizado (sem acentos, minúsculo, sem espaços extras)
  // Valor: ID numérico usado na API de sessões
  // city=1 é o fallback — retorna sessões do parceiro sem filtro por cidade.
  var _INGRESSO_IDS = {
    'sao paulo':           '1011',
    'guarulhos':           '1011', // mesma região metropolitana
    'osasco':              '1011',
    'santo andre':         '1011',
    'sao bernardo do campo':'1011',
    'campinas':            '1012',
    'ribeirao preto':      '1013',
    'sorocaba':            '1014',
    'santos':              '1015',
    'sao jose dos campos': '1016',
    'rio de janeiro':      '1001',
    'niteroi':             '1001',
    'belo horizonte':      '1007',
    'brasilia':            '1006',
    'curitiba':            '1003',
    'porto alegre':        '1004',
    'salvador':            '1005',
    'fortaleza':           '1008',
    'recife':              '1009',
    'manaus':              '1010',
  };

  // Retorna o ID de cidade para a Ingresso (fallback = '1')
  function _getCityId(cityName) {
    return _INGRESSO_IDS[_norm(cityName)] || '1';
  }

  // ── ESTADOS E CIDADES (ESTÁTICOS) ─────────────────────────────────────────────
  var _STATES = [
    { uf: 'AC', nome: 'Acre' }, { uf: 'AL', nome: 'Alagoas' },
    { uf: 'AP', nome: 'Amapá' }, { uf: 'AM', nome: 'Amazonas' },
    { uf: 'BA', nome: 'Bahia' }, { uf: 'CE', nome: 'Ceará' },
    { uf: 'DF', nome: 'Distrito Federal' }, { uf: 'ES', nome: 'Espírito Santo' },
    { uf: 'GO', nome: 'Goiás' }, { uf: 'MA', nome: 'Maranhão' },
    { uf: 'MT', nome: 'Mato Grosso' }, { uf: 'MS', nome: 'Mato Grosso do Sul' },
    { uf: 'MG', nome: 'Minas Gerais' }, { uf: 'PA', nome: 'Pará' },
    { uf: 'PB', nome: 'Paraíba' }, { uf: 'PR', nome: 'Paraná' },
    { uf: 'PE', nome: 'Pernambuco' }, { uf: 'PI', nome: 'Piauí' },
    { uf: 'RJ', nome: 'Rio de Janeiro' }, { uf: 'RN', nome: 'Rio Grande do Norte' },
    { uf: 'RS', nome: 'Rio Grande do Sul' }, { uf: 'RO', nome: 'Rondônia' },
    { uf: 'RR', nome: 'Roraima' }, { uf: 'SC', nome: 'Santa Catarina' },
    { uf: 'SP', nome: 'São Paulo' }, { uf: 'SE', nome: 'Sergipe' },
    { uf: 'TO', nome: 'Tocantins' },
  ];

  var _CITIES = {
    AC: [{ name: 'Rio Branco' }],
    AL: [{ name: 'Maceió' }],
    AP: [{ name: 'Macapá' }],
    AM: [{ name: 'Manaus' }],
    BA: [
      { name: 'Salvador' }, { name: 'Feira de Santana' },
      { name: 'Vitória da Conquista' }, { name: 'Camaçari' },
    ],
    CE: [{ name: 'Fortaleza' }, { name: 'Caucaia' }, { name: 'Juazeiro do Norte' }],
    DF: [{ name: 'Brasília' }],
    ES: [{ name: 'Vitória' }, { name: 'Vila Velha' }, { name: 'Serra' }, { name: 'Cariacica' }],
    GO: [{ name: 'Goiânia' }, { name: 'Aparecida de Goiânia' }, { name: 'Anápolis' }],
    MA: [{ name: 'São Luís' }, { name: 'Imperatriz' }],
    MT: [{ name: 'Cuiabá' }, { name: 'Várzea Grande' }],
    MS: [{ name: 'Campo Grande' }, { name: 'Dourados' }],
    MG: [
      { name: 'Belo Horizonte' }, { name: 'Contagem' }, { name: 'Uberlândia' },
      { name: 'Juiz de Fora' }, { name: 'Betim' }, { name: 'Montes Claros' },
    ],
    PA: [{ name: 'Belém' }, { name: 'Ananindeua' }],
    PB: [{ name: 'João Pessoa' }, { name: 'Campina Grande' }],
    PR: [
      { name: 'Curitiba' }, { name: 'Londrina' }, { name: 'Maringá' },
      { name: 'Ponta Grossa' }, { name: 'Cascavel' }, { name: 'São José dos Pinhais' },
    ],
    PE: [
      { name: 'Recife' }, { name: 'Caruaru' }, { name: 'Olinda' },
      { name: 'Jaboatão dos Guararapes' },
    ],
    PI: [{ name: 'Teresina' }],
    RJ: [
      { name: 'Rio de Janeiro' }, { name: 'Niterói' }, { name: 'Nova Iguaçu' },
      { name: 'Duque de Caxias' }, { name: 'Volta Redonda' }, { name: 'Petrópolis' },
    ],
    RN: [{ name: 'Natal' }, { name: 'Mossoró' }],
    RS: [
      { name: 'Porto Alegre' }, { name: 'Caxias do Sul' }, { name: 'Pelotas' },
      { name: 'Canoas' }, { name: 'Santa Maria' },
    ],
    RO: [{ name: 'Porto Velho' }],
    RR: [{ name: 'Boa Vista' }],
    SC: [
      { name: 'Florianópolis' }, { name: 'Joinville' }, { name: 'Blumenau' },
      { name: 'São José' }, { name: 'Criciúma' },
    ],
    SP: [
      { name: 'São Paulo' }, { name: 'Campinas' }, { name: 'Guarulhos' },
      { name: 'São Bernardo do Campo' }, { name: 'Santo André' }, { name: 'Osasco' },
      { name: 'Ribeirão Preto' }, { name: 'Sorocaba' }, { name: 'Santos' },
      { name: 'São José dos Campos' }, { name: 'Mogi das Cruzes' },
      { name: 'Bauru' }, { name: 'Jundiaí' },
    ],
    SE: [{ name: 'Aracaju' }],
    TO: [{ name: 'Palmas' }],
  };

  // ── DADOS ─────────────────────────────────────────────────────────────────────
  var _accessibleFilms = []; // [{titulo, url_key, a11y, app, ingresso_url, tmdb_data}]
  var _eventIdCache    = {}; // ingresso_url → eventId
  var _theaters        = []; // lista atual renderizada
  var _favorites       = [];
  var _currentCityId   = '';
  var _currentCityName = '';

  // ── ELEMENTOS ─────────────────────────────────────────────────────────────────
  var elState   = document.getElementById('cf-state');
  var elCity    = document.getElementById('cf-city');
  var elSearch  = document.getElementById('cf-search');
  var elEmpty   = document.getElementById('cinemas-empty');
  var elLoading = document.getElementById('cinemas-loading');
  var elNone    = document.getElementById('cinemas-none');
  var elGrid    = document.getElementById('cinemas-grid');
  var elLive    = document.getElementById('live-region');

  // ── HELPERS ──────────────────────────────────────────────────────────────────
  function _esc(s) {
    return String(s || '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function _norm(s) {
    return (s || '').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  }

  function _slug(s) {
    return _norm(s).replace(/\s+/g, '-');
  }

  function _show(el) {
    [elEmpty, elLoading, elNone, elGrid].forEach(function (e) { if (e) e.hidden = true; });
    if (el) el.hidden = false;
  }

  function _announce(msg) {
    if (!elLive) return;
    elLive.textContent = '';
    setTimeout(function () { elLive.textContent = msg; }, 50);
  }

  // ── FAVORITOS ─────────────────────────────────────────────────────────────────
  function _loadFavs() {
    try { _favorites = JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); }
    catch (e) { _favorites = []; }
  }
  function _saveFavs() {
    try { localStorage.setItem(FAV_KEY, JSON.stringify(_favorites)); } catch (e) {}
  }
  function _isFav(id)    { return _favorites.indexOf(String(id)) !== -1; }
  function _toggleFav(id) {
    id = String(id);
    var i = _favorites.indexOf(id);
    if (i === -1) _favorites.push(id); else _favorites.splice(i, 1);
    _saveFavs();
  }

  // ── POPULAR ESTADOS ──────────────────────────────────────────────────────────
  function _populateStates() {
    _STATES.forEach(function (s) {
      var opt = document.createElement('option');
      opt.value = s.uf;
      opt.textContent = s.nome;
      elState.appendChild(opt);
    });
  }

  // ── POPULAR CIDADES ──────────────────────────────────────────────────────────
  function _populateCities(uf) {
    var cities = (_CITIES[uf] || []).slice().sort(function (a, b) {
      return a.name.localeCompare(b.name, 'pt-BR');
    });
    elCity.innerHTML = '<option value="">Selecione a cidade...</option>';
    cities.forEach(function (c) {
      var opt = document.createElement('option');
      opt.value = c.name; // nome da cidade como valor
      opt.textContent = c.name;
      elCity.appendChild(opt);
    });
    elCity.disabled = !cities.length;
  }

  // ── BUSCAR FILMES ACESSÍVEIS (SUPABASE) ───────────────────────────────────────
  function _fetchAccessibleFilms() {
    return supabaseGet('filmes?status=eq.cartaz&order=titulo&limit=100')
      .then(function (data) {
        return (data || []).filter(function (f) {
          if (!f.ingresso_url) return false;
          if (f.app) return true;
          var a = f.a11y || {};
          return a.ad === true || a.lse === true || a.libras === true;
        });
      })
      .catch(function () { return []; });
  }

  // ── PRÉ-BUSCAR EVENT IDs (background) ───────────────────────────────────────
  var _eventIdPromise = null;

  function _prefetchEventIds() {
    if (_eventIdPromise) return _eventIdPromise;
    _eventIdPromise = Promise.all(
      _accessibleFilms.map(function (f) {
        if (_eventIdCache[f.ingresso_url]) return Promise.resolve();
        return fetch(API + '?urlKey=' + encodeURIComponent(f.ingresso_url))
          .then(function (r) { return r.json(); })
          .then(function (ev) {
            if (ev && ev.id) _eventIdCache[f.ingresso_url] = String(ev.id);
          })
          .catch(function () {});
      })
    );
    return _eventIdPromise;
  }

  // ── CARREGAR TEATROS DA CIDADE ────────────────────────────────────────────────
  function _loadTheaters(cityName) {
    _currentCityName = cityName;
    _currentCityId   = _getCityId(cityName);
    _theaters        = [];
    elGrid.innerHTML = '';
    _show(elLoading);
    _announce('Buscando sessões acessíveis em ' + cityName + '...');

    var today = new Date().toISOString().slice(0, 10);

    _prefetchEventIds().then(function () {
      var filmsWithId = _accessibleFilms.filter(function (f) {
        return _eventIdCache[f.ingresso_url];
      });

      if (!filmsWithId.length) { _show(elNone); return; }

      // Busca sessões de todos os filmes acessíveis em paralelo
      return Promise.all(
        filmsWithId.map(function (f) {
          var evId = _eventIdCache[f.ingresso_url];
          var url  = API
            + '?eventId=' + encodeURIComponent(evId)
            + '&city='    + encodeURIComponent(_currentCityId)
            + '&date='    + today;
          return fetch(url)
            .then(function (r) { return r.json(); })
            .then(function (days) {
              return { film: f, days: Array.isArray(days) ? days : [] };
            })
            .catch(function () { return { film: f, days: [] }; });
        })
      );
    }).then(function (results) {
      if (!results) return;

      // Agrega: normalizedName → { name, address, films[] }
      var map = {};
      results.forEach(function (res) {
        var film = res.film;
        res.days.forEach(function (day) {
          (day.theaters || []).forEach(function (th) {
            if (!th.name) return;
            var key = _norm(th.name).replace(/\s/g, '');
            if (!map[key]) {
              map[key] = {
                id:      key,
                name:    th.name,
                address: [
                  th.address,
                  th.addressComplement,
                  th.neighborhood,
                ].filter(Boolean).join(', '),
                films: [],
              };
            }
            var dup = map[key].films.some(function (x) {
              return x.url_key === film.url_key;
            });
            if (!dup) map[key].films.push(film);
          });
        });
      });

      _theaters = Object.values(map).sort(function (a, b) {
        return a.name.localeCompare(b.name, 'pt-BR');
      });

      _renderTheaters();
      _announce(
        _theaters.length
          ? _theaters.length + ' cinema(s) com sessão acessível em ' + cityName
          : 'Nenhum cinema com sessão acessível encontrado em ' + cityName
      );
    }).catch(function () {
      _show(elNone);
    });
  }

  // ── RENDERIZAR CARDS ──────────────────────────────────────────────────────────
  function _renderTheaters() {
    var query = (elSearch.value || '').toLowerCase().trim();
    var list  = _theaters.filter(function (t) {
      return !query || t.name.toLowerCase().indexOf(query) !== -1;
    });

    list.sort(function (a, b) {
      var fa = _isFav(a.id) ? 0 : 1;
      var fb = _isFav(b.id) ? 0 : 1;
      if (fa !== fb) return fa - fb;
      return a.name.localeCompare(b.name, 'pt-BR');
    });

    if (!list.length) { _show(elNone); return; }

    var citySlug = _slug(_currentCityName);

    elGrid.innerHTML = list.map(function (t) {
      var fav         = _isFav(t.id);
      var cinemaSlug  = _slug(t.name);
      var ingressoUrl = 'https://www.ingresso.com/cinema/' + cinemaSlug
                      + (citySlug ? '?city=' + citySlug : '');
      var detailUrl   = 'cinema.html?' + [
        'id='       + encodeURIComponent(t.id),
        'name='     + encodeURIComponent(t.name),
        'address='  + encodeURIComponent(t.address || ''),
        'city='     + encodeURIComponent(_currentCityName),
        'citySlug=' + encodeURIComponent(citySlug),
      ].join('&');

      var filmsHtml = t.films.map(function (f) {
        var poster = (f.tmdb_data && f.tmdb_data.poster_path)
          ? 'https://image.tmdb.org/t/p/w92' + f.tmdb_data.poster_path
          : '';
        var a = f.a11y || {};
        var chips = '';
        if (a.ad     === true) chips += '<span class="cin-chip cin-chip--ad"  title="Audiodescrição">AD</span>';
        if (a.lse    === true) chips += '<span class="cin-chip cin-chip--lse" title="Legendas para surdos">LSE</span>';
        if (a.libras === true) chips += '<span class="cin-chip cin-chip--lib" title="Janela de Libras">Libras</span>';

        return (
          '<a class="cin-film-row" href="' + _esc('filme.html?urlKey=' + f.url_key) + '">' +
            (poster
              ? '<img class="cin-film-poster" src="' + _esc(poster) + '" alt="" loading="lazy">'
              : '<div class="cin-film-poster cin-film-poster--empty" aria-hidden="true">🎬</div>') +
            '<div class="cin-film-info">' +
              '<span class="cin-film-title">' + _esc(f.titulo) + '</span>' +
              (chips ? '<div class="cin-film-chips">' + chips + '</div>' : '') +
              (f.app ? '<span class="cin-film-app">📱 ' + _esc(f.app) + '</span>' : '') +
            '</div>' +
            '<svg class="cin-film-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>' +
          '</a>'
        );
      }).join('');

      return (
        '<div class="cin-card" role="listitem" data-id="' + _esc(t.id) + '">' +

          '<div class="cin-card-head">' +
            '<a class="cin-card-head-link" href="' + _esc(detailUrl) + '">' +
              '<h2 class="cin-name">' + _esc(t.name) + '</h2>' +
              (t.address ? '<p class="cin-addr">' + _esc(t.address) + '</p>' : '') +
            '</a>' +
            '<button class="cin-fav-btn' + (fav ? ' cin-fav-btn--active' : '') + '" ' +
              'data-id="' + _esc(t.id) + '" ' +
              'aria-label="' + _esc((fav ? 'Remover dos favoritos' : 'Favoritar') + ': ' + t.name) + '" ' +
              'aria-pressed="' + fav + '">' +
              '<svg width="18" height="18" viewBox="0 0 24 24" ' +
                'fill="' + (fav ? 'currentColor' : 'none') + '" ' +
                'stroke="currentColor" stroke-width="2" aria-hidden="true">' +
                '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>' +
              '</svg>' +
            '</button>' +
          '</div>' +

          '<div class="cin-films">' + filmsHtml + '</div>' +

          '<a class="cin-card-foot" href="' + _esc(ingressoUrl) + '" target="_blank" rel="noopener noreferrer">' +
            'Ver todas as sessões no Ingresso.com' +
            '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>' +
          '</a>' +

        '</div>'
      );
    }).join('');

    _show(elGrid);
  }

  // ── EVENTOS ───────────────────────────────────────────────────────────────────
  elState.addEventListener('change', function () {
    var uf = elState.value;
    elCity.innerHTML = '<option value="">Selecione a cidade...</option>';
    elCity.disabled  = true;
    _theaters        = [];
    elGrid.innerHTML = '';
    _show(elEmpty);
    if (!uf) return;
    _populateCities(uf);
  });

  elCity.addEventListener('change', function () {
    var cityName = elCity.value;
    if (!cityName) { _show(elEmpty); return; }
    _loadTheaters(cityName);
  });

  var _searchTimer;
  elSearch.addEventListener('input', function () {
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(function () {
      if (_theaters.length) _renderTheaters();
    }, 250);
  });

  elGrid.addEventListener('click', function (e) {
    var btn = e.target.closest('.cin-fav-btn');
    if (!btn) return;
    e.preventDefault();
    _toggleFav(btn.dataset.id);
    _renderTheaters();
  });

  // ── INIT ──────────────────────────────────────────────────────────────────────
  function init() {
    renderHeader('cinemas');
    renderFooter();
    _loadFavs();
    _populateStates();
    _show(elEmpty);

    // Carrega filmes acessíveis e pré-busca eventIds em background
    _fetchAccessibleFilms().then(function (filmes) {
      _accessibleFilms = filmes;
      if (filmes.length) _prefetchEventIds();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
