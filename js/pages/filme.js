// ── PÁGINA DE DETALHE DO FILME ────────────────────────────────────────────────
// Lógica da página filme.html
// Depende de: js/api/supabase.js, js/api/tmdb.js, js/api/ingresso.js,
//             js/utils.js (escHtml, today)

// ── Mapeamento de plataformas de streaming ────────────────────────────────────
var STREAMING_PLATFORMS = {
  8:   { n: 'Netflix',     i: 'N', c: '#E50914' },
  9:   { n: 'Prime Video', i: '▶', c: '#00A8E0' },
  337: { n: 'Disney+',     i: '+', c: '#113CCF' },
  619: { n: 'Star+',       i: 'S', c: '#1B2E4B' },
  307: { n: 'Globoplay',   i: 'G', c: '#E3000F' },
  384: { n: 'Max',         i: 'M', c: '#002BE7' },
  531: { n: 'Paramount+',  i: 'P', c: '#0064FF' },
  2:   { n: 'Apple TV+',   i: 'A', c: '#1c1c1e' },
};

var _trailerKey = null;
var _loadingDismissed = false;

// ── Helpers internos ──────────────────────────────────────────────────────────
function _set(id, val) {
  var el = document.getElementById(id);
  if (el) el.textContent = val;
}

function _dismissLoading() {
  if (_loadingDismissed) return;
  _loadingDismissed = true;
  document.body.classList.remove('film-loading');
  var sk1 = document.getElementById('sk-film-hero');
  var sk2 = document.getElementById('sk-film-body');
  if (sk1) { sk1.classList.remove('active'); sk1.style.display = 'none'; }
  if (sk2) { sk2.classList.remove('active'); sk2.style.display = 'none'; }
}

// Safety timeout — exibe conteúdo mesmo se a API falhar silenciosamente
setTimeout(_dismissLoading, 5000);

// ── Renderização de dados TMDb ────────────────────────────────────────────────
function _renderTmdb(d, wp) {
  var title = d.title || d.original_title || '';
  document.title = title + ' — Acesso na Tela';
  _set('fp-h1',   title);
  _set('bc-film', title);

  // Linha de origem
  var year = (d.release_date || '').slice(0, 4);
  var orig = d.original_title !== d.title ? d.original_title + ' · ' : '';
  var co   = (d.production_companies || [])[0];
  _set('fp-orig',
    orig + year +
    (d.production_countries && d.production_countries[0] ? ' · ' + d.production_countries[0].name : '') +
    (co ? ' · ' + co.name : '')
  );

  // Pôster
  if (d.poster_path) {
    var pb = document.getElementById('fp-poster-box');
    if (pb) {
      pb.style.backgroundImage    = 'url(' + CONFIG.TMDB_IMG + d.poster_path + ')';
      pb.style.backgroundSize     = 'cover';
      pb.style.backgroundPosition = 'center top';
    }
  }

  // Classificação indicativa
  var cert = 'L';
  ((d.release_dates || {}).results || []).forEach(function (r) {
    if (r.iso_3166_1 === 'BR') {
      r.release_dates.forEach(function (x) { if (x.certification) cert = x.certification; });
    }
  });
  var certLabel = (cert === 'L' || cert === '0' || cert === '') ? 'Livre' : cert + ' anos';

  // Pills de metadados
  var genre   = (d.genres || [])[0];
  var runtime = d.runtime ? Math.floor(d.runtime / 60) + 'h ' + (d.runtime % 60) + 'min' : '';
  var dateStr = d.release_date
    ? new Date(d.release_date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
    : '';
  var pills = document.querySelector('.meta-pills');
  if (pills) {
    pills.innerHTML = '';
    [genre ? genre.name : null, runtime, dateStr].forEach(function (t) {
      if (!t) return;
      var s = document.createElement('span'); s.className = 'mpill'; s.textContent = t;
      pills.appendChild(s);
    });
    var r = document.createElement('span'); r.className = 'mpill mpill-r'; r.textContent = certLabel;
    pills.appendChild(r);
  }

  // Sinopse
  _set('fp-sinopse1', d.overview || 'Sinopse não disponível em português.');
  _set('fp-sinopse2',
    certLabel === 'Livre'
      ? 'Adequada para toda a família. Sem cenas de violência ou conteúdo sensível.'
      : 'Classificação indicativa: ' + certLabel + '. Verifique o conteúdo antes de levar crianças.'
  );

  // Ficha técnica
  var dir = '';
  ((d.credits || {}).crew || []).forEach(function (c) { if (c.job === 'Director') dir = c.name; });
  var fichaEl = document.getElementById('fp-ficha');
  var filmeStatus = window._filmeStatus || 'cartaz';
  if (fichaEl) {
    var rows = [
      ['Direção',       dir || '—'],
      ['Produção',      co ? co.name : '—'],
      ['Gênero',        genre ? genre.name : '—'],
      ['Duração',       runtime || '—'],
      ['Classificação', certLabel],
      ['Lançamento',    dateStr || '—'],
      ['Status',
        filmeStatus === 'breve'   ? '<span class="verde">Em breve</span>' :
        filmeStatus === 'catalogo' ? 'Catálogo' :
                                    '<span class="verde">Em cartaz</span>'],
    ];
    fichaEl.innerHTML = rows.map(function (row) {
      return '<div class="info-row"><span class="ir-l">' + row[0] + '</span>' +
             '<span class="ir-v">' + row[1] + '</span></div>';
    }).join('');
  }

  // Streaming
  var sgEl = document.getElementById('fp-streaming');
  if (sgEl && wp) {
    var seen = {};
    var html = '';
    ['flatrate', 'rent', 'buy'].forEach(function (type) {
      (wp[type] || []).forEach(function (p) {
        if (seen[p.provider_id]) return;
        seen[p.provider_id] = true;
        var info = STREAMING_PLATFORMS[p.provider_id];
        var name = info ? info.n : p.provider_name;
        var ico  = info ? info.i : p.provider_name.charAt(0);
        var bg   = info ? info.c : '#888';
        var lbl  = type === 'flatrate' ? 'Assinatura' : type === 'rent' ? 'Aluguel' : 'Compra';
        html += '<div class="str-card" role="listitem">' +
                  '<div class="str-ico" style="background:' + bg + ';color:#fff;font-weight:700;">' + ico + '</div>' +
                  '<div class="str-name">' + escHtml(name) + '</div>' +
                  '<div class="str-ok">' + lbl + '</div>' +
                '</div>';
      });
    });
    sgEl.innerHTML = html ||
      '<p style="font-size:13px;color:var(--ink3);grid-column:1/-1;">Não disponível no streaming no Brasil ainda.</p>';
  }

  // Trailer thumbnail
  var vids = ((d.videos || {}).results || []);
  var tr   = vids.find(function (v) { return v.type === 'Trailer' && v.site === 'YouTube'; });
  if (!tr) tr = vids.find(function (v) { return v.site === 'YouTube'; });
  if (tr) {
    var img = document.getElementById('trailer-img');
    if (img) { img.src = 'https://img.youtube.com/vi/' + tr.key + '/hqdefault.jpg'; img.alt = 'Trailer de ' + title; }
    var trailerThumb = document.getElementById('trailer-thumb');
    if (trailerThumb) trailerThumb.style.display = '';
    _trailerKey = tr.key;
  }

  _dismissLoading();
}

// ── API pública ───────────────────────────────────────────────────────────────

/**
 * Carrega e renderiza a página de um filme a partir do urlKey.
 * Busca dados no Supabase, depois no TMDb via título.
 */
async function loadFilme(urlKey) {
  try {
    // 1. Dados do Supabase (status, app, tmdb_id)
    var rows = await supabaseGet('filmes', 'url_key=eq.' + encodeURIComponent(urlKey) + '&limit=1');
    var f = rows && rows[0];
    if (f) {
      window._filmeStatus = f.status || 'cartaz';
      if (f.app) {
        _set('app-dest-title', f.app);
        _set('ad-sub', 'Aplicativo gratuito · iOS e Android');
        if (typeof updateAppLinks === 'function') updateAppLinks(f.app);
      }

      // 2. TMDb: preferir tmdb_id salvo; fallback = busca por título via Ingresso
      if (f.tmdb_id) {
        var tmdbData = await getMovie(f.tmdb_id);
        var wp = await getWatchProviders(f.tmdb_id);
        _renderTmdb(tmdbData, wp);
        return;
      }
    }

    // 3. Fallback: busca título via Ingresso e depois TMDb por título
    var eventData = await getEventId(urlKey);
    var title = (eventData && (eventData.title || eventData.originalTitle)) || '';
    if (title) {
      var results = await searchMovie(title);
      var best = results[0];
      if (best) {
        var [tmdbFull, wpFull] = await Promise.all([getMovie(best.id), getWatchProviders(best.id)]);
        _renderTmdb(tmdbFull, wpFull);
        return;
      }
    }

    _dismissLoading();
  } catch (err) {
    console.error('Erro ao carregar filme:', err);
    _set('fp-h1', 'Erro ao carregar dados');
    _dismissLoading();
  }
}

/**
 * Ativa o iframe do YouTube para o trailer.
 */
function playTrailer() {
  var key = _trailerKey;
  if (!key) return;
  var thumb  = document.getElementById('trailer-thumb');
  var iframe = document.getElementById('trailer-iframe');
  if (thumb)  thumb.style.display  = 'none';
  if (iframe) {
    iframe.src          = 'https://www.youtube-nocookie.com/embed/' + key + '?autoplay=1&rel=0&modestbranding=1';
    iframe.style.display = 'block';
  }
}

/**
 * Ativa o iframe da sinopse em vídeo.
 */
function playSinopseVideo() {
  var thumb  = document.getElementById('sinopse-thumb');
  var iframe = document.getElementById('sinopse-video-iframe');
  if (!thumb || !iframe) return;
  var src = iframe.getAttribute('data-src');
  if (src) {
    iframe.src          = src + '?autoplay=1&rel=0';
    iframe.style.display = 'block';
    thumb.style.display  = 'none';
  }
}

/**
 * Carrega sessões do Ingresso para um eventId e cidade.
 */
function loadSessoes(eventId, cityId) {
  var wrap = document.querySelector('.sessoes-wrap') || document.querySelector('.cinema-list-wrap');
  if (!wrap) return;

  cityId = cityId || '1';

  // Monta controles de cidade/data se ainda não existirem
  _buildSessoesControls(wrap, eventId, cityId);

  // Carrega sessões para hoje
  _fetchAndRenderSessoes(eventId, cityId, today(), wrap);
}

var _CITIES = [
  { id: '1',  name: 'São Paulo — SP'       },
  { id: '2',  name: 'Rio de Janeiro — RJ'  },
  { id: '3',  name: 'Belo Horizonte — MG'  },
  { id: '4',  name: 'Brasília — DF'        },
  { id: '5',  name: 'Curitiba — PR'        },
  { id: '6',  name: 'Porto Alegre — RS'    },
  { id: '7',  name: 'Salvador — BA'        },
  { id: '8',  name: 'Recife — PE'          },
  { id: '9',  name: 'Fortaleza — CE'       },
  { id: '10', name: 'Manaus — AM'          },
];

var _TYPE_ALIAS = {
  'Dublado': 'DUB', 'Legendado': 'LEG', 'Libras': 'LIBRAS',
  'Audiodescrição': 'AD', 'Laser': 'LASER', 'Vip': 'VIP',
  'Normal': null,
};

var _A11Y_TYPES = ['Audiodescrição', 'Libras', 'Legendado'];

function _buildSessoesControls(wrap, eventId, defaultCity) {
  if (document.getElementById('sess-city')) return;

  var ctrl = document.createElement('div');
  ctrl.className = 'sessoes-ctrl';
  ctrl.innerHTML =
    '<select id="sess-city" aria-label="Selecionar cidade">' +
    _CITIES.map(function (c) {
      return '<option value="' + c.id + '"' + (c.id === defaultCity ? ' selected' : '') + '>' + escHtml(c.name) + '</option>';
    }).join('') +
    '</select>' +
    '<input type="date" id="sess-date" value="' + today() + '" min="' + today() + '" aria-label="Selecionar data">';

  wrap.parentNode.insertBefore(ctrl, wrap);

  function reload() {
    var city = document.getElementById('sess-city').value;
    var date = document.getElementById('sess-date').value || today();
    _fetchAndRenderSessoes(eventId, city, date, wrap);
  }
  document.getElementById('sess-city').addEventListener('change', reload);
  document.getElementById('sess-date').addEventListener('change', reload);
}

async function _fetchAndRenderSessoes(eventId, city, date, container) {
  container.innerHTML = '<p style="font-size:13px;color:var(--ink3);padding:16px 0">Carregando sessões...</p>';

  // Lê flags de acessibilidade do elemento data-a11y da página, se existir
  var a11yFlags = null;
  var pageData = document.querySelector('[data-a11y]');
  if (pageData) {
    try { a11yFlags = JSON.parse(pageData.getAttribute('data-a11y')); } catch (e) {}
  }

  try {
    var data = await getSessoes(eventId, city, date);
    _renderSessoes(data, container, a11yFlags);
  } catch (err) {
    container.innerHTML = '<p class="sessoes-empty">Erro ao carregar sessões.</p>';
    console.warn('Ingresso sessions error:', err);
  }
}

function _renderSessoes(data, container, a11yFlags) {
  var days = Array.isArray(data) ? data : [];
  if (!days.length) {
    container.innerHTML = '<p class="sessoes-empty">Nenhuma sessão encontrada para esta data e cidade.</p>';
    return;
  }

  var html = '';
  days.forEach(function (day) {
    (day.theaters || []).forEach(function (theater) {
      var sessions = [];
      (theater.rooms || []).forEach(function (room) {
        (room.sessions || []).forEach(function (s) {
          sessions.push({
            time:    s.time || s.startTime || '',
            types:   s.type || [],
            siteUrl: s.siteURL || theater.siteURL || '',
          });
        });
      });
      if (!sessions.length) return;

      sessions.sort(function (a, b) { return a.time < b.time ? -1 : 1; });

      var addr = [theater.address, theater.number, theater.neighborhood].filter(Boolean).join(', ');
      html += '<div class="cinema-block">';
      html += '<div class="cinema-name">' + escHtml(theater.name) + '</div>';
      html += '<div class="cinema-end">'  + escHtml(addr)          + '</div>';
      html += '<div class="horarios" role="list">';

      sessions.forEach(function (s) {
        var displayTypes = (s.types || []).filter(function (t) { return _TYPE_ALIAS[t] !== null; });
        var hasA11y      = s.types.some(function (t) { return _A11Y_TYPES.indexOf(t) >= 0; });
        if (a11yFlags && (a11yFlags.ad || a11yFlags.lse || a11yFlags.libras)) hasA11y = true;

        var label  = s.time + (displayTypes.length ? ' ' + displayTypes.join('/') : '');
        var buyUrl = s.siteUrl;

        html += '<div role="listitem">';
        if (buyUrl) html += '<a href="' + escHtml(buyUrl) + '" target="_blank" rel="noopener" aria-label="Comprar ingresso ' + escHtml(label) + '">';
        html += '<button class="hora-btn' + (hasA11y ? ' accessible' : '') + '" aria-label="' + escHtml(label) + '">';
        html += escHtml(s.time);
        if (displayTypes.length) {
          html += '<span class="hora-tipo">' +
                  displayTypes.map(function (t) { return _TYPE_ALIAS[t] || t; }).join(' ') +
                  '</span>';
        }
        html += '</button>';
        if (buyUrl) html += '</a>';
        html += '</div>';
      });

      html += '</div></div>';
    });
  });

  container.innerHTML = html || '<p class="sessoes-empty">Nenhuma sessão encontrada.</p>';
}

// ── Comentários (Supabase) ────────────────────────────────────────────────────

/**
 * Carrega comentários do Supabase para um filme e os renderiza.
 */
async function initComentarios(urlKey) {
  var container = document.getElementById('comentarios-list');
  if (!container) return;

  try {
    var rows = await supabaseGet(
      'comentarios',
      'url_key=eq.' + encodeURIComponent(urlKey) +
      '&or=(aprovado.is.null,aprovado.eq.true)' +
      '&order=created_at.desc&limit=50'
    );
    _renderComentarios(rows || [], container);
  } catch (err) {
    console.warn('Erro ao carregar comentários:', err);
  }
}

function _renderComentarios(rows, container) {
  if (!rows.length) {
    container.innerHTML = '<p style="font-size:13px;color:var(--ink3)">Nenhum comentário ainda. Seja o primeiro!</p>';
    return;
  }
  container.innerHTML = rows.map(function (c) {
    return '<div class="comentario-item">' +
      '<div class="comentario-autor">' + escHtml(c.autor || 'Anônimo') + '</div>' +
      '<div class="comentario-texto">' + escHtml(c.texto || '') + '</div>' +
      '</div>';
  }).join('');
}

/**
 * Chamado via onclick="submitComentario()" no filme.html.
 * Lê urlKey da URL e os campos do formulário no DOM.
 */
async function submitComentario() {
  var urlKey = new URLSearchParams(window.location.search).get('urlKey') || '';
  var autor  = ((document.getElementById('comment-nome')  || {}).value || '').trim();
  var texto  = ((document.getElementById('comment-texto') || {}).value || '').trim();
  if (!texto) return;

  var btn = document.getElementById('btn-comentar');
  if (btn) { btn.disabled = true; btn.textContent = 'Publicando...'; }

  try {
    await supabasePost('comentarios', {
      url_key:    urlKey,
      autor:      autor || 'Anônimo',
      texto:      texto,
      created_at: new Date().toISOString(),
    });
    var nomeEl  = document.getElementById('comment-nome');
    var textoEl = document.getElementById('comment-texto');
    if (nomeEl)  nomeEl.value  = '';
    if (textoEl) textoEl.value = '';
    await initComentarios(urlKey);
  } catch (err) {
    console.error('Erro ao enviar comentário:', err);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Publicar'; }
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────
window.addEventListener('load', function () {
  var params = new URLSearchParams(window.location.search);
  var urlKey = params.get('urlKey') || '';

  // Skeletons
  var sk1 = document.getElementById('sk-film-hero');
  var sk2 = document.getElementById('sk-film-body');
  if (sk1) sk1.classList.add('active');
  if (sk2) sk2.classList.add('active');

  if (!urlKey) {
    _set('fp-h1', 'Filme não encontrado');
    _dismissLoading();
    return;
  }

  loadFilme(urlKey);
  initComentarios(urlKey);
});
