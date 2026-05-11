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

// Importador
var _importFilmes    = [];
var _importSel       = {};
var _importFiltroVal = '';
var _importAppMap    = {};
var _importStMap     = {};

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

// ── Importador da Ingresso ────────────────────────────────────────────────────
function openImportPanel() {
  var panel = document.getElementById('import-panel');
  if (!panel) return;
  panel.style.display = 'block';
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  importShowStep('buscar');
}

function closeImportPanel() {
  var panel = document.getElementById('import-panel');
  if (panel) panel.style.display = 'none';
}

function importShowStep(step) {
  ['buscar', 'selecionar', 'confirmar'].forEach(function (s) {
    var el  = document.getElementById('istep-' + s);
    var tab = document.getElementById('itab-'  + s);
    if (el)  el.style.display = s === step ? 'block' : 'none';
    if (tab) tab.classList.toggle('active', s === step);
  });
}

async function importBuscar() {
  var btn      = document.getElementById('btn-import-buscar');
  var resultEl = document.getElementById('import-buscar-result');
  btn.textContent = 'Buscando...';
  btn.disabled    = true;
  resultEl.textContent = '';

  try {
    var data  = await getNowPlaying();
    if (data && data.error) throw new Error(data.error);
    var lista = Array.isArray(data) ? data : [];
    if (!lista.length) throw new Error('Nenhum filme encontrado.');

    var cadastrados = _filmes.map(function (f) { return f.url_key; });

    _importFilmes = lista
      .map(function (f) {
        return {
          id:     f.id || f.adoroId || f.urlKey,
          title:  f.title || '',
          urlKey: f.urlKey || '',
          exists: cadastrados.includes(f.urlKey),
        };
      })
      .filter(function (f) { return f.title && f.urlKey; });

    _importSel    = {};
    _importAppMap = {};
    _importStMap  = {};
    _importFilmes.forEach(function (f) {
      _importSel[f.id]    = !f.exists;
      _importAppMap[f.id] = 'Sem Acessibilidade'; // padrão: sem app, editar depois
      _importStMap[f.id]  = 'cartaz';
    });

    btn.textContent = 'Buscar filmes em cartaz';
    btn.disabled    = false;
    resultEl.innerHTML = '&#10003; ' + _importFilmes.length + ' filmes encontrados. ' +
      '<a href="#" style="color:#D4500F;font-weight:600;text-decoration:none;" onclick="importShowStep(\'selecionar\');return false;">Selecionar &#8594;</a>';
    importShowStep('selecionar');
    importRenderList();
  } catch (e) {
    btn.textContent = 'Buscar filmes em cartaz';
    btn.disabled    = false;
    resultEl.textContent = 'Erro: ' + e.message;
  }
}

function importRenderList() {
  var lista = document.getElementById('import-film-list');
  var total = 0, sel = 0;
  var html  = '';

  _importFilmes.forEach(function (f) {
    if (_importFiltroVal && f.title.toLowerCase().indexOf(_importFiltroVal.toLowerCase()) === -1) return;
    total++;
    var checked = _importSel[f.id];
    if (checked) sel++;
    var appVal = _importAppMap[f.id] || 'MovieReading';
    var stVal  = _importStMap[f.id]  || 'cartaz';

    var apps    = ['MovieReading', 'MLOAD', 'GRETA', 'PingPlay', 'Sem Acessibilidade'];
    var appOpts = apps.map(function (a) {
      return '<option value="' + a + '"' + (appVal === a ? ' selected' : '') + '>' + a + '</option>';
    }).join('');
    var stOpts =
      '<option value="cartaz"' + (stVal === 'cartaz' ? ' selected' : '') + '>Em cartaz</option>' +
      '<option value="breve"'  + (stVal === 'breve'  ? ' selected' : '') + '>Em breve</option>';

    html += '<div style="display:grid;grid-template-columns:20px 1fr 160px 120px;gap:12px;align-items:center;padding:10px 14px;background:#fff;border:1px solid ' + (checked ? '#D4500F' : '#e2e8f0') + ';border-radius:10px;">';
    html += '<input type="checkbox"' + (checked ? ' checked' : '') + ' style="accent-color:#D4500F;width:15px;height:15px;cursor:pointer;" onchange="importToggle(\'' + f.id + '\',this.checked)">';
    html += '<div>';
    html += '<div style="font-size:13px;font-weight:600;color:#1e293b;">' + escHtml(f.title) + '</div>';
    html += '<div style="font-size:11px;color:#94a3b8;font-family:monospace;">' + escHtml(f.urlKey) + '</div>';
    if (f.exists) html += '<span style="font-size:10px;padding:2px 7px;border-radius:20px;background:#f1f5f9;color:#64748b;display:inline-block;margin-top:2px;">Já cadastrado</span>';
    html += '</div>';
    html += '<select style="font-size:12px;padding:5px 8px;border:1px solid #e2e8f0;border-radius:8px;width:100%;" onchange="_importAppMap[\'' + f.id + '\']=this.value">' + appOpts + '</select>';
    html += '<select style="font-size:12px;padding:5px 8px;border:1px solid #e2e8f0;border-radius:8px;width:100%;" onchange="_importStMap[\'' + f.id + '\']=this.value">' + stOpts + '</select>';
    html += '</div>';
  });

  if (lista) lista.innerHTML = html || '<p style="font-size:13px;color:#64748b;padding:.5rem 0">Nenhum filme encontrado.</p>';
  _set('import-count-label', total + ' filmes');
  _set('import-sel-label',   sel   + ' selecionados');
  _set('import-sel-count',   sel);
}

function importToggle(id, val) {
  _importSel[id] = val;
  importRenderList();
}

function importSelecionarTodos(val) {
  _importFilmes.forEach(function (f) { _importSel[f.id] = val; });
  importRenderList();
}

function importFiltrar(v) { _importFiltroVal = v; importRenderList(); }

function importIrConfirmar() {
  var sel = _importFilmes.filter(function (f) { return _importSel[f.id]; });
  if (!sel.length) { showToast('Selecione ao menos um filme.', 'error'); return; }

  var note = document.getElementById('import-confirm-note');
  if (note) note.textContent = sel.length + ' filme(s) serão cadastrados no Supabase.';

  var html = '';
  sel.forEach(function (f) {
    var appVal = _importAppMap[f.id] || 'MovieReading';
    var stVal  = _importStMap[f.id]  || 'cartaz';
    html += '<div style="display:grid;grid-template-columns:1fr 160px 120px;gap:12px;align-items:center;padding:10px 14px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;">';
    html += '<div><div style="font-size:13px;font-weight:600;color:#1e293b;">' + escHtml(f.title) + '</div><div style="font-size:11px;color:#94a3b8;font-family:monospace;">' + escHtml(f.urlKey) + '</div></div>';
    html += '<span style="font-size:12px;color:#475569;">' + escHtml(appVal) + '</span>';
    html += '<span style="font-size:12px;color:#475569;">' + stVal + '</span>';
    html += '</div>';
  });
  var cl = document.getElementById('import-confirm-list');
  if (cl) cl.innerHTML = html;
  var sr = document.getElementById('import-save-result');
  if (sr) sr.innerHTML = '';
  importShowStep('confirmar');
}

async function importSalvar() {
  var btn      = document.getElementById('btn-import-salvar');
  var resultEl = document.getElementById('import-save-result');
  btn.textContent = 'Buscando no TMDb...';
  btn.disabled    = true;
  if (resultEl) resultEl.innerHTML = '';

  var sel       = _importFilmes.filter(function (f) { return _importSel[f.id]; });
  var semTmdb   = []; // filmes sem match — serão importados mesmo assim

  if (resultEl) resultEl.innerHTML = '<div style="font-size:13px;color:#64748b;padding:8px 0;">Buscando dados no TMDb para ' + sel.length + ' filmes...</div>';

  // Enriquecer com TMDb (opcional — importa mesmo sem match)
  var enriched = [];
  for (var i = 0; i < sel.length; i++) {
    var f = sel[i];
    btn.textContent = 'TMDb ' + (i + 1) + '/' + sel.length + '...';
    var tmdbMatch = null;
    try {
      var results  = await searchMovie(f.title);
      var titleNrm = f.title.toLowerCase().trim();
      tmdbMatch = results.find(function (r) {
        return (r.title || '').toLowerCase().trim() === titleNrm ||
               (r.original_title || '').toLowerCase().trim() === titleNrm;
      });
      if (!tmdbMatch && results[0] && results[0].popularity > 1 && results[0].poster_path) {
        tmdbMatch = results[0];
      }
    } catch (e) { /* sem TMDb, ok */ }
    if (!tmdbMatch) semTmdb.push(f.title);
    enriched.push({ f: f, tmdb: tmdbMatch });
  }

  var payloads = enriched.map(function (item) {
    var f       = item.f;
    var tmdb    = item.tmdb;
    var appVal  = _importAppMap[f.id] || 'Sem Acessibilidade';
    var stVal   = _importStMap[f.id]  || 'cartaz';
    var semA11y = !appVal || appVal === 'Sem Acessibilidade';
    return {
      id:           'f_' + f.id,
      titulo:       f.title,
      url_key:      f.urlKey,
      ingresso_url: 'https://www.ingresso.com/filme/' + f.urlKey,
      app:          semA11y ? null : appVal,
      status:       stVal,
      a11y:         semA11y ? { ad: false, lse: false, libras: false } : { ad: true, lse: true, libras: true },
      tmdb_id:      tmdb ? tmdb.id   : null,
      tmdb_data:    tmdb ? tmdb      : null,
      created_at:   new Date().toISOString(),
      updated_at:   new Date().toISOString(),
    };
  });

  var avisoHtml = '';
  if (semTmdb.length > 0) {
    avisoHtml = '<div style="background:#fef9c3;border:1px solid #fde047;border-radius:8px;padding:12px 14px;margin-bottom:10px;">' +
      '<div style="font-size:13px;font-weight:700;color:#854d0e;margin-bottom:4px;">&#9888; ' + semTmdb.length + ' sem match no TMDb (serão importados sem poster/dados):</div>' +
      '<div style="font-size:12px;color:#92400e;">' + semTmdb.map(escHtml).join(', ') + '</div>' +
      '</div>';
  }

  try {
    await supabasePost('filmes', payloads, 'resolution=ignore-duplicates,return=minimal');
    btn.textContent = 'Cadastrar no Supabase';
    btn.disabled    = false;
    await loadFilmes();
    if (resultEl) resultEl.innerHTML = avisoHtml +
      '<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:14px 18px;text-align:center;">' +
      '<div style="font-size:14px;font-weight:600;color:#166534;">&#10003; ' + payloads.length + ' filmes cadastrados!</div>' +
      '<div style="font-size:12px;color:#166534;margin-top:4px;">Edite os filmes no admin para adicionar acessibilidade.</div>' +
      '</div>';
    showToast(payloads.length + ' filmes importados!', 'success');
  } catch (e) {
    btn.textContent = 'Cadastrar no Supabase';
    btn.disabled    = false;
    showToast('Erro ao salvar: ' + e.message, 'error');
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

async function runSync() {
  var btn      = document.getElementById('btn-sync');
  var progress = document.getElementById('auto-progress');
  var summary  = document.getElementById('auto-summary');

  _syncLog = [];
  _logOpen = true;

  btn.disabled  = true;
  btn.innerHTML = '<span class="spinner"></span> Verificando...';
  if (progress) progress.classList.add('open');
  if (summary)  summary.classList.remove('open');
  var logEl  = document.getElementById('auto-log');
  var header = document.getElementById('auto-header');
  var togBtn = document.getElementById('btn-toggle-log');
  if (logEl)  logEl.classList.add('open');
  if (header) header.classList.add('open');
  if (togBtn) togBtn.style.display = 'none';
  renderLog();

  var toCheck = _filmes.filter(function (f) {
    var s = (f.status || '').toLowerCase();
    return (s === 'cartaz' || s === 'breve') && f.url_key;
  });

  _filmes.filter(function (f) {
    var s = (f.status || '').toLowerCase();
    return (s === 'cartaz' || s === 'breve') && !f.url_key;
  }).forEach(function (f) {
    addLog('skip', '&#9888;', '<strong>' + escHtml(f.titulo) + '</strong> — sem URL Ingresso, ignorado', null, null);
  });

  if (!toCheck.length) {
    setProgress(100, 'Nenhum filme para verificar.');
    btn.disabled  = false;
    btn.innerHTML = '&#9654; Sincronizar agora';
    if (summary)  { summary.classList.add('open'); summary.textContent = 'Nenhum filme em cartaz ou em breve com URL Ingresso.'; }
    if (progress) progress.classList.remove('open');
    if (togBtn)   togBtn.style.display = '';
    return;
  }

  var changed = 0;
  var errors  = 0;

  for (var i = 0; i < toCheck.length; i++) {
    var f = toCheck[i];
    setProgress(Math.round((i / toCheck.length) * 100), 'Verificando ' + (i + 1) + ' de ' + toCheck.length + ': ' + f.titulo);

    var currentStatus = (f.status || '').toLowerCase();
    var hasSessions   = false;

    try {
      hasSessions = await _checkFilmHasSessions(f.url_key);
    } catch (e) {
      addLog('err', '&#10060;', '<strong>' + escHtml(f.titulo) + '</strong> — erro ao consultar Ingresso: ' + e.message, null, null);
      errors++;
      continue;
    }

    var newStatus = null;
    if (currentStatus === 'cartaz' && !hasSessions) newStatus = 'CATALOGO';
    else if (currentStatus === 'breve' && hasSessions)  newStatus = 'CARTAZ';

    if (newStatus) {
      try {
        await supabasePatch('filmes', 'id=eq.' + f.id, { status: newStatus, updated_at: new Date().toISOString() });
        var oldLabel = currentStatus === 'cartaz' ? 'Em cartaz' : 'Em breve';
        var newLabel = newStatus === 'CATALOGO'   ? 'Catálogo'  : 'Em cartaz';
        addLog('ok', '&#10003;', '<strong>' + escHtml(f.titulo) + '</strong> — ' + oldLabel + ' &#8594; ' + newLabel, newLabel, 'tag-' + newStatus.toLowerCase());
        changed++;
        f.status = newStatus;
      } catch (e) {
        addLog('err', '&#10060;', '<strong>' + escHtml(f.titulo) + '</strong> — erro ao atualizar: ' + e.message, null, null);
        errors++;
      }
    } else {
      addLog('ok', '&#10003;', '<strong>' + escHtml(f.titulo) + '</strong> — status correto, sem alteração', null, null);
    }
  }

  setProgress(100, 'Concluído.');
  btn.disabled  = false;
  btn.innerHTML = '&#9654; Sincronizar agora';
  if (summary)  { summary.classList.add('open'); summary.textContent = changed + ' alteração(ões) · ' + errors + ' erro(s).'; }
  if (progress) progress.classList.remove('open');
  if (togBtn)   togBtn.style.display = '';

  renderTable();
  updateStats();
  showToast('Sincronização concluída: ' + changed + ' atualização(ões).', 'success');
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
