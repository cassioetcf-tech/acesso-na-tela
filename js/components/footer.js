// ── FOOTER COMPONENT ─────────────────────────────────────────────────────────
// Injeta o footer no elemento #footer-mount.
// Depende de: nada

function renderFooter() {
  var mount = document.getElementById('footer-mount');
  if (!mount) return;

  var year = new Date().getFullYear();

  mount.innerHTML =
    '<footer class="site-footer" role="contentinfo">' +
      '<div class="footer-inner">' +
        '<div class="footer-brand">' +
          '<a href="index.html" class="logo footer-logo" aria-label="Acesso na Tela — Página inicial">' +
            '<span class="logo-icon" aria-hidden="true">&#127916;</span>' +
            '<span class="logo-text">Acesso<strong>naTela</strong></span>' +
          '</a>' +
          '<p class="footer-tagline">Cinema e streaming acessíveis para todos.</p>' +
        '</div>' +

        '<nav class="footer-nav" aria-label="Links do rodapé">' +
          '<ul role="list">' +
            '<li><a href="index.html">Início</a></li>' +
            '<li><a href="catalogo.html">Catálogo</a></li>' +
            '<li><a href="aplicativos.html">Aplicativos</a></li>' +
            '<li><a href="faq.html">FAQ</a></li>' +
            '<li><a href="admin.html">Admin</a></li>' +
          '</ul>' +
        '</nav>' +

        '<div class="footer-a11y">' +
          '<p>Recursos de acessibilidade:</p>' +
          '<ul role="list">' +
            '<li><abbr title="Audiodescrição">AD</abbr> — Audiodescrição</li>' +
            '<li><abbr title="Legenda para surdos e ensurdecidos">LSE</abbr> — Legenda para surdos</li>' +
            '<li>LIBRAS — Língua de sinais brasileira</li>' +
          '</ul>' +
        '</div>' +
      '</div>' +

      '<div class="footer-bottom">' +
        '<p>&copy; ' + year + ' Acesso na Tela. Feito com acessibilidade em mente.</p>' +
      '</div>' +
    '</footer>';
}
