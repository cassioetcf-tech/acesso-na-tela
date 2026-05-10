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

function setContrast(mode) {
  document.body.classList.remove('contrast-high', 'contrast-inverted', 'contrast-grayscale');
  if (mode !== 'default') document.body.classList.add('contrast-' + mode);
  try { localStorage.setItem('ant_contrast', mode); } catch (e) {}
  var menu = document.getElementById('contrast-menu');
  if (menu) menu.hidden = true;
  var btn = document.querySelector('.a11y-contrast-btn');
  if (btn) btn.setAttribute('aria-expanded', 'false');
}

function toggleContrastMenu(btn) {
  var menu = document.getElementById('contrast-menu');
  if (!menu) return;
  var isOpen = !menu.hidden;
  menu.hidden = isOpen;
  btn.setAttribute('aria-expanded', String(!isOpen));
  if (!isOpen) {
    var first = menu.querySelector('button');
    if (first) first.focus();
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
})();
