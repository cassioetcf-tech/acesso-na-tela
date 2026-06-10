// ── FAQ PAGE ──────────────────────────────────────────────────────────────────
// Accordion do FAQ + carregamento sob demanda do vídeo acessível (YouTube).
// O vídeo só carrega quando a pergunta é aberta (lazy) e só aparece se o item
// tiver um ID de vídeo definido (data-yt). Depende de: nada.

function _loadFaqVideo(answer) {
  if (!answer) return;
  var box = answer.querySelector('.faq-video');
  if (!box) return;
  var yt = (box.getAttribute('data-yt') || '').trim();
  if (!yt) return; // sem vídeo definido → mantém oculto
  var iframe = box.querySelector('iframe');
  if (iframe && !iframe.src) {
    iframe.src = 'https://www.youtube.com/embed/' + yt + '?rel=0';
  }
  box.hidden = false;
}

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
        _loadFaqVideo(answer);
      }
    });
  });
});
