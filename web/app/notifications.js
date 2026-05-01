// notifications.js — toasts editoriais discretos.
// Sem dependência externa. Pega o container já no body via id.

const TIPOS = { ok: '', erro: 'toast--erro', info: 'toast--info' };

export function mostrarToast(mensagem, tipo = 'ok', duracao = 4000) {
  const container = document.querySelector('#toast-container');
  if (!container) return;

  const t = document.createElement('div');
  t.className = `toast ${TIPOS[tipo] ?? ''}`;
  t.setAttribute('role', tipo === 'erro' ? 'alert' : 'status');
  t.textContent = mensagem;

  container.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transition = 'opacity 200ms';
    setTimeout(() => t.remove(), 220);
  }, duracao);
}
