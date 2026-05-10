// ── HEADER COMPONENT ─────────────────────────────────────────────────────────
// Injeta o header completo no elemento #header-mount.
// Depende de: js/a11y.js (funções de a11y no HTML inline)

var _NAV_LINKS = [
  { key: 'home',        href: 'index.html',          label: 'Início'       },
  { key: 'catalogo',    href: 'catalogo.html',        label: 'Catálogo'     },
  { key: 'aplicativos', href: 'aplicativos.html',     label: 'Aplicativos'  },
  { key: 'faq',         href: 'faq.html',             label: 'FAQ'          },
];

/**
 * Renderiza e injeta o header no elemento #header-mount.
 * activePage: 'home' | 'catalogo' | 'filme' | 'admin' | 'aplicativos' | 'faq'
 */
function renderHeader(activePage) {
  var mount = document.getElementById('header-mount');
  if (!mount) return;

  var navLinks = _NAV_LINKS.map(function (link) {
    var active = link.key === activePage ? ' aria-current="page"' : '';
    return '<li><a href="' + link.href + '"' + active + '>' + link.label + '</a></li>';
  }).join('');

  mount.innerHTML =
    '<header class="site-header" role="banner">' +
      '<a href="#main-content" class="skip-link">Pular para o conteúdo</a>' +
      '<div class="header-inner">' +
        '<a href="index.html" class="logo" aria-label="Acesso na Tela — Página inicial">' +
          '<span class="logo-icon" aria-hidden="true">&#127916;</span>' +
          '<span class="logo-text">Acesso<strong>naTela</strong></span>' +
        '</a>' +

        '<nav class="main-nav" aria-label="Menu principal">' +
          '<ul role="list">' + navLinks + '</ul>' +
        '</nav>' +

        '<div class="a11y-bar" role="toolbar" aria-label="Ferramentas de acessibilidade">' +
          // Tamanho de fonte
          '<div class="a11y-font-wrap">' +
            '<button class="a11y-btn" onclick="changeFontSize(\'decrease\')" aria-label="Diminuir tamanho da fonte" title="Diminuir fonte">A-</button>' +
            '<button class="a11y-btn" onclick="changeFontSize(\'increase\')" aria-label="Aumentar tamanho da fonte" title="Aumentar fonte">A+</button>' +
          '</div>' +

          // Contraste
          '<div class="a11y-contrast-wrap">' +
            '<button class="a11y-btn a11y-contrast-btn" onclick="toggleContrastMenu(this)" aria-expanded="false" aria-controls="contrast-menu" aria-label="Opções de contraste" title="Contraste">' +
              '<span aria-hidden="true">&#9680;</span>' +
            '</button>' +
            '<div id="contrast-menu" class="contrast-menu" hidden role="menu" aria-label="Modos de contraste">' +
              '<button role="menuitem" onclick="setContrast(\'default\')">Original</button>' +
              '<button role="menuitem" onclick="setContrast(\'high\')">Alto contraste</button>' +
              '<button role="menuitem" onclick="setContrast(\'inverted\')">Invertido</button>' +
              '<button role="menuitem" onclick="setContrast(\'grayscale\')">Escala de cinza</button>' +
            '</div>' +
          '</div>' +

          // VLibras
          '<button class="a11y-btn" onclick="toggleVLibras()" aria-label="Ativar VLibras — tradutor de Libras" title="VLibras">' +
            '<span aria-hidden="true">&#128483;</span>' +
          '</button>' +
        '</div>' +

        // Menu hambúrguer (mobile)
        '<button class="nav-toggle" aria-label="Abrir menu de navegação" aria-expanded="false" aria-controls="mobile-nav" onclick="_toggleMobileNav(this)">' +
          '<span aria-hidden="true">&#9776;</span>' +
        '</button>' +
      '</div>' +

      // Nav mobile
      '<nav id="mobile-nav" class="mobile-nav" hidden aria-label="Menu móvel">' +
        '<ul role="list">' + navLinks + '</ul>' +
      '</nav>' +
    '</header>';
}

function _toggleMobileNav(btn) {
  var nav = document.getElementById('mobile-nav');
  if (!nav) return;
  var isOpen = !nav.hidden;
  nav.hidden = isOpen;
  btn.setAttribute('aria-expanded', String(!isOpen));
}
