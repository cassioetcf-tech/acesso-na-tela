// ── HOME PAGE ─────────────────────────────────────────────────────────────────
// Lógica específica da página inicial (index.html).
// Depende de: js/api/supabase.js, js/api/tmdb.js, js/components/film-card.js,
//             js/utils.js (escHtml, today)

/**
 * Busca filmes do Supabase (status=cartaz e status=breve) e renderiza as grades.
 */
async function loadCatalog() {
  var gridCartaz = document.getElementById('grid-cartaz') ||
                   document.querySelector('.films-grid[role="list"]');
  if (!gridCartaz) return;

  try {
    var filmes = await supabaseGet(
      'filmes',
      'or=(status.ilike.cartaz,status.ilike.breve)&order=created_at.desc&limit=100'
    );

    if (!Array.isArray(filmes) || filmes.length === 0) return;

    // Enriquecer com TMDb em paralelo
    var enriched = await Promise.all(filmes.map(async function (filme) {
      var tmdb = null;
      try {
        if (filme.tmdb_id) {
          tmdb = await getMovie(filme.tmdb_id);
        } else if (filme.titulo) {
          var results = await searchMovie(filme.titulo);
          if (results[0]) tmdb = results[0];
        }
      } catch (e) { /* ignora falhas individuais do TMDb */ }
      return { filme: filme, tmdb: tmdb };
    }));

    var cartaz = enriched.filter(function (i) { return (i.filme.status || '').toLowerCase() === 'cartaz'; });
    var breve  = enriched.filter(function (i) { return (i.filme.status || '').toLowerCase() === 'breve'; });

    // Renderizar "Em cartaz"
    gridCartaz.innerHTML = '';
    cartaz.forEach(function (item) {
      gridCartaz.appendChild(buildCard(item.filme, item.tmdb));
    });

    // Renderizar "Em breve"
    var gridBreve = document.querySelector('.coming-grid[aria-labelledby="h-breve"]') ||
                    document.querySelector('.coming-grid');
    if (gridBreve && breve.length) {
      gridBreve.innerHTML = '';
      breve.forEach(function (item) {
        gridBreve.appendChild(buildBreveCard(item.filme, item.tmdb));
      });
    }
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
