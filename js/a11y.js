// ── ACESSIBILIDADE ────────────────────────────────────────────────────────────
// Funções compartilhadas por todas as páginas.
// Depende de: nada (standalone)

var fontLevel = 0; // 0 = normal, 1 = font-lg, 2 = font-xl

function changeFontSize(dir) {
  if (dir === 'increase' && fontLevel < 2) fontLevel++;
  if (dir === 'decrease' && fontLevel > 0) fontLevel--;
  document.body.classList.remove('font-lg', 'font-xl');
  if (fontLevel === 1) document.body.classList.add('font-lg');
  if (fontLevel === 2) document.body.classList.add('font-xl');
  try { localStorage.setItem('ant_font', fontLevel); } catch (e) {}
}

// Modo de contraste atualmente ativo, lido das classes do body.
function _currentContrast() {
  if (document.body.classList.contains('contrast-high'))      return 'high';
  if (document.body.classList.contains('contrast-inverted'))  return 'inverted';
  if (document.body.classList.contains('contrast-grayscale')) return 'grayscale';
  return 'default';
}

// Marca o ✓ / aria-checked no item do modo ativo e atualiza o rótulo do botão.
function _syncContrastUI(mode) {
  var menu = document.getElementById('contrast-menu');
  if (menu) {
    Array.prototype.forEach.call(menu.querySelectorAll('[role="menuitemradio"]'), function (b) {
      var on = b.getAttribute('data-contrast') === mode;
      b.setAttribute('aria-checked', on ? 'true' : 'false');
      b.classList.toggle('cm-active', on);
    });
  }
  // Indica no botão quando há um modo ativo (diferente do normal).
  var btn = document.querySelector('.a11y-contrast-btn');
  if (btn) btn.classList.toggle('has-mode', mode !== 'default');
}

function setContrast(mode) {
  document.body.classList.remove('contrast-high', 'contrast-inverted', 'contrast-grayscale');
  if (mode !== 'default') document.body.classList.add('contrast-' + mode);
  try { localStorage.setItem('ant_contrast', mode); } catch (e) {}
  _syncContrastUI(mode);
  var menu = document.getElementById('contrast-menu');
  if (menu) menu.hidden = true;
  var btn = document.querySelector('.a11y-contrast-btn');
  if (btn) { btn.setAttribute('aria-expanded', 'false'); btn.focus(); }
}

function toggleContrastMenu(btn) {
  var menu = document.getElementById('contrast-menu');
  if (!menu) return;
  var isOpen = !menu.hidden;
  menu.hidden = isOpen;
  btn.setAttribute('aria-expanded', String(!isOpen));
  if (!isOpen) {
    var current = _currentContrast();
    _syncContrastUI(current);
    // Foca o modo ativo (ou o "Normal", se nenhum modo estiver ligado).
    var active = menu.querySelector('[role="menuitemradio"][aria-checked="true"]') ||
                 menu.querySelector('[role="menuitemradio"]');
    if (active) active.focus();
  }
}

function _closeContrastMenu() {
  var menu = document.getElementById('contrast-menu');
  if (menu) menu.hidden = true;
  var cbtn = document.querySelector('.a11y-contrast-btn');
  if (cbtn) {
    cbtn.setAttribute('aria-expanded', 'false');
    cbtn.focus();
  }
}

function toggleVLibras() {
  var btn = document.querySelector('[vw-access-button]');
  if (btn) btn.click();
}

// Fechar menu de contraste ao clicar fora
document.addEventListener('click', function (e) {
  if (!e.target.closest('.a11y-contrast-wrap')) {
    var menu = document.getElementById('contrast-menu');
    if (menu) menu.hidden = true;
    var cbtn = document.querySelector('.a11y-contrast-btn');
    if (cbtn) cbtn.setAttribute('aria-expanded', 'false');
  }
});

// Navegação por teclado no menu de contraste (setas + Escape + Home/End)
document.addEventListener('keydown', function (e) {
  var menu = document.getElementById('contrast-menu');
  if (!menu || menu.hidden) return;
  if (!menu.contains(document.activeElement) && document.activeElement !== document.querySelector('.a11y-contrast-btn')) return;

  var items = Array.from(menu.querySelectorAll('[role="menuitemradio"]'));
  if (!items.length) return;
  var idx = items.indexOf(document.activeElement);

  if (e.key === 'Escape') {
    e.preventDefault();
    _closeContrastMenu();
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    items[(idx + 1) % items.length].focus();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    items[(idx - 1 + items.length) % items.length].focus();
  } else if (e.key === 'Home') {
    e.preventDefault();
    items[0].focus();
  } else if (e.key === 'End') {
    e.preventDefault();
    items[items.length - 1].focus();
  } else if (e.key === 'Tab') {
    // Fechar ao sair do menu
    _closeContrastMenu();
  }
});

// Restaurar preferências salvas
(function restaurarPrefs() {
  try {
    var f = parseInt(localStorage.getItem('ant_font') || '0', 10);
    fontLevel = isNaN(f) ? 0 : f;
    document.body.classList.remove('font-lg', 'font-xl');
    if (fontLevel === 1) document.body.classList.add('font-lg');
    if (fontLevel === 2) document.body.classList.add('font-xl');

    var c = localStorage.getItem('ant_contrast');
    if (c && c !== 'default') {
      document.body.classList.add('contrast-' + c);
    }
  } catch (e) {}
  // Reflete o modo ativo no menu/botão assim que o header estiver no DOM.
  document.addEventListener('DOMContentLoaded', function () {
    if (typeof _syncContrastUI === 'function') _syncContrastUI(_currentContrast());
  });
})();
