// ── HOME PAGE ─────────────────────────────────────────────────────────────────
// Depende de: js/api/supabase.js, js/api/tmdb.js, js/components/film-card.js,
//             js/utils.js (escHtml)

// ── Cadastro de usuário (newsletter + hero) ──────────────────────────────────
// Grava via RPC upsert_subscriber (merge: acumula nome/celular, normaliza, não
// expõe a tabela). Se a RPC ainda não existir, faz fallback para insert direto.
async function _saveSubscriber(data) {
  var params = {
    p_email:           (data.email || '').trim().toLowerCase(),
    p_nome:            data.nome || null,
    p_celular:         data.celular ? normalizePhoneBR(data.celular) : null,
    p_prefs:           data.prefs || null,
    p_aceita_email:    (typeof data.aceita_email === 'boolean') ? data.aceita_email : null,
    p_aceita_whatsapp: (typeof data.aceita_whatsapp === 'boolean') ? data.aceita_whatsapp : null,
    p_origem:          data.origem || null,
  };
  try {
    await supabaseRpc('upsert_subscriber', params);
    return true;
  } catch (e) {
    console.warn('upsert_subscriber indisponível, fallback insert:', e.message);
    var row = { email: params.p_email };
    if (data.nome)        row.nome    = data.nome;
    if (params.p_celular) row.celular = params.p_celular;
    if (data.prefs)       row.prefs   = data.prefs;
    try {
      await supabasePost('newsletter', row, 'resolution=ignore-duplicates,return=minimal');
      return true;
    } catch (e2) { console.warn('Fallback insert falhou:', e2.message); return false; }
  }
}

// ── Formulário hero "Fique por dentro" ───────────────────────────────────────
async function heroFormSubmit(e) {
  e.preventDefault();
  var formEl   = e.target;
  var feedback = document.getElementById('cad-feedback');
  var btn      = formEl.querySelector('button[type=submit]');
  var data     = new FormData(formEl);
  var nome     = (data.get('nome') || '').trim();
  var email    = (data.get('email') || '').trim();

  if (!email) {
    _cadMsg(feedback, 'Informe seu e-mail.', true);
    formEl.querySelector('[name=email]').focus();
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = 'Enviando…'; }
  if (feedback) { feedback.textContent = ''; feedback.className = 'cad-feedback'; }

  var saved = false;

  // 1. Supabase (cadastro de usuário via RPC, com merge). Só e-mail por enquanto.
  try {
    saved = await _saveSubscriber({
      nome: nome, email: email,
      aceita_email: true, origem: 'hero',
    });
  } catch (e) { console.warn('Supabase hero form:', e.message); }

  // 2. Netlify Forms (gera notificação de e-mail no dashboard)
  try {
    var r = await fetch('/', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams(data).toString(),
    });
    if (r.ok) saved = true;
  } catch (e) { console.warn('Netlify hero form:', e.message); }

  if (saved) {
    _cadMsg(feedback, '✓ Cadastrado com sucesso!', false);
    formEl.reset();
  } else {
    _cadMsg(feedback, 'Erro ao enviar. Tente novamente.', true);
  }
  if (btn) { btn.disabled = false; btn.textContent = 'Cadastrar'; }
}

function _cadMsg(el, msg, isError) {
  if (!el) return;
  el.textContent = msg;
  el.className   = 'cad-feedback ' + (isError ? 'cad-err' : 'cad-ok');
}

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

// ── Semana atual (seg → dom) ──────────────────────────────────────────────────

// Retorna o domingo (23h59) da semana corrente
function _thisWeekSunday() {
  var now = new Date();
  var day = now.getDay(); // 0=Dom, 1=Seg … 6=Sáb
  var daysUntilSunday = day === 0 ? 0 : 7 - day;
  var sun = new Date(now);
  sun.setDate(now.getDate() + daysUntilSunday);
  sun.setHours(23, 59, 59, 0);
  return sun;
}

// Data de estreia do filme (Ingresso). premiereDate é ISO completo (localDate).
function _releaseStr(item) {
  return (item.filme && item.filme.ingresso_data && item.filme.ingresso_data.premiereDate) || '';
}

// Retorna true se o filme já estreou (estreia até o domingo desta semana).
// Filmes que estreiam em semanas futuras (ex.: pré-venda) ficam de fora.
function _isThisWeek(item) {
  var dt = _releaseStr(item);
  if (!dt) return true; // sem data → exibe (não sabemos quando estreia)
  var d = new Date(dt);
  if (isNaN(d)) return true;
  return d <= _thisWeekSunday();
}

// Formata intervalo "Seg 12/05 – Dom 18/05" para exibir na página
function _weekRangeLabel() {
  var now  = new Date();
  var day  = now.getDay();
  var mon  = new Date(now); mon.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
  var sun  = new Date(mon); sun.setDate(mon.getDate() + 6); // baseado no mon (rola o mês certo)
  var fmt  = function (d) {
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  };
  return fmt(mon) + ' a ' + fmt(sun);
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

    // Cards usam ingresso_data (cacheado pelo sync).
    var enriched = filmes.map(function (filme) { return { filme: filme, tmdb: null }; });

    // Só filmes que JÁ estrearam (estreia até o domingo desta semana), usando a
    // data de estreia do Ingresso (ingresso_data.premiereDate). Isso exclui
    // pré-vendas de semanas futuras (ex.: Toy Story 5, estreia 17/06). Filmes sem
    // data de estreia continuam aparecendo (fallback em _isThisWeek).
    enriched = enriched.filter(_isThisWeek);

    // Ordena: acessíveis primeiro, depois pendentes, depois sem acessibilidade
    // Dentro de cada grupo: data de lançamento mais recente primeiro
    enriched.sort(function (a, b) {
      var oa = _statusOrder(a.filme);
      var ob = _statusOrder(b.filme);
      if (oa !== ob) return oa - ob;
      var da = _releaseStr(a);
      var db = _releaseStr(b);
      if (da && db) return da > db ? -1 : da < db ? 1 : 0;
      if (da) return -1;
      if (db) return 1;
      return 0;
    });

    // Atualiza o título da seção com o intervalo da semana
    var secTitle = document.getElementById('h-cartaz');
    if (secTitle) {
      secTitle.innerHTML = 'Em cartaz com acessibilidade <span class="sec-week">' + _weekRangeLabel() + '</span>';
    }

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

  var btn = form.querySelector('button[type="submit"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }

  try {
    var ok = await _saveSubscriber({
      nome: nome.trim(), email: email.trim(),
      aceita_email: true, origem: 'newsletter',
    });
    if (!ok) throw new Error('falha ao salvar');
    var wrap    = document.getElementById('nl-form-wrap');
    var success = document.getElementById('nl-success');
    if (wrap)    wrap.style.display = 'none';
    if (success) {
      success.hidden = false;
      success.classList.add('show');   // .newsletter-success fica display:none sem .show
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
