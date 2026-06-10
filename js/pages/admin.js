// ── ADMIN PAGE ────────────────────────────────────────────────────────────────
// Lógica da página admin.html: autenticação, CRUD de filmes, preview TMDb,
// importador Ingresso e sincronização automática de status.
// Depende de: js/api/supabase.js, js/api/tmdb.js, js/api/ingresso.js,
//             js/utils.js (escHtml)

// ── Config local ──────────────────────────────────────────────────────────────
var ADMIN_SENHA = 'acesso2025'; // senha local de acesso ao painel

// ── Normalização de títulos para comparação ───────────────────────────────────
// Nível 1 — normT: remove acentos, pontuação, espaços extras, lowercase
//   "Zico, O Samurai" e "Zico: O Samurai" → "zico o samurai de quintino"
// Nível 2 — normFuzzy: além disso, strip artigo inicial comum
//   "O Batman" e "Batman" → "batman" (mesmo resultado)
// titlesMatch: retorna true se qualquer nível bater

function normT(t) {
  return (t || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\([^)]*\)/g, ' ')   // remove "(2026)", "(dublado)" etc.
    .replace(/\[[^\]]*\]/g, ' ')  // remove "[...]"
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ').trim();
}

function normFuzzy(t) {
  // Remove artigo/numeral inicial (O, A, Os, As, Um, Uma, The, An)
  return normT(t).replace(/^(o|a|os|as|um|uma|the|an)\s+/, '');
}

// Extrai o slug do filme de uma URL do Ingresso, ignorando query string.
// Ex.: https://www.ingresso.com/filme/o-velho-fusca?x=1 → "o-velho-fusca"
function _ingressoSlug(url) {
  if (!url) return '';
  var m = String(url).match(/\/filme\/([^/?#]+)/);
  return m ? m[1].toLowerCase() : '';
}

function titlesMatch(a, b) {
  if (!a || !b) return false;
  var na = normT(a),    nb = normT(b);
  if (na === nb) return true;
  var fa = normFuzzy(a), fb = normFuzzy(b);
  return fa.length >= 4 && fa === fb;
}

// ── Estado ────────────────────────────────────────────────────────────────────
var _filmes        = [];
var _editId        = null;
var _currentFilter = 'todos';
var _previewTimer  = null;
var _semA11yActive = false;


// Sync log
var _syncLog = [];
var _logOpen = false;

// Ordenação da tabela
var _sortCol = 'data';   // 'titulo' | 'app' | 'status' | 'data'
var _sortDir = 'desc';   // 'asc' | 'desc'

// ── Autenticação ──────────────────────────────────────────────────────────────
function doLogin() {
  var pass = document.getElementById('login-pass').value;
  if (pass === ADMIN_SENHA) {
    sessionStorage.setItem('ant_auth', '1');
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('admin-screen').style.display = 'block';
    loadFilmes();
  } else {
    document.getElementById('login-error').style.display = 'block';
    document.getElementById('login-pass').focus();
  }
}

function doLogout() {
  sessionStorage.removeItem('ant_auth');
  location.reload();
}

window.addEventListener('load', function () {
  if (sessionStorage.getItem('ant_auth') === '1') {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('admin-screen').style.display = 'block';
    loadFilmes();
  }
  // Enter no campo senha
  var passEl = document.getElementById('login-pass');
  if (passEl) passEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); });

  // Fechar modal no overlay e ESC
  var overlay = document.getElementById('modal-overlay');
  if (overlay) overlay.addEventListener('click', function (e) { if (e.target === this) closeModal(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });
});

// ── CRUD: carregar ────────────────────────────────────────────────────────────
async function loadFilmes() {
  var tbody = document.getElementById('filmes-tbody');
  tbody.innerHTML = '<tr><td colspan="5"><div class="empty-state"><p>Carregando...</p></div></td></tr>';

  try {
    var data = await supabaseGet('filmes', 'order=created_at.desc&limit=500');
    _filmes = Array.isArray(data) ? data : [];
  } catch (e) {
    console.error('Supabase load error:', e);
    _filmes = [];
    showToast('Erro ao carregar filmes', 'error');
  }

  renderTable();
  updateStats();
}

// ── Helpers de status ─────────────────────────────────────────────────────────

function _getAppStatusAdmin(f) {
  if (f.app_status) return f.app_status;
  if (f.app) return 'confirmado';
  var a = f.a11y || {};
  if (a.ad === false && a.lse === false && a.libras === false) return 'sem_acessibilidade';
  return 'pendente';
}

function updateStats() {
  _set('stat-total',   _filmes.length);
  _set('stat-cartaz',  _filmes.filter(function (f) { return (f.status || '').toLowerCase() === 'cartaz';   }).length);
  _set('stat-breve',   _filmes.filter(function (f) { return (f.status || '').toLowerCase() === 'breve';    }).length);
  _set('stat-catalogo',_filmes.filter(function (f) { return (f.status || '').toLowerCase() === 'catalogo'; }).length);

  // Mostra/oculta aba "Sem TMDb" conforme existência de filmes sem tmdb_id
  var semTmdb  = _filmes.filter(function (f) { return !f.tmdb_id; }).length;
  var tabSemTmdb = document.getElementById('tab-semtmdb');
  if (tabSemTmdb) {
    tabSemTmdb.style.display = semTmdb > 0 ? '' : 'none';
    tabSemTmdb.textContent   = '⚠️ Sem TMDb (' + semTmdb + ')';
  }
}

function _set(id, val) {
  var el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ── Filtro / tabela ───────────────────────────────────────────────────────────
function setFilter(filter, el) {
  _currentFilter = filter;
  document.querySelectorAll('.filter-tab').forEach(function (t) { t.classList.remove('active'); });
  if (el) el.classList.add('active');
  renderTable();
}

function filterFilmes() { renderTable(); }

function setSort(col) {
  if (_sortCol === col) {
    _sortDir = _sortDir === 'asc' ? 'desc' : 'asc';
  } else {
    _sortCol = col;
    _sortDir = col === 'data' ? 'desc' : 'asc';
  }
  _updateSortHeaders();
  renderTable();
}

function _updateSortHeaders() {
  var cols = ['titulo', 'app', 'status', 'data'];
  cols.forEach(function (c) {
    var th  = document.getElementById('th-' + c);
    var arr = document.getElementById('arr-' + c);
    if (!th || !arr) return;
    if (c === _sortCol) {
      th.classList.add('sort-active');
      arr.textContent = _sortDir === 'asc' ? '↑' : '↓';
      arr.style.opacity = '1';
    } else {
      th.classList.remove('sort-active');
      arr.textContent = '';
      arr.style.opacity = '.6';
    }
  });
}

function renderTable() {
  var q     = ((document.getElementById('search-input') || {}).value || '').toLowerCase();
  var tbody = document.getElementById('filmes-tbody');

  var list = _filmes.filter(function (f) {
    var s = (f.status || '').toLowerCase();
    var matchFilter = _currentFilter === 'todos'   ? true :
                      _currentFilter === 'semtmdb' ? !f.tmdb_id :
                      s === _currentFilter;
    var matchSearch = !q || (f.titulo || '').toLowerCase().includes(q);
    return matchFilter && matchSearch;
  });

  // Ordenação por coluna
  list = list.slice().sort(function (a, b) {
    var va, vb;
    if (_sortCol === 'titulo') {
      va = (a.titulo || '').toLowerCase();
      vb = (b.titulo || '').toLowerCase();
      return _sortDir === 'asc' ? va.localeCompare(vb, 'pt-BR') : vb.localeCompare(va, 'pt-BR');
    }
    if (_sortCol === 'app') {
      va = (a.app || '').toLowerCase();
      vb = (b.app || '').toLowerCase();
      return _sortDir === 'asc' ? va.localeCompare(vb, 'pt-BR') : vb.localeCompare(va, 'pt-BR');
    }
    if (_sortCol === 'status') {
      var ord = { cartaz: 0, breve: 1, catalogo: 2 };
      va = ord[(a.status || '').toLowerCase()] !== undefined ? ord[(a.status || '').toLowerCase()] : 3;
      vb = ord[(b.status || '').toLowerCase()] !== undefined ? ord[(b.status || '').toLowerCase()] : 3;
      return _sortDir === 'asc' ? va - vb : vb - va;
    }
    // data lançamento (tmdb_data.release_date), fallback created_at
    va = (a.tmdb_data && a.tmdb_data.release_date) || a.created_at || '';
    vb = (b.tmdb_data && b.tmdb_data.release_date) || b.created_at || '';
    return _sortDir === 'desc' ? (va > vb ? -1 : 1) : (va < vb ? -1 : 1);
  });

  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state"><p>' +
      (_filmes.length === 0
        ? 'Nenhum filme cadastrado ainda. Clique em "+ Adicionar filme" para começar.'
        : 'Nenhum filme encontrado com esses filtros.') +
      '</p></div></td></tr>';
    return;
  }

  var html = '';
  list.forEach(function (f) {
    var s         = (f.status || '').toLowerCase();
    var statusCls = { cartaz: 'status-cartaz', breve: 'status-breve', catalogo: 'status-catalogo' }[s] || '';
    var statusTxt = { cartaz: 'Em cartaz',     breve: 'Em breve',     catalogo: 'Catálogo'        }[s] || f.status;

    var a11yHtml = (function () {
      var a = f.a11y || {};
      if (a.ad === false && a.lse === false && a.libras === false) {
        return '<span class="chip-sem-a11y">&#8855; Sem acessibilidade</span>';
      }
      return '<span class="a11y-chip chip-ad">AD</span>' +
             '<span class="a11y-chip chip-lse">LSE</span>' +
             '<span class="a11y-chip chip-libras">LIBRAS</span>';
    })();

    var semTmdbBadge = !f.tmdb_id
      ? '<span title="Sem dados do TMDb — edite para corrigir" style="display:inline-block;margin-left:6px;font-size:11px;background:#fff7ed;color:#c2410c;border:1px solid #fed7aa;border-radius:4px;padding:1px 5px;vertical-align:middle;cursor:default;">⚠️ TMDb</span>'
      : '';
    var pendentebadge = _getAppStatusAdmin(f) === 'pendente'
      ? '<span title="Aguardando classificação de acessibilidade" style="display:inline-block;margin-left:4px;font-size:11px;background:#fef9c3;color:#854d0e;border:1px solid #fde68a;border-radius:4px;padding:1px 5px;vertical-align:middle;cursor:default;">Pendente</span>'
      : '';

    var releaseDate = (f.tmdb_data && f.tmdb_data.release_date)
      ? new Date(f.tmdb_data.release_date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : '—';

    html +=
      '<tr>' +
        '<td>' +
          '<div class="td-title">' + escHtml(f.titulo) + semTmdbBadge + pendentebadge + '</div>' +
          (f.url_key ? '<div class="td-urlkey">' + escHtml(f.url_key) + '</div>' : '') +
        '</td>' +
        '<td>' + (f.app ? '<span class="app-badge">' + escHtml(f.app) + '</span>' : '<span style="color:var(--ink3);font-size:12px">—</span>') + '</td>' +
        '<td><div class="a11y-chips">' + a11yHtml + '</div></td>' +
        '<td><span class="status-badge ' + statusCls + '">' + escHtml(statusTxt) + '</span></td>' +
        '<td style="font-size:12px;color:var(--ink3);white-space:nowrap;">' + releaseDate + '</td>' +
        '<td>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
            (f.app && _getAppStatusAdmin(f) !== 'confirmado'
              ? '<button class="btn" style="background:#dcfce7;color:#166534;border:1px solid #86efac;font-size:12px;" onclick="fixAppStatus(\'' + f.id + '\')" title="Corrigir app_status para confirmado">✓ Corrigir</button>'
              : '') +
            '<button class="btn btn-edit"   onclick="editFilme(\'' + f.id + '\')">Editar</button>' +
            '<button class="btn btn-delete" onclick="deleteFilme(\'' + f.id + '\')">Excluir</button>' +
          '</div>' +
        '</td>' +
      '</tr>';
  });

  tbody.innerHTML = html;
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function openModal(id) {
  _editId = id || null;
  clearForm();

  if (id) {
    var f = _filmes.find(function (x) { return x.id === id; });
    if (!f) return;
    document.getElementById('modal-title').textContent = 'Editar filme';
    document.getElementById('f-titulo').value           = f.titulo || '';
    document.getElementById('f-ingresso-url').value     = f.ingresso_url || '';
    document.getElementById('f-status').value           = f.status || 'cartaz';
    document.getElementById('urlkey-preview').textContent = f.url_key || '—';

    if (f.app) {
      document.querySelectorAll('.app-option').forEach(function (el) {
        var radio = el.querySelector('input[type=radio]');
        if (radio && radio.value === f.app) { radio.checked = true; el.classList.add('selected'); }
      });
    }

    setSemA11y(!!(f.a11y && f.a11y.ad === false && f.a11y.lse === false && f.a11y.libras === false));
    if (f.tmdb_data) {
      showPreview(f.tmdb_data);
    } else {
      // Sem dados do TMDb — mostra alerta, campo de ID manual, e já busca automaticamente
      _setTmdbAlert(true);
      setTimeout(fetchPreview, 200); // dispara busca com o título já preenchido
    }
    var svEl = document.getElementById('f-sinopse-video');
    if (svEl) svEl.value = f.sinopse_video_id || '';
    var tvEl = document.getElementById('f-trailer-acessivel');
    if (tvEl) tvEl.value = f.trailer_acessivel_id || '';
  } else {
    document.getElementById('modal-title').textContent = 'Adicionar filme';
    var svEl2 = document.getElementById('f-sinopse-video');
    if (svEl2) svEl2.value = '';
  }

  document.getElementById('modal-overlay').classList.add('open');
  setTimeout(function () { document.getElementById('f-titulo').focus(); }, 100);
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
  _editId = null;
  clearForm();
}

function clearForm() {
  document.getElementById('f-titulo').value           = '';
  document.getElementById('f-ingresso-url').value     = '';
  document.getElementById('f-status').value           = 'cartaz';
  document.getElementById('urlkey-preview').textContent = '—';
  document.getElementById('tmdb-preview').innerHTML   = '<div class="preview-loading">Digite o título para buscar dados do filme</div>';
  var manualEl = document.getElementById('f-tmdb-id-manual');
  if (manualEl) manualEl.value = '';
  var tvEl2 = document.getElementById('f-trailer-acessivel');
  if (tvEl2) tvEl2.value = '';
  _setTmdbAlert(false);
  document.querySelectorAll('.app-option').forEach(function (el) {
    el.classList.remove('selected');
    var r = el.querySelector('input[type=radio]');
    if (r) r.checked = false;
  });
  setSemA11y(false);
}

function _setTmdbAlert(show) {
  var alertField  = document.getElementById('tmdb-alert-field');
  var manualField = document.getElementById('tmdb-id-manual-field');
  if (alertField)  alertField.style.display  = show ? '' : 'none';
  if (manualField) manualField.style.display = show ? '' : 'none';
}

async function onManualTmdbId() {
  var raw = ((document.getElementById('f-tmdb-id-manual') || {}).value || '').trim();
  var id  = parseInt(raw, 10);
  if (!id) return;
  var preview = document.getElementById('tmdb-preview');
  if (preview) preview.innerHTML = '<div class="preview-loading">Buscando TMDb ID ' + id + '...</div>';
  try {
    var data = await getMovie(id);
    if (data && data.id) { showPreview(data); _setTmdbAlert(false); }
    else if (preview) preview.innerHTML = '<div class="preview-loading">ID não encontrado no TMDb</div>';
  } catch (e) {
    if (preview) preview.innerHTML = '<div class="preview-loading">Erro ao buscar ID no TMDb</div>';
  }
}

function selectApp(name, el) {
  document.querySelectorAll('.app-option').forEach(function (o) { o.classList.remove('selected'); });
  if (el) el.classList.add('selected');
}

// ── Sem acessibilidade ────────────────────────────────────────────────────────
function setSemA11y(val) {
  _semA11yActive = val;
  var label    = document.getElementById('sem-a11y-label');
  var xIcon    = document.getElementById('sem-a11y-x');
  var appBlock = document.getElementById('app-block');
  if (label)    label.classList.toggle('active', val);
  if (xIcon)    xIcon.style.display  = val ? '' : 'none';
  if (appBlock) appBlock.style.display = val ? 'none' : '';
}

function toggleSemA11y() { setSemA11y(!_semA11yActive); }

// ── URL Key ───────────────────────────────────────────────────────────────────
function extractUrlKey() {
  var url   = (document.getElementById('f-ingresso-url') || {}).value || '';
  var match = url.trim().match(/ingresso\.com\/filme\/([^/?]+)/);
  var key   = match ? match[1] : '';
  var el    = document.getElementById('urlkey-preview');
  if (el) el.textContent = key || '—';
  return key;
}

// ── TMDb preview ──────────────────────────────────────────────────────────────
function debouncePreview() {
  clearTimeout(_previewTimer);
  _previewTimer = setTimeout(fetchPreview, 800);
}

// Remove "(2026)", "[...]" etc. do título antes de buscar no TMDb.
// O TMDb retorna 0 resultados se a query tiver o ano entre parênteses.
function _cleanTitleForSearch(t) {
  return (t || '').replace(/\([^)]*\)/g, ' ').replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
}
// Extrai um ano (19xx/20xx) do título, se houver — usado para desambiguar remakes.
function _extractYear(t) {
  var m = (t || '').match(/\b(19|20)\d{2}\b/);
  return m ? m[0] : null;
}

/**
 * Busca o melhor match no TMDb:
 *  - limpa o título (tira "(2026)") antes de buscar
 *  - casa por título (normT ignora pontuação/ano) e, se houver ano, prioriza a edição daquele ano
 *  - fallbacks: sem subtítulo, depois 1º resultado com poster
 */
async function searchMovieBest(titulo) {
  if (!titulo || titulo.length < 2) return null;
  try {
    var clean = _cleanTitleForSearch(titulo) || titulo;
    var year  = _extractYear(titulo);

    var pick = function (results) {
      if (!results || !results.length) return null;
      var matches = results.filter(function (r) {
        return titlesMatch(r.title, clean) || titlesMatch(r.original_title, clean) ||
               titlesMatch(r.title, titulo) || titlesMatch(r.original_title, titulo);
      });
      if (!matches.length) return null;
      if (year) {
        var byYear = matches.filter(function (r) { return (r.release_date || '').slice(0, 4) === year; });
        if (byYear.length) return byYear[0];
      }
      return matches[0];
    };

    // Nível 1: busca pelo título limpo
    var r1 = await searchMovie(clean);
    var m1 = pick(r1);
    if (m1) return m1;

    // Nível 2: busca sem subtítulo (ex: "Título: Subtítulo" → "Título")
    var base = clean.replace(/\s*[:\-–—]\s*.+$/, '').trim();
    if (base && base !== clean && base.length >= 3) {
      var r2 = await searchMovie(base);
      var m2 = pick(r2);
      if (m2) return m2;
      if (r2[0] && r2[0].poster_path) return r2[0];
    }

    // Nível 3: fallback — 1º resultado com poster
    if (r1[0] && r1[0].poster_path) return r1[0];
  } catch (e) {}
  return null;
}

async function fetchPreview() {
  var title = (document.getElementById('f-titulo') || {}).value || '';
  title = title.trim();
  if (title.length < 2) return;

  var preview = document.getElementById('tmdb-preview');
  if (preview) preview.innerHTML = '<div class="preview-loading">Buscando no TMDb...</div>';

  try {
    var result = await searchMovieBest(title);
    if (!result) {
      if (preview) preview.innerHTML = '<div class="preview-loading">Filme não encontrado no TMDb</div>';
      return;
    }
    showPreview(result);
  } catch (e) {
    if (preview) preview.innerHTML = '<div class="preview-loading">Erro ao buscar no TMDb</div>';
  }
}

function showPreview(data) {
  var preview    = document.getElementById('tmdb-preview');
  if (!preview) return;
  var posterUrl  = data.poster_path ? 'https://image.tmdb.org/t/p/w92' + data.poster_path : '';
  var year       = (data.release_date || '').slice(0, 4);

  preview.innerHTML =
    '<div class="preview-film">' +
      (posterUrl ? '<img class="preview-poster" src="' + posterUrl + '" alt="">' : '') +
      '<div>' +
        '<div class="preview-title">' + escHtml(data.title || data.original_title || '') + '</div>' +
        '<div class="preview-meta">' + (year ? year + ' · ' : '') + (data.vote_average ? '★ ' + data.vote_average.toFixed(1) : '') + '</div>' +
        '<div class="preview-meta" style="margin-top:4px;font-size:11px;color:#888">TMDb ID: ' + data.id + '</div>' +
      '</div>' +
    '</div>';
}

// ── Salvar ────────────────────────────────────────────────────────────────────
async function saveFilme() {
  var titulo     = (document.getElementById('f-titulo')      || {}).value || '';
  var ingressoUrl= (document.getElementById('f-ingresso-url')|| {}).value || '';
  var status     = (document.getElementById('f-status')      || {}).value || 'cartaz';
  titulo      = titulo.trim();
  ingressoUrl = ingressoUrl.trim();
  var urlKey  = extractUrlKey();
  var app     = '';

  var checked = document.querySelector('input[name="app"]:checked');
  if (checked) app = checked.value;

  if (!titulo) { showToast('Informe o título do filme', 'error'); return; }
  if (!_semA11yActive && !app) { showToast('Selecione o aplicativo', 'error'); return; }

  var btn = document.getElementById('btn-save');
  btn.innerHTML = '<span class="spinner"></span> Salvando...';
  btn.disabled  = true;

  try {
    var tmdbData = null;

    // 1. ID manual tem prioridade — busca direta pelo ID no TMDb
    var manualId = parseInt(((document.getElementById('f-tmdb-id-manual') || {}).value || '').trim(), 10);
    if (manualId) {
      try { tmdbData = await getMovie(manualId); } catch (e) {}
    }

    // 2. Busca por título se não veio ID manual (3 níveis via searchMovieBest)
    if (!tmdbData) {
      tmdbData = await searchMovieBest(titulo);
    }

    // 3. Edição: preserva tmdb_id já existente se nenhuma das buscas acima encontrou
    var existingFilme = _editId ? _filmes.find(function (x) { return x.id === _editId; }) : null;
    if (!tmdbData && existingFilme && existingFilme.tmdb_id) {
      tmdbData = existingFilme.tmdb_data || { id: existingFilme.tmdb_id };
    }

    var a11yVal = _semA11yActive
      ? { ad: false, lse: false, libras: false }
      : { ad: true,  lse: true,  libras: true  };

    var sinopseVideo    = ((document.getElementById('f-sinopse-video')     || {}).value || '').trim();
    var trailerAcessivel= ((document.getElementById('f-trailer-acessivel') || {}).value || '').trim();

    var appStatus = _semA11yActive ? 'sem_acessibilidade' : (app ? 'confirmado' : 'pendente');

    var filme = {
      titulo:       titulo,
      ingresso_url: ingressoUrl,
      url_key:      urlKey,
      app:          _semA11yActive ? null : app,
      app_status:   appStatus,
      status:       status,
      a11y:         a11yVal,
      tmdb_id:      tmdbData ? tmdbData.id : null,
      tmdb_data:    tmdbData || null,
      updated_at:   new Date().toISOString(),
    };
    // Campos opcionais: só inclui se preenchidos (colunas podem ainda não existir no schema)
    if (sinopseVideo)     filme.sinopse_video_id     = sinopseVideo;
    if (trailerAcessivel) filme.trailer_acessivel_id = trailerAcessivel;

    if (_editId) {
      await supabasePatch('filmes', 'id=eq.' + _editId, filme);
    } else {
      filme.created_at = new Date().toISOString();
      await supabasePost('filmes', filme);
    }

    await loadFilmes();
    closeModal();
    showToast(_editId ? 'Filme atualizado!' : 'Filme cadastrado!', 'success');
  } catch (e) {
    console.error('Save error:', e);
    showToast('Erro ao salvar: ' + e.message, 'error');
  } finally {
    btn.innerHTML = 'Salvar filme';
    btn.disabled  = false;
  }
}

// ── Editar / Deletar ──────────────────────────────────────────────────────────
function editFilme(id) { openModal(id); }

async function deleteFilme(id) {
  var f = _filmes.find(function (x) { return x.id === id; });
  if (!f) return;
  if (!confirm('Remover "' + f.titulo + '"?')) return;
  try {
    await supabaseDelete('filmes', 'id=eq.' + id);
    await loadFilmes();
    showToast('Filme removido', 'success');
  } catch (e) {
    showToast('Erro ao remover: ' + e.message, 'error');
  }
}


// ── Corrigir app_status ───────────────────────────────────────────────────────
async function fixAppStatus(id) {
  var f = _filmes.find(function (x) { return x.id === id; });
  if (!f || !f.app) return;
  try {
    await supabasePatch('filmes', 'id=eq.' + id, {
      app_status: 'confirmado',
      updated_at: new Date().toISOString(),
    });
    await loadFilmes();
    showToast('Status corrigido para confirmado!', 'success');
  } catch (e) {
    showToast('Erro ao corrigir: ' + e.message, 'error');
  }
}

// ── Sincronização automática de status ────────────────────────────────────────
function toggleLog() {
  _logOpen = !_logOpen;
  var logEl  = document.getElementById('auto-log');
  var togBtn = document.getElementById('btn-toggle-log');
  var header = document.getElementById('auto-header');
  if (logEl)  logEl.classList.toggle('open', _logOpen);
  if (togBtn) togBtn.textContent = _logOpen ? 'Ocultar histórico' : 'Ver histórico';
  if (header) header.classList.toggle('open', _logOpen);
}

function addLog(type, icon, html, tagLabel, tagClass) {
  _syncLog.push({ type: type, icon: icon, html: html, tagLabel: tagLabel, tagClass: tagClass });
  renderLog();
}

function renderLog() {
  var el = document.getElementById('log-list');
  if (!el) return;
  var html = '';
  _syncLog.slice().reverse().forEach(function (item) {
    html += '<div class="log-item log-' + item.type + '">' +
      '<span class="log-icon">'  + item.icon + '</span>' +
      '<span class="log-text">'  + item.html + '</span>' +
      (item.tagLabel ? '<span class="log-tag ' + (item.tagClass || '') + '">' + item.tagLabel + '</span>' : '') +
    '</div>';
  });
  el.innerHTML = html || '<div style="color:var(--ink3);font-size:13px;padding:8px">Nenhuma alteração registrada.</div>';
}

function setProgress(pct, label) {
  var fill  = document.getElementById('progress-fill');
  var lbl   = document.getElementById('progress-label');
  if (fill) fill.style.width     = pct + '%';
  if (lbl)  lbl.textContent = label;
}

async function _checkFilmHasSessions(urlKey) {
  var eventData = await getEventId(urlKey);
  var eventId   = eventData && eventData.id ? eventData.id : null;
  if (!eventId) return false;

  var datas = [];
  for (var i = 0; i < 7; i++) {
    var d = new Date();
    d.setDate(d.getDate() + i);
    datas.push(d.toISOString().slice(0, 10));
  }

  for (var j = 0; j < datas.length; j++) {
    try {
      var sessions = await getSessoes(eventId, '1', datas[j]);
      if (Array.isArray(sessions) && sessions.length > 0) return true;
      if (sessions && sessions.theaters && sessions.theaters.length > 0) return true;
    } catch (e) { /* continua */ }
  }
  return false;
}

// ── Sincronização completa ────────────────────────────────────────────────────
// FASE 1 — Ingresso: descobre filmes novos via Ingresso + verifica sessões.
// FASE 2 — TMDb: enriquece filmes sem poster/dados com informações do TMDb.
// FASE 3 — Apps: filmes_scaneados (MovieReading/Conecta/MLOAD/Trio) + PingPlay (API) + GRETA (Paramount).

async function runSync() {
  var btn      = document.getElementById('btn-sync');
  var progress = document.getElementById('auto-progress');
  var summary  = document.getElementById('auto-summary');

  _syncLog = [];
  _logOpen = true;

  btn.disabled  = true;
  btn.innerHTML = '<span class="spinner"></span> Sincronizando...';
  if (progress) progress.classList.add('open');
  if (summary)  summary.classList.remove('open');

  var logEl  = document.getElementById('auto-log');
  var header = document.getElementById('auto-header');
  var togBtn = document.getElementById('btn-toggle-log');
  if (logEl)  logEl.classList.add('open');
  if (header) header.classList.add('open');
  if (togBtn) togBtn.style.display = 'none';
  renderLog();

  var discovered = 0;
  var changed    = 0;
  var enriched   = 0;
  var errors     = 0;
  var now        = new Date().toISOString();
  var BATCH      = 8;

  // Métricas para o resumo final (tabela no log)
  var mIngresso  = 0; // filmes em cartaz no Ingresso.com
  var mSessoes   = 0; // filmes com sessão nesta semana (status CARTAZ)
  var mApps      = 0; // filmes encontrados nos apps
  var mTmdb      = 0; // filmes encontrados no TMDb

  // ── FASE 1: Ingresso — Descoberta + Verificação de sessões ──────────────────
  addLog('ok', '🎟️', '<strong>Fase 1</strong> — Ingresso.com: descoberta + sessões', null, null);

  // 1a. Busca lista diretamente do Ingresso.com (fonte oficial)
  try {
    setProgress(2, 'Buscando filmes em cartaz no Ingresso.com...');
    var data  = await getNowPlaying();
    var lista = Array.isArray(data) ? data : [];
    if (!lista.length) throw new Error('Nenhum filme retornado pelo Ingresso.');
    addLog('ok', '🎬', '<strong>' + lista.length + '</strong> filmes encontrados no Ingresso.com', null, null);
    mIngresso = lista.filter(function (f) { return !f.isComingSoon; }).length;

    // 1b. Filtra os que ainda não estão na base — sem verificação extra (fonte JÁ é o Ingresso)
    var keysExistentes = new Set(_filmes.map(function (f) { return f.url_key; }).filter(Boolean));
    var novos = lista.filter(function (f) { return f.urlKey && f.title && !keysExistentes.has(f.urlKey); });

    if (!novos.length) {
      addLog('ok', '✓', 'Nenhum filme novo para adicionar', null, null);
    } else {
      addLog('ok', '🆕', '<strong>' + novos.length + '</strong> filme(s) novo(s) para adicionar...', null, null);
      for (var i = 0; i < novos.length; i += BATCH) {
        setProgress(4 + Math.round((i / novos.length) * 26), 'Adicionando ' + Math.min(i + BATCH, novos.length) + '/' + novos.length + '...');
        var batch = novos.slice(i, i + BATCH);
        await Promise.all(batch.map(function (nf) {
          var statusInicial = nf.isComingSoon ? 'BREVE' : 'CARTAZ';
          var tagLabel      = nf.isComingSoon ? 'Em breve' : 'Em cartaz';
          var tagCls        = nf.isComingSoon ? 'tag-breve' : 'tag-cartaz';
          return supabasePost('filmes', {
            id: 'film_' + nf.urlKey, titulo: nf.title, url_key: nf.urlKey,
            ingresso_url: 'https://www.ingresso.com/filme/' + nf.urlKey,
            status: statusInicial, app_status: 'pendente', app: null,
            a11y: { ad: false, lse: false, libras: false },
            tmdb_id: null, tmdb_data: null, // enriquecido na Fase 2
            created_at: now, updated_at: now,
          }, 'resolution=ignore-duplicates,return=minimal')
          .then(function () {
            addLog('ok', '✓', '<strong>' + escHtml(nf.title) + '</strong> — adicionado', tagLabel, tagCls);
            discovered++;
          })
          .catch(function (e) {
            addLog('err', '✕', escHtml(nf.title) + ' — ' + e.message, null, null);
            errors++;
          });
        }));
      }
    }
  } catch (e) {
    addLog('err', '✕', 'Fase 1 descoberta: ' + e.message, null, null);
    errors++;
  }

  // 1c. Verifica sessões para filmes já cadastrados
  try { _filmes = await supabaseGet('filmes', 'order=created_at.desc&limit=500'); } catch (e) {}

  var toCheck = _filmes.filter(function (f) {
    var s = (f.status || '').toLowerCase();
    return (s === 'cartaz' || s === 'breve') && f.url_key;
  });

  if (toCheck.length) {
    addLog('ok', '🎟️', 'Verificando sessões para <strong>' + toCheck.length + '</strong> filmes...', null, null);
    for (var k = 0; k < toCheck.length; k++) {
      var cf = toCheck[k];
      setProgress(26 + Math.round((k / toCheck.length) * 24), 'Sessões ' + (k + 1) + '/' + toCheck.length + ': ' + cf.titulo);
      var currentStatus = (cf.status || '').toLowerCase();
      try {
        var hasSessions = await _checkFilmHasSessions(cf.url_key);
        var newStatus   = null;
        if (currentStatus === 'cartaz' && !hasSessions) newStatus = 'CATALOGO';
        else if (currentStatus === 'breve' && hasSessions) newStatus = 'CARTAZ';
        if (newStatus) {
          await supabasePatch('filmes', 'id=eq.' + cf.id, { status: newStatus, updated_at: now });
          var oldLbl = currentStatus === 'cartaz' ? 'Em cartaz' : 'Em breve';
          var newLbl = newStatus === 'CATALOGO' ? 'Catálogo' : 'Em cartaz';
          addLog('ok', '→', '<strong>' + escHtml(cf.titulo) + '</strong> — ' + oldLbl + ' → ' + newLbl, newLbl, 'tag-' + newStatus.toLowerCase());
          changed++;
          cf.status = newStatus;
        }
      } catch (e) {
        addLog('err', '✕', '<strong>' + escHtml(cf.titulo) + '</strong> — ' + e.message, null, null);
        errors++;
      }
    }
  } else {
    addLog('ok', '✓', 'Nenhum filme em cartaz/breve para verificar sessões', null, null);
  }

  // ── FASE 2: Apps — Auto-classificação ───────────────────────────────────────
  // Fontes: tabela filmes_scaneados (MovieReading/Conecta/MLOAD/Trio) + PingPlay (API) + GRETA (Paramount/filmeb)
  // Varre TODOS os filmes com sessão na semana (status CARTAZ). Roda ANTES do TMDb — não depende dele.
  addLog('ok', '🎯', '<strong>Fase 2</strong> — Auto-classificação: filmes_scaneados + PingPlay + GRETA', null, null);
  setProgress(55, 'Buscando fontes de acessibilidade...');

  try {
    // 3a. Tabela filmes_scaneados — MovieReading, Conecta, MLOAD, Trio
    var canonApp = function (a) {
      var k = normT(a);
      if (k === 'moviereading')        return 'MovieReading';
      if (k === 'mload')               return 'MLOAD';
      if (k === 'pingplay')            return 'PingPlay';
      if (k === 'greta')               return 'GRETA';
      if (k.indexOf('conecta') === 0)  return 'Conecta Acessibilidade';
      if (k.indexOf('trio') === 0)     return 'Trio Cinema';
      return a; // fallback: mantém o valor original
    };
    var scanNorm  = {};
    var scanFuzzy = {};
    try {
      var scaneados = await supabaseGet('filmes_scaneados', 'select=titulo,app&limit=5000');
      (scaneados || []).forEach(function (row) {
        if (!row || !row.titulo || !row.app) return;
        var app = canonApp(row.app);
        var n = normT(row.titulo), f = normFuzzy(row.titulo);
        if (n && !scanNorm[n]) scanNorm[n] = app;
        if (f.length >= 4 && !scanFuzzy[f]) scanFuzzy[f] = app;
      });
      addLog('ok', '🗂️', 'filmes_scaneados: <strong>' + (scaneados ? scaneados.length : 0) + '</strong> registro(s)', null, null);
    } catch (e) {
      addLog('err', '✕', 'filmes_scaneados: ' + e.message, null, null);
    }

    // 3b. PingPlay (API) + GRETA (Paramount/filmeb) via função a11y-sources
    var a11yResp = await fetch('/.netlify/functions/a11y-sources');
    var a11yText = await a11yResp.text();
    var a11yData = {};
    try { a11yData = a11yText ? JSON.parse(a11yText) : {}; } catch (pe) {
      addLog('err', '✕', 'Fase 3: resposta inválida da função (possível timeout) — ' + pe.message, null, null);
    }

    var pingplaySet   = new Set((a11yData.pingplay || []).map(normT));
    var pingplayFuzzy = new Set((a11yData.pingplay || []).map(normFuzzy));
    var gretaSet      = new Set((a11yData.greta    || []).map(normT));
    var gretaFuzzy    = new Set((a11yData.greta    || []).map(normFuzzy));

    // PingPlay: mapa por SLUG do ingressoUrl (match exato, à prova de idioma) + título (fallback)
    var ppDetails  = a11yData.pingplay_details || [];
    var ppByUrlKey = {};
    var ppByNorm   = {};
    ppDetails.forEach(function (d) {
      var slug = _ingressoSlug(d.ingressoUrl);
      if (slug) ppByUrlKey[slug] = d;
      ppByNorm[normT(d.name)]     = d;
      ppByNorm[normFuzzy(d.name)] = d;
    });

    addLog('ok', '📋',
      'filmes_scaneados: <strong>' + Object.keys(scanNorm).length + '</strong> títulos · ' +
      'PingPlay: <strong>' + pingplaySet.size + '</strong>' + (ppDetails.length ? ' (API ✓)' : '') + ' · ' +
      'GRETA: <strong>' + gretaSet.size + '</strong> (Paramount)',
      null, null);

    // Apps auto-classificáveis (usado no fallback "mantém" quando some das fontes)
    var APPS_RASTRAVEIS = ['MovieReading', 'MLOAD', 'PingPlay', 'GRETA', 'Conecta Acessibilidade', 'Trio Cinema'];
    // Varre TODOS os filmes com sessão na semana (status CARTAZ), independente do app_status.
    var emCartaz = _filmes.filter(function (f) {
      return (f.status || '').toLowerCase() === 'cartaz';
    });
    mSessoes = emCartaz.length; // filmes com sessão nesta semana
    addLog('ok', '🎬', '<strong>' + emCartaz.length + '</strong> filme(s) em cartaz para verificar', null, null);
    var autoCount = 0;

    for (var ap = 0; ap < emCartaz.length; ap++) {
      var pf    = emCartaz[ap];
      var norm  = normT(pf.titulo);
      var fuzzy = normFuzzy(pf.titulo);
      var app   = null;
      var appDet = null;

      // Prioridade de match:
      //   1. PingPlay por SLUG do ingressoUrl — match EXATO por URL (definitivo, à prova de idioma)
      //   2. tabela filmes_scaneados          — MovieReading, Conecta, MLOAD, Trio
      //   3. PingPlay por título               — fallback (sem URL mapeada)
      //   4. GRETA                             — filmes da Paramount (filmeb)
      var pfSlug     = pf.url_key || _ingressoSlug(pf.ingresso_url);
      var ppUrlDet   = pfSlug ? ppByUrlKey[pfSlug] : null;
      var ppTitleDet = ppByNorm[norm] || ppByNorm[fuzzy] || null;
      var scanApp    = scanNorm[norm] || (fuzzy.length >= 4 ? scanFuzzy[fuzzy] : null) || null;
      var inPPTitle  = pingplaySet.has(norm) || (fuzzy.length >= 4 && pingplayFuzzy.has(fuzzy));
      var inGreta    = gretaSet.has(norm) || (fuzzy.length >= 4 && gretaFuzzy.has(fuzzy));

      if (ppUrlDet) {
        // 1. PingPlay — match exato por ingresso_url (definitivo)
        app    = 'PingPlay';
        appDet = ppUrlDet;
      } else if (scanApp) {
        // 2. filmes_scaneados — MovieReading / Conecta / MLOAD / Trio
        app    = scanApp;
        appDet = null;
      } else if (inPPTitle) {
        // 3. PingPlay por título — fallback
        app    = 'PingPlay';
        appDet = ppTitleDet;
      } else if (inGreta) {
        // 4. GRETA — Paramount (filmeb)
        app    = 'GRETA';
        appDet = null;
      }

      if (app) mApps++; // encontrado em alguma fonte de app

      // Sem match em nenhuma fonte
      if (!app) {
        // Se já estava classificado num app rastreável e sumiu das fontes → mantém (pode ser lag)
        if (pf.app && APPS_RASTRAVEIS.indexOf(pf.app) > -1) {
          addLog('ok', '⚠️', '<strong>' + escHtml(pf.titulo) + '</strong> — não encontrado nas fontes (mantém ' + pf.app + ')', pf.app, null);
        }
        continue;
      }

      // Sem mudança real → pula atualização desnecessária
      if (pf.app === app && _getAppStatusAdmin(pf) === 'confirmado') continue;

      try {
        // PingPlay traz recursos detalhados (appDet); demais fontes = os 3 recursos
        var a11yData3 = { ad: true, lse: true, libras: true };
        if (appDet) {
          a11yData3 = {
            ad:     !!appDet.ad,
            lse:    !!(appDet.srt || appDet.legenda),
            libras: !!appDet.libras,
          };
        }
        await supabasePatch('filmes', 'id=eq.' + pf.id, {
          app: app, app_status: 'confirmado',
          a11y: a11yData3,
          updated_at: now,
        });
        var a11yTag = appDet
          ? ' <span style="font-size:11px;color:#555">' + (appDet.ad ? '🎧AD ' : '') + (appDet.libras ? '🤟Libras ' : '') + ((appDet.srt || appDet.legenda) ? '💬Leg' : '') + '</span>'
          : '';
        var mudou = (pf.app && pf.app !== app) ? escHtml(pf.app) + ' → ' : '';
        addLog('ok', '🎯', '<strong>' + escHtml(pf.titulo) + '</strong> — ' + mudou + app + a11yTag, app, 'tag-cartaz');
        autoCount++;
        var pidx = _filmes.findIndex(function (x) { return x.id === pf.id; });
        if (pidx > -1) { _filmes[pidx].app = app; _filmes[pidx].app_status = 'confirmado'; _filmes[pidx].a11y = a11yData3; }
      } catch (e) {
        addLog('err', '✕', escHtml(pf.titulo) + ' — ' + e.message, null, null);
        errors++;
      }
    }
    if (autoCount > 0) discovered += autoCount;
    addLog('ok', '✓', '<strong>' + autoCount + '</strong> filme(s) auto-classificado(s)', null, null);

    // ── Fase 3b: re-valida filmes MovieReading com ingresso_url mapeado ─────────
    // Caso específico: filme salvo como MovieReading mas que possui ingresso_url
    // correspondente ao PingPlay API → corrige para PingPlay (URL match é definitivo).
    var mrComUrl = _filmes.filter(function (f) {
      var s = f.url_key || _ingressoSlug(f.ingresso_url);
      return f.app === 'MovieReading' && s && ppByUrlKey[s];
    });
    if (mrComUrl.length) {
      addLog('ok', '🔍', '<strong>' + mrComUrl.length + '</strong> filme(s) MovieReading com URL PingPlay — corrigindo...', null, null);
      for (var rv = 0; rv < mrComUrl.length; rv++) {
        var rf   = mrComUrl[rv];
        var rDet = ppByUrlKey[rf.url_key || _ingressoSlug(rf.ingresso_url)];
        var rA11y = { ad: !!rDet.ad, lse: !!(rDet.srt || rDet.legenda), libras: !!rDet.libras };
        try {
          await supabasePatch('filmes', 'id=eq.' + rf.id, { app: 'PingPlay', app_status: 'confirmado', a11y: rA11y, updated_at: now });
          addLog('ok', '✏️', '<strong>' + escHtml(rf.titulo) + '</strong>: MovieReading → PingPlay (URL match)', 'PingPlay', 'tag-cartaz');
          changed++;
          var ridx = _filmes.findIndex(function (x) { return x.id === rf.id; });
          if (ridx > -1) { _filmes[ridx].app = 'PingPlay'; _filmes[ridx].a11y = rA11y; }
        } catch (e) {
          addLog('err', '✕', escHtml(rf.titulo) + ' re-val: ' + e.message, null, null);
        }
      }
    }

    // ── Fase 3c: corrige filmes com app definido manualmente mas app_status desatualizado ──
    var desatualizados = _filmes.filter(function (f) {
      return f.app && _getAppStatusAdmin(f) !== 'confirmado';
    });
    if (desatualizados.length) {
      addLog('ok', '🔧', '<strong>' + desatualizados.length + '</strong> filme(s) com app definido mas status desatualizado — corrigindo...', null, null);
      for (var da = 0; da < desatualizados.length; da++) {
        var df = desatualizados[da];
        try {
          await supabasePatch('filmes', 'id=eq.' + df.id, { app_status: 'confirmado', updated_at: now });
          addLog('ok', '✓', '<strong>' + escHtml(df.titulo) + '</strong> — app_status corrigido → confirmado', df.app, 'tag-cartaz');
          changed++;
          var didx = _filmes.findIndex(function (x) { return x.id === df.id; });
          if (didx > -1) _filmes[didx].app_status = 'confirmado';
        } catch (e) {
          addLog('err', '✕', escHtml(df.titulo) + ' — fix: ' + e.message, null, null);
          errors++;
        }
      }
    }
  } catch (e) {
    addLog('err', '✕', 'Fase 2 erro: ' + e.message, null, null);
  }

  // ── FASE 3: TMDb — Enriquecimento de dados (por último; não bloqueia os apps) ─
  addLog('ok', '🎬', '<strong>Fase 3</strong> — TMDb: buscando poster e dados dos filmes', null, null);
  setProgress(80, 'Buscando dados no TMDb...');

  try { _filmes = await supabaseGet('filmes', 'order=created_at.desc&limit=500'); } catch (e) {}

  var semDados = _filmes.filter(function (f) {
    return !f.tmdb_data && (f.status || '').toLowerCase() === 'cartaz';
  });

  if (!semDados.length) {
    addLog('ok', '✓', 'Todos os filmes em cartaz já têm dados do TMDb', null, null);
  } else {
    addLog('ok', '🔍', '<strong>' + semDados.length + '</strong> filme(s) sem dados — buscando no TMDb...', null, null);
    for (var t = 0; t < semDados.length; t++) {
      var sf = semDados[t];
      setProgress(80 + Math.round((t / semDados.length) * 18), 'TMDb ' + (t + 1) + '/' + semDados.length + ': ' + sf.titulo);
      try {
        var tmdbData = await searchMovieBest(sf.titulo);

        if (tmdbData) {
          await supabasePatch('filmes', 'id=eq.' + sf.id, { tmdb_id: tmdbData.id, tmdb_data: tmdbData, updated_at: now });
          addLog('ok', '🎬', '<strong>' + escHtml(sf.titulo) + '</strong> — poster e dados atualizados', null, null);
          var sfIdx = _filmes.findIndex(function (x) { return x.id === sf.id; });
          if (sfIdx > -1) { _filmes[sfIdx].tmdb_id = tmdbData.id; _filmes[sfIdx].tmdb_data = tmdbData; }
          enriched++;
        } else {
          addLog('skip', '—', escHtml(sf.titulo) + ' — não encontrado no TMDb', null, null);
        }
      } catch (e) {
        addLog('err', '✕', escHtml(sf.titulo) + ' — TMDb: ' + e.message, null, null);
      }
    }
  }

  // ── Resumo final (tabela) ────────────────────────────────────────────────────
  mTmdb = _filmes.filter(function (f) {
    return (f.status || '').toLowerCase() === 'cartaz' && f.tmdb_data;
  }).length;

  var resumoHtml =
    '<strong>Resumo da sincronização</strong>' +
    '<table style="border-collapse:collapse;font-size:12px;margin-top:6px;line-height:1.6">' +
      '<tr><td style="padding:1px 14px 1px 0">🎟️ Em cartaz no Ingresso.com</td><td style="font-weight:700;text-align:right">' + mIngresso + '</td></tr>' +
      '<tr><td style="padding:1px 14px 1px 0">📅 Com sessões nesta semana</td><td style="font-weight:700;text-align:right">' + mSessoes + '</td></tr>' +
      '<tr><td style="padding:1px 14px 1px 0">📱 Encontrados nos apps</td><td style="font-weight:700;text-align:right">' + mApps + '</td></tr>' +
      '<tr><td style="padding:1px 14px 1px 0">🎬 Encontrados no TMDb</td><td style="font-weight:700;text-align:right">' + mTmdb + '</td></tr>' +
    '</table>';
  addLog('ok', '📊', resumoHtml, null, null);

  // ── Finaliza ─────────────────────────────────────────────────────────────────
  setProgress(100, 'Concluído.');
  btn.disabled  = false;
  btn.innerHTML = '🔄 Sincronizar';
  if (progress) progress.classList.remove('open');
  if (togBtn)   togBtn.style.display = '';

  var summaryParts = [];
  if (discovered > 0) summaryParts.push(discovered + ' novo(s)');
  if (changed    > 0) summaryParts.push(changed    + ' status atualizado(s)');
  if (enriched   > 0) summaryParts.push(enriched   + ' enriquecido(s) no TMDb');
  if (errors     > 0) summaryParts.push(errors     + ' erro(s)');
  if (!summaryParts.length) summaryParts.push('Tudo em dia — nenhuma alteração necessária');

  if (summary) { summary.classList.add('open'); summary.textContent = summaryParts.join(' · '); }

  await loadFilmes();
  showToast(summaryParts[0], discovered > 0 || changed > 0 ? 'success' : null);
}

// ── Moderação de comentários ──────────────────────────────────────────────────

async function loadComentarios() {
  var container = document.getElementById('comentarios-admin-list');
  if (!container) return;
  container.innerHTML = '<p style="font-size:13px;color:var(--ink3)">Carregando...</p>';

  try {
    var rows = await supabaseGet(
      'comentarios',
      'order=created_at.desc&limit=100'
    );
    if (!rows || !rows.length) {
      container.innerHTML = '<p style="font-size:13px;color:var(--ink3);padding:12px 0;">Nenhum comentário cadastrado.</p>';
      return;
    }
    container.innerHTML = rows.map(function (c) {
      var aprovadoTag = c.aprovado === true
        ? '<span style="background:#dcfce7;color:#166534;font-size:11px;padding:2px 8px;border-radius:20px;font-weight:600;">Aprovado</span>'
        : c.aprovado === false
        ? '<span style="background:#fee2e2;color:#991b1b;font-size:11px;padding:2px 8px;border-radius:20px;font-weight:600;">Rejeitado</span>'
        : '<span style="background:#fef9c3;color:#854d0e;font-size:11px;padding:2px 8px;border-radius:20px;font-weight:600;">Pendente</span>';

      return '<div class="comentario-admin-item" id="cmt-' + escHtml(c.id) + '" style="border:1px solid var(--bdr);border-radius:8px;padding:12px 14px;margin-bottom:8px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap;">' +
          '<div>' +
            '<span style="font-weight:600;font-size:13px;">' + escHtml(c.autor || 'Anônimo') + '</span>' +
            ' <span style="font-size:11px;color:var(--ink3);">· ' + escHtml(c.url_key || '') + '</span>' +
            ' · ' + aprovadoTag +
          '</div>' +
          '<div style="display:flex;gap:6px;">' +
            (c.aprovado !== true
              ? '<button class="btn btn-outline" style="font-size:11px;padding:4px 10px;" onclick="aprovarComentario(\'' + escHtml(c.id) + '\')">✓ Aprovar</button>'
              : '') +
            '<button class="btn" style="font-size:11px;padding:4px 10px;background:#fee2e2;color:#991b1b;border:1px solid #fca5a5;" onclick="excluirComentario(\'' + escHtml(c.id) + '\')">✕ Excluir</button>' +
          '</div>' +
        '</div>' +
        '<p style="margin:8px 0 0;font-size:13px;color:var(--ink2);line-height:1.5;">' + escHtml(c.texto || '') + '</p>' +
        '</div>';
    }).join('');
  } catch (err) {
    container.innerHTML = '<p style="font-size:13px;color:#dc2626;padding:12px 0;">Erro ao carregar comentários: ' + escHtml(err.message) + '</p>';
  }
}

async function aprovarComentario(id) {
  try {
    await supabasePatch('comentarios', 'id=eq.' + encodeURIComponent(id), { aprovado: true });
    showToast('Comentário aprovado.', 'success');
    loadComentarios();
  } catch (err) {
    showToast('Erro ao aprovar: ' + err.message, 'error');
  }
}

async function excluirComentario(id) {
  if (!confirm('Excluir este comentário? Esta ação é irreversível.')) return;
  try {
    await supabaseDelete('comentarios', 'id=eq.' + encodeURIComponent(id));
    var el = document.getElementById('cmt-' + id);
    if (el) el.remove();
    showToast('Comentário excluído.', 'success');
  } catch (err) {
    showToast('Erro ao excluir: ' + err.message, 'error');
  }
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(msg, type) {
  var t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className   = 'toast show' + (type ? ' ' + type : '');
  setTimeout(function () { t.className = 'toast'; }, 3000);
}
