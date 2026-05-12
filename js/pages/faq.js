// ── FAQ PAGE ──────────────────────────────────────────────────────────────────
// Accordion do FAQ.
// Depende de: nada

document.addEventListener('DOMContentLoaded', function () {
  renderHeader('faq');
  renderFooter();
  document.querySelectorAll('.faq-question').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var expanded = btn.getAttribute('aria-expanded') === 'true';
      var answerId = btn.getAttribute('aria-controls');
      var answer   = answerId ? document.getElementById(answerId) : null;

      // Fecha todos
      document.querySelectorAll('.faq-question').forEach(function (b) {
        b.setAttribute('aria-expanded', 'false');
      });
      document.querySelectorAll('.faq-answer').forEach(function (a) {
        a.hidden = true;
      });

      // Abre o clicado (se estava fechado)
      if (!expanded && answer) {
        btn.setAttribute('aria-expanded', 'true');
        answer.hidden = false;
      }
    });
  });
});
