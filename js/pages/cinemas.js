// ── CINEMAS PAGE ─────────────────────────────────────────────────────────────
// Filtros: estado, cidade, busca por nome. Favoritos via localStorage.

(function () {
  'use strict';

  // ── CONSTANTES ───────────────────────────────────────────────────────────────
  var FAV_KEY = 'antela_cinema_favs';
  var API     = '/api/ingresso';

  // ── ESTADO LOCAL ─────────────────────────────────────────────────────────────
  var _theaters  = [];   // lista completa da cidade selecionada
  var _favorites = [];   // IDs favoritos (localStorage)
  var _cityId    = '';
  var _cityName  = '';

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
  function _loadStates() {
    fetch(API + '?type=states')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var items = Array.isArray(data) ? data : (data.items || data.states || []);
        if (!items.length) { _fallbackStates(); return; }
        items.sort(function (a, b) {
          return (a.name || a.nome || '').localeCompare(b.name || b.nome || '');
        });
        items.forEach(function (s) {
          var opt = document.createElement('option');
          opt.value = s.uf || s.state || s.acronym || s.sigla || '';
          opt.textContent = s.name || s.nome || opt.value;
          elState.appendChild(opt);
        });
      })
      .catch(function () { _fallbackStates(); });
  }

  // Lista estática como fallback caso a API não retorne estados
  function _fallbackStates() {
    var states = [
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
    states.forEach(function (s) {
      var opt = document.createElement('option');
      opt.value = s.uf;
      opt.textContent = s.nome;
      elState.appendChild(opt);
    });
  }

  // ── CIDADES ──────────────────────────────────────────────────────────────────
  function _loadCities(uf) {
    elCity.innerHTML = '<option value="">Carregando...</option>';
    elCity.disabled = true;

    fetch(API + '?type=cities&state=' + encodeURIComponent(uf))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var items = Array.isArray(data) ? data : (data.items || data.cities || []);
        if (!items.length) {
          elCity.innerHTML = '<option value="">Nenhuma cidade encontrada</option>';
          return;
        }
        items.sort(function (a, b) {
          return (a.name || a.nome || '').localeCompare(b.name || b.nome || '');
        });
        elCity.innerHTML = '<option value="">Selecione a cidade...</option>';
        items.forEach(function (c) {
          var opt = document.createElement('option');
          opt.value = c.id || c.cityId || c._id || '';
          opt.textContent = c.name || c.nome || '';
          if (opt.value) elCity.appendChild(opt);
        });
        elCity.disabled = false;
      })
      .catch(function () {
        elCity.innerHTML = '<option value="">Erro ao carregar cidades</option>';
        elCity.disabled = false;
      });
  }

  // ── CINEMAS ──────────────────────────────────────────────────────────────────
  function _loadTheaters(cityId, cityLabel) {
    _cityId   = cityId;
    _cityName = cityLabel;
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
        console.error('[cinemas] erro:', err);
        _theaters = [];
        _renderTheaters();
        _announce('Erro ao buscar cinemas. Tente novamente.');
      });
  }

  function _formatAddress(t) {
    var parts = [];
    if (t.address)  parts.push(t.address);
    if (t.addressComplement) parts.push(t.addressComplement);
    if (t.districtName || t.neighborhood) parts.push(t.districtName || t.neighborhood);
    if (t.cityName || t.city) parts.push(t.cityName || t.city);
    if (t.state || t.uf) parts.push(t.state || t.uf);
    return parts.join(', ');
  }

  // ── RENDERIZAÇÃO ─────────────────────────────────────────────────────────────
  function _renderTheaters() {
    var query = (elSearch.value || '').toLowerCase().trim();
    var list  = _theaters.filter(function (t) {
      return !query || t.name.toLowerCase().indexOf(query) !== -1 ||
             (t.address && t.address.toLowerCase().indexOf(query) !== -1);
    });

    // Favoritos primeiro
    list.sort(function (a, b) {
      var fa = _isFav(a.id) ? 0 : 1;
      var fb = _isFav(b.id) ? 0 : 1;
      if (fa !== fb) return fa - fb;
      return a.name.localeCompare(b.name);
    });

    if (!list.length) {
      _show(elNone);
      return;
    }

    elGrid.innerHTML = list.map(function (t) {
      var fav    = _isFav(t.id);
      var favLbl = fav ? 'Remover dos favoritos' : 'Favoritar cinema';
      var favCls = fav ? 'cin-fav-btn cin-fav-btn--active' : 'cin-fav-btn';
      var addrHtml = t.address
        ? '<p class="cin-addr">' + _escHtml(t.address) + '</p>'
        : '';
      var linkHtml = t.url
        ? '<a class="cin-link" href="' + _escHtml(t.url) + '" target="_blank" rel="noopener noreferrer">Ver programação</a>'
        : '';
      return (
        '<div class="cin-card" role="listitem" data-id="' + _escHtml(t.id) + '">' +
          '<div class="cin-card-top">' +
            '<h2 class="cin-name">' + _escHtml(t.name) + '</h2>' +
            '<button class="' + favCls + '" data-id="' + _escHtml(t.id) + '" ' +
              'aria-label="' + _escHtml(favLbl) + ': ' + _escHtml(t.name) + '" ' +
              'aria-pressed="' + fav + '" title="' + _escHtml(favLbl) + '">' +
              '<svg width="18" height="18" viewBox="0 0 24 24" fill="' + (fav ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="2" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>' +
            '</button>' +
          '</div>' +
          addrHtml +
          (linkHtml ? '<div class="cin-actions">' + linkHtml + '</div>' : '') +
        '</div>'
      );
    }).join('');

    _show(elGrid);
  }

  function _escHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
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
    if (!uf) {
      elCity.innerHTML = '<option value="">Selecione o estado...</option>';
      elCity.disabled  = true;
      _theaters = [];
      _show(elEmpty);
      return;
    }
    _loadCities(uf);
  });

  elCity.addEventListener('change', function () {
    var cityId = elCity.value;
    if (!cityId) {
      _theaters = [];
      _show(elEmpty);
      return;
    }
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

  // Delegação de clique para botões de favorito
  elGrid.addEventListener('click', function (e) {
    var btn = e.target.closest('.cin-fav-btn');
    if (!btn) return;
    var id = btn.dataset.id;
    _toggleFav(id);
    // Atualiza visual do botão sem re-renderizar tudo
    var fav    = _isFav(id);
    var favLbl = fav ? 'Remover dos favoritos' : 'Favoritar cinema';
    var card   = elGrid.querySelector('.cin-card[data-id="' + id + '"]');
    if (card) {
      var name = card.querySelector('.cin-name');
      var nameText = name ? name.textContent : '';
      btn.className   = fav ? 'cin-fav-btn cin-fav-btn--active' : 'cin-fav-btn';
      btn.setAttribute('aria-pressed', String(fav));
      btn.setAttribute('aria-label', favLbl + ': ' + nameText);
      btn.setAttribute('title', favLbl);
      var svg = btn.querySelector('svg');
      if (svg) svg.setAttribute('fill', fav ? 'currentColor' : 'none');
    }
    // Re-ordena a lista para colocar favoritos no topo
    _renderTheaters();
  });

  // ── INIT ─────────────────────────────────────────────────────────────────────
  function init() {
    renderHeader('cinemas');
    renderFooter();
    _loadFavs();
    _loadStates();
    _show(elEmpty);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
