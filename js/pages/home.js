// ── HOME PAGE ─────────────────────────────────────────────────────────────────
// Depende de: js/api/supabase.js, js/api/tmdb.js, js/components/film-card.js,
//             js/utils.js (escHtml)

// ── Formulários de cadastro (Netlify Forms) ───────────────────────────────────
async function _submitCadastro(formEl, feedbackId) {
  var feedback = document.getElementById(feedbackId);
  var btn      = formEl.querySelector('button[type=submit]');
  var data     = new FormData(formEl);
  var email    = (data.get('email') || '').trim();
  var celular  = (data.get('celular') || '').trim();

  if (!email) {
    if (feedback) feedback.textContent = 'Informe seu e-mail.';
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = 'Enviando…'; }
  if (feedback) feedback.textContent = '';

  var ok = false;
  try {
    // 1. Salva no Supabase (reutiliza newsletter_subscribers — só e-mail)
    await supabasePost(
      'newsletter_subscribers',
      { email: email, subscribed_at: new Date().toISOString() },
      'resolution=ignore-duplicates,return=minimal'
    );
    ok = true;
  } catch (e) { console.warn('Supabase cadastro:', e.message); }

  try {
    // 2. Netlify Forms (backup — garante notificação por e-mail)
    await fetch('/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(data).toString() });
    ok = true;
  } catch (e) { console.warn('Netlify form cadastro:', e.message); }

  if (ok) {
    if (feedback) feedback.textContent = '✓ Cadastrado com sucesso!';
    formEl.reset();
  } else {
    if (feedback) feedback.textContent = 'Erro ao enviar. Tente novamente.';
  }
  if (btn) { btn.disabled = false; btn.textContent = 'Cadastrar'; }
}

function heroFormSubmit(e)   { e.preventDefault(); _submitCadastro(e.target, 'cad-feedback'); }
function footerFormSubmit(e) { e.preventDefault(); _submitCadastro(e.target, 'fcad-feedback'); }

var _allCards = []; // { el, acessivel: bool }

// ── Legenda ───────────────────────────────────────────────────────────────────

function _showLegend() {
  var leg = document.getElementById('legend-a11y');
  if (leg) leg.style.display = '';
}

function _applyFilter() {
  // Sempre mostra só filmes com acessibilidade confirmada
  var visiveis = 0;
  _allCards.forEach(function (item) {
    item.el.style.display = item.acessivel ? '' : 'none';
    if (item.acessivel) visiveis++;
  });
  var empty = document.getElementById('grid-empty');
  if (empty) empty.style.display = (!visiveis && _allCards.length) ? '' : 'none';
}

// ── Ordenação ─────────────────────────────────────────────────────────────────

function _getAppStatus(filme) {
  if (filme.app_status) return filme.app_status;
  // Retrocompatibilidade com registros antigos sem app_status
  if (filme.app) return 'confirmado';
  var a = filme.a11y || {};
  if (a.ad === false && a.lse === false && a.libras === false) return 'sem_acessibilidade';
  return 'pendente';
}

function _statusOrder(filme) {
  var s = _getAppStatus(filme);
  if (s === 'confirmado') return 0;
  if (s === 'pendente')   return 1;
  return 2; // sem_acessibilidade
}

async function _fetchIngressoOrder() {
  var CACHE_KEY = 'ant_ingresso_order';
  var CACHE_TTL = 60 * 60 * 1000;
  try {
    var cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
    if (cached && Date.now() < cached.exp) return cached.map;
  } catch (e) {}
  try {
    var r    = await fetch('/api/ingresso?type=nowplaying');
    var list = await r.json();
    if (!Array.isArray(list)) return {};
    var map = {};
    list.forEach(function (item, i) { if (item.urlKey) map[item.urlKey] = i; });
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ map: map, exp: Date.now() + CACHE_TTL })); } catch (e) {}
    return map;
  } catch (e) { return {}; }
}

// ── Carregamento ──────────────────────────────────────────────────────────────

async function loadCatalog() {
  var grid = document.getElementById('grid-cartaz');
  if (!grid) return;

  try {
    // Busca apenas filmes em cartaz com acessibilidade confirmada
    var filmes = await supabaseGet(
      'filmes',
      'status=ilike.cartaz&app_status=eq.confirmado&order=created_at.desc&limit=200'
    );

    if (!Array.isArray(filmes) || filmes.length === 0) {
      grid.innerHTML = '<p style="color:var(--ink3);font-size:14px;padding:24px 0;">Nenhum filme em cartaz no momento.</p>';
      return;
    }

    // Enriquece com TMDb em paralelo
    var enriched = await Promise.all(filmes.map(async function (filme) {
      var tmdb = null;
      try {
        if (filme.tmdb_data) {
          tmdb = filme.tmdb_data; // já temos os dados cacheados no Supabase
        } else if (filme.tmdb_id) {
          tmdb = await getMovie(filme.tmdb_id);
        }
        // Não faz nova busca TMDb aqui — o sync-status cuida disso
      } catch (e) {}
      return { filme: filme, tmdb: tmdb };
    }));

    // Ordena: acessíveis primeiro, depois pendentes, depois sem acessibilidade
    // Dentro de cada grupo: data de lançamento mais recente primeiro
    enriched.sort(function (a, b) {
      var oa = _statusOrder(a.filme);
      var ob = _statusOrder(b.filme);
      if (oa !== ob) return oa - ob;
      // Mesmo grupo: data de lançamento (tmdb release_date), mais recente primeiro
      var da = (a.tmdb && a.tmdb.release_date) || (a.filme.tmdb_data && a.filme.tmdb_data.release_date) || '';
      var db = (b.tmdb && b.tmdb.release_date) || (b.filme.tmdb_data && b.filme.tmdb_data.release_date) || '';
      if (da && db) return da > db ? -1 : da < db ? 1 : 0;
      if (da) return -1; // filmes com data vêm antes dos sem data
      if (db) return 1;
      return 0;
    });

    // Renderiza
    grid.innerHTML = '';
    _allCards = [];

    enriched.forEach(function (item) {
      var el        = buildCard(item.filme, item.tmdb);
      var acessivel = _getAppStatus(item.filme) === 'confirmado';
      _allCards.push({ el: el, acessivel: acessivel });
      grid.appendChild(el);
    });

    // Empty state placeholder
    var emptyEl = document.createElement('p');
    emptyEl.id = 'grid-empty';
    emptyEl.style.cssText = 'display:none;color:var(--ink3);font-size:14px;padding:24px 0;grid-column:1/-1;';
    emptyEl.textContent = 'Nenhum filme com acessibilidade confirmada no momento.';
    grid.appendChild(emptyEl);

    _showLegend();
    _applyFilter();

  } catch (err) {
    console.error('Erro ao carregar catálogo:', err);
  }
}

// ── Busca ─────────────────────────────────────────────────────────────────────

function doSearch(val) {
  var q          = (val || '').toLowerCase().trim();
  var liveRegion = document.getElementById('live-region');
  var visible    = 0;

  _allCards.forEach(function (item) {
    var text = item.el.textContent.toLowerCase();
    // Só exibe filmes acessíveis que correspondem à busca
    var show = item.acessivel && (!q || text.includes(q));
    item.el.style.display = show ? '' : 'none';
    if (show) visible++;
  });

  if (liveRegion) {
    liveRegion.textContent = q
      ? visible + ' filme' + (visible !== 1 ? 's' : '') + ' encontrado' + (visible !== 1 ? 's' : '') + ' para "' + val + '"'
      : '';
  }
}

// ── Newsletter ────────────────────────────────────────────────────────────────

function _nlError(inputId, msg) {
  var input = document.getElementById(inputId);
  if (!input) return;
  var errId = inputId + '-error';
  var existing = document.getElementById(errId);
  if (!existing) {
    existing = document.createElement('span');
    existing.id        = errId;
    existing.className = 'nl-field-error';
    existing.setAttribute('role', 'alert');
    input.parentNode.insertBefore(existing, input.nextSibling);
  }
  existing.textContent = msg;
  input.setAttribute('aria-describedby', errId);
  input.setAttribute('aria-invalid', 'true');
  input.focus();
}

function _nlClearErrors(form) {
  form.querySelectorAll('.nl-field-error').forEach(function (el) { el.remove(); });
  form.querySelectorAll('[aria-invalid]').forEach(function (el) {
    el.removeAttribute('aria-invalid');
    el.removeAttribute('aria-describedby');
  });
}

async function submitNewsletter(event) {
  event.preventDefault();
  var form  = event.target;
  var nome  = (document.getElementById('nl-nome')  || {}).value || '';
  var email = (document.getElementById('nl-email') || {}).value || '';

  _nlClearErrors(form);

  if (!email.trim()) {
    _nlError('nl-email', 'Informe seu e-mail para continuar.');
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    _nlError('nl-email', 'Digite um e-mail válido.');
    return;
  }

  var prefs = Array.from(form.querySelectorAll('input[name="pref"]:checked'))
                   .map(function (el) { return el.value; });

  var btn = form.querySelector('button[type="submit"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }

  try {
    await supabasePost(
      'newsletter_subscribers',
      { nome: nome.trim(), email: email.trim(), prefs: prefs, subscribed_at: new Date().toISOString() },
      'resolution=ignore-duplicates,return=minimal'
    );
    var wrap    = document.getElementById('nl-form-wrap');
    var success = document.getElementById('nl-success');
    if (wrap)    wrap.style.display = 'none';
    if (success) {
      success.removeAttribute('hidden');
      success.setAttribute('tabindex', '-1');
      success.focus();
    }
  } catch (err) {
    console.error('Erro newsletter:', err);
    if (btn) { btn.disabled = false; btn.textContent = 'Quero receber'; }
    var liveRegion = document.getElementById('live-region');
    if (liveRegion) liveRegion.textContent = 'Erro ao cadastrar. Tente novamente.';
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', function () {
  renderHeader('home');
  renderFooter();
  loadCatalog();
});
