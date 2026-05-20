// demo-modal.js — Sandbox /demo-modal: Versão C FINAL do modal de
// lançamento (aprovada com ajustes). Split 1/3 (resumo + linha do
// tempo / anotações com filtro animado) + 2/3 (detalhes + adicionar
// anotação / formulário de edição). Estático, dados fake.
//
// Ajustes finais do operador:
//  - 'Adicionar anotação' fica na direita, abaixo de Detalhes.
//  - Botão editar usa o ícone-lápis padrão.
//  - Filtro Tudo|Linha do tempo|Anotações com indicador deslizante.

const SVG = `viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"`;

export async function renderDemoModal() {
  document.querySelector('#app').innerHTML = `
    <div class="dm-root">
      <header class="dm-topo">
        <div>
          <p class="dm-eyebrow">Sandbox · versão final</p>
          <h1 class="dm-titulo">Modal de lançamento — Versão C final</h1>
          <p class="dm-sub">
            Anotar abaixo de Detalhes · botão editar com ícone-lápis padrão ·
            filtro Tudo / Linha do tempo / Anotações com indicador deslizante.
          </p>
        </div>
      </header>

      <div class="dm-palco" id="dm-palco">${versaoFinal()}</div>

      <p class="dm-legenda">
        Versão final pra aprovação. Esquerda 1/3: card-resumo + lista unificada
        (linha do tempo + anotações) com filtro deslizante. Direita 2/3:
        barra com label e botão editar (lápis); leitura mostra detalhes do
        pagamento + bloco de adicionar anotação logo abaixo; clicar no lápis
        troca tudo pelo formulário de edição.
      </p>
    </div>
  `;
  ligarMockup();
}

const MOCK = {
  nf: '33.774', cliente: 'Margarida Sabino', valor: 'R$ 1.249,90',
  pedido: '#48201', estado: 'Categorizado',
};

const EVENTOS = `
  <li class="dmm-tl-item" data-tone="criacao">
    <span class="dmm-tl-dot"></span>
    <div>
      <div class="dmm-tl-head"><span class="dmm-tl-tipo">Criação</span><time>há 3 h</time></div>
      <p class="dmm-tl-corpo"><strong>NF 33.774</strong> registrada — R$ 1.249,90 para <strong>Margarida Sabino</strong></p>
      <p class="dmm-tl-autor">por joao.botucatu</p>
    </div>
  </li>
  <li class="dmm-tl-item" data-tone="edicao">
    <span class="dmm-tl-dot"></span>
    <div>
      <div class="dmm-tl-head"><span class="dmm-tl-tipo">Edição</span><time>há 40 min</time></div>
      <p class="dmm-tl-corpo">Valor corrigido de R$ 1.200,00 para R$ 1.249,90.</p>
      <p class="dmm-tl-autor">por joao.botucatu</p>
    </div>
  </li>
`;

const ANOTACOES = `
  <li class="dmm-anot-item">
    <p class="dmm-anot-corpo">Cliente avisada por WhatsApp. Aguardando confirmação do comprovante.</p>
    <p class="dmm-anot-autor">ana.silva · há 2 h</p>
  </li>
  <li class="dmm-anot-item">
    <p class="dmm-anot-corpo">Comprovante conferido no físico, tudo certo.</p>
    <p class="dmm-anot-autor">joao.botucatu · há 1 h</p>
  </li>
`;

function versaoFinal() {
  return `
    <div class="dmm dmm--c" data-modo="leitura" data-filtro="tudo">
      <header class="dmm-cabec">
        <div>
          <p class="dmm-cabec-eyebrow">Nota fiscal · ${MOCK.nf}</p>
          <h2 class="dmm-cabec-titulo">${MOCK.cliente}</h2>
        </div>
        <div class="dmm-cabec-dir">
          <span class="dmm-badge">${MOCK.estado}</span>
          <button class="dmm-x" aria-label="Fechar"><svg ${SVG}><path d="M4 4l8 8M12 4l-8 8"/></svg></button>
        </div>
      </header>

      <div class="dmm-corpo">
        <aside class="dmm-esq">
          <div class="dmm-resumo-card">
            <span class="dmm-resumo-cat" data-cat="pix">Pix</span>
            <span class="dmm-resumo-valor">${MOCK.valor}</span>
            <span class="dmm-resumo-pedido">Pedido ${MOCK.pedido}</span>
          </div>

          <div class="dmm-sec">
            <div class="dmm-filtro-mini" role="group" aria-label="Filtrar histórico">
              <span class="dmm-filtro-ind" aria-hidden="true"></span>
              <button class="dmm-fmini" data-f="tudo" aria-selected="true">Tudo</button>
              <button class="dmm-fmini" data-f="tempo" aria-selected="false">Linha do tempo</button>
              <button class="dmm-fmini" data-f="anot" aria-selected="false">Anotações</button>
            </div>

            <div data-grupo="tempo">
              <p class="dmm-sec-sub">Linha do tempo</p>
              <ul class="dmm-tl-lista">${EVENTOS}</ul>
            </div>
            <div data-grupo="anot">
              <p class="dmm-sec-sub">Anotações</p>
              <ul class="dmm-anot-lista">${ANOTACOES}</ul>
            </div>
          </div>
        </aside>

        <section class="dmm-dir">
          <div class="dmm-dir-barra">
            <span class="dmm-dir-label" data-leitura>Detalhes do pagamento</span>
            <span class="dmm-dir-label" data-edicao hidden>Editar lançamento</span>
            <button class="dmm-editar-btn" data-acao="toggle-edit" aria-label="Editar lançamento">
              <svg ${SVG}><path d="M11.6 2.4a1.4 1.4 0 0 1 2 2L5.5 12.5 2.5 13.5l1-3 8.1-8.1Z"/><path d="M10.5 3.5l2 2"/></svg>
              <span>Editar</span>
            </button>
          </div>

          <div data-leitura>
            <div class="dmm-leitura-detalhes">
              <dl class="dmm-dl">
                <dt>cliente</dt><dd>${MOCK.cliente}</dd>
                <dt>código do pedido</dt><dd>${MOCK.pedido}</dd>
                <dt>valor da NF</dt><dd>${MOCK.valor}</dd>
                <dt>id comprovante</dt><dd>E1820250513...</dd>
                <dt>chave recebedora</dt><dd>contato@boti.com.br</dd>
                <dt>data/hora do Pix</dt><dd>13/05/2026 09:14</dd>
                <dt>remetente</dt><dd>Margarida S.</dd>
              </dl>
            </div>

            <div class="dmm-anot-add">
              <p class="dmm-anot-add-titulo">Adicionar anotação</p>
              <textarea rows="2" placeholder="Escrever uma anotação sobre este lançamento…"></textarea>
              <button class="dmm-btn dmm-btn--primary dmm-btn--sm">Anotar</button>
            </div>
          </div>

          <div data-edicao hidden>
            <div class="dmm-form">
              <div class="dmm-form-grid">
                <label class="dmm-field"><span>Número da NF</span><input value="33.774" /></label>
                <label class="dmm-field"><span>Código do pedido</span><input value="48201" /></label>
              </div>
              <label class="dmm-field"><span>Cliente</span><input value="Margarida Sabino" /></label>

              <div class="dmm-form-sep"></div>

              <!-- Valor ocupa a mesma linha de Categoria -->
              <div class="dmm-form-grid">
                <label class="dmm-field"><span>Categoria</span>
                  <select id="dmm-cat-sel"><option>Pix</option><option>Cartão</option><option>Dinheiro</option></select>
                </label>
                <label class="dmm-field"><span>Valor (R$)</span><input value="1249.90" /></label>
              </div>

              <!-- Motivo vem ANTES dos campos da categoria. Os campos
                   especificos so desbloqueiam quando o motivo tem 10+ chars. -->
              <label class="dmm-field dmm-field--motivo">
                <span>Motivo da edição <em class="dmm-req">*</em></span>
                <textarea id="dmm-motivo" rows="2" placeholder="Explique a edição — mínimo 10 caracteres"></textarea>
              </label>

              <div class="dmm-cat-campos" id="dmm-cat-campos" data-bloqueado="true">
                <div class="dmm-cat-aviso">
                  <svg ${SVG}><path d="M8 5.5v3M8 11h.01M8 1.5 1 14h14L8 1.5Z"/></svg>
                  Preencha o motivo da edição acima para liberar os detalhes da categoria.
                </div>
                <div class="dmm-cat-form">
                  <div class="dmm-form-grid">
                    <label class="dmm-field"><span>Comprovante</span><input value="E1820..." /></label>
                    <label class="dmm-field"><span>Data/hora do Pix</span><input value="13/05 09:14" /></label>
                  </div>
                  <label class="dmm-field"><span>Chave recebedora</span><input value="contato@boti.com.br" /></label>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <footer class="dmm-rodape">
        <div class="dmm-rodape-dir" style="margin-left:auto">
          <button class="dmm-btn dmm-btn--link">Cancelar</button>
          <button class="dmm-btn dmm-btn--primary">Salvar</button>
        </div>
      </footer>
    </div>`;
}

function ligarMockup() {
  // Toggle leitura <-> edição
  document.querySelectorAll('[data-acao="toggle-edit"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const dmm = btn.closest('.dmm');
      const editando = dmm.dataset.modo === 'edicao';
      dmm.dataset.modo = editando ? 'leitura' : 'edicao';
      dmm.querySelectorAll('[data-leitura]').forEach(el => { el.hidden = editando ? false : true; });
      dmm.querySelectorAll('[data-edicao]').forEach(el => { el.hidden = editando ? true : false; });
      btn.classList.toggle('is-ativo', !editando);
    });
  });

  // Motivo da edição libera os campos da categoria (10+ chars).
  // Enquanto bloqueado, os inputs ficam disabled — não dá pra
  // preencher nada da categoria antes de justificar a edição.
  const motivo = document.querySelector('#dmm-motivo');
  const catCampos = document.querySelector('#dmm-cat-campos');
  if (motivo && catCampos) {
    const campos = catCampos.querySelectorAll('input, select, textarea');
    const sincronizar = () => {
      const ok = motivo.value.trim().length >= 10;
      catCampos.dataset.bloqueado = ok ? 'false' : 'true';
      campos.forEach(c => { c.disabled = !ok; });
    };
    sincronizar();
    motivo.addEventListener('input', sincronizar);
  }

  // Filtro mini com indicador deslizante. O .dmm-filtro-mini é
  // position:relative, então offsetLeft/offsetWidth dos botões já
  // são relativos ao trilho — basta copiá-los pro indicador.
  document.querySelectorAll('.dmm-filtro-mini').forEach(grupo => {
    const ind = grupo.querySelector('.dmm-filtro-ind');
    const botoes = [...grupo.querySelectorAll('.dmm-fmini')];

    const mover = (btn) => {
      ind.style.width = `${btn.offsetWidth}px`;
      ind.style.left  = `${btn.offsetLeft}px`;
    };
    // posição inicial
    requestAnimationFrame(() => {
      const sel = grupo.querySelector('.dmm-fmini[aria-selected="true"]') || botoes[0];
      mover(sel);
    });
    // reposiciona se a janela mudar de tamanho (botões reflowam)
    window.addEventListener('resize', () => {
      const sel = grupo.querySelector('.dmm-fmini[aria-selected="true"]') || botoes[0];
      mover(sel);
    });

    botoes.forEach(f => {
      f.addEventListener('click', () => {
        const dmm = f.closest('.dmm');
        const alvo = f.dataset.f;
        dmm.dataset.filtro = alvo;
        botoes.forEach(x => x.setAttribute('aria-selected', String(x.dataset.f === alvo)));
        mover(f);
        dmm.querySelectorAll('[data-grupo]').forEach(g => {
          g.hidden = alvo !== 'tudo' && g.dataset.grupo !== (alvo === 'tempo' ? 'tempo' : 'anot');
        });
      });
    });
  });
}
