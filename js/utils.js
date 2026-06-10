function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

// Normaliza celular brasileiro para E.164 (+55DDDNÚMERO). Retorna '' se vazio.
function normalizePhoneBR(raw) {
  var d = String(raw || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.slice(0, 2) === '55' && (d.length === 12 || d.length === 13)) return '+' + d;
  if (d.length === 10 || d.length === 11) return '+55' + d;
  return '+55' + d;
}

function debounce(fn, ms) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}
