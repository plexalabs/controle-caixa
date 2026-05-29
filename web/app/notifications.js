// notifications.js — toasts v2 "Clean Profissional".
// Cartão escuro com chip de ícone tingido pelo tipo. Sem dependência
// externa; pega o #toast-container já no body.

const A = `viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"`;

const TIPOS = {
  ok:   { cls: '',            icone: `<svg ${A} stroke-width="1.9"><path d="M3.4 8.4 6.5 11.5 12.6 4.6"/></svg>` },
  erro: { cls: 'toast--erro', icone: `<svg ${A} stroke-width="1.9"><path d="M4.6 4.6 11.4 11.4M11.4 4.6 4.6 11.4"/></svg>` },
  info: { cls: 'toast--info', icone: `<svg ${A} stroke-width="1.7"><circle cx="8" cy="8" r="6.3"/><path d="M8 11.2V7.6"/><path d="M8 4.9h.01"/></svg>` },
};

export function mostrarToast(mensagem, tipo = 'ok', duracao = 4000) {
  const container = document.querySelector('#toast-container');
  if (!container) return;
  const conf = TIPOS[tipo] || TIPOS.ok;

  const t = document.createElement('div');
  t.className = `toast ${conf.cls}`.trim();
  t.setAttribute('role', tipo === 'erro' ? 'alert' : 'status');

  const ic = document.createElement('span');
  ic.className = 'toast-icone';
  ic.setAttribute('aria-hidden', 'true');
  ic.innerHTML = conf.icone;

  const msg = document.createElement('span');
  msg.className = 'toast-msg';
  msg.textContent = mensagem;

  t.append(ic, msg);
  container.appendChild(t);

  setTimeout(() => {
    t.classList.add('toast--saindo');
    setTimeout(() => t.remove(), 240);
  }, duracao);
}
