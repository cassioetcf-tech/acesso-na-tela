// ── HOME PAGE ─────────────────────────────────────────────────────────────────
// Lógica específica da página inicial (index.html).
// Depende de: js/api/supabase.js, js/api/tmdb.js, js/components/film-card.js,
//             js/utils.js (escHtml, today)

/**
 * Busca a ordem de exibição da Ingresso.com (via AdoroCinema scraper, cache 1h).
 * Retorna um Map de urlKey → posição (0 = primeiro da lista).
 */
async function _fetchIngressoOrder() {
  var CACHE_KEY = 'ant_ingresso_order';
  var CACHE_TTL = 60 * 60 * 1000; // 1 hora

  try {
    var cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
    if (cached && Date.now() < cached.exp) return cached.map;
  } catch (e) {}

  try {
    var r    = await fetch('/api/ingresso?type=nowplaying');
    var list = await r.json();
    if (!Array.isArray(list)) return {};

    var map = {};
    list.forEach(function (item, i) {
      if (item.urlKey) map[item.urlKey] = i;
    });

    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ map: map, exp: Date.now() + CACHE_TTL }));
    } catch (e) {}

    return map;
  } catch (e) {
    return {};
  }
}

/**
 * Ordena filmes "cartaz" conforme a posição na Ingresso.com.
 * Filmes sem correspondência ficam no final, mantendo ordem original entre si.
 */
function _sortByIngressoOrder(filmes, orderMap) {
  return filmes.slice().sort(function (a, b) {
    var posA = orderMap[a.filme.url_key];
    var posB = orderMap[b.filme.url_key];
    var hasA = posA !== undefined;
    var hasB = posB !== undefined;
    if (hasA && hasB) return posA - posB;
    if (hasA) return -1;
    if (hasB) return 1;
    return 0;
  });
}

/**
 * Busca filmes do Supabase (status=cartaz e status=breve) e renderiza as grades.
 * Os filmes "Em cartaz" seguem a ordem da Ingresso.com.
 */
async function loadCatalog() {
  var gridCartaz = document.getElementById('grid-cartaz') ||
                   document.querySelector('.films-grid[role="list"]');
  if (!gridCartaz) return;

  try {
    var filmes = await supabaseGet(
      'filmes',
      'status=ilike.cartaz&tmdb_id=not.is.null&order=created_at.desc&limit=100'
    );

    if (!Array.isArray(filmes) || filmes.length === 0) return;

    // Busca ordem da Ingresso.com em paralelo com o enriquecimento TMDb
    var enrichedPromise = Promise.all(filmes.map(async function (filme) {
      var tmdb = null;
      try {
        if (filme.tmdb_id) {
          tmdb = await getMovie(filme.tmdb_id);
        } else if (filme.titulo) {
          var results = await searchMovie(filme.titulo);
          if (results[0]) tmdb = results[0];
        }
      } catch (e) {}
      return { filme: filme, tmdb: tmdb };
    }));

    var orderMap = await _fetchIngressoOrder();
    var enriched = await enrichedPromise;

    var cartaz = enriched.filter(function (i) { return (i.filme.status || '').toLowerCase() === 'cartaz'; });

    // Ordenar "Em cartaz" conforme Ingresso.com
    cartaz = _sortByIngressoOrder(cartaz, orderMap);

    // Renderizar "Em cartaz"
    gridCartaz.innerHTML = '';
    cartaz.forEach(function (item) {
      gridCartaz.appendChild(buildCard(item.filme, item.tmdb));
    });
  } catch (err) {
    console.error('Erro ao carregar catálogo da home:', err);
  }
}

/**
 * Filtra os cards visíveis em ambas as grades pelo texto digitado.
 * Anuncia o resultado para leitores de tela via aria-live.
 */
function doSearch(val) {
  var q = (val || '').toLowerCase().trim();
  var liveRegion = document.getElementById('live-region');

  var cards = document.querySelectorAll('#grid-cartaz .film-card-link, .coming-grid .film-card-link');
  var visible = 0;

  cards.forEach(function (card) {
    var text = card.textContent.toLowerCase();
    var show = !q || text.includes(q);
    card.style.display = show ? '' : 'none';
    if (show) visible++;
  });

  if (liveRegion) {
    liveRegion.textContent = q
      ? visible + ' filme' + (visible !== 1 ? 's' : '') +
        ' encontrado' + (visible !== 1 ? 's' : '') + ' para "' + val + '"'
      : '';
  }
}

/**
 * Chamado via onsubmit="submitNewsletter(event)" no index.html.
 * POSTa os dados no Supabase (tabela newsletter_subscribers).
 */
async function submitNewsletter(event) {
  event.preventDefault();
  var form = event.target;

  var nome  = (document.getElementById('nl-nome')  || {}).value || '';
  var email = (document.getElementById('nl-email') || {}).value || '';
  if (!email.trim()) return;

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
    if (wrap)    wrap.style.display    = 'none';
    if (success) success.removeAttribute('hidden');
  } catch (err) {
    console.error('Erro ao cadastrar newsletter:', err);
    if (btn) { btn.disabled = false; btn.textContent = 'Quero receber'; }
    var liveEl = document.getElementById('live-region');
    if (liveEl) liveEl.textContent = 'Erro ao cadastrar. Tente novamente.';
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', function () {
  renderHeader('home');
  renderFooter();
  loadCatalog();
});
