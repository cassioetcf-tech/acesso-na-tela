// ── ADMIN PAGE ────────────────────────────────────────────────────────────────
// Lógica da página admin.html: autenticação, CRUD de filmes, preview TMDb,
// importador Ingresso e sincronização automática de status.
// Depende de: js/api/supabase.js, js/api/tmdb.js, js/api/ingresso.js,
//             js/utils.js (escHtml)

// ── Config local ──────────────────────────────────────────────────────────────
var ADMIN_SENHA = 'acesso2025'; // senha local de acesso ao painel

// ── Estado ────────────────────────────────────────────────────────────────────
var _filmes        = [];
var _editId        = null;
var _currentFilter = 'todos';
var _previewTimer  = null;
var _semA11yActive = false;


// Sync log
var _syncLog = [];
var _logOpen = false;

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
  renderTriagem();
  updateStats();
}

// ── Fila de triagem ───────────────────────────────────────────────────────────

function _getAppStatusAdmin(f) {
  if (f.app_status) return f.app_status;
  if (f.app) return 'confirmado';
  var a = f.a11y || {};
  if (a.ad === false && a.lse === false && a.libras === false) return 'sem_acessibilidade';
  return 'pendente';
}

function renderTriagem() {
  var panel = document.getElementById('triage-panel');
  var list  = document.getElementById('triage-list');
  var badge = document.getElementById('triage-count');
  if (!panel || !list) return;

  var pendentes = _filmes.filter(function (f) { return _getAppStatusAdmin(f) === 'pendente'; });

  if (badge) badge.textContent = pendentes.length;

  if (!pendentes.length) {
    panel.style.display = 'none';
    return;
  }

  panel.style.display = '';

  list.innerHTML = pendentes.map(function (f) {
    var tmdb   = f.tmdb_data || {};
    var poster = tmdb.poster_path ? 'https://image.tmdb.org/t/p/w92' + tmdb.poster_path : '';
    var title  = (tmdb.title || f.titulo || '').slice(0, 40);
    var year   = (tmdb.release_date || '').slice(0, 4);
    var meta   = year ? year : '';

    return '<div class="triage-item" id="tri-' + escHtml(f.id) + '">' +
      (poster
        ? '<img class="triage-poster" src="' + poster + '" alt="">'
        : '<div class="triage-poster triage-poster-ph">' + escHtml(title.slice(0,2).toUpperCase()) + '</div>'
      ) +
      '<div class="triage-info">' +
        '<div class="triage-title">' + escHtml(title) + '</div>' +
        (meta ? '<div class="triage-meta">' + escHtml(meta) + '</div>' : '') +
      '</div>' +
      '<div class="triage-btns">' +
        '<button class="triage-btn triage-mr"  onclick="triageFilme(\'' + f.id + '\',\'MovieReading\')">MovieReading</button>' +
        '<button class="triage-btn triage-ml"  onclick="triageFilme(\'' + f.id + '\',\'MLOAD\')">MLOAD</button>' +
        '<button class="triage-btn triage-gr"  onclick="triageFilme(\'' + f.id + '\',\'GRETA\')">GRETA</button>' +
        '<button class="triage-btn triage-pp"  onclick="triageFilme(\'' + f.id + '\',\'PingPlay\')">PingPlay</button>' +
        '<button class="triage-btn triage-sem" onclick="triageFilme(\'' + f.id + '\',null)">Sem acessibilidade</button>' +
      '</div>' +
    '</div>';
  }).join('');
}

async function triageFilme(id, app) {
  var itemEl = document.getElementById('tri-' + id);
  if (itemEl) itemEl.style.opacity = '0.4';

  var appStatus = app ? 'confirmado' : 'sem_acessibilidade';
  var a11yVal   = app
    ? { ad: true, lse: true, libras: true }
    : { ad: false, lse: false, libras: false };

  try {
    await supabasePatch('filmes', 'id=eq.' + id, {
      app:        app,
      app_status: appStatus,
      a11y:       a11yVal,
      updated_at: new Date().toISOString(),
    });

    // Atualiza cache local
    var idx = _filmes.findIndex(function (x) { return x.id === id; });
    if (idx > -1) {
      _filmes[idx].app        = app;
      _filmes[idx].app_status = appStatus;
      _filmes[idx].a11y       = a11yVal;
    }

    if (itemEl) itemEl.remove();
    renderTable();
    updateStats();

    var pendentes = _filmes.filter(function (f) { return _getAppStatusAdmin(f) === 'pendente'; });
    var badge = document.getElementById('triage-count');
    if (badge) badge.textContent = pendentes.length;
    if (!pendentes.length) {
      var panel = document.getElementById('triage-panel');
      if (panel) panel.style.display = 'none';
    }

    showToast(app ? 'App salvo: ' + app : 'Sem acessibilidade confirmada.', 'success');
  } catch (e) {
    if (itemEl) itemEl.style.opacity = '1';
    showToast('Erro ao salvar: ' + e.message, 'error');
  }
}

function updateStats() {
  _set('stat-total',   _filmes.length);
  _set('stat-cartaz',  _filmes.filter(function (f) { return (f.status || '').toLowerCase() === 'cartaz';   }).length);
  _set('stat-breve',   _filmes.filter(function (f) { return (f.status || '').toLowerCase() === 'breve';    }).length);
  _set('stat-catalogo',_filmes.filter(function (f) { return (f.status || '').toLowerCase() === 'catalogo'; }).length);
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

function renderTable() {
  var q     = ((document.getElementById('search-input') || {}).value || '').toLowerCase();
  var tbody = document.getElementById('filmes-tbody');

  var list = _filmes.filter(function (f) {
    var matchFilter = _currentFilter === 'todos' || (f.status || '').toLowerCase() === _currentFilter;
    var matchSearch = !q || (f.titulo || '').toLowerCase().includes(q);
    return matchFilter && matchSearch;
  });

  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="5"><div class="empty-state"><p>' +
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

    html +=
      '<tr>' +
        '<td>' +
          '<div class="td-title">' + escHtml(f.titulo) + '</div>' +
          (f.url_key ? '<div class="td-urlkey">' + escHtml(f.url_key) + '</div>' : '') +
        '</td>' +
        '<td>' + (f.app ? '<span class="app-badge">' + escHtml(f.app) + '</span>' : '<span style="color:var(--ink3);font-size:12px">—</span>') + '</td>' +
        '<td><div class="a11y-chips">' + a11yHtml + '</div></td>' +
        '<td><span class="status-badge ' + statusCls + '">' + escHtml(statusTxt) + '</span></td>' +
        '<td>' +
          '<div style="display:flex;gap:8px;">' +
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
    if (f.tmdb_data) showPreview(f.tmdb_data);
    var svEl = document.getElementById('f-sinopse-video');
    if (svEl) svEl.value = f.sinopse_video_id || '';
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
  document.querySelectorAll('.app-option').forEach(function (el) {
    el.classList.remove('selected');
    var r = el.querySelector('input[type=radio]');
    if (r) r.checked = false;
  });
  setSemA11y(false);
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

async function fetchPreview() {
  var title = (document.getElementById('f-titulo') || {}).value || '';
  title = title.trim();
  if (title.length < 2) return;

  var preview = document.getElementById('tmdb-preview');
  if (preview) preview.innerHTML = '<div class="preview-loading">Buscando no TMDb...</div>';

  try {
    var results = await searchMovie(title);
    if (!results[0]) {
      if (preview) preview.innerHTML = '<div class="preview-loading">Filme não encontrado no TMDb</div>';
      return;
    }
    showPreview(results[0]);
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
    // Busca TMDb: tenta match exato de título primeiro, depois resultado 1
    var results  = await searchMovie(titulo);
    var titleNrm = titulo.toLowerCase().trim();
    var tmdbData = results.find(function (r) {
      return (r.title || '').toLowerCase().trim() === titleNrm ||
             (r.original_title || '').toLowerCase().trim() === titleNrm;
    }) || (results[0] && results[0].poster_path ? results[0] : null);

    // Se estamos editando e a busca não encontrou nada, preserva o tmdb_id já salvo
    var existingFilme = _editId ? _filmes.find(function (x) { return x.id === _editId; }) : null;
    if (!tmdbData && existingFilme && existingFilme.tmdb_id) {
      tmdbData = existingFilme.tmdb_data || { id: existingFilme.tmdb_id };
    }

    var a11yVal = _semA11yActive
      ? { ad: false, lse: false, libras: false }
      : { ad: true,  lse: true,  libras: true  };

    var sinopseVideo = ((document.getElementById('f-sinopse-video') || {}).value || '').trim();

    var filme = {
      titulo:          titulo,
      ingresso_url:    ingressoUrl,
      url_key:         urlKey,
      app:             _semA11yActive ? null : app,
      status:          status,
      a11y:            a11yVal,
      sinopse_video_id: sinopseVideo || null,
      tmdb_id:         tmdbData ? tmdbData.id   : null,
      tmdb_data:       tmdbData || null,
      updated_at:      new Date().toISOString(),
    };

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


// ── TMDb Cleanup ──────────────────────────────────────────────────────────────
async function runTmdbCleanup() {
  var btn      = document.getElementById('btn-tmdb-scan');
  var resultEl = document.getElementById('tmdb-cleanup-result');
  btn.disabled    = true;
  btn.textContent = 'Verificando...';
  if (resultEl) resultEl.innerHTML = '<div style="padding:12px;font-size:13px;color:#64748b;">Verificando filmes no TMDb...</div>';

  var semMatch = [];
  for (var i = 0; i < _filmes.length; i++) {
    var f = _filmes[i];
    btn.textContent = 'Verificando ' + (i + 1) + '/' + _filmes.length + '...';
    if (f.tmdb_id) continue;
    try {
      var results  = await searchMovie(f.titulo || '');
      var titleNrm = (f.titulo || '').toLowerCase().trim();
      var match    = results.find(function (r) {
        return (r.title || '').toLowerCase().trim() === titleNrm ||
               (r.original_title || '').toLowerCase().trim() === titleNrm;
      });
      if (!match && results[0] && results[0].popularity > 1 && results[0].poster_path) match = results[0];
      if (!match) semMatch.push(f);
    } catch (e) { semMatch.push(f); }
  }

  btn.disabled    = false;
  btn.textContent = 'Verificar agora';

  if (!semMatch.length) {
    if (resultEl) resultEl.innerHTML = '<div style="padding:12px 14px;background:#f0fdf4;border-top:1px solid #bbf7d0;font-size:13px;color:#166534;">&#10003; Todos os filmes têm correspondência no TMDb.</div>';
    return;
  }

  var allIds  = JSON.stringify(semMatch.map(function (f) { return f.id; }));
  var listHtml = semMatch.map(function (f) {
    return '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f1f5f9;">' +
      '<div><div style="font-size:13px;font-weight:600;color:#1e293b;">' + escHtml(f.titulo) + '</div>' +
      '<div style="font-size:11px;font-family:monospace;color:#94a3b8;">' + escHtml(f.url_key || f.id) + ' · ' + escHtml(f.status || '') + '</div></div>' +
      '<button onclick="excluirFilmeSemTmdb(\'' + f.id + '\', this)" style="font-size:12px;padding:5px 12px;background:#fee2e2;color:#991b1b;border:1px solid #fca5a5;border-radius:6px;cursor:pointer;font-family:inherit;">Excluir</button>' +
    '</div>';
  }).join('');

  if (resultEl) resultEl.innerHTML =
    '<div style="padding:14px 16px;border-top:1px solid #e2e8f0;">' +
    '<div style="font-size:13px;font-weight:700;color:#dc2626;margin-bottom:12px;">&#9888; ' + semMatch.length + ' filme(s) sem match no TMDb:</div>' +
    '<div style="max-height:280px;overflow-y:auto;">' + listHtml + '</div>' +
    '<div style="margin-top:12px;display:flex;justify-content:flex-end;">' +
    '<button onclick="excluirTodosSemTmdb(' + allIds + ', this)" style="font-size:13px;font-weight:700;padding:8px 18px;background:#dc2626;color:#fff;border:none;border-radius:8px;cursor:pointer;font-family:inherit;">Excluir todos (' + semMatch.length + ')</button>' +
    '</div></div>';
}

async function excluirFilmeSemTmdb(id, btn) {
  if (!confirm('Excluir este filme do Supabase?')) return;
  btn.disabled    = true;
  btn.textContent = 'Excluindo...';
  try {
    await supabaseDelete('filmes', 'id=eq.' + id);
    btn.closest('div').parentElement.remove();
    _filmes = _filmes.filter(function (f) { return f.id !== id; });
    renderTable();
    showToast('Filme removido.', 'success');
  } catch (e) {
    btn.disabled    = false;
    btn.textContent = 'Excluir';
    showToast('Erro: ' + e.message, 'error');
  }
}

async function excluirTodosSemTmdb(ids, btn) {
  if (!confirm('Excluir ' + ids.length + ' filmes sem match no TMDb? Esta ação não pode ser desfeita.')) return;
  btn.disabled    = true;
  btn.textContent = 'Excluindo...';
  var erros = 0;
  for (var i = 0; i < ids.length; i++) {
    try {
      await supabaseDelete('filmes', 'id=eq.' + ids[i]);
      _filmes = _filmes.filter(function (f) { return f.id !== ids[i]; });
    } catch (e) { erros++; }
  }
  renderTable();
  showToast((ids.length - erros) + ' filmes removidos.', 'success');
}

// ── Corrigir TMDb em lote ─────────────────────────────────────────────────────
async function runTmdbFix() {
  var btn      = document.getElementById('btn-tmdb-fix');
  var resultEl = document.getElementById('tmdb-cleanup-result');
  btn.disabled    = true;
  btn.textContent = 'Verificando...';
  if (resultEl) resultEl.innerHTML = '<div style="padding:12px;font-size:13px;color:#64748b;">Buscando filmes sem tmdb_id...</div>';

  var semId = _filmes.filter(function (f) { return !f.tmdb_id; });
  if (!semId.length) {
    btn.disabled    = false;
    btn.textContent = '🔧 Corrigir TMDb';
    if (resultEl) resultEl.innerHTML = '<div style="padding:12px 14px;background:#f0fdf4;border-top:1px solid #bbf7d0;font-size:13px;color:#166534;">&#10003; Todos os filmes já têm tmdb_id.</div>';
    return;
  }

  var corrigidos = 0;
  var semMatch   = [];

  for (var i = 0; i < semId.length; i++) {
    var f = semId[i];
    btn.textContent = 'Corrigindo ' + (i + 1) + '/' + semId.length + '...';
    try {
      var results  = await searchMovie(f.titulo || '');
      var titleNrm = (f.titulo || '').toLowerCase().trim();
      var match    = results.find(function (r) {
        return (r.title || '').toLowerCase().trim() === titleNrm ||
               (r.original_title || '').toLowerCase().trim() === titleNrm;
      });
      if (!match && results[0] && results[0].popularity > 1 && results[0].poster_path) match = results[0];

      if (match) {
        await supabasePatch('filmes', 'id=eq.' + f.id, {
          tmdb_id:   match.id,
          tmdb_data: match,
          updated_at: new Date().toISOString(),
        });
        // Atualiza cache local
        var idx = _filmes.findIndex(function (x) { return x.id === f.id; });
        if (idx > -1) { _filmes[idx].tmdb_id = match.id; _filmes[idx].tmdb_data = match; }
        corrigidos++;
      } else {
        semMatch.push(f.titulo);
      }
    } catch (e) { semMatch.push(f.titulo); }
  }

  btn.disabled    = false;
  btn.textContent = '🔧 Corrigir TMDb';
  renderTable();
  updateStats();

  var html = '<div style="padding:14px 16px;border-top:1px solid #e2e8f0;">';
  if (corrigidos > 0) {
    html += '<div style="font-size:13px;font-weight:700;color:#166534;margin-bottom:8px;">&#10003; ' + corrigidos + ' filme(s) corrigido(s) com tmdb_id.</div>';
  }
  if (semMatch.length > 0) {
    html += '<div style="font-size:13px;font-weight:700;color:#854d0e;margin-bottom:6px;">&#9888; ' + semMatch.length + ' sem match no TMDb (precisam de revisão manual):</div>' +
      '<div style="font-size:12px;color:#92400e;">' + semMatch.map(escHtml).join(', ') + '</div>';
  }
  html += '</div>';
  if (resultEl) resultEl.innerHTML = html;
  showToast(corrigidos + ' filmes com TMDb corrigido(s).', corrigidos > 0 ? 'success' : 'error');
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
// FASE 3 — Apps: auto-classifica MovieReading, MLOAD e PingPlay.

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

  function normT(t) {
    return (t || '').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ').trim();
  }

  // ── FASE 1: Ingresso — Descoberta + Verificação de sessões ──────────────────
  addLog('ok', '🎟️', '<strong>Fase 1</strong> — Ingresso.com: descoberta + sessões', null, null);

  // 1a. Busca lista diretamente do Ingresso.com (fonte oficial)
  try {
    setProgress(2, 'Buscando filmes em cartaz no Ingresso.com...');
    var data  = await getNowPlaying();
    var lista = Array.isArray(data) ? data : [];
    if (!lista.length) throw new Error('Nenhum filme retornado pelo Ingresso.');
    addLog('ok', '🎬', '<strong>' + lista.length + '</strong> filmes encontrados no Ingresso.com', null, null);

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

  // ── FASE 2: TMDb — Enriquecimento de dados ───────────────────────────────────
  addLog('ok', '🎬', '<strong>Fase 2</strong> — TMDb: buscando poster e dados dos filmes', null, null);
  setProgress(50, 'Buscando dados no TMDb...');

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
      setProgress(50 + Math.round((t / semDados.length) * 22), 'TMDb ' + (t + 1) + '/' + semDados.length + ': ' + sf.titulo);
      try {
        var tmdbR    = await searchMovie(sf.titulo);
        var titleNrm = sf.titulo.toLowerCase().trim();
        var tmdbData = tmdbR.find(function (r) {
          return (r.title || '').toLowerCase().trim() === titleNrm ||
                 (r.original_title || '').toLowerCase().trim() === titleNrm;
        });
        if (!tmdbData && tmdbR[0] && tmdbR[0].popularity > 1 && tmdbR[0].poster_path) tmdbData = tmdbR[0];

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

  // ── FASE 3: Apps — Auto-classificação ───────────────────────────────────────
  addLog('ok', '🎯', '<strong>Fase 3</strong> — Auto-classificação: MovieReading, MLOAD e PingPlay', null, null);
  setProgress(72, 'Buscando fontes de acessibilidade...');

  try {
    var a11yResp = await fetch('/.netlify/functions/a11y-sources');
    var a11yData = await a11yResp.json();

    var mrSet       = new Set((a11yData.moviereading || []).map(normT));
    var mloadSet    = new Set((a11yData.mload        || []).map(normT));
    var pingplaySet = new Set((a11yData.pingplay     || []).map(normT));
    addLog('ok', '📋',
      'MovieReading: <strong>' + mrSet.size + '</strong> · ' +
      'MLOAD: <strong>' + mloadSet.size + '</strong> · ' +
      'PingPlay: <strong>' + pingplaySet.size + '</strong> títulos',
      null, null);

    var pendentes = _filmes.filter(function (f) { return _getAppStatusAdmin(f) === 'pendente'; });
    var autoCount = 0;

    for (var ap = 0; ap < pendentes.length; ap++) {
      var pf   = pendentes[ap];
      var norm = normT(pf.titulo);
      var app  = null;
      if      (mrSet.has(norm))       app = 'MovieReading';
      else if (mloadSet.has(norm))    app = 'MLOAD';
      else if (pingplaySet.has(norm)) app = 'PingPlay';
      if (!app) continue;
      try {
        await supabasePatch('filmes', 'id=eq.' + pf.id, {
          app: app, app_status: 'confirmado',
          a11y: { ad: true, lse: true, libras: true },
          updated_at: now,
        });
        addLog('ok', '🎯', '<strong>' + escHtml(pf.titulo) + '</strong> → ' + app, app, 'tag-cartaz');
        autoCount++;
        var pidx = _filmes.findIndex(function (x) { return x.id === pf.id; });
        if (pidx > -1) { _filmes[pidx].app = app; _filmes[pidx].app_status = 'confirmado'; _filmes[pidx].a11y = { ad: true, lse: true, libras: true }; }
      } catch (e) {
        addLog('err', '✕', escHtml(pf.titulo) + ' — ' + e.message, null, null);
        errors++;
      }
    }
    if (autoCount > 0) discovered += autoCount;
    addLog('ok', '✓', '<strong>' + autoCount + '</strong> filme(s) auto-classificado(s)', null, null);
  } catch (e) {
    addLog('err', '✕', 'Fase 3 erro: ' + e.message, null, null);
  }

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
