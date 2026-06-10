// ── FAQ PAGE ──────────────────────────────────────────────────────────────────
// Os blocos ficam SEMPRE abertos (perguntas como <h2>) — mais acessível para
// leitores de tela, que navegam direto pelos cabeçalhos. Os vídeos do YouTube
// usam loading="lazy" nativo (o navegador adia os que estão fora da tela).
// Depende de: header.js, footer.js.

document.addEventListener('DOMContentLoaded', function () {
  renderHeader('faq');
  renderFooter();
});
