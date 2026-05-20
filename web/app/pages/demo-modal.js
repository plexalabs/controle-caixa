// demo-modal.js — Sandbox /demo-modal: 3 variações da Versão C revisada
// do modal de lançamento. Split 1/3 (resumo + linha do tempo +
// anotações) + 2/3 (detalhes / edição). Estático, dados fake.
//
// Ajustes do operador sobre a Versão C original:
//  - Sem aba 'Editar' — vira botão ✎ pincel na linha de 'Detalhes'.
//  - Sem aba 'Observações' — campo de adicionar anotação fica embaixo.
//  - 'Observações' renomeado pra 'Anotações' (evita confundir com a
//    categoria/etiqueta OBS).
//  - Coluna esquerda: Linha do tempo em cima, Anotações embaixo.

const SVG = `viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"`;

export async function renderDemoModal() {
  document.querySelector('#app').innerHTML = `
    <div class="dm-root">
      <header class="dm-topo">
        <div>
          <p class="dm-eyebrow">Sandbox · aprovação · rodada 2</p>
          <h1 class="dm-titulo">Modal de lançamento — Versão C revisada</h1>
          <p class="dm-sub">
            Botão editar (pincel) na linha de Detalhes · sem abas ·
            esquerda com Linha do tempo em cima e Anotações embaixo.
            Escolha entre as 3 variações.
          </p>
        </div>
        <div class="dm-switch" role="tablist">
          <button class="dm-switch-btn" data-v="a" aria-selected="true">C1 · Empilhado</button>
          <button class="dm-switch-btn" data-v="b" aria-selected="false">C2 · Dividido</button>
          <button class="dm-switch-btn" data-v="c" aria-selected="false">C3 · Filtro</button>
        </div>
      </header>

      <div class="dm-palco" id="dm-palco">${versaoC1()}</div>

      <p class="dm-legenda" id="dm-legenda">${legenda('a')}</p>
    </div>
  `;

  document.querySelectorAll('.dm-switch-btn').forEach(b => {
    b.addEventListener('click', () => {
      const v = b.dataset.v;
      document.querySelectorAll('.dm-switch-btn').forEach(x =>
        x.setAttribute('aria-selected', String(x.dataset.v === v)));
      const palco = document.querySelector('#dm-palco');
      palco.innerHTML = v === 'a' ? versaoC1() : v === 'b' ? versaoC2() : versaoC3();
      document.querySelector('#dm-legenda').textContent = legenda(v);
      ligarMockup();
    });
  });
  ligarMockup();
}

function legenda(v) {
  return ({
    a: 'C1 · Empilhado — Coluna esquerda com 3 blocos empilhados num scroll só: card-resumo, Linha do tempo, Anotações (com campo de adicionar no fim). Direita: barra com label Detalhes + botão ✎ Editar à direita; clicar troca leitura por formulário no mesmo espaço.',
    b: 'C2 · Dividido — Esquerda em dois cartões nítidos e separados: Linha do tempo (scroll próprio) em cima, Anotações (scroll próprio + adicionar) embaixo. Direita: botão ✎ Editar é só o ícone pincel num canto, discreto.',
    c: 'C3 · Filtro — Esquerda traz timeline e anotações numa lista unificada com mini-filtro no topo (Tudo / Linha do tempo / Anotações). Direita: botão ✎ Editar em pill verde destacado ao lado de Detalhes.',
  })[v];
}

const MOCK = {
  nf: '33.774', cliente: 'Margarida Sabino', valor: 'R$ 1.249,90',
  pedido: '#48201', estado: 'Categorizado',
};

// Eventos da linha do tempo (sistema) — SEM anotações manuais
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

// Anotações manuais (o que era "observações")
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

function resumoCard() {
  return `
    <div class="dmm-resumo-card">
      <span class="dmm-resumo-cat" data-cat="pix">Pix</span>
      <span class="dmm-resumo-valor">${MOCK.valor}</span>
      <span class="dmm-resumo-pedido">Pedido ${MOCK.pedido}</span>
    </div>`;
}

function timelineSecao() {
  return `
    <div class="dmm-sec">
      <p class="dmm-sec-titulo">Linha do tempo</p>
      <ul class="dmm-tl-lista">${EVENTOS}</ul>
    </div>`;
}

function anotacoesSecao(comAdicionar = true) {
  return `
    <div class="dmm-sec">
      <p class="dmm-sec-titulo">Anotações</p>
      <ul class="dmm-anot-lista">${ANOTACOES}</ul>
      ${comAdicionar ? `
        <div class="dmm-anot-add">
          <textarea rows="2" placeholder="Escrever uma anotação…"></textarea>
          <button class="dmm-btn dmm-btn--primary dmm-btn--sm">Anotar</button>
        </div>` : ''}
    </div>`;
}

function leituraDetalhe() {
  return `
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
    </div>`;
}

function formCampos() {
  return `
    <div class="dmm-form">
      <div class="dmm-form-grid">
        <label class="dmm-field"><span>Número da NF</span><input value="33.774" /></label>
        <label class="dmm-field"><span>Código do pedido</span><input value="48201" /></label>
      </div>
      <label class="dmm-field"><span>Cliente</span><input value="Margarida Sabino" /></label>
      <label class="dmm-field"><span>Valor (R$)</span><input value="1249.90" /></label>
      <div class="dmm-form-sep"></div>
      <label class="dmm-field"><span>Categoria</span>
        <select><option>Pix</option><option>Cartão</option><option>Dinheiro</option></select>
      </label>
      <div class="dmm-form-grid">
        <label class="dmm-field"><span>Comprovante</span><input value="E1820..." /></label>
        <label class="dmm-field"><span>Data/hora do Pix</span><input value="13/05 09:14" /></label>
      </div>
      <label class="dmm-field"><span>Motivo da edição *</span>
        <textarea rows="2" placeholder="mínimo 10 caracteres"></textarea>
      </label>
    </div>`;
}

function cabec() {
  return `
    <header class="dmm-cabec">
      <div>
        <p class="dmm-cabec-eyebrow">Nota fiscal · ${MOCK.nf}</p>
        <h2 class="dmm-cabec-titulo">${MOCK.cliente}</h2>
      </div>
      <div class="dmm-cabec-dir">
        <span class="dmm-badge">${MOCK.estado}</span>
        <button class="dmm-x" aria-label="Fechar"><svg ${SVG}><path d="M4 4l8 8M12 4l-8 8"/></svg></button>
      </div>
    </header>`;
}

function rodape() {
  return `
    <footer class="dmm-rodape">
      <div class="dmm-rodape-dir" style="margin-left:auto">
        <button class="dmm-btn dmm-btn--link">Cancelar</button>
        <button class="dmm-btn dmm-btn--primary">Salvar</button>
      </div>
    </footer>`;
}

// Botão editar com pincel (3 estilos)
function btnEditar(estilo) {
  const pincel = `<svg ${SVG}><path d="M11 2.5l2.5 2.5M12.2 1.3a1.2 1.2 0 0 1 1.7 1.7l-8 8L3 14l.5-2.9 8-8Z"/></svg>`;
  if (estilo === 'icone') {
    return `<button class="dmm-editar-icone" data-acao="toggle-edit" aria-label="Editar">${pincel}</button>`;
  }
  if (estilo === 'pill') {
    return `<button class="dmm-editar-pill" data-acao="toggle-edit">${pincel}<span>Editar</span></button>`;
  }
  return `<button class="dmm-editar-ghost" data-acao="toggle-edit">${pincel}<span>Editar</span></button>`;
}

// ─── C1 — Empilhado ──────────────────────────────────────────────────
function versaoC1() {
  return `
    <div class="dmm dmm--c" data-modo="leitura">
      ${cabec()}
      <div class="dmm-corpo">
        <aside class="dmm-esq">
          ${resumoCard()}
          ${timelineSecao()}
          ${anotacoesSecao(true)}
        </aside>
        <section class="dmm-dir">
          <div class="dmm-dir-barra">
            <span class="dmm-dir-label" data-leitura>Detalhes do pagamento</span>
            <span class="dmm-dir-label" data-edicao hidden>Editar lançamento</span>
            ${btnEditar('ghost')}
          </div>
          <div data-leitura>${leituraDetalhe()}</div>
          <div data-edicao hidden>${formCampos()}</div>
        </section>
      </div>
      ${rodape()}
    </div>`;
}

// ─── C2 — Dividido (2 cartões nítidos na esquerda) ───────────────────
function versaoC2() {
  return `
    <div class="dmm dmm--c" data-modo="leitura">
      ${cabec()}
      <div class="dmm-corpo">
        <aside class="dmm-esq dmm-esq--dividida">
          ${resumoCard()}
          <div class="dmm-card-bloco">
            <p class="dmm-sec-titulo">Linha do tempo</p>
            <ul class="dmm-tl-lista">${EVENTOS}</ul>
          </div>
          <div class="dmm-card-bloco">
            <p class="dmm-sec-titulo">Anotações</p>
            <ul class="dmm-anot-lista">${ANOTACOES}</ul>
            <div class="dmm-anot-add">
              <textarea rows="2" placeholder="Escrever uma anotação…"></textarea>
              <button class="dmm-btn dmm-btn--primary dmm-btn--sm">Anotar</button>
            </div>
          </div>
        </aside>
        <section class="dmm-dir">
          <div class="dmm-dir-barra">
            <span class="dmm-dir-label" data-leitura>Detalhes do pagamento</span>
            <span class="dmm-dir-label" data-edicao hidden>Editar lançamento</span>
            ${btnEditar('icone')}
          </div>
          <div data-leitura>${leituraDetalhe()}</div>
          <div data-edicao hidden>${formCampos()}</div>
        </section>
      </div>
      ${rodape()}
    </div>`;
}

// ─── C3 — Lista unificada com filtro ─────────────────────────────────
function versaoC3() {
  return `
    <div class="dmm dmm--c" data-modo="leitura" data-filtro="tudo">
      ${cabec()}
      <div class="dmm-corpo">
        <aside class="dmm-esq">
          ${resumoCard()}
          <div class="dmm-sec">
            <div class="dmm-filtro-mini" role="group">
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
            <div class="dmm-anot-add">
              <textarea rows="2" placeholder="Escrever uma anotação…"></textarea>
              <button class="dmm-btn dmm-btn--primary dmm-btn--sm">Anotar</button>
            </div>
          </div>
        </aside>
        <section class="dmm-dir">
          <div class="dmm-dir-barra">
            <span class="dmm-dir-label" data-leitura>Detalhes do pagamento</span>
            <span class="dmm-dir-label" data-edicao hidden>Editar lançamento</span>
            ${btnEditar('pill')}
          </div>
          <div data-leitura>${leituraDetalhe()}</div>
          <div data-edicao hidden>${formCampos()}</div>
        </section>
      </div>
      ${rodape()}
    </div>`;
}

function ligarMockup() {
  // Toggle leitura <-> edição
  document.querySelectorAll('[data-acao="toggle-edit"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const dmm = btn.closest('.dmm');
      const editando = dmm.dataset.modo === 'edicao';
      dmm.dataset.modo = editando ? 'leitura' : 'edicao';
      dmm.querySelectorAll('[data-leitura]').forEach(el => el.hidden = !editando ? true : false);
      dmm.querySelectorAll('[data-edicao]').forEach(el => el.hidden = !editando ? false : true);
    });
  });
  // Filtro mini (C3)
  document.querySelectorAll('.dmm-fmini').forEach(f => {
    f.addEventListener('click', () => {
      const dmm = f.closest('.dmm');
      const alvo = f.dataset.f;
      dmm.dataset.filtro = alvo;
      dmm.querySelectorAll('.dmm-fmini').forEach(x =>
        x.setAttribute('aria-selected', String(x.dataset.f === alvo)));
      dmm.querySelectorAll('[data-grupo]').forEach(g => {
        g.hidden = alvo !== 'tudo' && g.dataset.grupo !== (alvo === 'tempo' ? 'tempo' : 'anot');
      });
    });
  });
}
