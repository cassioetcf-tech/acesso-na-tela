// ── CINEMAS PAGE ─────────────────────────────────────────────────────────────
// Estado e cidade: dados estáticos (instantâneo, sem API).
// Cinemas: carregados da API Ingresso apenas quando a cidade é selecionada.
// Favoritos: localStorage.

(function () {
  'use strict';

  var FAV_KEY = 'antela_cinema_favs';
  var API     = '/api/ingresso';

  // ── DADOS ESTÁTICOS ───────────────────────────────────────────────────────────
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

  // city IDs são os IDs internos da Ingresso.com
  var _CITIES = {
    AC: [{ id: '57',   name: 'Rio Branco' }],
    AL: [{ id: '62',   name: 'Maceió' }],
    AP: [{ id: '68',   name: 'Macapá' }],
    AM: [{ id: '56',   name: 'Manaus' }],
    BA: [{ id: '26',   name: 'Salvador' }, { id: '185', name: 'Feira de Santana' }, { id: '186', name: 'Vitória da Conquista' }, { id: '187', name: 'Camaçari' }],
    CE: [{ id: '33',   name: 'Fortaleza' }, { id: '188', name: 'Caucaia' }, { id: '189', name: 'Juazeiro do Norte' }],
    DF: [{ id: '31',   name: 'Brasília' }],
    ES: [{ id: '72',   name: 'Vitória' }, { id: '190', name: 'Serra' }, { id: '191', name: 'Cariacica' }, { id: '192', name: 'Vila Velha' }],
    GO: [{ id: '44',   name: 'Goiânia' }, { id: '193', name: 'Aparecida de Goiânia' }, { id: '194', name: 'Anápolis' }],
    MA: [{ id: '94',   name: 'São Luís' }, { id: '195', name: 'Imperatriz' }],
    MT: [{ id: '35',   name: 'Cuiabá' }, { id: '196', name: 'Várzea Grande' }],
    MS: [{ id: '30',   name: 'Campo Grande' }, { id: '197', name: 'Dourados' }],
    MG: [{ id: '49',   name: 'Belo Horizonte' }, { id: '198', name: 'Contagem' }, { id: '199', name: 'Uberlândia' }, { id: '200', name: 'Juiz de Fora' }, { id: '201', name: 'Betim' }, { id: '202', name: 'Montes Claros' }],
    PA: [{ id: '80',   name: 'Belém' }, { id: '203', name: 'Ananindeua' }],
    PB: [{ id: '50',   name: 'João Pessoa' }, { id: '204', name: 'Campina Grande' }],
    PR: [{ id: '157',  name: 'Curitiba' }, { id: '205', name: 'Londrina' }, { id: '206', name: 'Maringá' }, { id: '207', name: 'Ponta Grossa' }, { id: '208', name: 'Cascavel' }, { id: '209', name: 'São José dos Pinhais' }],
    PE: [{ id: '86',   name: 'Recife' }, { id: '210', name: 'Caruaru' }, { id: '211', name: 'Olinda' }, { id: '212', name: 'Jaboatão dos Guararapes' }],
    PI: [{ id: '99',   name: 'Teresina' }],
    RJ: [{ id: '219',  name: 'Rio de Janeiro' }, { id: '213', name: 'Niterói' }, { id: '214', name: 'Nova Iguaçu' }, { id: '215', name: 'Duque de Caxias' }, { id: '216', name: 'Campos dos Goytacazes' }, { id: '217', name: 'Volta Redonda' }, { id: '218', name: 'Petrópolis' }],
    RN: [{ id: '65',   name: 'Natal' }, { id: '220', name: 'Mossoró' }],
    RS: [{ id: '225',  name: 'Porto Alegre' }, { id: '221', name: 'Caxias do Sul' }, { id: '222', name: 'Pelotas' }, { id: '223', name: 'Canoas' }, { id: '224', name: 'Santa Maria' }],
    RO: [{ id: '88',   name: 'Porto Velho' }],
    RR: [{ id: '27',   name: 'Boa Vista' }],
    SC: [{ id: '93',   name: 'Florianópolis' }, { id: '226', name: 'Joinville' }, { id: '227', name: 'Blumenau' }, { id: '228', name: 'São José' }, { id: '229', name: 'Criciúma' }],
    SP: [
      { id: '1011', name: 'São Paulo' },
      { id: '230',  name: 'Campinas' },
      { id: '231',  name: 'Guarulhos' },
      { id: '232',  name: 'São Bernardo do Campo' },
      { id: '233',  name: 'Santo André' },
      { id: '234',  name: 'Osasco' },
      { id: '235',  name: 'Ribeirão Preto' },
      { id: '236',  name: 'Sorocaba' },
      { id: '237',  name: 'Santos' },
      { id: '238',  name: 'São José dos Campos' },
      { id: '239',  name: 'Mauá' },
      { id: '240',  name: 'Mogi das Cruzes' },
      { id: '241',  name: 'Bauru' },
      { id: '242',  name: 'Jundiaí' },
    ],
    SE: [{ id: '18',   name: 'Aracaju' }],
    TO: [{ id: '78',   name: 'Palmas' }],
  };

  // ── ESTADO LOCAL ─────────────────────────────────────────────────────────────
  var _theaters  = [];
  var _favorites = [];

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
    try { localStorage.setItem(FAV_KEY, JSON.stringify(_favorites)); } catch (e) {}
  }
  function _isFav(id)    { return _favorites.indexOf(String(id)) !== -1; }
  function _toggleFav(id) {
    id = String(id);
    var i = _favorites.indexOf(id);
    if (i === -1) _favorites.push(id); else _favorites.splice(i, 1);
    _saveFavs();
  }

  // ── LIVE REGION ──────────────────────────────────────────────────────────────
  function _announce(msg) {
    if (!elLive) return;
    elLive.textContent = '';
    setTimeout(function () { elLive.textContent = msg; }, 50);
  }

  // ── VISIBILIDADE ─────────────────────────────────────────────────────────────
  function _show(el) {
    [elEmpty, elLoading, elNone, elGrid].forEach(function (e) { if (e) e.hidden = true; });
    if (el) el.hidden = false;
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
    if (!cities.length) {
      elCity.innerHTML = '<option value="">Nenhuma cidade disponível</option>';
      elCity.disabled = true;
      return;
    }
    cities.forEach(function (c) {
      var opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name;
      elCity.appendChild(opt);
    });
    elCity.disabled = false;
  }

  // ── BUSCAR CINEMAS ───────────────────────────────────────────────────────────
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
            address: _formatAddr(t),
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
      .catch(function () {
        _show(elNone);
        _announce('Erro ao buscar cinemas. Tente novamente.');
      });
  }

  function _formatAddr(t) {
    var parts = [];
    if (t.address)                        parts.push(t.address);
    if (t.addressComplement)              parts.push(t.addressComplement);
    if (t.districtName || t.neighborhood) parts.push(t.districtName || t.neighborhood);
    if (t.cityName || t.city)             parts.push(t.cityName || t.city);
    if (t.state || t.uf)                  parts.push(t.state || t.uf);
    return parts.join(', ');
  }

  // ── RENDERIZAR CARDS ─────────────────────────────────────────────────────────
  function _renderTheaters() {
    var query = (elSearch.value || '').toLowerCase().trim();
    var list  = _theaters.filter(function (t) {
      return !query || t.name.toLowerCase().indexOf(query) !== -1 ||
             (t.address && t.address.toLowerCase().indexOf(query) !== -1);
    });

    list.sort(function (a, b) {
      var fa = _isFav(a.id) ? 0 : 1;
      var fb = _isFav(b.id) ? 0 : 1;
      if (fa !== fb) return fa - fb;
      return a.name.localeCompare(b.name, 'pt-BR');
    });

    if (!list.length) { _show(elNone); return; }

    elGrid.innerHTML = list.map(function (t) {
      var fav    = _isFav(t.id);
      var favCls = 'cin-fav-btn' + (fav ? ' cin-fav-btn--active' : '');
      var favLbl = (fav ? 'Remover dos favoritos' : 'Favoritar cinema') + ': ' + t.name;
      return (
        '<div class="cin-card" role="listitem" data-id="' + _esc(t.id) + '">' +
          '<div class="cin-card-top">' +
            '<h2 class="cin-name">' + _esc(t.name) + '</h2>' +
            '<button class="' + favCls + '" data-id="' + _esc(t.id) + '" ' +
              'aria-label="' + _esc(favLbl) + '" aria-pressed="' + fav + '">' +
              '<svg width="18" height="18" viewBox="0 0 24 24" ' +
                'fill="' + (fav ? 'currentColor' : 'none') + '" ' +
                'stroke="currentColor" stroke-width="2" aria-hidden="true">' +
                '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>' +
              '</svg>' +
            '</button>' +
          '</div>' +
          (t.address ? '<p class="cin-addr">' + _esc(t.address) + '</p>' : '') +
          (t.url ? '<div class="cin-actions"><a class="cin-link" href="' + _esc(t.url) + '" target="_blank" rel="noopener noreferrer">Ver programação</a></div>' : '') +
        '</div>'
      );
    }).join('');

    _show(elGrid);
  }

  function _esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── EVENTOS ──────────────────────────────────────────────────────────────────
  elState.addEventListener('change', function () {
    var uf = elState.value;
    elCity.innerHTML = '<option value="">Selecione a cidade...</option>';
    elCity.disabled  = true;
    _theaters = [];
    elGrid.innerHTML = '';
    _show(elEmpty);
    if (!uf) return;
    _populateCities(uf);
  });

  elCity.addEventListener('change', function () {
    var cityId = elCity.value;
    _theaters = [];
    elGrid.innerHTML = '';
    if (!cityId) { _show(elEmpty); return; }
    _loadTheaters(cityId, elCity.options[elCity.selectedIndex].textContent);
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
    _toggleFav(btn.dataset.id);
    _renderTheaters();
  });

  // ── INIT ─────────────────────────────────────────────────────────────────────
  function init() {
    renderHeader('cinemas');
    renderFooter();
    _loadFavs();
    _populateStates();
    _show(elEmpty);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
