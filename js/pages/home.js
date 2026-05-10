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
 * Inicializa o formulário de newsletter.
 */
function initNewsletter() {
  var form = document.getElementById('newsletter-form') ||
             document.querySelector('.newsletter-form');
  if (!form) return;

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var emailEl = form.querySelector('input[type="email"]');
    var email   = emailEl ? emailEl.value.trim() : '';
    if (!email) return;

    var msg = form.querySelector('.newsletter-msg') ||
              form.querySelector('[role="status"]');

    // Salva localmente e confirma (integração real pode ser adicionada aqui)
    try {
      var subs = JSON.parse(localStorage.getItem('ant_newsletter') || '[]');
      if (!subs.includes(email)) {
        subs.push(email);
        localStorage.setItem('ant_newsletter', JSON.stringify(subs));
      }
    } catch (e) {}

    if (msg) {
      msg.textContent = 'Obrigado! Você receberá novidades sobre filmes acessíveis.';
    }
    if (emailEl) emailEl.value = '';
  });
}

// ── Init ──────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', function () {
  loadCatalog();
  initNewsletter();
});
