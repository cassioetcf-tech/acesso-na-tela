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
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ').trim();
}

function normFuzzy(t) {
  // Remove artigo/numeral inicial (O, A, Os, As, Um, Uma, The, An)
  return normT(t).replace(/^(o|a|os|as|um|uma|the|an)\s+/, '');
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

    var semTmdbBadge = !f.tmdb_id
      ? '<span title="Sem dados do TMDb — edite para corrigir" style="display:inline-block;margin-left:6px;font-size:11px;background:#fff7ed;color:#c2410c;border:1px solid #fed7aa;border-radius:4px;padding:1px 5px;vertical-align:middle;cursor:default;">⚠️ TMDb</span>'
      : '';
    var pendentebadge = _getAppStatusAdmin(f) === 'pendente'
      ? '<span title="Aguardando classificação de acessibilidade" style="display:inline-block;margin-left:4px;font-size:11px;background:#fef9c3;color:#854d0e;border:1px solid #fde68a;border-radius:4px;padding:1px 5px;vertical-align:middle;cursor:default;">Pendente</span>'
      : '';

    html +=
      '<tr>' +
        '<td>' +
          '<div class="td-title">' + escHtml(f.titulo) + semTmdbBadge + pendentebadge + '</div>' +
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
    if (f.tmdb_data) {
      showPreview(f.tmdb_data);
    } else {
      // Sem dados do TMDb — mostra alerta e campo de ID manual
      _setTmdbAlert(true);
    }
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
  var manualEl = document.getElementById('f-tmdb-id-manual');
  if (manualEl) manualEl.value = '';
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
    var tmdbData = null;

    // 1. ID manual tem prioridade — busca direta pelo ID no TMDb
    var manualId = parseInt(((document.getElementById('f-tmdb-id-manual') || {}).value || '').trim(), 10);
    if (manualId) {
      try { tmdbData = await getMovie(manualId); } catch (e) {}
    }

    // 2. Busca por título se não veio ID manual
    if (!tmdbData) {
      var results = await searchMovie(titulo);
      tmdbData = results.find(function (r) {
        return titlesMatch(r.title, titulo) || titlesMatch(r.original_title, titulo);
      }) || (results[0] && results[0].poster_path ? results[0] : null);
    }

    // 3. Edição: preserva tmdb_id já existente se nenhuma das buscas acima encontrou
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
        var tmdbData = tmdbR.find(function (r) {
          return titlesMatch(r.title, sf.titulo) || titlesMatch(r.original_title, sf.titulo);
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
    var a11yText = await a11yResp.text();
    var a11yData = {};
    try { a11yData = a11yText ? JSON.parse(a11yText) : {}; } catch (pe) {
      addLog('err', '✕', 'Fase 3: resposta inválida da função (possível timeout) — ' + pe.message, null, null);
    }

    var mrSet         = new Set((a11yData.moviereading || []).map(normT));
    var mloadSet      = new Set((a11yData.mload        || []).map(normT));
    var pingplaySet   = new Set((a11yData.pingplay     || []).map(normT));
    // Nível 2: sem artigo inicial (O/A/Os/As/Um/Uma/The/An)
    var mrFuzzy       = new Set((a11yData.moviereading || []).map(normFuzzy));
    var mloadFuzzy    = new Set((a11yData.mload        || []).map(normFuzzy));
    var pingplayFuzzy = new Set((a11yData.pingplay     || []).map(normFuzzy));
    addLog('ok', '📋',
      'MovieReading: <strong>' + mrSet.size + '</strong> · ' +
      'MLOAD: <strong>' + mloadSet.size + '</strong> · ' +
      'PingPlay: <strong>' + pingplaySet.size + '</strong> títulos',
      null, null);

    var pendentes = _filmes.filter(function (f) { return _getAppStatusAdmin(f) === 'pendente'; });
    var autoCount = 0;

    for (var ap = 0; ap < pendentes.length; ap++) {
      var pf    = pendentes[ap];
      var norm  = normT(pf.titulo);
      var fuzzy = normFuzzy(pf.titulo);
      var app   = null;
      if      (mrSet.has(norm)       || (fuzzy.length >= 4 && mrFuzzy.has(fuzzy)))       app = 'MovieReading';
      else if (mloadSet.has(norm)    || (fuzzy.length >= 4 && mloadFuzzy.has(fuzzy)))    app = 'MLOAD';
      else if (pingplaySet.has(norm) || (fuzzy.length >= 4 && pingplayFuzzy.has(fuzzy))) app = 'PingPlay';
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
