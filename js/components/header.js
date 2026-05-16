// ── HEADER COMPONENT ─────────────────────────────────────────────────────────
// Injeta a barra de acessibilidade + header no elemento #header-mount.
// Depende de: js/a11y.js (changeFontSize, setContrast, toggleContrastMenu, toggleVLibras)

var _NAV_LINKS = [
  { key: 'home',        href: 'index.html',       label: 'Filmes'      },
  { key: 'cinemas',     href: 'cinemas.html',     label: 'Cinemas'     },
  { key: 'aplicativos', href: 'aplicativos.html', label: 'Aplicativos' },
  { key: 'faq',         href: 'faq.html',         label: 'FAQ'         },
];

function renderHeader(activePage) {
  var mount = document.getElementById('header-mount');
  if (!mount) return;

  var navLinks = _NAV_LINKS.map(function (l) {
    var cls = l.key === activePage ? ' class="active"' : '';
    var cur = l.key === activePage ? ' aria-current="page"' : '';
    return '<a href="' + l.href + '"' + cls + cur + '>' + l.label + '</a>';
  }).join('');

  mount.innerHTML =
    // ── Barra de acessibilidade (fundo escuro) ──
    '<div class="a11y-bar" role="toolbar" aria-label="Ferramentas de acessibilidade">' +
      '<div class="a11y-skip-links">' +
        '<a class="a11y-skip-btn" href="#main-content">Ir para o conteúdo</a>' +
        '<a class="a11y-skip-btn" href="#header-nav">Ir para o menu</a>' +
      '</div>' +
      '<div class="a11y-controls">' +
        '<span class="a11y-label">Tamanho do texto:</span>' +
        '<button class="a11y-btn" onclick="changeFontSize(\'increase\')" aria-label="Aumentar tamanho da fonte">A+</button>' +
        '<button class="a11y-btn" onclick="changeFontSize(\'decrease\')" aria-label="Diminuir tamanho da fonte">A-</button>' +
        '<div class="a11y-contrast-wrap">' +
          '<button class="a11y-contrast-btn" onclick="toggleContrastMenu(this)" ' +
            'aria-expanded="false" aria-controls="contrast-menu" aria-label="Opções de contraste">' +
            '&#9680; Contraste' +
          '</button>' +
          '<div id="contrast-menu" class="a11y-contrast-menu" hidden role="menu" aria-label="Modos de contraste">' +
            '<button role="menuitem" onclick="setContrast(\'default\')">Original</button>' +
            '<button role="menuitem" onclick="setContrast(\'high\')">Alto contraste</button>' +
            '<button role="menuitem" onclick="setContrast(\'inverted\')">Invertido</button>' +
            '<button role="menuitem" onclick="setContrast(\'grayscale\')">Escala de cinza</button>' +
          '</div>' +
        '</div>' +
        '<a class="a11y-decl-link" href="acessibilidade.html" aria-label="Declaração de acessibilidade">&#9679; Acessibilidade</a>' +
      '</div>' +
    '</div>' +

    // ── Header principal (fundo branco) ──
    '<header role="banner">' +
      '<a href="index.html" class="logo" aria-label="Acesso na Tela — Página inicial">' +
        '<img src="/assets/logo.png" alt="Acesso na Tela">' +
      '</a>' +
      '<nav id="header-nav" aria-label="Menu principal">' + navLinks + '</nav>' +
    '</header>';
}
