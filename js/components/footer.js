// ── FOOTER COMPONENT ─────────────────────────────────────────────────────────
// Injeta o footer no elemento #footer-mount.

function renderFooter() {
  var mount = document.getElementById('footer-mount');
  if (!mount) return;

  var year = new Date().getFullYear();

  mount.innerHTML =
    '<footer role="contentinfo">' +
      '<nav aria-label="Links do rodapé">' +
        '<a href="index.html">Filmes</a>' +
        '<a href="aplicativos.html">Aplicativos</a>' +
        '<a href="faq.html">FAQ</a>' +
        '<a href="sobre.html">Sobre</a>' +
        '<a href="contato.html">Contato</a>' +
      '</nav>' +
      '<p><strong>Acesso na Tela</strong> — Cinema acessível para todos.<br>' +
      '&copy; ' + year + '</p>' +
    '</footer>';
}
