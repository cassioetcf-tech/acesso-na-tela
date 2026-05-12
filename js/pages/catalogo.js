// ── CATÁLOGO PAGE ─────────────────────────────────────────────────────────────
// Lógica da página catalogo.html.
// Depende de: js/api/supabase.js, js/api/tmdb.js, js/utils.js (escHtml)

var _catalogoFilmes     = [];
var _plataformaAtiva    = 'todas';
var _buscaAtiva         = '';

/**
 * Carrega filmes com status=CATALOGO do Supabase, enriquece com TMDb e
 * providers, e renderiza o grid inicial.
 */
async function carregarCatalogo() {
  try {
    var resp = await supabaseGet(
      'filmes',
      'status=ilike.catalogo&app_status=eq.confirmado&tmdb_id=not.is.null&order=created_at.desc'
    );

    if (!resp || resp.length === 0) {
      renderVazio('Nenhum filme no catálogo ainda.', 'Em breve novos títulos com acessibilidade chegarão aqui.');
      return;
    }

    _catalogoFilmes = await Promise.all(resp.map(_enriquecerFilme));
    construirChips(_catalogoFilmes);
    renderGrid(_catalogoFilmes);
  } catch (err) {
    console.error('Erro ao carregar catálogo:', err);
    renderVazio('Não foi possível carregar o catálogo.', 'Verifique sua conexão e tente novamente.');
  }
}

/**
 * Enriquece um registro do Supabase com dados TMDb e lista de providers.
 */
async function _enriquecerFilme(filme) {
  try {
    var tmdbId   = filme.tmdb_id;
    var tmdbData = filme.tmdb_data || null;

    if (!tmdbId && filme.titulo) {
      var results = await searchMovie(filme.titulo);
      if (results[0]) tmdbId = results[0].id;
    }

    if (tmdbId && !(tmdbData && tmdbData.genres)) {
      tmdbData = await tmdbGet('/movie/' + tmdbId, { language: 'pt-BR' });
    }

    var providers = [];
    if (tmdbId) {
      var br = await getWatchProviders(tmdbId);
      if (br) {
        var all  = (br.flatrate || []).concat(br.free || []).concat(br.ads || []);
        var seen = {};
        providers = all.filter(function (p) {
          if (seen[p.provider_id]) return false;
          seen[p.provider_id] = true;
          return true;
        });
      }
    }

    return { sb: filme, tmdb: tmdbData, providers: providers };
  } catch (e) {
    return { sb: filme, tmdb: null, providers: [] };
  }
}

/**
 * Constrói o select de plataformas a partir dos providers disponíveis.
 */
function construirChips(filmes) {
  var mapa = {};
  filmes.forEach(function (f) {
    (f.providers || []).forEach(function (p) {
      if (!mapa[p.provider_id]) {
        mapa[p.provider_id] = { id: p.provider_id, nome: p.provider_name };
      }
    });
  });

  var sel = document.getElementById('plat-select');
  if (!sel) return;

  while (sel.options.length > 1) sel.remove(1);

  var plats = Object.values(mapa).sort(function (a, b) {
    return a.nome.localeCompare(b.nome, 'pt-BR');
  });

  plats.forEach(function (plat) {
    var opt = document.createElement('option');
    opt.value       = plat.id;
    opt.textContent = plat.nome;
    sel.appendChild(opt);
  });
}

/**
 * Filtra a lista global e redesenha o grid.
 */
function renderGrid(filmes, filtro) {
  var lista = filtro !== undefined ? filtro : _filtrarFilmes(filmes || _catalogoFilmes);
  var grid  = document.getElementById('filmes-grid');
  var count = document.getElementById('resultado-count');

  if (!grid) return;

  grid.innerHTML = '';

  if (lista.length === 0) {
    renderVazio('Nenhum filme encontrado.', 'Tente outro filtro ou termo de busca.');
    if (count) count.textContent = '';
    return;
  }

  if (count) {
    count.textContent = lista.length + ' filme' + (lista.length > 1 ? 's' : '');
  }

  lista.forEach(function (f) { grid.appendChild(_criarCard(f)); });
}

function _filtrarFilmes(filmes) {
  return (filmes || _catalogoFilmes).filter(function (f) {
    if (_plataformaAtiva !== 'todas') {
      if (!(f.providers || []).some(function (p) {
        return String(p.provider_id) === String(_plataformaAtiva);
      })) return false;
    }
    if (_buscaAtiva) {
      var titulo  = (f.sb.titulo || '').toLowerCase();
      var generos = (f.tmdb && f.tmdb.genres)
        ? f.tmdb.genres.map(function (g) { return g.name.toLowerCase(); }).join(' ')
        : '';
      var sinopse = (f.tmdb && f.tmdb.overview) ? f.tmdb.overview.toLowerCase() : '';
      if (!titulo.includes(_buscaAtiva) && !generos.includes(_buscaAtiva) && !sinopse.includes(_buscaAtiva)) {
        return false;
      }
    }
    return true;
  });
}

function _criarCard(f) {
  var sb        = f.sb;
  var tmdb      = f.tmdb;
  var providers = f.providers || [];
  var titulo    = (tmdb && tmdb.title) ? tmdb.title : sb.titulo || 'Filme';
  var ano       = (tmdb && tmdb.release_date) ? tmdb.release_date.slice(0, 4) : '';
  var poster    = (tmdb && tmdb.poster_path) ? CONFIG.TMDB_IMG + tmdb.poster_path : null;
  var generos   = (tmdb && tmdb.genres) ? tmdb.genres.map(function (g) { return g.name; }).join(', ') : '';
  var href      = sb.url_key ? 'catalogo-filme.html?urlKey=' + sb.url_key : '#';

  var link = document.createElement('a');
  link.href = href;
  link.className = 'film-card-link';
  link.setAttribute('aria-label',
    titulo + (ano ? ', ' + ano : '') + '. Acessível com audiodescrição, legenda para surdos e Libras.');

  var card = document.createElement('div');
  card.className = 'film-card';

  // Pôster
  var posterDiv = document.createElement('div');
  posterDiv.className = 'film-poster';
  if (poster) {
    var img = document.createElement('img');
    img.src = poster; img.alt = 'Pôster do filme ' + titulo; img.loading = 'lazy';
    posterDiv.appendChild(img);
  } else {
    var ph = document.createElement('div');
    ph.className = 'poster-placeholder'; ph.setAttribute('aria-hidden', 'true'); ph.textContent = '🎬';
    posterDiv.appendChild(ph);
  }

  var badgesDiv = document.createElement('div');
  badgesDiv.className = 'poster-badges';
  badgesDiv.innerHTML =
    '<span class="pbadge pb-ad" aria-label="Audiodescrição">AD</span>' +
    '<span class="pbadge pb-lse" aria-label="Legenda para surdos">LSE</span>' +
    '<span class="pbadge pb-lib" aria-label="Libras">LIBRAS</span>';
  posterDiv.appendChild(badgesDiv);

  card.appendChild(posterDiv);

  // Corpo
  var body = document.createElement('div');
  body.className = 'film-body';

  var h2 = document.createElement('h2');
  h2.className = 'film-name'; h2.textContent = titulo;
  body.appendChild(h2);

  var meta = document.createElement('div');
  meta.className = 'film-meta';
  var parts = [];
  if (ano) parts.push(ano);
  if (generos) parts.push(generos.split(',')[0]);
  if (providers.length > 0) {
    var provStr = providers.slice(0, 2).map(function (p) { return p.provider_name; }).join(', ');
    if (providers.length > 2) provStr += ' +' + (providers.length - 2);
    parts.push(provStr);
  }
  meta.textContent = parts.join(' · ');
  body.appendChild(meta);

  card.appendChild(body);
  link.appendChild(card);
  return link;
}

function renderVazio(titulo, desc) {
  var grid = document.getElementById('filmes-grid');
  if (!grid) return;
  grid.innerHTML =
    '<div class="empty-state" role="status"><h2>' + escHtml(titulo) + '</h2><p>' + escHtml(desc) + '</p></div>';
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
  renderHeader('catalogo');
  renderFooter();
  carregarCatalogo();

  var busca = document.getElementById('busca-catalogo');
  if (busca) {
    busca.addEventListener('input', function () {
      _buscaAtiva = this.value.toLowerCase().trim();
      renderGrid(_catalogoFilmes, _filtrarFilmes());
    });
  }

  var sel = document.getElementById('plat-select');
  if (sel) {
    sel.addEventListener('change', function () {
      _plataformaAtiva = this.value;
      renderGrid(_catalogoFilmes, _filtrarFilmes());
    });
  }
});
