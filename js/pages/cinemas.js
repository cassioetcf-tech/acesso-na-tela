// ── CINEMAS PAGE ─────────────────────────────────────────────────────────────
// Filtros: estado, cidade, busca por nome. Favoritos via localStorage.

(function () {
  'use strict';

  // ── CONSTANTES ───────────────────────────────────────────────────────────────
  var FAV_KEY = 'antela_cinema_favs';
  var API     = '/api/ingresso';

  // ── ESTADO LOCAL ─────────────────────────────────────────────────────────────
  var _theaters   = [];   // lista completa da cidade selecionada
  var _favorites  = [];   // IDs favoritos (localStorage)
  var _citiesMap  = {};   // { 'SP': [{id, name}, ...], 'RJ': [...] }

  // ── FALLBACK: cidades mais relevantes por estado ──────────────────────────────
  // Usado quando a API da Ingresso não retornar dados de cidades.
  // IDs correspondem aos city IDs da Ingresso.com.
  var _FALLBACK_CITIES = {
    AC: [{ id: '1', name: 'Rio Branco' }],
    AL: [{ id: '2', name: 'Maceió' }],
    AP: [{ id: '3', name: 'Macapá' }],
    AM: [{ id: '4', name: 'Manaus' }],
    BA: [{ id: '5', name: 'Salvador' }, { id: '6', name: 'Feira de Santana' }, { id: '7', name: 'Vitória da Conquista' }],
    CE: [{ id: '8', name: 'Fortaleza' }, { id: '9', name: 'Caucaia' }],
    DF: [{ id: '10', name: 'Brasília' }],
    ES: [{ id: '11', name: 'Vitória' }, { id: '12', name: 'Cariacica' }, { id: '13', name: 'Serra' }],
    GO: [{ id: '14', name: 'Goiânia' }, { id: '15', name: 'Aparecida de Goiânia' }],
    MA: [{ id: '16', name: 'São Luís' }],
    MT: [{ id: '17', name: 'Cuiabá' }],
    MS: [{ id: '18', name: 'Campo Grande' }],
    MG: [{ id: '19', name: 'Belo Horizonte' }, { id: '20', name: 'Contagem' }, { id: '21', name: 'Uberlândia' }, { id: '22', name: 'Juiz de Fora' }],
    PA: [{ id: '23', name: 'Belém' }],
    PB: [{ id: '24', name: 'João Pessoa' }],
    PR: [{ id: '25', name: 'Curitiba' }, { id: '26', name: 'Londrina' }, { id: '27', name: 'Maringá' }],
    PE: [{ id: '28', name: 'Recife' }, { id: '29', name: 'Caruaru' }],
    PI: [{ id: '30', name: 'Teresina' }],
    RJ: [{ id: '31', name: 'Rio de Janeiro' }, { id: '32', name: 'Niterói' }, { id: '33', name: 'Nova Iguaçu' }, { id: '34', name: 'Duque de Caxias' }],
    RN: [{ id: '35', name: 'Natal' }],
    RS: [{ id: '36', name: 'Porto Alegre' }, { id: '37', name: 'Caxias do Sul' }, { id: '38', name: 'Pelotas' }],
    RO: [{ id: '39', name: 'Porto Velho' }],
    RR: [{ id: '40', name: 'Boa Vista' }],
    SC: [{ id: '41', name: 'Florianópolis' }, { id: '42', name: 'Joinville' }, { id: '43', name: 'Blumenau' }],
    SP: [
      { id: '1011', name: 'São Paulo' }, { id: '44', name: 'Campinas' },
      { id: '45', name: 'Santos' }, { id: '46', name: 'São Bernardo do Campo' },
      { id: '47', name: 'Guarulhos' }, { id: '48', name: 'Ribeirão Preto' },
      { id: '49', name: 'Sorocaba' }, { id: '50', name: 'São José dos Campos' },
    ],
    SE: [{ id: '51', name: 'Aracaju' }],
    TO: [{ id: '52', name: 'Palmas' }],
  };

  // ── ESTADOS (lista estática) ──────────────────────────────────────────────────
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

  // ── ELEMENTOS ────────────────────────────────────────────────────────────────
  var elState   = document.getElementById('cf-state');
  var elCity    = document.getElementById('cf-city');
  var elSearch  = document.getElementById('cf-search');
  var elEmpty   = document.getElementById('cinemas-empty');
  var elLoading = document.getElementById('cinemas-loading');
  var elNone    = document.getElementById('cinemas-none');
  var elGrid    = document.getElementById('cinemas-grid');
  var elLive    = document.getElementById('live-region');

  // ── FAVORITOS ────────────────────────────────────────────────────────────────
  function _loadFavs() {
    try { _favorites = JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); }
    catch (e) { _favorites = []; }
  }

  function _saveFavs() {
    try { localStorage.setItem(FAV_KEY, JSON.stringify(_favorites)); }
    catch (e) {}
  }

  function _isFav(id) { return _favorites.indexOf(String(id)) !== -1; }

  function _toggleFav(id) {
    id = String(id);
    var idx = _favorites.indexOf(id);
    if (idx === -1) _favorites.push(id);
    else            _favorites.splice(idx, 1);
    _saveFavs();
  }

  // ── ANÚNCIO LIVE REGION ──────────────────────────────────────────────────────
  function _announce(msg) {
    if (!elLive) return;
    elLive.textContent = '';
    setTimeout(function () { elLive.textContent = msg; }, 50);
  }

  // ── ESTADOS ──────────────────────────────────────────────────────────────────
  function _populateStates() {
    // Usa lista estática — mais confiável do que depender de um endpoint de estados
    elState.innerHTML = '<option value="">Selecione...</option>';
    _STATES.forEach(function (s) {
      var opt = document.createElement('option');
      opt.value = s.uf;
      opt.textContent = s.nome;
      elState.appendChild(opt);
    });
  }

  // ── CIDADES ──────────────────────────────────────────────────────────────────
  // Carrega todas as cidades da Ingresso de uma vez e monta o mapa por UF.
  function _fetchAllCities() {
    return fetch(API + '?type=cities')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var items = Array.isArray(data) ? data : (data.items || data.cities || []);
        if (!items.length) { _citiesMap = _FALLBACK_CITIES; return; }

        var map = {};
        items.forEach(function (c) {
          // A Ingresso retorna campos como: id, name, state (UF sigla)
          var uf   = (c.state || c.uf || c.acronym || '').toUpperCase();
          var id   = String(c.id || c._id || '');
          var name = c.name || c.nome || '';
          if (!uf || !id || !name) return;
          if (!map[uf]) map[uf] = [];
          map[uf].push({ id: id, name: name });
        });

        _citiesMap = Object.keys(map).length ? map : _FALLBACK_CITIES;
      })
      .catch(function () {
        _citiesMap = _FALLBACK_CITIES;
      });
  }

  function _populateCities(uf) {
    var cities = (_citiesMap[uf] || []).slice().sort(function (a, b) {
      return a.name.localeCompare(b.name);
    });

    if (!cities.length) {
      elCity.innerHTML = '<option value="">Nenhuma cidade disponível</option>';
      elCity.disabled = true;
      return;
    }

    elCity.innerHTML = '<option value="">Selecione a cidade...</option>';
    cities.forEach(function (c) {
      var opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name;
      elCity.appendChild(opt);
    });
    elCity.disabled = false;
  }

  // ── CINEMAS ──────────────────────────────────────────────────────────────────
  function _loadTheaters(cityId, cityLabel) {
    _theaters = [];
    _show(elLoading);
    _announce('Buscando cinemas em ' + cityLabel + '...');

    fetch(API + '?type=theaters&city=' + encodeURIComponent(cityId))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var items = Array.isArray(data) ? data : (data.items || data.theaters || []);
        _theaters = items.map(function (t) {
          return {
            id:      String(t.id || t._id || ''),
            name:    t.name || t.nome || '',
            address: _formatAddress(t),
            url:     t.siteURL || t.siteUrl || t.url || '',
          };
        }).filter(function (t) { return t.name; });

        _renderTheaters();
        _announce(
          _theaters.length
            ? _theaters.length + ' cinemas encontrados em ' + cityLabel
            : 'Nenhum cinema encontrado em ' + cityLabel
        );
      })
      .catch(function (err) {
        console.error('[cinemas] erro ao buscar cinemas:', err);
        _theaters = [];
        _show(elNone);
        _announce('Erro ao buscar cinemas. Tente novamente.');
      });
  }

  function _formatAddress(t) {
    var parts = [];
    if (t.address)                           parts.push(t.address);
    if (t.addressComplement)                 parts.push(t.addressComplement);
    if (t.districtName || t.neighborhood)    parts.push(t.districtName || t.neighborhood);
    if (t.cityName || t.city)                parts.push(t.cityName || t.city);
    if (t.state || t.uf)                     parts.push(t.state || t.uf);
    return parts.join(', ');
  }

  // ── RENDERIZAÇÃO ─────────────────────────────────────────────────────────────
  function _renderTheaters() {
    var query = (elSearch.value || '').toLowerCase().trim();
    var list  = _theaters.filter(function (t) {
      return !query || t.name.toLowerCase().indexOf(query) !== -1 ||
             (t.address && t.address.toLowerCase().indexOf(query) !== -1);
    });

    // Favoritos primeiro, depois alfabético
    list.sort(function (a, b) {
      var fa = _isFav(a.id) ? 0 : 1;
      var fb = _isFav(b.id) ? 0 : 1;
      if (fa !== fb) return fa - fb;
      return a.name.localeCompare(b.name);
    });

    if (!list.length) { _show(elNone); return; }

    elGrid.innerHTML = list.map(function (t) {
      var fav    = _isFav(t.id);
      var favLbl = fav ? 'Remover dos favoritos' : 'Favoritar cinema';
      var favCls = fav ? 'cin-fav-btn cin-fav-btn--active' : 'cin-fav-btn';
      var addrHtml = t.address
        ? '<p class="cin-addr">' + _esc(t.address) + '</p>'
        : '';
      var linkHtml = t.url
        ? '<a class="cin-link" href="' + _esc(t.url) + '" target="_blank" rel="noopener noreferrer">Ver programação</a>'
        : '';
      return (
        '<div class="cin-card" role="listitem" data-id="' + _esc(t.id) + '">' +
          '<div class="cin-card-top">' +
            '<h2 class="cin-name">' + _esc(t.name) + '</h2>' +
            '<button class="' + favCls + '" data-id="' + _esc(t.id) + '" ' +
              'aria-label="' + _esc(favLbl + ': ' + t.name) + '" ' +
              'aria-pressed="' + fav + '" title="' + _esc(favLbl) + '">' +
              '<svg width="18" height="18" viewBox="0 0 24 24" fill="' + (fav ? 'currentColor' : 'none') + '" ' +
                'stroke="currentColor" stroke-width="2" aria-hidden="true">' +
                '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>' +
              '</svg>' +
            '</button>' +
          '</div>' +
          addrHtml +
          (linkHtml ? '<div class="cin-actions">' + linkHtml + '</div>' : '') +
        '</div>'
      );
    }).join('');

    _show(elGrid);
  }

  function _esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── VISIBILIDADE ─────────────────────────────────────────────────────────────
  function _show(el) {
    [elEmpty, elLoading, elNone, elGrid].forEach(function (e) {
      if (e) e.hidden = true;
    });
    if (el) el.hidden = false;
  }

  // ── EVENTOS ──────────────────────────────────────────────────────────────────
  elState.addEventListener('change', function () {
    var uf = elState.value;
    elCity.innerHTML = '<option value="">Selecione a cidade...</option>';
    elCity.disabled  = true;
    _theaters = [];
    _show(elEmpty);

    if (!uf) return;
    _populateCities(uf);
  });

  elCity.addEventListener('change', function () {
    var cityId = elCity.value;
    _theaters = [];
    if (!cityId) { _show(elEmpty); return; }
    var cityLabel = elCity.options[elCity.selectedIndex].textContent;
    _loadTheaters(cityId, cityLabel);
  });

  var _searchTimer;
  elSearch.addEventListener('input', function () {
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(function () {
      if (_theaters.length) _renderTheaters();
    }, 250);
  });

  // Botões de favorito (delegação no grid)
  elGrid.addEventListener('click', function (e) {
    var btn = e.target.closest('.cin-fav-btn');
    if (!btn) return;
    var id = btn.dataset.id;
    _toggleFav(id);
    _renderTheaters(); // re-renderiza para reordenar
  });

  // ── INIT ─────────────────────────────────────────────────────────────────────
  function init() {
    renderHeader('cinemas');
    renderFooter();
    _loadFavs();
    _populateStates();
    _show(elEmpty);

    // Carrega todas as cidades em segundo plano (sem bloquear a UI)
    _fetchAllCities();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
