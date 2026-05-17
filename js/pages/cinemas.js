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

  // bbox = "sul,oeste,norte,leste" (coordenadas WGS84) para query OSM mais rápida.
  // Cidades sem bbox usam fallback por nome no Overpass.
  var _CITIES = {
    AC: [{ name: 'Rio Branco',           bbox: '-10.05,-67.95,-9.85,-67.75' }],
    AL: [{ name: 'Maceió',               bbox: '-9.75,-35.85,-9.55,-35.65' }],
    AP: [{ name: 'Macapá',               bbox: '-0.15,-51.15,0.10,-51.00' }],
    AM: [{ name: 'Manaus',               bbox: '-3.25,-60.15,-2.95,-59.95' }],
    BA: [
      { name: 'Salvador',                bbox: '-13.05,-38.65,-12.85,-38.30' },
      { name: 'Feira de Santana',        bbox: '-12.35,-39.05,-12.15,-38.90' },
      { name: 'Vitória da Conquista',    bbox: '-14.90,-40.90,-14.75,-40.80' },
      { name: 'Camaçari',               bbox: '-12.75,-38.40,-12.60,-38.25' },
    ],
    CE: [
      { name: 'Fortaleza',              bbox: '-3.90,-38.65,-3.65,-38.40' },
      { name: 'Caucaia',                bbox: '-3.80,-38.75,-3.65,-38.55' },
      { name: 'Juazeiro do Norte',      bbox: '-7.25,-39.35,-7.15,-39.25' },
    ],
    DF: [{ name: 'Brasília',            bbox: '-16.05,-48.25,-15.55,-47.35' }],
    ES: [
      { name: 'Vitória',                bbox: '-20.45,-40.45,-20.25,-40.20' },
      { name: 'Vila Velha',             bbox: '-20.45,-40.35,-20.30,-40.20' },
      { name: 'Serra',                  bbox: '-20.20,-40.35,-20.05,-40.15' },
      { name: 'Cariacica',              bbox: '-20.35,-40.45,-20.20,-40.30' },
    ],
    GO: [
      { name: 'Goiânia',               bbox: '-16.80,-49.40,-16.55,-49.15' },
      { name: 'Aparecida de Goiânia',   bbox: '-16.90,-49.35,-16.75,-49.20' },
      { name: 'Anápolis',              bbox: '-16.40,-49.00,-16.25,-48.90' },
    ],
    MA: [
      { name: 'São Luís',               bbox: '-2.70,-44.40,-2.45,-44.15' },
      { name: 'Imperatriz',             bbox: '-5.55,-47.55,-5.45,-47.40' },
    ],
    MT: [
      { name: 'Cuiabá',                bbox: '-15.70,-56.20,-15.50,-55.95' },
      { name: 'Várzea Grande',          bbox: '-15.70,-56.20,-15.55,-56.05' },
    ],
    MS: [
      { name: 'Campo Grande',           bbox: '-20.60,-54.80,-20.35,-54.50' },
      { name: 'Dourados',              bbox: '-22.30,-54.90,-22.20,-54.75' },
    ],
    MG: [
      { name: 'Belo Horizonte',         bbox: '-20.10,-44.10,-19.75,-43.85' },
      { name: 'Contagem',              bbox: '-20.05,-44.15,-19.90,-44.00' },
      { name: 'Uberlândia',            bbox: '-18.95,-48.35,-18.85,-48.20' },
      { name: 'Juiz de Fora',           bbox: '-21.85,-43.45,-21.70,-43.30' },
      { name: 'Betim',                 bbox: '-20.05,-44.30,-19.90,-44.10' },
      { name: 'Montes Claros',          bbox: '-16.80,-43.95,-16.65,-43.80' },
    ],
    PA: [
      { name: 'Belém',                 bbox: '-1.55,-48.65,-1.30,-48.40' },
      { name: 'Ananindeua',            bbox: '-1.40,-48.45,-1.30,-48.35' },
    ],
    PB: [
      { name: 'João Pessoa',           bbox: '-7.20,-34.95,-7.05,-34.82' },
      { name: 'Campina Grande',        bbox: '-7.30,-35.95,-7.20,-35.85' },
    ],
    PR: [
      { name: 'Curitiba',              bbox: '-25.65,-49.40,-25.35,-49.15' },
      { name: 'Londrina',              bbox: '-23.40,-51.25,-23.25,-51.10' },
      { name: 'Maringá',               bbox: '-23.50,-52.00,-23.35,-51.85' },
      { name: 'Ponta Grossa',          bbox: '-25.15,-50.20,-25.05,-50.05' },
      { name: 'Cascavel',              bbox: '-25.00,-53.60,-24.90,-53.45' },
      { name: 'São José dos Pinhais',  bbox: '-25.60,-49.25,-25.50,-49.15' },
    ],
    PE: [
      { name: 'Recife',                bbox: '-8.20,-35.10,-7.95,-34.85' },
      { name: 'Caruaru',               bbox: '-8.30,-36.00,-8.20,-35.90' },
      { name: 'Olinda',                bbox: '-8.05,-35.00,-7.95,-34.90' },
      { name: 'Jaboatão dos Guararapes', bbox: '-8.25,-35.10,-8.10,-34.95' },
    ],
    PI: [{ name: 'Teresina',           bbox: '-5.20,-42.90,-5.05,-42.75' }],
    RJ: [
      { name: 'Rio de Janeiro',        bbox: '-23.10,-43.65,-22.75,-43.10' },
      { name: 'Niterói',               bbox: '-22.95,-43.15,-22.85,-43.05' },
      { name: 'Nova Iguaçu',           bbox: '-22.80,-43.55,-22.70,-43.40' },
      { name: 'Duque de Caxias',       bbox: '-22.85,-43.35,-22.70,-43.20' },
      { name: 'Volta Redonda',         bbox: '-22.60,-44.15,-22.50,-44.05' },
      { name: 'Petrópolis',            bbox: '-22.60,-43.25,-22.45,-43.10' },
    ],
    RN: [
      { name: 'Natal',                 bbox: '-5.90,-35.30,-5.70,-35.15' },
      { name: 'Mossoró',               bbox: '-5.25,-37.45,-5.15,-37.35' },
    ],
    RS: [
      { name: 'Porto Alegre',          bbox: '-30.30,-51.30,-29.95,-51.05' },
      { name: 'Caxias do Sul',         bbox: '-29.25,-51.25,-29.15,-51.15' },
      { name: 'Pelotas',               bbox: '-31.85,-52.45,-31.70,-52.30' },
      { name: 'Canoas',                bbox: '-29.95,-51.25,-29.85,-51.15' },
      { name: 'Santa Maria',           bbox: '-29.75,-53.85,-29.65,-53.75' },
    ],
    RO: [{ name: 'Porto Velho',        bbox: '-8.85,-63.95,-8.70,-63.80' }],
    RR: [{ name: 'Boa Vista',          bbox: '2.75,-60.85,2.90,-60.65' }],
    SC: [
      { name: 'Florianópolis',         bbox: '-27.75,-48.65,-27.50,-48.40' },
      { name: 'Joinville',             bbox: '-26.40,-48.95,-26.25,-48.80' },
      { name: 'Blumenau',              bbox: '-26.95,-49.15,-26.85,-49.05' },
      { name: 'São José',              bbox: '-27.65,-48.70,-27.55,-48.60' },
      { name: 'Criciúma',              bbox: '-28.75,-49.45,-28.65,-49.35' },
    ],
    SP: [
      { name: 'São Paulo',             bbox: '-24.05,-46.85,-23.35,-46.35' },
      { name: 'Campinas',              bbox: '-23.10,-47.20,-22.85,-47.00' },
      { name: 'Guarulhos',             bbox: '-23.55,-46.60,-23.40,-46.45' },
      { name: 'São Bernardo do Campo', bbox: '-23.80,-46.65,-23.65,-46.50' },
      { name: 'Santo André',           bbox: '-23.75,-46.60,-23.60,-46.45' },
      { name: 'Osasco',                bbox: '-23.60,-46.85,-23.50,-46.75' },
      { name: 'Ribeirão Preto',        bbox: '-21.25,-47.90,-21.10,-47.75' },
      { name: 'Sorocaba',              bbox: '-23.55,-47.55,-23.40,-47.40' },
      { name: 'Santos',                bbox: '-24.05,-46.45,-23.90,-46.30' },
      { name: 'São José dos Campos',   bbox: '-23.30,-45.95,-23.15,-45.80' },
      { name: 'Mogi das Cruzes',       bbox: '-23.55,-46.25,-23.45,-46.15' },
      { name: 'Bauru',                 bbox: '-22.40,-49.10,-22.25,-48.95' },
      { name: 'Jundiaí',               bbox: '-23.25,-47.00,-23.15,-46.90' },
    ],
    SE: [{ name: 'Aracaju',            bbox: '-11.10,-37.15,-10.85,-37.00' }],
    TO: [{ name: 'Palmas',             bbox: '-10.40,-48.45,-10.10,-48.25' }],
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
    cities.forEach(function (c, i) {
      var opt = document.createElement('option');
      opt.value = String(i); // índice para lookup posterior
      opt.textContent = c.name;
      elCity.appendChild(opt);
    });
    elCity.disabled = false;
    // Guarda referência da lista do estado atual para recuperar bbox depois
    elCity._stateCities = cities;
  }

  // Converte nome da cidade em slug para a URL da Ingresso.com
  // "São Paulo" → "sao-paulo", "Rio de Janeiro" → "rio-de-janeiro"
  function _slug(name) {
    return (name || '')
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-');
  }

  // ── BUSCAR CINEMAS ───────────────────────────────────────────────────────────
  function _loadTheaters(cityLabel, cityBbox) {
    _theaters = [];
    _show(elLoading);
    _announce('Buscando cinemas em ' + cityLabel + '...');

    var q = '?type=theaters&cityName=' + encodeURIComponent(cityLabel);
    if (cityBbox) q += '&bbox=' + encodeURIComponent(cityBbox);
    fetch(API + q)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        // Log para diagnóstico — visível no DevTools > Console
        console.log('[cinemas] resposta API theaters:', JSON.stringify(data).substring(0, 400));

        // Tenta extrair array em vários formatos conhecidos da Ingresso
        var items = Array.isArray(data)
          ? data
          : (data.items || data.theaters || data.cinemas || data.data || []);

        _theaters = items.map(function (t) {
          return {
            id:      String(t.id || t._id || t.theatherId || ''),
            name:    t.name || t.nome || t.fantasyName || t.tradeName || '',
            address: _formatAddr(t),
            url:     t.siteURL || t.siteUrl || t.url || '',
          };
        }).filter(function (t) { return t.name; });

        console.log('[cinemas] theaters mapeados:', _theaters.length);

        _renderTheaters();
        _announce(
          _theaters.length
            ? _theaters.length + ' cinemas encontrados em ' + cityLabel
            : 'Nenhum cinema encontrado em ' + cityLabel
        );
      })
      .catch(function (err) {
        console.error('[cinemas] erro na API theaters:', err);
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
    var idx = elCity.value;
    _theaters = [];
    elGrid.innerHTML = '';
    if (idx === '') { _show(elEmpty); return; }
    var cities = elCity._stateCities || [];
    var city   = cities[parseInt(idx, 10)] || {};
    _loadTheaters(city.name || '', city.bbox || '');
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
