// demo-modal.js — Sandbox /demo-modal: 3 versões do modal de lançamento
// redesenhado (split 1/3 + 2/3). Estático, dados fake, sem backend.
// Serve só pra aprovar a direção visual antes de aplicar no modal real.

const SVG = `viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"`;

export async function renderDemoModal() {
  document.querySelector('#app').innerHTML = `
    <div class="dm-root">
      <header class="dm-topo">
        <div>
          <p class="dm-eyebrow">Sandbox · aprovação</p>
          <h1 class="dm-titulo">Modal de lançamento — 3 versões</h1>
          <p class="dm-sub">
            Layout amplo split: esquerda 1/3 (informações + linha do tempo),
            direita 2/3 (edição). Escolha a versão que prefere.
          </p>
        </div>
        <div class="dm-switch" role="tablist">
          <button class="dm-switch-btn" data-v="a" aria-selected="true">Versão A</button>
          <button class="dm-switch-btn" data-v="b" aria-selected="false">Versão B</button>
          <button class="dm-switch-btn" data-v="c" aria-selected="false">Versão C</button>
        </div>
      </header>

      <div class="dm-palco" id="dm-palco">
        ${versaoA()}
      </div>

      <p class="dm-legenda" id="dm-legenda">${legenda('a')}</p>
    </div>
  `;

  document.querySelectorAll('.dm-switch-btn').forEach(b => {
    b.addEventListener('click', () => {
      const v = b.dataset.v;
      document.querySelectorAll('.dm-switch-btn').forEach(x =>
        x.setAttribute('aria-selected', String(x.dataset.v === v)));
      const palco = document.querySelector('#dm-palco');
      palco.innerHTML = v === 'a' ? versaoA() : v === 'b' ? versaoB() : versaoC();
      document.querySelector('#dm-legenda').textContent = legenda(v);
      ligarToggles();
    });
  });
  ligarToggles();
}

function legenda(v) {
  return ({
    a: 'Versão A — Split clássico. Esquerda fixa: bloco de informações no topo, timeline embaixo. Direita: leitura vira formulário ao clicar Editar. Transição suave de conteúdo.',
    b: 'Versão B — Timeline como espinha. A coluna esquerda é dedicada só à linha do tempo (trilho visual contínuo). As informações ficam no topo da direita; ao editar, viram campos no mesmo lugar.',
    c: 'Versão C — Abas na direita. Esquerda: card-resumo do lançamento + timeline. Direita com abas Detalhes / Editar / Observações — cada uma troca só o conteúdo, mantém o resto estável.',
  })[v];
}

// Dados fake compartilhados
const MOCK = {
  nf: '33.774', cliente: 'Margarida Sabino', valor: 'R$ 1.249,90',
  categoria: 'Pix', pedido: '#48201', estado: 'Categorizado',
};

const TIMELINE = `
  <li class="dmm-tl-item" data-tone="criacao">
    <span class="dmm-tl-dot"></span>
    <div>
      <div class="dmm-tl-head"><span class="dmm-tl-tipo">Criação</span><time>há 3 h</time></div>
      <p class="dmm-tl-corpo"><strong>NF 33.774</strong> registrada — R$ 1.249,90 para <strong>Margarida Sabino</strong></p>
      <p class="dmm-tl-autor">por joao.botucatu</p>
    </div>
  </li>
  <li class="dmm-tl-item" data-tone="obs">
    <span class="dmm-tl-dot"></span>
    <div>
      <div class="dmm-tl-head"><span class="dmm-tl-tipo">Observação</span><time>há 2 h</time></div>
      <p class="dmm-tl-corpo">Cliente avisada por WhatsApp. Aguardando confirmação do comprovante.</p>
      <p class="dmm-tl-autor">por ana.silva</p>
    </div>
  </li>
  <li class="dmm-tl-item" data-tone="">
    <span class="dmm-tl-dot"></span>
    <div>
      <div class="dmm-tl-head"><span class="dmm-tl-tipo">Edição</span><time>há 40 min</time></div>
      <p class="dmm-tl-corpo">Valor corrigido de R$ 1.200,00 para R$ 1.249,90.</p>
      <p class="dmm-tl-autor">por joao.botucatu</p>
    </div>
  </li>
`;

function blocoInfo() {
  return `
    <div class="dmm-info">
      <div class="dmm-info-cell">
        <span class="dmm-info-k">Cliente</span>
        <span class="dmm-info-v">${MOCK.cliente}</span>
      </div>
      <div class="dmm-info-cell">
        <span class="dmm-info-k">Valor da NF</span>
        <span class="dmm-info-v dmm-info-v--forte">${MOCK.valor}</span>
      </div>
      <div class="dmm-info-cell">
        <span class="dmm-info-k">Código do pedido</span>
        <span class="dmm-info-v">${MOCK.pedido}</span>
      </div>
      <div class="dmm-info-cell">
        <span class="dmm-info-k">Categoria</span>
        <span class="dmm-info-v"><span class="dmm-chip" data-cat="pix">Pix</span></span>
      </div>
    </div>`;
}

function timelineBloco(compacta = false) {
  return `
    <div class="dmm-tl ${compacta ? 'dmm-tl--compacta' : ''}">
      <p class="dmm-tl-titulo">Linha do tempo</p>
      <ul class="dmm-tl-lista">${TIMELINE}</ul>
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

function leituraDetalhe() {
  return `
    <div class="dmm-leitura">
      <div class="dmm-leitura-detalhes">
        <p class="dmm-leitura-titulo">Detalhes do pagamento</p>
        <dl class="dmm-dl">
          <dt>ID comprovante</dt><dd>E1820250513...</dd>
          <dt>Chave recebedora</dt><dd>contato@boti.com.br</dd>
          <dt>Data/hora</dt><dd>13/05/2026 09:14</dd>
          <dt>Remetente</dt><dd>Margarida S.</dd>
        </dl>
      </div>
      <div class="dmm-obs-add">
        <p class="dmm-leitura-titulo">Adicionar observação</p>
        <textarea rows="2" placeholder="ex.: cliente confirmou o comprovante"></textarea>
      </div>
    </div>`;
}

// ─── VERSÃO A — Split clássico ───────────────────────────────────────
function versaoA() {
  return `
    <div class="dmm dmm--a" data-modo="leitura">
      <header class="dmm-cabec">
        <div>
          <p class="dmm-cabec-eyebrow">Nota fiscal · ${MOCK.nf}</p>
          <h2 class="dmm-cabec-titulo">${MOCK.cliente}</h2>
        </div>
        <div class="dmm-cabec-dir">
          <span class="dmm-badge">${MOCK.estado}</span>
          <button class="dmm-x" aria-label="Fechar">${xIcon()}</button>
        </div>
      </header>
      <div class="dmm-corpo">
        <aside class="dmm-esq">
          ${blocoInfo()}
          ${timelineBloco()}
        </aside>
        <section class="dmm-dir">
          <div class="dmm-dir-leitura">${leituraDetalhe()}</div>
          <div class="dmm-dir-edicao">${formCampos()}</div>
        </section>
      </div>
      <footer class="dmm-rodape">
        <button class="dmm-btn dmm-btn--ghost" data-acao="toggle-edit">✎ Editar lançamento</button>
        <div class="dmm-rodape-dir">
          <button class="dmm-btn dmm-btn--link">Cancelar</button>
          <button class="dmm-btn dmm-btn--primary">Salvar</button>
        </div>
      </footer>
    </div>`;
}

// ─── VERSÃO B — Timeline como espinha ────────────────────────────────
function versaoB() {
  return `
    <div class="dmm dmm--b" data-modo="leitura">
      <header class="dmm-cabec">
        <div>
          <p class="dmm-cabec-eyebrow">Nota fiscal · ${MOCK.nf}</p>
          <h2 class="dmm-cabec-titulo">${MOCK.cliente}</h2>
        </div>
        <div class="dmm-cabec-dir">
          <span class="dmm-badge">${MOCK.estado}</span>
          <button class="dmm-x" aria-label="Fechar">${xIcon()}</button>
        </div>
      </header>
      <div class="dmm-corpo">
        <aside class="dmm-esq dmm-esq--trilho">
          ${timelineBloco()}
        </aside>
        <section class="dmm-dir">
          <div class="dmm-dir-leitura">
            ${blocoInfo()}
            ${leituraDetalhe()}
          </div>
          <div class="dmm-dir-edicao">${formCampos()}</div>
        </section>
      </div>
      <footer class="dmm-rodape">
        <button class="dmm-btn dmm-btn--ghost" data-acao="toggle-edit">✎ Editar lançamento</button>
        <div class="dmm-rodape-dir">
          <button class="dmm-btn dmm-btn--link">Cancelar</button>
          <button class="dmm-btn dmm-btn--primary">Salvar</button>
        </div>
      </footer>
    </div>`;
}

// ─── VERSÃO C — Abas na direita ──────────────────────────────────────
function versaoC() {
  return `
    <div class="dmm dmm--c" data-modo="leitura" data-aba="detalhes">
      <header class="dmm-cabec">
        <div>
          <p class="dmm-cabec-eyebrow">Nota fiscal · ${MOCK.nf}</p>
          <h2 class="dmm-cabec-titulo">${MOCK.cliente}</h2>
        </div>
        <div class="dmm-cabec-dir">
          <span class="dmm-badge">${MOCK.estado}</span>
          <button class="dmm-x" aria-label="Fechar">${xIcon()}</button>
        </div>
      </header>
      <div class="dmm-corpo">
        <aside class="dmm-esq">
          <div class="dmm-resumo-card">
            <span class="dmm-resumo-cat" data-cat="pix">Pix</span>
            <span class="dmm-resumo-valor">${MOCK.valor}</span>
            <span class="dmm-resumo-pedido">Pedido ${MOCK.pedido}</span>
          </div>
          ${timelineBloco(true)}
        </aside>
        <section class="dmm-dir">
          <nav class="dmm-abas" role="tablist">
            <button class="dmm-aba" data-aba="detalhes" aria-selected="true">Detalhes</button>
            <button class="dmm-aba" data-aba="editar" aria-selected="false">Editar</button>
            <button class="dmm-aba" data-aba="obs" aria-selected="false">Observações</button>
          </nav>
          <div class="dmm-aba-conteudo">
            <div data-painel="detalhes">${leituraDetalhe()}</div>
            <div data-painel="editar" hidden>${formCampos()}</div>
            <div data-painel="obs" hidden>
              <div class="dmm-obs-add">
                <p class="dmm-leitura-titulo">Adicionar observação</p>
                <textarea rows="3" placeholder="ex.: cliente confirmou o comprovante"></textarea>
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

function ligarToggles() {
  // Toggle leitura/edicao (versões A e B)
  document.querySelectorAll('[data-acao="toggle-edit"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const dmm = btn.closest('.dmm');
      const editando = dmm.dataset.modo === 'edicao';
      dmm.dataset.modo = editando ? 'leitura' : 'edicao';
      btn.textContent = editando ? '✎ Editar lançamento' : '← Voltar à leitura';
    });
  });
  // Abas (versão C)
  document.querySelectorAll('.dmm-aba').forEach(aba => {
    aba.addEventListener('click', () => {
      const dmm = aba.closest('.dmm');
      const alvo = aba.dataset.aba;
      dmm.querySelectorAll('.dmm-aba').forEach(x =>
        x.setAttribute('aria-selected', String(x.dataset.aba === alvo)));
      dmm.querySelectorAll('[data-painel]').forEach(p => {
        p.hidden = p.dataset.painel !== alvo;
      });
    });
  });
}

function xIcon() {
  return `<svg ${SVG}><path d="M4 4l8 8M12 4l-8 8"/></svg>`;
}
