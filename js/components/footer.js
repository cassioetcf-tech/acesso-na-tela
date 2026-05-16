// ── FOOTER COMPONENT ─────────────────────────────────────────────────────────
// Injeta o footer no elemento #footer-mount.

function renderFooter() {
  var mount = document.getElementById('footer-mount');
  if (!mount) return;

  var year = new Date().getFullYear();

  mount.innerHTML =
    '<footer role="contentinfo">' +
      '<nav aria-label="Links do rodapé">' +
        '<a href="index.html">Início</a>' +
        '<a href="catalogo.html">Catálogo</a>' +
        '<a href="aplicativos.html">Aplicativos</a>' +
        '<a href="faq.html">FAQ</a>' +
        '<a href="acessibilidade.html">Acessibilidade</a>' +
      '</nav>' +
      '<p><strong>Acesso na Tela</strong> — Cinema e streaming acessíveis para todos.<br>' +
      '&copy; ' + year + '</p>' +
    '</footer>';
}
