// ── FOOTER COMPONENT ─────────────────────────────────────────────────────────
// Injeta o footer no elemento #footer-mount.

function renderFooter() {
  var mount = document.getElementById('footer-mount');
  if (!mount) return;

  var year = new Date().getFullYear();

  mount.innerHTML =
    '<footer role="contentinfo">' +
      '<div class="footer-inner">' +
        '<div class="footer-info">' +
          '<nav aria-label="Links do rodapé">' +
            '<a href="index.html">Início</a>' +
            '<a href="catalogo.html">Catálogo</a>' +
            '<a href="aplicativos.html">Aplicativos</a>' +
            '<a href="faq.html">FAQ</a>' +
          '</nav>' +
          '<p><strong>Acesso na Tela</strong> — Cinema e streaming acessíveis para todos.<br>' +
          '&copy; ' + year + '</p>' +
        '</div>' +
        '<div class="footer-cadastro">' +
          '<p class="footer-cad-title">Fique por dentro</p>' +
          '<form name="cadastro-footer" class="footer-cad-form" method="POST" data-netlify="true" netlify-honeypot="bot-field" onsubmit="footerFormSubmit(event)">' +
            '<input type="hidden" name="form-name" value="cadastro-footer">' +
            '<input type="hidden" name="bot-field">' +
            '<label for="fcad-email" class="sr-only">E-mail</label>' +
            '<input type="email" id="fcad-email" name="email" class="fcad-input" placeholder="Seu e-mail" required autocomplete="email">' +
            '<label for="fcad-cel" class="sr-only">Celular</label>' +
            '<input type="tel" id="fcad-cel" name="celular" class="fcad-input" placeholder="Seu celular" autocomplete="tel">' +
            '<button type="submit" class="fcad-btn">Cadastrar</button>' +
            '<p class="fcad-feedback" id="fcad-feedback" aria-live="polite"></p>' +
          '</form>' +
        '</div>' +
      '</div>' +
    '</footer>';
}
