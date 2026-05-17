// ── CINEMAS PAGE — v2 ────────────────────────────────────────────────────────
// Arquitetura: Film-Sessions Index
// 1. Carrega filmes acessíveis do Supabase (1 chamada)
// 2. Carrega cidades da Ingresso com IDs (1 chamada)
// 3. Quando cidade selecionada: busca sessões de todos os filmes em paralelo
// 4. Agrega por teatro → renderiza cards com filmes dentro

(function () {
  'use strict';

  var API     = '/api/ingresso';
  var FAV_KEY = 'antela_cinema_favs';

  // ── NOMES DE ESTADOS ──────────────────────────────────────────────────────────
  var _STATE_NAMES = {
    AC:'Acre', AL:'Alagoas', AP:'Amapá', AM:'Amazonas',
    BA:'Bahia', CE:'Ceará', DF:'Distrito Federal', ES:'Espírito Santo',
    GO:'Goiás', MA:'Maranhão', MT:'Mato Grosso', MS:'Mato Grosso do Sul',
    MG:'Minas Gerais', PA:'Pará', PB:'Paraíba', PR:'Paraná',
    PE:'Pernambuco', PI:'Piauí', RJ:'Rio de Janeiro', RN:'Rio Grande do Norte',
    RS:'Rio Grande do Sul', RO:'Rondônia', RR:'Roraima', SC:'Santa Catarina',
    SP:'São Paulo', SE:'Sergipe', TO:'Tocantins',
  };

  // Mapa nome normalizado → UF (fallback quando Ingresso não retorna UF)
  var _CITY_UF = {
    'rio branco':'AC', 'maceio':'AL', 'macapa':'AP', 'manaus':'AM',
    'salvador':'BA', 'feira de santana':'BA', 'vitoria da conquista':'BA', 'camacari':'BA',
    'fortaleza':'CE', 'caucaia':'CE', 'juazeiro do norte':'CE',
    'brasilia':'DF',
    'vitoria':'ES', 'vila velha':'ES', 'serra':'ES', 'cariacica':'ES',
    'goiania':'GO', 'aparecida de goiania':'GO', 'anapolis':'GO',
    'sao luis':'MA', 'imperatriz':'MA',
    'cuiaba':'MT', 'varzea grande':'MT',
    'campo grande':'MS', 'dourados':'MS',
    'belo horizonte':'MG', 'contagem':'MG', 'uberlandia':'MG',
    'juiz de fora':'MG', 'betim':'MG', 'montes claros':'MG',
    'belem':'PA', 'ananindeua':'PA',
    'joao pessoa':'PB', 'campina grande':'PB',
    'curitiba':'PR', 'londrina':'PR', 'maringa':'PR',
    'ponta grossa':'PR', 'cascavel':'PR', 'sao jose dos pinhais':'PR',
    'recife':'PE', 'caruaru':'PE', 'olinda':'PE', 'jaboatao dos guararapes':'PE',
    'teresina':'PI',
    'rio de janeiro':'RJ', 'niteroi':'RJ', 'nova iguacu':'RJ',
    'duque de caxias':'RJ', 'volta redonda':'RJ', 'petropolis':'RJ',
    'natal':'RN', 'mossoro':'RN',
    'porto alegre':'RS', 'caxias do sul':'RS', 'pelotas':'RS',
    'canoas':'RS', 'santa maria':'RS',
    'porto velho':'RO', 'boa vista':'RR',
    'florianopolis':'SC', 'joinville':'SC', 'blumenau':'SC',
    'sao jose':'SC', 'criciuma':'SC',
    'sao paulo':'SP', 'campinas':'SP', 'guarulhos':'SP',
    'sao bernardo do campo':'SP', 'santo andre':'SP', 'osasco':'SP',
    'ribeirao preto':'SP', 'sorocaba':'SP', 'santos':'SP',
    'sao jose dos campos':'SP', 'mogi das cruzes':'SP',
    'bauru':'SP', 'jundiai':'SP',
    'aracaju':'SE', 'palmas':'TO',
  };

  // ── DADOS ─────────────────────────────────────────────────────────────────────
  var _accessibleFilms = []; // [{titulo, url_key, a11y, app, ingresso_url, tmdb_data}]
  var _stateGroups     = {}; // { UF: [{id, name}] }  — cidades da Ingresso por estado
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

  // Remove acentos e pontuação para comparação e slug
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

  // ── BUSCAR FILMES ACESSÍVEIS (SUPABASE) ────────────────────────────────────
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

  // ── BUSCAR CIDADES DA INGRESSO ────────────────────────────────────────────────
  function _fetchCities() {
    return fetch(API + '?type=cities')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!Array.isArray(data)) return [];
        return data
          .filter(function (c) { return c.id && c.name; })
          .map(function (c) {
            // Tenta obter UF do próprio response; fallback pelo mapa
            var uf = c.UF || c.uf || c.state || c.Estado
                  || _CITY_UF[_norm(c.name)] || '';
            return { id: String(c.id), name: c.name, uf: uf.toUpperCase() };
          })
          .filter(function (c) { return c.uf && _STATE_NAMES[c.uf]; });
      })
      .catch(function () { return []; });
  }

  // ── MONTAR GRUPOS POR ESTADO ──────────────────────────────────────────────────
  function _buildStateGroups(cities) {
    _stateGroups = {};
    cities.forEach(function (c) {
      if (!_stateGroups[c.uf]) _stateGroups[c.uf] = [];
      // Deduplica por nome normalizado
      var already = _stateGroups[c.uf].some(function (x) {
        return _norm(x.name) === _norm(c.name);
      });
      if (!already) _stateGroups[c.uf].push(c);
    });
    Object.keys(_stateGroups).forEach(function (uf) {
      _stateGroups[uf].sort(function (a, b) {
        return a.name.localeCompare(b.name, 'pt-BR');
      });
    });
  }

  // ── POPULAR DROPDOWNS ─────────────────────────────────────────────────────────
  function _populateStates() {
    var ufs = Object.keys(_stateGroups).sort(function (a, b) {
      return (_STATE_NAMES[a] || a).localeCompare(_STATE_NAMES[b] || b, 'pt-BR');
    });
    elState.innerHTML = '<option value="">Selecione o estado...</option>';
    ufs.forEach(function (uf) {
      var opt = document.createElement('option');
      opt.value = uf;
      opt.textContent = _STATE_NAMES[uf] || uf;
      elState.appendChild(opt);
    });
    elState.disabled = !ufs.length;
  }

  function _populateCities(uf) {
    var cities = _stateGroups[uf] || [];
    elCity.innerHTML = '<option value="">Selecione a cidade...</option>';
    cities.forEach(function (c) {
      var opt = document.createElement('option');
      opt.value = c.id;          // ID numérico da Ingresso
      opt.textContent = c.name;
      elCity.appendChild(opt);
    });
    elCity.disabled = !cities.length;
  }

  // ── PRÉ-BUSCAR EVENT IDs (background) ───────────────────────────────────────
  // Roda em background logo após init; cache reutilizado quando o usuário troca
  // de cidade sem recarregar a página.
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
  function _loadTheaters(cityId, cityName) {
    _currentCityId   = cityId;
    _currentCityName = cityName;
    _theaters        = [];
    elGrid.innerHTML = '';
    _show(elLoading);
    _announce('Buscando sessões acessíveis em ' + cityName + '...');

    var today = new Date().toISOString().slice(0, 10);

    // Aguarda eventIds e então busca sessões em paralelo
    _prefetchEventIds().then(function () {
      var filmsWithId = _accessibleFilms.filter(function (f) {
        return _eventIdCache[f.ingresso_url];
      });

      if (!filmsWithId.length) { _show(elNone); return; }

      return Promise.all(
        filmsWithId.map(function (f) {
          var evId = _eventIdCache[f.ingresso_url];
          var url  = API + '?eventId=' + encodeURIComponent(evId)
                       + '&city=' + encodeURIComponent(cityId)
                       + '&date=' + today;
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
                address: th.address || th.vicinity || '',
                films:   [],
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

    // Favoritos primeiro
    list.sort(function (a, b) {
      var fa = _isFav(a.id) ? 0 : 1;
      var fb = _isFav(b.id) ? 0 : 1;
      if (fa !== fb) return fa - fb;
      return a.name.localeCompare(b.name, 'pt-BR');
    });

    if (!list.length) { _show(elNone); return; }

    var citySlug = _slug(_currentCityName);

    elGrid.innerHTML = list.map(function (t) {
      var fav          = _isFav(t.id);
      var cinemaSlug   = _slug(t.name);
      var ingressoUrl  = 'https://www.ingresso.com/cinema/' + cinemaSlug
                       + (citySlug ? '?city=' + citySlug : '');
      var detailUrl    = 'cinema.html?' + [
        'id='       + encodeURIComponent(t.id),
        'name='     + encodeURIComponent(t.name),
        'address='  + encodeURIComponent(t.address || ''),
        'city='     + encodeURIComponent(_currentCityName),
        'citySlug=' + encodeURIComponent(citySlug),
      ].join('&');

      // Filme rows
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
              (f.app ? '<span class="cin-film-app">📱 ' + _esc(f.app) + '</span>' : '') +
            '</div>' +
            '<svg class="cin-film-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>' +
          '</a>'
        );
      }).join('');

      return (
        '<div class="cin-card" role="listitem" data-id="' + _esc(t.id) + '">' +

          // Cabeçalho do card (nome + botão fav)
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

          // Filmes acessíveis
          '<div class="cin-films">' + filmsHtml + '</div>' +

          // Rodapé — link Ingresso
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
    var cityId = elCity.value;
    if (!cityId) { _show(elEmpty); return; }
    var cityName = elCity.options[elCity.selectedIndex].textContent;
    _loadTheaters(cityId, cityName);
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
    _show(elLoading);

    Promise.all([
      _fetchAccessibleFilms(),
      _fetchCities(),
    ]).then(function (results) {
      _accessibleFilms = results[0];
      _buildStateGroups(results[1]);
      _populateStates();
      _show(elEmpty);
      // Pré-busca eventIds em background enquanto usuário seleciona a cidade
      if (_accessibleFilms.length) _prefetchEventIds();
    }).catch(function () {
      _populateStates();
      _show(elEmpty);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
