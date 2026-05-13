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

        '<div class="footer-cad">' +
          '<p class="footer-cad-title">Fique por dentro</p>' +
          '<form id="footer-cad-form" name="cadastro-footer" method="POST" data-netlify="true" novalidate>' +
            '<input type="hidden" name="form-name" value="cadastro-footer">' +
            '<div class="footer-cad-form">' +
              '<input type="email" name="email" id="fcad-email" class="fcad-input" placeholder="Seu e-mail" autocomplete="email" required>' +
              '<input type="tel" name="celular" id="fcad-cel" class="fcad-input" placeholder="Celular (opcional)" autocomplete="tel">' +
              '<button type="submit" class="fcad-btn">Cadastrar</button>' +
            '</div>' +
            '<p id="fcad-feedback" class="fcad-feedback" aria-live="polite"></p>' +
          '</form>' +
        '</div>' +

      '</div>' +
    '</footer>';

  // Vincula o handler do formulário após injetar o HTML
  var form = document.getElementById('footer-cad-form');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      _submitFooterForm(form);
    });
  }
}

// ── Handler do formulário do rodapé ──────────────────────────────────────────

async function _submitFooterForm(formEl) {
  var feedback = document.getElementById('fcad-feedback');
  var btn      = formEl.querySelector('button[type=submit]');
  var data     = new FormData(formEl);
  var email    = (data.get('email') || '').trim();

  if (!email) {
    _fcadMsg(feedback, 'Informe seu e-mail.', true);
    var inp = document.getElementById('fcad-email');
    if (inp) inp.focus();
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = 'Enviando…'; }
  if (feedback) { feedback.textContent = ''; feedback.className = 'fcad-feedback'; }

  var saved = false;

  // 1. Salva no Supabase
  try {
    if (typeof supabasePost === 'function') {
      await supabasePost(
        'newsletter_subscribers',
        { email: email, subscribed_at: new Date().toISOString() },
        'resolution=ignore-duplicates,return=minimal'
      );
      saved = true;
    }
  } catch (e) { console.warn('Supabase footer form:', e.message); }

  // 2. Netlify Forms (gera notificação de e-mail)
  try {
    var r = await fetch('/', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams(data).toString(),
    });
    if (r.ok) saved = true;
  } catch (e) { console.warn('Netlify footer form:', e.message); }

  if (saved) {
    _fcadMsg(feedback, '✓ Cadastrado! Obrigado.', false);
    formEl.reset();
  } else {
    _fcadMsg(feedback, 'Erro ao cadastrar. Tente novamente.', true);
  }

  if (btn) { btn.disabled = false; btn.textContent = 'Cadastrar'; }
}

function _fcadMsg(el, msg, isError) {
  if (!el) return;
  el.textContent = msg;
  el.className   = 'fcad-feedback ' + (isError ? 'fcad-err' : 'fcad-ok');
}
