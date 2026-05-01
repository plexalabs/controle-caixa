// modal-editar-lancamento.js — Drawer multi-modo para editar/categorizar
// um lançamento ja existente. Tres modos detectados pelo estado:
//
//   1. CATEGORIZAR  (categoria=null) — formulario completo com campos
//      comuns + select de categoria + campos dinamicos. Submit aplica
//      categoria, dados e estado='completo'.
//   2. GERENCIAR    (categoria!=null, sem estado_final no JSON) — exibe
//      dados read-only, lista de observacoes, botoes finalizar/cancelar
//      e textarea para nova observacao. (implementado no proximo commit)
//   3. FINALIZADO   (dados_categoria.estado_final setado) — banner do
//      desfecho + dados read-only + observacoes (so adicionar). (idem)

import { supabase } from '../app/supabase.js';
import { abrirModal, fecharModal } from './modal.js';
import { CATEGORIAS, BANDEIRAS, MODALIDADES, STATUS_LINK, TIPOS_OBS,
         LABEL_CATEGORIA } from '../app/dominio.js';
import { mostrarToast } from '../app/notifications.js';
import { debounce } from '../app/utils.js';
import { instalarPopSelectsEm } from './pop-select.js';
import { instalarPopDatasEm }   from './pop-data.js';

// Estado interno do drawer (limpo a cada abertura).
let estado = null;

export function abrirModalEditarLancamento({ lancamento, dataCaixa, aoSalvar = () => {} } = {}) {
  estado = {
    lancamento,                              // pode ser null se for criacao direta
    dataCaixa,
    aoSalvar,
    categoriaAtual: lancamento?.categoria || '',
    dadosCategoria: lancamento?.dados_categoria || {},
    vendedoras: [],
    sujo: false,
    modo: detectarModo(lancamento),
  };

  if (estado.modo === 'categorizar') return abrirModoCategorizar();
  return abrirModoGerenciarOuFinalizado();
}

function detectarModo(l) {
  if (!l || l.categoria == null) return 'categorizar';
  if (l.dados_categoria?.estado_final) return 'finalizado';
  return 'gerenciar';
}

// ════════════════════════════════════════════════════════════════════════
// MODO 1 — CATEGORIZAR
// ════════════════════════════════════════════════════════════════════════
function abrirModoCategorizar() {
  const l = estado.lancamento;
  abrirModal({
    lateral: true,
    eyebrow: l ? `NF ${l.numero_nf} · em análise` : `Novo lançamento · ${formatarDataPt(estado.dataCaixa)}`,
    titulo:  l ? 'Categorizar lançamento.' : 'Adicionar uma página ao caixa.',
    conteudo: corpoFormCategorizar(),
    rodape: `
      <div id="erro-form" role="alert" aria-live="polite" class="hidden alert" style="margin-bottom:0.85rem"></div>
      <div class="painel-rodape-acoes">
        <button type="button" id="btn-cancel" class="btn-link">Cancelar</button>
        <button type="submit" form="form-lanc" id="btn-salvar" class="btn-primary" disabled>Salvar categorização</button>
      </div>`,
    onConfirmarFechar: () => {
      if (!estado?.sujo) return true;
      return confirm('Os dados preenchidos serão descartados. Continuar?');
    },
  });

  ligarCategorizar();
}

function corpoFormCategorizar() {
  const l = estado.lancamento;
  const nfReadOnly = !!l;
  return `
    ${l ? `
      <p class="text-body" style="font-size:0.9rem;color:var(--c-tinta-3);margin-bottom:1.4rem;line-height:1.5">
        Você anotou a NF <strong style="color:var(--c-tinta)">${esc(l.numero_nf)}</strong>
        com valor de <strong style="color:var(--c-tinta)">${formatBRL(l.valor_nf)}</strong>.
        Agora defina como o pagamento foi feito.
      </p>` : ''}

    <form id="form-lanc" novalidate>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div class="field" style="margin-bottom:0">
          <label class="field-label" for="numero_nf">Número da NF</label>
          <input id="numero_nf" name="numero_nf" required maxlength="15" class="field-input"
                 ${nfReadOnly ? 'readonly' : ''}
                 value="${esc(l?.numero_nf || '')}" />
        </div>
        <div class="field" style="margin-bottom:0">
          <label class="field-label" for="codigo_pedido">Código do pedido</label>
          <input id="codigo_pedido" name="codigo_pedido" required maxlength="20" class="field-input"
                 value="${esc(l?.codigo_pedido || '')}" />
        </div>
      </div>

      <div class="field mt-5">
        <label class="field-label" for="cliente_nome">Cliente</label>
        <input id="cliente_nome" name="cliente_nome" required maxlength="120" class="field-input"
               value="${esc(l?.cliente_nome || '')}" />
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-5">
        <div class="field" style="margin-bottom:0">
          <label class="field-label" for="valor_nf">Valor (R$)</label>
          <input id="valor_nf" name="valor_nf" type="number" step="0.01" min="0.01" required
                 class="field-input" inputmode="decimal"
                 value="${esc(l?.valor_nf ?? '')}" />
        </div>
        <div class="field" style="margin-bottom:0">
          <label class="field-label" for="categoria">Forma de pagamento *</label>
          <select id="categoria" name="categoria" required class="field-input">
            <option value="">— escolher —</option>
            ${CATEGORIAS.map(c => `<option value="${c.valor}">${c.rotulo}</option>`).join('')}
          </select>
        </div>
      </div>

      <fieldset id="bloco-cat" class="mt-7 pt-6 border-t" style="border-color:var(--c-papel-3)">
        <legend class="h-eyebrow" style="padding:0">Detalhes da categoria</legend>
        <p id="bloco-cat-vazio" class="text-body text-sm mt-3" style="color:var(--c-tinta-3)">
          Escolha uma forma de pagamento acima para preencher os campos correspondentes.
        </p>
        <div id="bloco-cat-campos"></div>
      </fieldset>
    </form>
  `;
}

function ligarCategorizar() {
  const form = document.querySelector('#form-lanc');
  if (!form) return;

  const f = (id) => form.querySelector(`#${id}`) || document.querySelector(`#${id}`);
  const erroEl = document.querySelector('#erro-form');

  // Substitui os <select> nativos pelo listbox custom papel/musgo
  // e os inputs date/datetime pelo calendário custom.
  instalarPopSelectsEm(form);
  instalarPopDatasEm(form);

  setTimeout(() => {
    const alvo = estado.lancamento ? f('categoria') : f('numero_nf');
    // Quando categoria foi populada e o select original está oculto,
    // foca o trigger custom em vez do select.
    const triggerCat = document.querySelector('.pop-select-trigger[aria-labelledby]');
    if (estado.lancamento && triggerCat) triggerCat.focus();
    else alvo?.focus();
  }, 360);

  form.addEventListener('input', () => { estado.sujo = true; revalidar(); });

  f('btn-cancel').addEventListener('click', () => fecharModal(false));

  const buscar = debounce(async () => {
    const codigo = f('codigo_pedido').value.trim();
    if (!codigo) return;
    const { data } = await supabase
      .from('cliente_cache').select('cliente_nome, valor_nf_ultimo')
      .eq('codigo_pedido', codigo).maybeSingle();
    if (!data) return;
    if (!f('cliente_nome').value) f('cliente_nome').value = data.cliente_nome;
    if (!f('valor_nf').value && data.valor_nf_ultimo)
      f('valor_nf').value = Number(data.valor_nf_ultimo).toFixed(2);
    revalidar();
  }, 350);
  f('codigo_pedido').addEventListener('blur', buscar);

  f('categoria').addEventListener('change', async (e) => {
    const nova = e.target.value;
    if (estado.categoriaAtual && temDadosCategoria() && nova !== estado.categoriaAtual) {
      if (!confirm(`Os dados de ${LABEL_CATEGORIA[estado.categoriaAtual]} serão descartados. Continuar?`)) {
        e.target.value = estado.categoriaAtual;
        return;
      }
    }
    estado.categoriaAtual = nova;
    estado.dadosCategoria = {};
    await renderCamposCategoria(nova);
    revalidar();
  });

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    erroEl.classList.add('hidden');
    const btn = f('btn-salvar');
    btn.setAttribute('aria-busy', 'true');
    btn.disabled = true;

    const payload = construirPayload(form);
    if (!payload) {
      btn.removeAttribute('aria-busy');
      revalidar();
      return;
    }

    const { error } = await supabase.rpc('upsert_lancamento', payload);
    btn.removeAttribute('aria-busy');

    if (error) {
      btn.disabled = false;
      erroEl.classList.remove('hidden');
      erroEl.textContent = traduzirErroBanco(error);
      return;
    }

    estado.sujo = false;
    fecharModal(true);
    mostrarToast('Lançamento categorizado.', 'ok', 2200);
    estado.aoSalvar();
  });
}

async function renderCamposCategoria(cat) {
  const container = document.querySelector('#bloco-cat-campos');
  const vazio     = document.querySelector('#bloco-cat-vazio');
  if (!container) return;

  if (!cat) {
    container.innerHTML = '';
    vazio?.classList.remove('hidden');
    return;
  }
  vazio?.classList.add('hidden');

  switch (cat) {
    case 'cartao':
      container.innerHTML = `
        ${campoTexto('codigo_autorizacao', 'Código de autorização', { required: true, minlength: 4, maxlength: 20 })}
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-5">
          ${campoSelect('bandeira',   'Bandeira',   BANDEIRAS, { required: true })}
          ${campoSelect('modalidade', 'Modalidade', MODALIDADES, { required: true })}
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-5">
          ${campoNumero('parcelas', 'Parcelas', { required: true, min: 1, max: 24 })}
          ${campoTexto('ultimos_4_digitos', 'Últimos 4 dígitos', { maxlength: 4, pattern: '\\d{4}' })}
        </div>`;
      break;

    case 'pix':
      container.innerHTML = `
        ${campoTexto('comprovante_id_externo', 'Identificador do comprovante (vem na NF)', { required: true })}
        ${campoTexto('chave_recebedora', 'Chave Pix recebedora', { required: true })}
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-5">
          ${campoTexto('data_hora_pix', 'Data e hora do Pix', { required: true, type: 'datetime-local' })}
          ${campoTexto('nome_remetente', 'Nome do remetente')}
        </div>`;
      break;

    case 'dinheiro': {
      const { data: vendedoras } = await supabase
        .from('vendedora').select('id, nome, apelido').eq('ativa', true).order('nome');
      estado.vendedoras = vendedoras || [];

      if (!estado.vendedoras.length) {
        container.innerHTML = `
          <div class="alert alert--info">
            Nenhuma vendedora cadastrada. Cadastre antes de registrar um lançamento de dinheiro
            em <a href="/configuracoes" data-link>Configurações → Vendedoras</a>.
          </div>`;
      } else {
        const opts = estado.vendedoras.map(v => ({ valor: v.id, rotulo: v.nome }));
        container.innerHTML = `
          ${campoSelect('vendedora_id', 'Vendedora que recebeu', opts, { required: true })}
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-5">
            ${campoNumero('valor_recebido', 'Valor recebido (R$)', { required: true, step: 0.01, min: 0.01 })}
            ${campoNumero('troco', 'Troco (R$)', { step: 0.01, min: 0 })}
          </div>
          ${campoTextarea('observacao_caixa', 'Observação (opcional)', { maxlength: 240 })}`;

        document.querySelector('#campo-valor_recebido').addEventListener('input', () => {
          const recebido = Number(document.querySelector('#campo-valor_recebido').value || 0);
          const valorNF  = Number(document.querySelector('#valor_nf').value || 0);
          const trocoEl  = document.querySelector('#campo-troco');
          if (trocoEl && recebido > 0 && valorNF > 0) {
            trocoEl.value = Math.max(0, recebido - valorNF).toFixed(2);
          }
        });
      }
      break;
    }

    case 'cancelado':
      container.innerHTML = `
        ${campoTextarea('motivo_cancelamento', 'Motivo do cancelamento (mín. 10 caracteres)', { required: true, minlength: 10 })}
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-5">
          ${campoTexto('cancelado_por',     'Cancelado por',          { required: true })}
          ${campoTexto('data_cancelamento', 'Data do cancelamento',   { required: true, type: 'date' })}
        </div>
        ${campoTexto('numero_estorno', 'Número do estorno (opcional)')}`;
      break;

    case 'cartao_link':
      container.innerHTML = `
        ${campoTexto('link_url', 'URL do link de pagamento (https://…)', { required: true, type: 'url', pattern: 'https://.+' })}
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-5">
          ${campoSelect('status_link', 'Status', STATUS_LINK, { required: true })}
          ${campoTexto('data_envio_link', 'Data de envio', { required: true, type: 'datetime-local' })}
        </div>`;
      break;

    case 'obs':
      container.innerHTML = `
        ${campoSelect('tipo_obs', 'Tipo de observação', TIPOS_OBS, { required: true })}
        ${campoTextarea('descricao', 'Descrição (mín. 20 caracteres)', { required: true, minlength: 20, maxlength: 500 })}`;
      break;
  }

  container.querySelectorAll('input, select, textarea').forEach(el => {
    el.addEventListener('input', () => { estado.sujo = true; revalidar(); });
  });

  // Re-instala pop-selects e pop-datas nos novos campos dinamicos
  // (bandeira, modalidade, vendedora, status_link, tipo_obs +
  //  data_hora_pix, data_cancelamento, data_envio_link).
  instalarPopSelectsEm(container);
  instalarPopDatasEm(container);
}

// ─── Helpers de geração de campos ───────────────────────────────────────
function campoTexto(name, label, opts = {}) {
  const t = opts.type || 'text';
  const req = opts.required ? 'required' : '';
  const minlen = opts.minlength ? `minlength="${opts.minlength}"` : '';
  const maxlen = opts.maxlength ? `maxlength="${opts.maxlength}"` : '';
  const pat = opts.pattern ? `pattern="${opts.pattern}"` : '';
  return `
    <div class="field" style="margin-bottom:0">
      <label class="field-label" for="campo-${name}">${esc(label)}${opts.required ? ' *' : ''}</label>
      <input id="campo-${name}" name="${name}" type="${t}" class="field-input" ${req} ${minlen} ${maxlen} ${pat} />
    </div>`;
}
function campoNumero(name, label, opts = {}) {
  const req = opts.required ? 'required' : '';
  const step = opts.step ? `step="${opts.step}"` : 'step="1"';
  const min = opts.min != null ? `min="${opts.min}"` : '';
  const max = opts.max != null ? `max="${opts.max}"` : '';
  return `
    <div class="field" style="margin-bottom:0">
      <label class="field-label" for="campo-${name}">${esc(label)}${opts.required ? ' *' : ''}</label>
      <input id="campo-${name}" name="${name}" type="number" inputmode="decimal" class="field-input" ${req} ${step} ${min} ${max} />
    </div>`;
}
function campoSelect(name, label, opcoes, opts = {}) {
  const req = opts.required ? 'required' : '';
  const itens = opcoes.map(o => {
    const v = typeof o === 'string' ? o : o.valor;
    const r = typeof o === 'string' ? o : o.rotulo;
    return `<option value="${esc(v)}">${esc(r)}</option>`;
  }).join('');
  return `
    <div class="field" style="margin-bottom:0">
      <label class="field-label" for="campo-${name}">${esc(label)}${opts.required ? ' *' : ''}</label>
      <select id="campo-${name}" name="${name}" class="field-input" ${req}>
        <option value="">— selecionar —</option>
        ${itens}
      </select>
    </div>`;
}
function campoTextarea(name, label, opts = {}) {
  const req = opts.required ? 'required' : '';
  const minlen = opts.minlength ? `minlength="${opts.minlength}"` : '';
  const maxlen = opts.maxlength ? `maxlength="${opts.maxlength}"` : '';
  return `
    <div class="field" style="margin-bottom:0;margin-top:1.25rem">
      <label class="field-label" for="campo-${name}">${esc(label)}${opts.required ? ' *' : ''}</label>
      <textarea id="campo-${name}" name="${name}" rows="3"
                class="field-input" style="resize:vertical;padding-top:0.6rem"
                ${req} ${minlen} ${maxlen}></textarea>
    </div>`;
}

function temDadosCategoria() {
  const campos = document.querySelectorAll('#bloco-cat-campos input, #bloco-cat-campos select, #bloco-cat-campos textarea');
  return Array.from(campos).some(c => c.value && c.value.trim() !== '');
}
function revalidar() {
  const form = document.querySelector('#form-lanc');
  const btn  = document.querySelector('#btn-salvar');
  if (!form || !btn) return;
  btn.disabled = !form.checkValidity();
}

function construirPayload(form) {
  const dadosCategoria = {};
  const campos = form.querySelectorAll('#bloco-cat-campos input, #bloco-cat-campos select, #bloco-cat-campos textarea');
  for (const el of campos) {
    if (el.name && el.value !== '') dadosCategoria[el.name] = el.value;
  }
  if (dadosCategoria.parcelas) dadosCategoria.parcelas = Number(dadosCategoria.parcelas);
  if (dadosCategoria.valor_recebido) dadosCategoria.valor_recebido = Number(dadosCategoria.valor_recebido);
  if (dadosCategoria.troco != null && dadosCategoria.troco !== '') dadosCategoria.troco = Number(dadosCategoria.troco);
  if (form.categoria.value === 'dinheiro' && dadosCategoria.vendedora_id) {
    const v = estado.vendedoras.find(x => x.id === dadosCategoria.vendedora_id);
    if (v) dadosCategoria.vendedora_nome_cache = v.nome;
  }

  return {
    p_data_caixa:     estado.dataCaixa,
    p_numero_nf:      form.numero_nf.value.trim(),
    p_codigo_pedido:  form.codigo_pedido.value.trim(),
    p_cliente_nome:   form.cliente_nome.value.trim(),
    p_valor_nf:       Number(form.valor_nf.value),
    p_categoria:      form.categoria.value,
    p_estado:         form.categoria.value === 'cancelado' ? 'cancelado' : 'completo',
    p_dados_categoria: dadosCategoria,
    p_fonte_origem:   'web',
  };
}

function traduzirErroBanco(error) {
  const m = (error.message || '').toLowerCase();
  if (m.includes('numero_nf') && m.includes('duplic')) return 'Já existe lançamento com este número de NF neste caixa.';
  if (m.includes('lancamento_nf_caixa_uk'))           return 'Já existe lançamento com este número de NF neste caixa.';
  if (m.includes('cartão incompletos') || m.includes('cartao incompletos'))    return 'Preencha todos os campos obrigatórios da categoria Cartão.';
  if (m.includes('pix incompletos'))                  return 'Preencha todos os campos obrigatórios da categoria Pix.';
  if (m.includes('dinheiro incompletos'))             return 'Preencha todos os campos obrigatórios da categoria Dinheiro.';
  if (m.includes('cancelamento incompletos'))         return 'Preencha motivo, autorizador e data do cancelamento.';
  if (m.includes('motivo de cancelamento muito curto')) return 'Motivo do cancelamento precisa ter ao menos 10 caracteres.';
  if (m.includes('cartão link incompletos') || m.includes('cartao link'))      return 'Preencha URL e status do link.';
  if (m.includes('link deve come'))                   return 'O link precisa começar com https://.';
  if (m.includes('obs incompletos'))                  return 'Preencha tipo e descrição da observação.';
  if (m.includes('descrição de obs muito curta') || m.includes('descricao de obs')) return 'Descrição da observação precisa ter ao menos 20 caracteres.';
  if (m.includes('row-level security'))               return 'Você não tem permissão para criar lançamentos. Contate o administrador.';
  return error.message || 'Não foi possível salvar. Tente novamente.';
}

function formatarDataPt(iso) {
  const d = new Date(iso + 'T00:00:00');
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long' }).format(d);
}
function formatBRL(n) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(n || 0));
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

// ════════════════════════════════════════════════════════════════════════
// MODOS 2/3 — GERENCIAR (categorizado) e FINALIZADO (estado_final setado)
// ════════════════════════════════════════════════════════════════════════
function abrirModoGerenciarOuFinalizado() {
  const l = estado.lancamento;
  const ef = l.dados_categoria?.estado_final;
  const finalizado = !!ef;
  const eyebrow = finalizado
    ? `NF ${l.numero_nf} · ${ef === 'cancelado' ? 'cancelado' : 'finalizado'}`
    : `NF ${l.numero_nf} · ${LABEL_CATEGORIA[l.categoria] || l.categoria}`;
  const titulo  = finalizado ? 'Histórico do lançamento.' : 'Lançamento em curso.';

  abrirModal({
    lateral: true,
    eyebrow,
    titulo,
    conteudo: corpoGerenciar(),
    rodape:   rodapeGerenciar(),
    onConfirmarFechar: () => true,  // sem dados de form pra perder
  });

  ligarGerenciar();
}

function corpoGerenciar() {
  const l  = estado.lancamento;
  const ef = l.dados_categoria?.estado_final;
  const ts = l.dados_categoria?.estado_final_em;
  const motivo = l.dados_categoria?.estado_final_motivo;
  const observacoes = Array.isArray(l.dados_categoria?.observacoes)
    ? l.dados_categoria.observacoes
    : [];

  return `
    ${ef ? bannerFinal(ef, ts, motivo) : ''}

    <section class="lanc-leitura">
      ${cardLeitura('Categoria',
        `<span class="lanc-categoria" style="background:${corBgCat(l.categoria)};color:${corTextoCat(l.categoria)}">
           ${esc(LABEL_CATEGORIA[l.categoria] || l.categoria)}
         </span>`)}
      ${cardLeitura('Cliente',  esc(l.cliente_nome))}
      ${cardLeitura('Código',   esc(l.codigo_pedido) + ' · NF ' + esc(l.numero_nf))}
      ${cardLeitura('Valor',    `<strong style="font-family:'Fraunces';font-variant-numeric:tabular-nums;font-size:1.2rem">${formatBRL(l.valor_nf)}</strong>`)}
    </section>

    ${dadosCategoriaLeitura(l)}

    <section class="lanc-obs-bloco">
      <h3 class="h-eyebrow" style="margin-top:1.75rem;margin-bottom:0.85rem">Observações</h3>
      <ul id="lista-obs" class="lanc-obs-lista">
        ${observacoes.length === 0
          ? `<li class="lanc-obs-vazio">Nenhuma observação ainda.</li>`
          : observacoes.map(linhaObs).join('')}
      </ul>
      <div class="lanc-obs-novo">
        <label class="field-label" for="nova-obs" style="margin-bottom:0.4rem">Adicionar observação</label>
        <textarea id="nova-obs" rows="2" class="field-input"
                  placeholder="ex.: avisei o cliente em 02/05, vence dia 05/05"
                  maxlength="500" style="resize:vertical"></textarea>
        <div style="display:flex;justify-content:flex-end;margin-top:0.5rem">
          <button type="button" id="btn-add-obs" class="btn-primary" style="padding:0.55rem 1.1rem;font-size:0.85rem" disabled>
            Adicionar
          </button>
        </div>
      </div>
    </section>
  `;
}

function rodapeGerenciar() {
  const l  = estado.lancamento;
  const ef = l.dados_categoria?.estado_final;
  if (ef) {
    return `<div class="painel-rodape-acoes">
      <span class="text-body" style="font-size:0.82rem;color:var(--c-tinta-3)">
        Lançamento ${ef === 'cancelado' ? 'cancelado' : 'finalizado'}. Apenas observações continuam editáveis.
      </span>
      <button type="button" id="btn-fechar-leitura" class="btn-link">Fechar</button>
    </div>`;
  }
  return `
    <div id="erro-form" role="alert" aria-live="polite" class="hidden alert" style="margin-bottom:0.85rem"></div>
    <div class="painel-acoes-finais">
      <button type="button" id="btn-cancelar-pos" class="btn-secundario btn-secundario--alerta">
        ✕ Marcar como cancelado
      </button>
      <button type="button" id="btn-finalizar" class="btn-primary">
        ✓ Marcar como finalizado
      </button>
    </div>`;
}

function bannerFinal(ef, ts, motivo) {
  const cancelado = ef === 'cancelado';
  return `
    <div class="lanc-banner lanc-banner--${cancelado ? 'cancelado' : 'finalizado'}">
      <div class="lanc-banner-icone">${cancelado ? '✕' : '✓'}</div>
      <div>
        <p class="lanc-banner-titulo">${cancelado ? 'Cancelado' : 'Finalizado'}${ts ? ' em ' + formatarTs(ts) : ''}</p>
        ${motivo ? `<p class="lanc-banner-motivo">${esc(motivo)}</p>` : ''}
      </div>
    </div>`;
}

function cardLeitura(rotulo, valorHtml) {
  return `
    <div class="lanc-leitura-item">
      <p class="h-eyebrow" style="font-size:0.6rem">${esc(rotulo)}</p>
      <div class="lanc-leitura-valor">${valorHtml}</div>
    </div>`;
}

function dadosCategoriaLeitura(l) {
  const cat = l.categoria;
  const d   = l.dados_categoria || {};
  let pares = [];

  if (cat === 'cartao') pares = [
    ['Bandeira',       d.bandeira],
    ['Modalidade',     d.modalidade],
    ['Parcelas',       d.parcelas ? `${d.parcelas}x` : null],
    ['Últimos 4',      d.ultimos_4_digitos ? `**** ${d.ultimos_4_digitos}` : null],
    ['Cód. autorização', d.codigo_autorizacao],
  ];
  else if (cat === 'pix') pares = [
    ['ID comprovante', d.comprovante_id_externo],
    ['Chave',          d.chave_recebedora],
    ['Data/hora',      d.data_hora_pix ? formatarTs(d.data_hora_pix) : null],
    ['Remetente',      d.nome_remetente],
  ];
  else if (cat === 'dinheiro') pares = [
    ['Recebido por',   d.vendedora_nome_cache],
    ['Valor recebido', d.valor_recebido != null ? formatBRL(d.valor_recebido) : null],
    ['Troco',          d.troco != null && Number(d.troco) > 0 ? formatBRL(d.troco) : null],
  ];
  else if (cat === 'cancelado') pares = [
    ['Motivo',         d.motivo_cancelamento],
    ['Cancelado por',  d.cancelado_por],
    ['Data',           d.data_cancelamento],
    ['Estorno nº',     d.numero_estorno],
  ];
  else if (cat === 'cartao_link') pares = [
    ['URL',            d.link_url],
    ['Status',         d.status_link],
    ['Enviado em',     d.data_envio_link ? formatarTs(d.data_envio_link) : null],
  ];
  else if (cat === 'obs') pares = [
    ['Tipo',           d.tipo_obs],
    ['Descrição',      d.descricao],
  ];

  pares = pares.filter(([, v]) => v != null && v !== '');
  if (!pares.length) return '';

  return `
    <section class="lanc-leitura-detalhes">
      <h3 class="h-eyebrow" style="margin-top:1.6rem;margin-bottom:0.65rem">Detalhes do pagamento</h3>
      <dl class="lanc-leitura-dl">
        ${pares.map(([k, v]) => `
          <dt>${esc(k)}</dt>
          <dd>${esc(v)}</dd>
        `).join('')}
      </dl>
    </section>`;
}

function linhaObs(o) {
  return `
    <li class="lanc-obs-item">
      <p class="lanc-obs-texto">${esc(o.texto)}</p>
      <p class="lanc-obs-meta">${esc(o.autor || 'operador')} · ${formatarTs(o.criado_em)}</p>
    </li>`;
}

function ligarGerenciar() {
  const l = estado.lancamento;
  const ef = l.dados_categoria?.estado_final;

  // Sempre liga: textarea de adicionar observacao.
  const tx = document.querySelector('#nova-obs');
  const btnAdd = document.querySelector('#btn-add-obs');
  if (tx && btnAdd) {
    tx.addEventListener('input', () => {
      btnAdd.disabled = tx.value.trim().length < 3;
    });
    btnAdd.addEventListener('click', async () => {
      const texto = tx.value.trim();
      if (!texto) return;
      btnAdd.setAttribute('aria-busy', 'true');
      btnAdd.disabled = true;
      const ok = await persistirObservacao(texto);
      btnAdd.removeAttribute('aria-busy');
      if (!ok) { btnAdd.disabled = false; return; }
      tx.value = '';
      mostrarToast('Observação adicionada.', 'ok', 1800);
      // Recarrega o drawer com dados frescos.
      await reabrirComDadosFrescos();
    });
  }

  // Modos finalizado: so botao fechar.
  if (ef) {
    document.querySelector('#btn-fechar-leitura')?.addEventListener('click', () => fecharModal(true));
    return;
  }

  // Modo gerenciar: liga botoes finalizar / cancelar-pos.
  document.querySelector('#btn-finalizar')?.addEventListener('click', async () => {
    if (!confirm('Confirma que o cliente buscou e o lançamento está finalizado?')) return;
    await aplicarEstadoFinal('finalizado', null);
  });
  document.querySelector('#btn-cancelar-pos')?.addEventListener('click', async () => {
    const motivo = prompt('Motivo do cancelamento:');
    if (motivo == null) return;
    if (motivo.trim().length < 3) {
      alert('Informe um motivo com ao menos 3 caracteres.');
      return;
    }
    await aplicarEstadoFinal('cancelado', motivo.trim());
  });
}

async function persistirObservacao(texto) {
  // Por enquanto, append em dados_categoria.observacoes (array). O backend
  // da proxima rodada migra isso pra tabela lancamento_observacao.
  const l = estado.lancamento;
  const obsAtuais = Array.isArray(l.dados_categoria?.observacoes)
    ? l.dados_categoria.observacoes : [];
  const obs = {
    texto,
    autor:     await pegarEmail(),
    criado_em: new Date().toISOString(),
  };
  const novosDados = { ...l.dados_categoria, observacoes: [...obsAtuais, obs] };

  const { error } = await supabase
    .from('lancamento')
    .update({ dados_categoria: novosDados, atualizado_em: new Date().toISOString() })
    .eq('id', l.id);

  if (error) {
    alert('Não foi possível salvar a observação: ' + error.message);
    return false;
  }
  // Atualiza o objeto em memoria.
  estado.lancamento = { ...l, dados_categoria: novosDados };
  return true;
}

async function aplicarEstadoFinal(tipo, motivo) {
  const l = estado.lancamento;
  const dados = {
    ...l.dados_categoria,
    estado_final:        tipo,
    estado_final_em:     new Date().toISOString(),
    estado_final_motivo: motivo,
  };
  const { error } = await supabase
    .from('lancamento')
    .update({ dados_categoria: dados })
    .eq('id', l.id);

  if (error) {
    document.querySelector('#erro-form')?.classList.remove('hidden');
    document.querySelector('#erro-form').textContent =
      'Não foi possível atualizar: ' + error.message;
    return;
  }
  estado.lancamento = { ...l, dados_categoria: dados };
  mostrarToast(tipo === 'finalizado' ? 'Lançamento finalizado.' : 'Lançamento cancelado.', 'ok', 2000);
  fecharModal(true);
  estado.aoSalvar();
}

async function reabrirComDadosFrescos() {
  const l = estado.lancamento;
  // Re-busca o lancamento (caso outro operador tenha mexido).
  const { data } = await supabase.from('lancamento').select('*').eq('id', l.id).maybeSingle();
  if (data) estado.lancamento = data;
  fecharModal(true);
  setTimeout(() => abrirModalEditarLancamento({
    lancamento: estado.lancamento,
    dataCaixa:  estado.dataCaixa,
    aoSalvar:   estado.aoSalvar,
  }), 280);
  estado.aoSalvar();
}

async function pegarEmail() {
  const { data } = await supabase.auth.getSession();
  return data?.session?.user?.email || 'operador';
}

// ─── Helpers compartilhados pelos modos read-only ────────────────────────
function corBgCat(cat) {
  const map = {
    cartao: 'var(--cat-cartao-bg)',  pix: 'var(--cat-pix-bg)',
    dinheiro: 'var(--cat-dinheiro-bg)', cancelado: 'var(--cat-cancelado-bg)',
    cartao_link: 'var(--cat-link-bg)', obs: 'var(--cat-obs-bg)',
  };
  return map[cat] || 'var(--c-papel-2)';
}
function corTextoCat(cat) {
  const map = {
    cartao: 'var(--cat-cartao-text)', pix: 'var(--cat-pix-text)',
    dinheiro: 'var(--cat-dinheiro-text)', cancelado: 'var(--cat-cancelado-text)',
    cartao_link: 'var(--cat-link-text)', obs: 'var(--cat-obs-text)',
  };
  return map[cat] || 'var(--c-tinta-3)';
}
function formatarTs(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const dia = String(d.getDate()).padStart(2, '0');
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const hh  = String(d.getHours()).padStart(2, '0');
  const mm  = String(d.getMinutes()).padStart(2, '0');
  return `${dia}/${mes} ${hh}:${mm}`;
}
