// demo-logo.js — /demo-logo (sandbox de identidade).
// Cinco propostas de símbolo para o Caixa Boti, cada uma mostrada nos
// contextos reais de uso: marca compacta, escala pequena e lockup.
// Nada aqui altera o sistema — é só pra escolher.

const SVG = `viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"`;

// ─── Os 5 símbolos (monocromáticos, herdam currentColor) ─────────────
const MARCAS = {
  caixa: `<svg ${SVG} stroke-width="2.3"><rect x="5" y="11" width="22" height="16" rx="3"/><path d="M5 17.4H27"/><path d="M12.7 22.2h6.6"/><circle cx="16" cy="7.4" r="3.3"/></svg>`,
  be:    `<svg ${SVG} stroke-width="3"><path d="M11 6V26M11 6h6.5a5 5 0 0 1 0 10H11M11 16h7.5a5 5 0 0 1 0 10H11"/></svg>`,
  check: `<svg ${SVG}><circle cx="16" cy="16" r="11.3" stroke-width="2.3"/><path d="M10.5 16.5 14.3 20.3 21.7 11.9" stroke-width="2.9"/></svg>`,
  livro: `<svg ${SVG} stroke-width="2.3"><rect x="7" y="5" width="18" height="22" rx="2.6"/><path d="M12 5V27"/><path d="M15.6 11.5h5.8M15.6 16h5.8M15.6 20.5h3.8"/></svg>`,
  moedas:`<svg ${SVG} stroke-width="2.2"><ellipse cx="16" cy="8" rx="8.7" ry="3.3"/><path d="M7.3 8v15.8a8.7 3.3 0 0 0 17.4 0V8"/><path d="M7.3 13.4a8.7 3.3 0 0 0 17.4 0"/><path d="M7.3 18.6a8.7 3.3 0 0 0 17.4 0"/></svg>`,
};

const OPCOES = [
  {
    n: '01', chave: 'caixa', nome: 'A registradora',
    tag: 'o lugar onde tudo acontece',
    desc: 'A caixa vista de frente, com a moeda caindo dentro. É a leitura mais direta — bate o olho e se entende: isto cuida do caixa. Reconhecível de longe, funciona até miúdo.',
  },
  {
    n: '02', chave: 'be', nome: 'Monograma B',
    tag: 'a letra da marca, encorpada',
    desc: 'A inicial de Boti redesenhada com traço cheio e cantos vivos. Herda o "B" que o sistema já usa hoje na sidebar, agora com mais presença e menos genérico.',
  },
  {
    n: '03', chave: 'check', nome: 'Conferido',
    tag: 'o gesto da auditoria',
    desc: 'Um visto dentro do selo. O sistema existe pra isso: bater, conferir, fechar o dia certinho. O símbolo é o próprio veredito — está auditado, está fechado.',
  },
  {
    n: '04', chave: 'livro', nome: 'Livro-caixa',
    tag: 'o caderno de cada dia',
    desc: 'A página pautada do livro-caixa, lançamento sobre lançamento. Evoca o "caderno de auditoria diária" — o registro paciente, dia após dia, de tudo que passou.',
  },
  {
    n: '05', chave: 'moedas', nome: 'Pilha de moedas',
    tag: 'o dinheiro que se junta',
    desc: 'Três moedas empilhadas — o total que cresce a cada lançamento. Fala de valor, de soma, do que o caixa acumula do abrir ao fechar. O lado financeiro da coisa.',
  },
];

export function renderDemoLogo() {
  document.querySelector('#app').innerHTML = `
    <main class="dlg">
      <header class="dlg-header">
        <p class="dlg-eyebrow">Identidade · sandbox</p>
        <h1 class="dlg-title">A marca do Caixa&nbsp;Boti</h1>
        <p class="dlg-sub">
          Cinco direções para o símbolo do sistema — cada uma conta um
          pedaço do que ele faz: auditar o caixa, todo dia. Veja cada
          proposta nos contextos reais de uso e me diga o número da
          escolhida.
        </p>
      </header>

      <div class="dlg-lista">
        ${OPCOES.map(cardOpcao).join('')}
      </div>

      <footer class="dlg-foot">
        <span>Sandbox de identidade — não altera nada no sistema.</span>
        <a href="/login" data-link class="dlg-foot-link">← voltar</a>
      </footer>
    </main>
  `;
}

function cardOpcao(o, i) {
  const m = MARCAS[o.chave];
  return `
    <article class="dlg-card" style="animation-delay:${i * 80}ms">
      <header class="dlg-card-head">
        <span class="dlg-num">${o.n}</span>
        <div class="dlg-card-id">
          <h2 class="dlg-name">${o.nome}</h2>
          <p class="dlg-tag">${o.tag}</p>
        </div>
      </header>

      <div class="dlg-stage">
        <div class="dlg-hero" aria-hidden="true">${m}</div>
        <div class="dlg-chips">
          <div class="dlg-chip dlg-chip--verde">
            <span class="dlg-chip-mark">${m}</span>
            <span class="dlg-chip-cap">marca</span>
          </div>
          <div class="dlg-chip dlg-chip--ink">
            <span class="dlg-chip-mark">${m}</span>
            <span class="dlg-chip-cap">escuro</span>
          </div>
          <div class="dlg-chip dlg-chip--claro">
            <span class="dlg-chip-mark">${m}</span>
            <span class="dlg-chip-cap">claro</span>
          </div>
        </div>
      </div>

      <div class="dlg-aplica">
        <div class="dlg-lockup">
          <span class="dlg-lockup-mark" aria-hidden="true">${m}</span>
          <span class="dlg-lockup-txt">
            <span class="dlg-lockup-nome">Caixa Boti</span>
            <span class="dlg-lockup-tag">Auditoria diária</span>
          </span>
        </div>
        <div class="dlg-escala" title="O símbolo em tamanho pequeno">
          <span class="dlg-escala-m" style="--s:27px">${m}</span>
          <span class="dlg-escala-m" style="--s:19px">${m}</span>
          <span class="dlg-escala-m" style="--s:13px">${m}</span>
        </div>
      </div>

      <p class="dlg-desc">${o.desc}</p>
    </article>
  `;
}
