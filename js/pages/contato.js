// ── CONTATO PAGE ─────────────────────────────────────────────────────────────
// Envia o formulário de contato para a função Netlify /contato (Resend).
// Depende de: nada (vanilla).

async function submitContato(ev) {
  ev.preventDefault();

  var form = document.getElementById('contato-form');
  var fb   = document.getElementById('contato-feedback');
  var btn  = document.getElementById('contato-btn');

  var nome     = (document.getElementById('c-nome')     || {}).value || '';
  var email    = (document.getElementById('c-email')    || {}).value || '';
  var celular  = (document.getElementById('c-celular')  || {}).value || '';
  var mensagem = (document.getElementById('c-mensagem') || {}).value || '';
  var botField = (document.getElementById('c-bot')      || {}).value || '';

  nome = nome.trim(); email = email.trim(); celular = celular.trim(); mensagem = mensagem.trim();

  function setFeedback(cls, msg) {
    if (!fb) return;
    fb.className = 'contato-feedback ' + cls;
    fb.textContent = msg;
  }

  if (!nome)                                       { setFeedback('err', 'Por favor, informe seu nome.');       (document.getElementById('c-nome') || {}).focus && document.getElementById('c-nome').focus(); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))   { setFeedback('err', 'Por favor, informe um e-mail válido.'); document.getElementById('c-email').focus(); return; }
  if (!mensagem)                                   { setFeedback('err', 'Por favor, escreva sua mensagem.');    document.getElementById('c-mensagem').focus(); return; }

  btn.disabled = true;
  btn.textContent = 'Enviando...';
  setFeedback('', '');

  try {
    var r = await fetch('/.netlify/functions/contato', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: nome, email: email, celular: celular, mensagem: mensagem, bot_field: botField }),
    });
    var data = {};
    try { data = await r.json(); } catch (e) {}

    if (r.ok && data.ok) {
      // Troca o formulário pela mensagem de sucesso
      var wrap    = document.getElementById('contato-form-wrap');
      var success = document.getElementById('contato-success');
      if (wrap)    wrap.hidden = true;
      if (success) { success.hidden = false; success.focus && success.focus(); }
    } else {
      setFeedback('err', (data && data.error) || 'Não foi possível enviar agora. Tente novamente em instantes.');
      btn.disabled = false;
      btn.textContent = 'Enviar mensagem';
    }
  } catch (e) {
    setFeedback('err', 'Erro de conexão. Verifique sua internet e tente novamente.');
    btn.disabled = false;
    btn.textContent = 'Enviar mensagem';
  }
}
