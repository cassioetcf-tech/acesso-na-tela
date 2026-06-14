// ── ADMIN PAGE ────────────────────────────────────────────────────────────────
// Lógica da página admin.html: autenticação, CRUD de filmes, preview Ingresso
// e sincronização automática de status.
// Depende de: js/api/supabase.js, js/api/ingresso.js,
//             js/utils.js (escHtml)

// ── Config local ──────────────────────────────────────────────────────────────
// A senha NÃO fica mais no código. O login é validado pela Netlify Function
// /admin-login (senha em variável de ambiente ADMIN_PASSWORD) que devolve um
// token de sessão assinado. Ver netlify/functions/admin-login.js.

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
var _appFilter     = 'todos';  // 'todos' | 'com' | 'sem' | <nome do app>
var _previewTimer  = null;
var _semA11yActive = false;


// Sync log
var _syncLog = [];
var _logOpen = false;

// Ordenação da tabela
var _sortCol = 'data';   // 'titulo' | 'app' | 'status' | 'data'
var _sortDir = 'desc';   // 'asc' | 'desc'

// Paginação da aba Filmes
var _page    = 1;
var _perPage = 50;

// Aba ativa
var _activeTab = 'dashboard';

// Comentários (carregados sob demanda na aba Comentários)
var _comentarios = [];
var _cmtSortDir  = 'desc';

// Filtros clicáveis do Dashboard (drill-down na própria tela)
var _dashStatus = '';  // '' | 'cartaz' | 'breve' | 'catalogo'
var _dashA11y   = '';  // '' | 'com' | 'sem'
var _dashApp    = '';  // '' | <nome do app>

// ── Autenticação ──────────────────────────────────────────────────────────────
function _hasValidSession() {
  try {
    var tok = sessionStorage.getItem('ant_admin_token');
    var exp = parseInt(sessionStorage.getItem('ant_admin_exp') || '0', 10);
    return !!tok && exp > Date.now();
  } catch (e) { return false; }
}

function _enterAdmin() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('admin-screen').style.display = 'block';
  loadFilmes();
}

async function doLogin() {
  var input = document.getElementById('login-pass');
  var errEl = document.getElementById('login-error');
  var btn   = document.getElementById('login-btn');
  var pass  = (input && input.value) || '';
  if (!pass) { input && input.focus(); return; }

  if (errEl) errEl.style.display = 'none';
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Entrando...'; }

  try {
    var r = await fetch('/.netlify/functions/admin-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pass }),
    });
    var data = {};
    try { data = await r.json(); } catch (e) {}

    if (r.ok && data.ok && data.token) {
      sessionStorage.setItem('ant_admin_token', data.token);
      sessionStorage.setItem('ant_admin_exp', String(data.exp || (Date.now() + 8 * 3600 * 1000)));
      if (input) input.value = '';
      _enterAdmin();
    } else {
      if (errEl) {
        errEl.textContent = (data && data.error) || 'Senha incorreta. Tente novamente.';
        errEl.style.display = 'block';
      }
      if (input) { input.focus(); input.select(); }
    }
  } catch (e) {
    if (errEl) { errEl.textContent = 'Erro de conexão. Tente novamente.'; errEl.style.display = 'block'; }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Entrar'; }
  }
}

function doLogout() {
  try {
    sessionStorage.removeItem('ant_admin_token');
    sessionStorage.removeItem('ant_admin_exp');
  } catch (e) {}
  location.reload();
}

// ── Abas (Dashboard / Filmes / Comentários) ─────────────────────────────────────
function showTab(name) {
  _activeTab = name;
  ['dashboard', 'filmes', 'comentarios'].forEach(function (t) {
    var panel = document.getElementById('tab-' + t);
    var btn   = document.getElementById('tabbtn-' + t);
    var on    = t === name;
    if (panel) panel.hidden = !on;
    if (panel) panel.classList.toggle('active', on);
    if (btn) { btn.classList.toggle('active', on); btn.setAttribute('aria-selected', on ? 'true' : 'false'); }
  });
  if (name === 'dashboard') renderDashboard();
  // Comentários: carrega na primeira visita à aba
  if (name === 'comentarios' && !_comentarios.length) loadComentarios();
}

window.addEventListener('load', function () {
  if (_hasValidSession()) _enterAdmin();

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
  if (tbody) tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state"><p>Carregando...</p></div></td></tr>';

  try {
    // Acumulamos TODOS os filmes (sempre os mais novos primeiro).
    var data = await supabaseGet('filmes', 'order=created_at.desc&limit=2000');
    _filmes = Array.isArray(data) ? data : [];
  } catch (e) {
    console.error('Supabase load error:', e);
    _filmes = [];
    showToast('Erro ao carregar filmes', 'error');
  }

  _page = 1;
  renderTable();
  updateStats();
  renderDashboard();
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
}

function _set(id, val) {
  var el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ── Filtro / tabela ───────────────────────────────────────────────────────────
function setFilter(filter, el) {
  _currentFilter = filter;
  _page = 1;
  document.querySelectorAll('.filter-tab').forEach(function (t) { t.classList.remove('active'); });
  if (el) el.classList.add('active');
  renderTable();
}

function filterFilmes() { _page = 1; renderTable(); }

function setSort(col) {
  if (_sortCol === col) {
    _sortDir = _sortDir === 'asc' ? 'desc' : 'asc';
  } else {
    _sortCol = col;
    _sortDir = col === 'data' ? 'desc' : 'asc';
  }
  _page = 1;
  _updateSortHeaders();
  renderTable();
}

function _updateSortHeaders() {
  var cols = ['titulo', 'distrib', 'app', 'status', 'data'];
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

// Distribuidora do filme (string) — '' se desconhecida.
function _filmeDistrib(f) {
  return (f.ingresso_data && f.ingresso_data.distributor) || '';
}

// Aplica filtros (status + busca + app) e ordenação. Usado pela tabela e pelo export.
function _getFilteredFilmes() {
  var q = ((document.getElementById('search-input') || {}).value || '').toLowerCase();

  var list = _filmes.filter(function (f) {
    var s = (f.status || '').toLowerCase();
    var matchStatus = _currentFilter === 'todos' ? true : s === _currentFilter;

    var matchApp;
    if (_appFilter === 'todos')          matchApp = true;
    else if (_appFilter === 'com')       matchApp = !!f.app;
    else if (_appFilter === 'sem')       matchApp = !f.app;
    else if (_appFilter === 'a11y-com')  matchApp = _getAppStatusAdmin(f) === 'confirmado';
    else if (_appFilter === 'a11y-sem')  matchApp = _getAppStatusAdmin(f) !== 'confirmado';
    else                                 matchApp = f.app === _appFilter;

    var matchSearch = !q ||
      (f.titulo || '').toLowerCase().includes(q) ||
      _filmeDistrib(f).toLowerCase().includes(q);

    return matchStatus && matchApp && matchSearch;
  });

  return list.slice().sort(function (a, b) {
    var va, vb;
    if (_sortCol === 'titulo') {
      va = (a.titulo || '').toLowerCase();
      vb = (b.titulo || '').toLowerCase();
      return _sortDir === 'asc' ? va.localeCompare(vb, 'pt-BR') : vb.localeCompare(va, 'pt-BR');
    }
    if (_sortCol === 'distrib') {
      va = _filmeDistrib(a).toLowerCase();
      vb = _filmeDistrib(b).toLowerCase();
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
    // data lançamento (ingresso_data.premiereDate), fallback created_at
    va = (a.ingresso_data && a.ingresso_data.premiereDate) || a.created_at || '';
    vb = (b.ingresso_data && b.ingresso_data.premiereDate) || b.created_at || '';
    return _sortDir === 'desc' ? (va > vb ? -1 : 1) : (va < vb ? -1 : 1);
  });
}

function onAppFilter() {
  _appFilter = (document.getElementById('app-filter') || {}).value || 'todos';
  _page = 1;
  renderTable();
}

// Marca a pílula de status correspondente como ativa.
function _selectStatusPill(status) {
  var order = ['todos', 'cartaz', 'breve', 'catalogo'];
  var pills = document.querySelectorAll('#tab-filmes .filter-tabs .filter-tab');
  Array.prototype.forEach.call(pills, function (p) { p.classList.remove('active'); });
  var idx = order.indexOf(status);
  if (idx >= 0 && pills[idx]) pills[idx].classList.add('active');
}

// Navega para a aba Filmes já filtrada (usado pelos cards/barras do Dashboard).
function goFilmes(status, app) {
  _currentFilter = status || 'todos';
  _appFilter     = app || 'todos';
  _page = 1;
  _selectStatusPill(_currentFilter);
  var sel = document.getElementById('app-filter');
  if (sel) sel.value = _appFilter;
  renderTable();
  showTab('filmes');
}

function renderTable() {
  var tbody = document.getElementById('filmes-tbody');
  var list  = _getFilteredFilmes();

  var countEl = document.getElementById('filmes-count');
  if (countEl) countEl.textContent = '(' + list.length + ')';

  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state"><p>' +
      (_filmes.length === 0
        ? 'Nenhum filme cadastrado ainda. Clique em "+ Adicionar filme" para começar.'
        : 'Nenhum filme encontrado com esses filtros.') +
      '</p></div></td></tr>';
    _renderPagination(0, 0);
    return;
  }

  // Paginação — 50 por página
  var totalPages = Math.max(1, Math.ceil(list.length / _perPage));
  if (_page > totalPages) _page = totalPages;
  if (_page < 1) _page = 1;
  var startIdx  = (_page - 1) * _perPage;
  var pageItems = list.slice(startIdx, startIdx + _perPage);

  var html = '';
  pageItems.forEach(function (f) {
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

    var pendentebadge = _getAppStatusAdmin(f) === 'pendente'
      ? '<span title="Aguardando classificação de acessibilidade" style="display:inline-block;margin-left:4px;font-size:11px;background:#fef9c3;color:#854d0e;border:1px solid #fde68a;border-radius:4px;padding:1px 5px;vertical-align:middle;cursor:default;">Pendente</span>'
      : '';

    var _rd = (f.ingresso_data && f.ingresso_data.premiereDate) ? new Date(f.ingresso_data.premiereDate) : null;
    var releaseDate = (_rd && !isNaN(_rd))
      ? _rd.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })
      : '—';

    html +=
      '<tr>' +
        '<td>' +
          '<div class="td-title">' + escHtml(f.titulo) + pendentebadge + '</div>' +
          (f.url_key ? '<div class="td-urlkey">' + escHtml(f.url_key) + '</div>' : '') +
        '</td>' +
        '<td style="font-size:13px;color:var(--ink2);">' + (_filmeDistrib(f) ? escHtml(_filmeDistrib(f)) : '<span style="color:var(--ink3)">—</span>') + '</td>' +
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
  _renderPagination(list.length, totalPages);
}

// Controles de paginação da tabela de filmes.
function _renderPagination(total, totalPages) {
  var el = document.getElementById('filmes-pagination');
  if (!el) return;
  if (!total || totalPages <= 1) { el.innerHTML = ''; return; }

  var from = (_page - 1) * _perPage + 1;
  var to   = Math.min(_page * _perPage, total);

  el.innerHTML =
    '<button class="page-btn" ' + (_page <= 1 ? 'disabled' : '') + ' onclick="gotoPage(' + (_page - 1) + ')" aria-label="Página anterior">←</button>' +
    '<span class="page-info">' + from + '–' + to + ' de ' + total + ' · pág. ' + _page + '/' + totalPages + '</span>' +
    '<button class="page-btn" ' + (_page >= totalPages ? 'disabled' : '') + ' onclick="gotoPage(' + (_page + 1) + ')" aria-label="Próxima página">→</button>';
}

function gotoPage(p) {
  _page = p;
  renderTable();
  // Rola para o topo da tabela ao trocar de página.
  var t = document.querySelector('#tab-filmes .table-wrap');
  if (t && t.scrollIntoView) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Exportar para CSV (abre no Excel) ────────────────────────────────────────────
// Exporta a lista atual (respeitando os filtros aplicados). Sem filtro = tudo.
function exportCSV() {
  var list = _getFilteredFilmes();
  if (!list.length) { showToast('Nada para exportar com os filtros atuais.', 'error'); return; }

  var headers = ['Titulo', 'URL key', 'Distribuidora', 'App', 'Situacao app', 'Status',
    'AD', 'LSE', 'Libras', 'Data estreia', 'Data cadastro', 'Genero', 'Duracao (min)',
    'Classificacao', 'Pais'];

  var rows = list.map(function (f) {
    var ig = f.ingresso_data || {};
    var a  = f.a11y || {};
    var sim = function (v) { return v === false ? 'Nao' : 'Sim'; };
    return [
      f.titulo || '',
      f.url_key || '',
      ig.distributor || '',
      f.app || '',
      _getAppStatusAdmin(f),
      (f.status || '').toUpperCase(),
      sim(a.ad), sim(a.lse), sim(a.libras),
      ig.premiereDate ? String(ig.premiereDate).slice(0, 10) : '',
      f.created_at ? String(f.created_at).slice(0, 10) : '',
      (ig.genres && ig.genres[0]) || '',
      ig.duration || '',
      ig.contentRating || '',
      ig.countryOrigin || '',
    ];
  });

  var sep = ';'; // ponto-e-vírgula = melhor compatibilidade com Excel pt-BR
  var esc = function (v) {
    v = String(v == null ? '' : v);
    if (/[";\n\r]/.test(v)) v = '"' + v.replace(/"/g, '""') + '"';
    return v;
  };
  var csv = [headers].concat(rows)
    .map(function (r) { return r.map(esc).join(sep); })
    .join('\r\n');

  var d = new Date();
  var stamp = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  var blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }); // BOM p/ acentos no Excel
  var url  = URL.createObjectURL(blob);
  var a    = document.createElement('a');
  a.href = url;
  a.download = 'acessonatela-filmes-' + stamp + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast(list.length + ' filme(s) exportado(s).', 'success');
}

// ── Dashboard ───────────────────────────────────────────────────────────────────
// Classifica o filme: 'confirmado' = com acessibilidade; 'sem_acessibilidade';
// 'pendente' = a verificar. (reaproveita _getAppStatusAdmin)
function _filmeComA11y(f)  { return _getAppStatusAdmin(f) === 'confirmado'; }
// "Sem acessibilidade" = tudo que NÃO é confirmado (binário: tem ou não tem).
function _filmeSemA11y(f)  { return !_filmeComA11y(f); }

// Retorna a data (Date) do filme conforme a base escolhida, ou null.
function _filmeData(f, basis) {
  var s = basis === 'created'
    ? f.created_at
    : (f.ingresso_data && f.ingresso_data.premiereDate);
  if (!s) return null;
  var d = new Date(s);
  return isNaN(d) ? null : d;
}

function clearDashFilter() {
  var from = document.getElementById('dash-from');
  var to   = document.getElementById('dash-to');
  if (from) from.value = '';
  if (to)   to.value = '';
  renderDashboard();
}

// Alterna um filtro do dashboard (clicar de novo no mesmo limpa). Filtra na tela.
function toggleDash(dim, value) {
  if (dim === 'status')    _dashStatus = (_dashStatus === value) ? '' : value;
  else if (dim === 'a11y') _dashA11y   = (_dashA11y   === value) ? '' : value;
  else if (dim === 'app')  _dashApp    = (_dashApp    === value) ? '' : value;
  renderDashboard();
}
function dashClearCross() { _dashStatus = ''; _dashA11y = ''; _dashApp = ''; renderDashboard(); }

function renderDashboard() {
  if (!_filmes) return;
  var basis = (document.getElementById('dash-date-basis') || {}).value || 'premiere';
  var fromV = (document.getElementById('dash-from') || {}).value || '';
  var toV   = (document.getElementById('dash-to')   || {}).value || '';
  var hasRange = !!(fromV || toV);
  var from = fromV ? new Date(fromV + 'T00:00:00Z') : null;
  var to   = toV   ? new Date(toV   + 'T23:59:59Z') : null;

  // 1) Base: recorte por data
  var semData = 0;
  var dated = _filmes.filter(function (f) {
    if (!hasRange) return true;
    var d = _filmeData(f, basis);
    if (!d) { semData++; return false; }
    if (from && d < from) return false;
    if (to   && d > to)   return false;
    return true;
  });

  // 2) Filtros clicáveis (drill-down). Os CARDS mostram sempre o panorama da
  //    base (estáveis, servem de botão); os painéis de aplicativo e distribuidora
  //    refletem o filtro selecionado.
  var passStatus = function (f) { return !_dashStatus || (f.status || '').toLowerCase() === _dashStatus; };
  var passA11y   = function (f) {
    if (_dashA11y === 'com') return _filmeComA11y(f);
    if (_dashA11y === 'sem') return !_filmeComA11y(f);
    return true;
  };
  var passApp    = function (f) { return !_dashApp || f.app === _dashApp; };

  var appList = dated.filter(function (f) { return passStatus(f) && passA11y(f); });            // painel de apps (sem filtro de app)
  var flist   = appList.filter(passApp);                                                          // distribuidora + nota

  // ── Cards (sempre da base 'dated'; destacam o filtro ativo) ──
  var n = function (pred) { return dated.filter(pred).length; };
  var byStatus = function (st) { return n(function (f) { return (f.status || '').toLowerCase() === st; }); };
  var noCross = !_dashStatus && !_dashA11y && !_dashApp;
  var cards = [
    { label: 'Total',              value: dated.length,         color: 'var(--laranja)', action: 'dashClearCross()',           active: noCross },
    { label: 'Em cartaz',          value: byStatus('cartaz'),   color: '#166534',        action: "toggleDash('status','cartaz')",   active: _dashStatus === 'cartaz' },
    { label: 'Em breve',           value: byStatus('breve'),    color: '#854D0E',        action: "toggleDash('status','breve')",    active: _dashStatus === 'breve' },
    { label: 'Catálogo',           value: byStatus('catalogo'), color: '#475569',        action: "toggleDash('status','catalogo')", active: _dashStatus === 'catalogo' },
    { label: 'Com acessibilidade', value: n(_filmeComA11y),     color: '#166534',        action: "toggleDash('a11y','com')",        active: _dashA11y === 'com' },
    { label: 'Sem acessibilidade', value: n(_filmeSemA11y),     color: '#991B1B',        action: "toggleDash('a11y','sem')",        active: _dashA11y === 'sem' },
  ];
  var cardsEl = document.getElementById('dash-cards');
  if (cardsEl) {
    cardsEl.innerHTML = cards.map(function (c) {
      return '<button type="button" class="stat-card stat-card-btn' + (c.active ? ' active' : '') + '" ' +
               'onclick="' + c.action + '">' +
               '<div class="stat-num" style="color:' + c.color + '">' + c.value + '</div>' +
               '<div class="stat-label">' + c.label + '</div></button>';
    }).join('');
  }

  // ── Filmes por aplicativo (reflete status + acessibilidade) ──
  var apps = {};
  appList.forEach(function (f) {
    if (_filmeComA11y(f) && f.app) apps[f.app] = (apps[f.app] || 0) + 1;
  });
  var appRows = Object.keys(apps).map(function (k) { return { app: k, n: apps[k] }; })
    .sort(function (a, b) { return b.n - a.n; });
  var appsEl = document.getElementById('dash-apps');
  if (appsEl) {
    if (!appRows.length) {
      appsEl.innerHTML = '<p class="dash-empty">Nenhum filme com aplicativo no recorte.</p>';
    } else {
      var maxApp = appRows[0].n || 1;
      appsEl.innerHTML = appRows.map(function (r) {
        var pct = Math.round((r.n / maxApp) * 100);
        var appArg = String(r.app).replace(/'/g, "\\'");
        var act = _dashApp === r.app ? ' active' : '';
        return '<button type="button" class="dash-bar-row dash-bar-btn' + act + '" title="Filtrar por ' + escHtml(r.app) + '" ' +
            'onclick="toggleDash(\'app\',\'' + appArg + '\')">' +
            '<span class="dash-bar-label">' + escHtml(r.app) + '</span>' +
            '<span class="dash-bar-track"><span class="dash-bar-fill" style="width:' + pct + '%"></span></span>' +
            '<span class="dash-bar-val">' + r.n + '</span>' +
          '</button>';
      }).join('');
    }
  }

  // ── Acessibilidade por distribuidora (reflete todos os filtros) ──
  var dist = {};
  flist.forEach(function (f) {
    var d = (f.ingresso_data && f.ingresso_data.distributor) || '— Sem distribuidora';
    if (!dist[d]) dist[d] = { com: 0, sem: 0, total: 0 };
    dist[d].total++;
    if (_filmeComA11y(f)) dist[d].com++; else dist[d].sem++;
  });
  var distRows = Object.keys(dist).map(function (k) { return { nome: k, v: dist[k] }; })
    .sort(function (a, b) { return b.v.total - a.v.total || a.nome.localeCompare(b.nome, 'pt-BR'); });
  var distEl = document.getElementById('dash-distrib');
  if (distEl) {
    if (!distRows.length) {
      distEl.innerHTML = '<tr><td colspan="4"><div class="empty-state"><p>Nenhum filme no recorte.</p></div></td></tr>';
    } else {
      distEl.innerHTML = distRows.map(function (r) {
        return '<tr>' +
            '<td>' + escHtml(r.nome) + '</td>' +
            '<td style="text-align:right;color:#166534;font-weight:700;">' + r.v.com + '</td>' +
            '<td style="text-align:right;color:#991B1B;font-weight:700;">' + r.v.sem + '</td>' +
            '<td style="text-align:right;font-weight:700;">' + r.v.total + '</td>' +
          '</tr>';
      }).join('');
    }
  }

  // ── Nota / filtros ativos ──
  var note = document.getElementById('dash-filter-note');
  if (note) {
    var parts = [];
    if (hasRange) {
      var basisLbl = basis === 'created' ? 'data de cadastro' : 'data de estreia';
      parts.push(dated.length + ' filme(s) por ' + basisLbl + (semData ? ' (' + semData + ' sem data)' : ''));
    }
    var crossLbls = [];
    if (_dashStatus) crossLbls.push({ cartaz: 'Em cartaz', breve: 'Em breve', catalogo: 'Catálogo' }[_dashStatus] || _dashStatus);
    if (_dashA11y === 'com') crossLbls.push('Com acessibilidade');
    if (_dashA11y === 'sem') crossLbls.push('Sem acessibilidade');
    if (_dashApp) crossLbls.push(_dashApp);

    if (crossLbls.length) {
      note.innerHTML = (parts.length ? escHtml(parts.join(' · ')) + ' · ' : '') +
        'Filtrando: <strong>' + escHtml(crossLbls.join(' + ')) + '</strong> (' + flist.length + ') ' +
        '<button type="button" class="dash-clear-link" onclick="dashClearCross()">limpar ✕</button>';
    } else if (parts.length) {
      note.textContent = parts.join(' · ');
    } else {
      note.textContent = 'Mostrando todos os ' + _filmes.length + ' filmes. Clique num card ou aplicativo para filtrar.';
    }
  }
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
    if (f.ingresso_data && f.ingresso_data.poster) {
      showPreview(f.ingresso_data);
    } else if (f.url_key) {
      setTimeout(fetchPreview, 200); // busca dados do Ingresso pela url_key
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
  var prevEl = document.getElementById('ingresso-preview');
  if (prevEl) prevEl.innerHTML = '<div class="preview-loading">Cole a URL da Ingresso para buscar os dados do filme</div>';
  var tvEl2 = document.getElementById('f-trailer-acessivel');
  if (tvEl2) tvEl2.value = '';
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
  debouncePreview();
  return key;
}

// ── Ingresso preview ────────────────────────────────────────────────────────────
function debouncePreview() {
  clearTimeout(_previewTimer);
  _previewTimer = setTimeout(fetchPreview, 600);
}

// Monta o subconjunto de dados do Ingresso que é cacheado em filmes.ingresso_data.
// (Mesma forma usada pelo netlify/functions/sync-status.js)
function ingressoData(e) {
  var poster = '';
  var imgs = e.images || [];
  for (var i = 0; i < imgs.length; i++) {
    if (imgs[i] && imgs[i].type === 'PosterPortrait' && imgs[i].url) { poster = imgs[i].url; break; }
  }
  if (!poster) { for (var j = 0; j < imgs.length; j++) { if (imgs[j] && imgs[j].url) { poster = imgs[j].url; break; } } }
  return {
    title:         e.title || '',
    originalTitle: e.originalTitle || '',
    poster:        poster,
    genres:        e.genres || [],
    duration:      e.duration || null,
    contentRating: e.contentRating || '',
    synopsis:      e.synopsis || '',
    countryOrigin: e.countryOrigin || '',
    distributor:   e.distributor || '',
    premiereDate:  (e.premiereDate && e.premiereDate.localDate) || '',
  };
}

// Busca os dados do filme no Ingresso a partir da url_key (campo URL).
async function fetchPreview() {
  var urlKey = extractUrlKeyValue();
  var preview = document.getElementById('ingresso-preview');
  if (!urlKey) {
    if (preview) preview.innerHTML = '<div class="preview-loading">Cole a URL da Ingresso para buscar os dados do filme</div>';
    return;
  }
  if (preview) preview.innerHTML = '<div class="preview-loading">Buscando no Ingresso.com...</div>';
  try {
    var ev = await getEventId(urlKey);
    if (!ev || !ev.id) {
      if (preview) preview.innerHTML = '<div class="preview-loading">Filme não encontrado no Ingresso</div>';
      return;
    }
    showPreview(ingressoData(ev));
  } catch (e) {
    if (preview) preview.innerHTML = '<div class="preview-loading">Erro ao buscar no Ingresso</div>';
  }
}

// Lê a url_key sem reagendar o preview (evita loop com extractUrlKey).
function extractUrlKeyValue() {
  var url   = (document.getElementById('f-ingresso-url') || {}).value || '';
  var match = url.trim().match(/ingresso\.com\/filme\/([^/?]+)/);
  return match ? match[1] : '';
}

function showPreview(ig) {
  var preview = document.getElementById('ingresso-preview');
  if (!preview) return;
  var poster = ig.poster || '';
  var year   = (ig.premiereDate || '').slice(0, 4);
  var meta   = [year, (ig.genres && ig.genres[0]) || '', ig.contentRating || ''].filter(Boolean).join(' · ');

  preview.innerHTML =
    '<div class="preview-film">' +
      (poster ? '<img class="preview-poster" src="' + poster + '" alt="">' : '') +
      '<div>' +
        '<div class="preview-title">' + escHtml(ig.title || ig.originalTitle || '') + '</div>' +
        '<div class="preview-meta">' + escHtml(meta) + '</div>' +
        (ig.distributor ? '<div class="preview-meta" style="margin-top:4px;font-size:11px;color:#888">' + escHtml(ig.distributor) + '</div>' : '') +
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
    // Busca os dados do filme no Ingresso pela url_key (poster, ficha, sinopse).
    var igData = null;
    if (urlKey) {
      try {
        var ev = await getEventId(urlKey);
        if (ev && ev.id) igData = ingressoData(ev);
      } catch (e) {}
    }

    // Edição: preserva os dados do Ingresso já existentes se a busca acima falhou.
    var existingFilme = _editId ? _filmes.find(function (x) { return x.id === _editId; }) : null;
    if (!igData && existingFilme && existingFilme.ingresso_data) {
      igData = existingFilme.ingresso_data;
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
      ingresso_data: igData || null,
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
// FASE 2 — Apps: filmes_scaneados (MovieReading/Conecta/MLOAD/Trio) + PingPlay (API) + GRETA (Paramount).
// FASE 3 — Ingresso: enriquece filmes em cartaz com poster, ficha técnica e sinopse.

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
            ingresso_data: null, // enriquecido na Fase 3 (Ingresso)
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
  // Varre TODOS os filmes com sessão na semana (status CARTAZ).
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

  // ── FASE 3: Ingresso — Enriquecimento de dados (poster, ficha, sinopse) ───────
  addLog('ok', '🎬', '<strong>Fase 3</strong> — Ingresso: buscando poster e dados dos filmes', null, null);
  setProgress(80, 'Buscando dados no Ingresso.com...');

  try { _filmes = await supabaseGet('filmes', 'order=created_at.desc&limit=500'); } catch (e) {}

  var semDados = _filmes.filter(function (f) {
    return !f.ingresso_data && f.url_key && (f.status || '').toLowerCase() === 'cartaz';
  });

  if (!semDados.length) {
    addLog('ok', '✓', 'Todos os filmes em cartaz já têm dados do Ingresso', null, null);
  } else {
    addLog('ok', '🔍', '<strong>' + semDados.length + '</strong> filme(s) sem dados — buscando no Ingresso...', null, null);
    for (var t = 0; t < semDados.length; t++) {
      var sf = semDados[t];
      setProgress(80 + Math.round((t / semDados.length) * 18), 'Ingresso ' + (t + 1) + '/' + semDados.length + ': ' + sf.titulo);
      try {
        var ev = await getEventId(sf.url_key);
        if (ev && ev.id) {
          var igData = ingressoData(ev);
          await supabasePatch('filmes', 'id=eq.' + sf.id, { ingresso_data: igData, updated_at: now });
          addLog('ok', '🎬', '<strong>' + escHtml(sf.titulo) + '</strong> — poster e dados atualizados', null, null);
          var sfIdx = _filmes.findIndex(function (x) { return x.id === sf.id; });
          if (sfIdx > -1) { _filmes[sfIdx].ingresso_data = igData; }
          enriched++;
        } else {
          addLog('skip', '—', escHtml(sf.titulo) + ' — não encontrado no Ingresso', null, null);
        }
      } catch (e) {
        addLog('err', '✕', escHtml(sf.titulo) + ' — Ingresso: ' + e.message, null, null);
      }
    }
  }

  // ── Resumo final (tabela) ────────────────────────────────────────────────────
  var mDados = _filmes.filter(function (f) {
    return (f.status || '').toLowerCase() === 'cartaz' && f.ingresso_data;
  }).length;

  var resumoHtml =
    '<strong>Resumo da sincronização</strong>' +
    '<table style="border-collapse:collapse;font-size:12px;margin-top:6px;line-height:1.6">' +
      '<tr><td style="padding:1px 14px 1px 0">🎟️ Em cartaz no Ingresso.com</td><td style="font-weight:700;text-align:right">' + mIngresso + '</td></tr>' +
      '<tr><td style="padding:1px 14px 1px 0">📅 Com sessões nesta semana</td><td style="font-weight:700;text-align:right">' + mSessoes + '</td></tr>' +
      '<tr><td style="padding:1px 14px 1px 0">📱 Encontrados nos apps</td><td style="font-weight:700;text-align:right">' + mApps + '</td></tr>' +
      '<tr><td style="padding:1px 14px 1px 0">🎬 Com dados do Ingresso</td><td style="font-weight:700;text-align:right">' + mDados + '</td></tr>' +
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
  if (enriched   > 0) summaryParts.push(enriched   + ' enriquecido(s) no Ingresso');
  if (errors     > 0) summaryParts.push(errors     + ' erro(s)');
  if (!summaryParts.length) summaryParts.push('Tudo em dia — nenhuma alteração necessária');

  if (summary) { summary.classList.add('open'); summary.textContent = summaryParts.join(' · '); }

  await loadFilmes();
  showToast(summaryParts[0], discovered > 0 || changed > 0 ? 'success' : null);
}

// ── Moderação de comentários ──────────────────────────────────────────────────

function _cmtStatus(c) {
  if (c.aprovado === true)  return 'aprovado';
  if (c.aprovado === false) return 'rejeitado';
  return 'pendente';
}

// Título do filme a partir do url_key do comentário (cai para o próprio url_key).
function _cmtFilme(c) {
  var key = c.filme_url_key || c.url_key || '';
  if (!key) return '—';
  var f = _filmes.find(function (x) { return x.url_key === key; });
  return f ? f.titulo : key;
}

async function loadComentarios() {
  var tbody = document.getElementById('comentarios-tbody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state"><p>Carregando...</p></div></td></tr>';
  try {
    var rows = await supabaseGet('comentarios', 'order=created_at.desc&limit=500');
    _comentarios = Array.isArray(rows) ? rows : [];
  } catch (err) {
    if (tbody) tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state"><p style="color:#dc2626;">Erro ao carregar: ' + escHtml(err.message) + '</p></div></td></tr>';
    return;
  }
  renderComentarios();
}

function setCmtSort() {
  _cmtSortDir = _cmtSortDir === 'asc' ? 'desc' : 'asc';
  var arr = document.getElementById('arr-cmt-data');
  if (arr) arr.textContent = _cmtSortDir === 'asc' ? '↑' : '↓';
  renderComentarios();
}

function renderComentarios() {
  var tbody = document.getElementById('comentarios-tbody');
  if (!tbody) return;
  var q      = ((document.getElementById('cmt-search') || {}).value || '').toLowerCase();
  var status = (document.getElementById('cmt-status-filter') || {}).value || 'todos';

  var list = _comentarios.filter(function (c) {
    if (status !== 'todos' && _cmtStatus(c) !== status) return false;
    if (!q) return true;
    return (c.autor || '').toLowerCase().includes(q) ||
           (c.texto || '').toLowerCase().includes(q) ||
           _cmtFilme(c).toLowerCase().includes(q);
  }).sort(function (a, b) {
    var va = a.created_at || '', vb = b.created_at || '';
    return _cmtSortDir === 'desc' ? (va > vb ? -1 : 1) : (va < vb ? -1 : 1);
  });

  var countEl = document.getElementById('cmt-count');
  if (countEl) countEl.textContent = '(' + list.length + ')';

  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state"><p>' +
      (_comentarios.length ? 'Nenhum comentário com esses filtros.' : 'Nenhum comentário cadastrado.') +
      '</p></div></td></tr>';
    return;
  }

  var tag = {
    aprovado:  '<span class="cmt-status cmt-aprovado">Aprovado</span>',
    rejeitado: '<span class="cmt-status cmt-rejeitado">Rejeitado</span>',
    pendente:  '<span class="cmt-status cmt-pendente">Pendente</span>',
  };

  tbody.innerHTML = list.map(function (c) {
    var st   = _cmtStatus(c);
    var data = c.created_at ? new Date(c.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
    var id   = escHtml(c.id);
    return '<tr id="cmt-' + id + '">' +
        '<td>' + escHtml(c.autor || 'Anônimo') + (c.email ? '<div class="td-urlkey">' + escHtml(c.email) + '</div>' : '') + '</td>' +
        '<td style="font-size:13px;">' + escHtml(_cmtFilme(c)) + '</td>' +
        '<td class="cmt-text">' + escHtml(c.texto || '') + '</td>' +
        '<td>' + (tag[st] || '') + '</td>' +
        '<td style="font-size:12px;color:var(--ink3);white-space:nowrap;">' + data + '</td>' +
        '<td>' +
          '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
            (st !== 'aprovado' ? '<button class="btn" style="font-size:11px;padding:4px 10px;background:#dcfce7;color:#166534;border:1px solid #86efac;" onclick="aprovarComentario(\'' + id + '\')">✓ Aprovar</button>' : '') +
            (st !== 'rejeitado' ? '<button class="btn" style="font-size:11px;padding:4px 10px;background:#fef9c3;color:#854d0e;border:1px solid #fde68a;" onclick="rejeitarComentario(\'' + id + '\')">Rejeitar</button>' : '') +
            '<button class="btn btn-delete" style="font-size:11px;padding:4px 10px;" onclick="excluirComentario(\'' + id + '\')">Excluir</button>' +
          '</div>' +
        '</td>' +
      '</tr>';
  }).join('');
}

function _setCmtAprovado(id, value, msg) {
  return supabasePatch('comentarios', 'id=eq.' + encodeURIComponent(id), { aprovado: value })
    .then(function () {
      var c = _comentarios.find(function (x) { return String(x.id) === String(id); });
      if (c) c.aprovado = value;
      renderComentarios();
      showToast(msg, 'success');
    })
    .catch(function (err) { showToast('Erro: ' + err.message, 'error'); });
}

async function aprovarComentario(id) { await _setCmtAprovado(id, true,  'Comentário aprovado.'); }
async function rejeitarComentario(id) { await _setCmtAprovado(id, false, 'Comentário rejeitado.'); }

async function excluirComentario(id) {
  if (!confirm('Excluir este comentário? Esta ação é irreversível.')) return;
  try {
    await supabaseDelete('comentarios', 'id=eq.' + encodeURIComponent(id));
    _comentarios = _comentarios.filter(function (x) { return String(x.id) !== String(id); });
    renderComentarios();
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
