// modal-editar-lancamento.js — Drawer multi-modo para editar/categorizar
// um lançamento ja existente. Tres modos detectados pelo estado real
// do enum (CP4 — backend deixou de usar dados_categoria.estado_final):
//
//   1. CATEGORIZAR  (estado=pendente, categoria=null) — formulario
//      completo com campos comuns + select de categoria + campos
//      dinamicos. Submit chama RPC categorizar_lancamento.
//   2. GERENCIAR    (estado=completo) — dados read-only, lista de
//      observacoes lida de lancamento_observacao, botoes finalizar e
//      cancelar (chamam marcar_finalizado / marcar_cancelado_pos),
//      textarea para nova observacao (chama adicionar_observacao).
//      Subscribe realtime em lancamento_observacao para sync cross-tab.
//   3. FINALIZADO   (estado=finalizado ou cancelado_pos) — banner do
//      desfecho + dados read-only + observacoes (so adicionar).
//
// Estados legados resolvido/cancelado entram no modo finalizado por
// compatibilidade.

import { supabase } from '../app/supabase.js';
import { log } from '../app/log.js';
import { abrirModal, fecharModal } from './modal.js';
import { CATEGORIAS, BANDEIRAS, MODALIDADES, STATUS_LINK, TIPOS_OBS,
         LABEL_CATEGORIA } from '../app/dominio.js';
import { mostrarToast } from '../app/notifications.js';
import { debounce } from '../app/utils.js';
import { instalarPopSelectsEm } from './pop-select.js';
import { instalarPopDatasEm }   from './pop-data.js';
import { temPermissaoSync }     from '../app/papeis.js';

// Janela default (em minutos) pra editar categoria após criação.
// Se a config lancamento.editar_categoria_minutos estiver setada
// no banco, prevalece. Esta constante e' fallback.
const JANELA_EDITAR_CAT_MIN_DEFAULT = 30;
let janelaEditarCategoriaMin = JANELA_EDITAR_CAT_MIN_DEFAULT;

// Carrega a janela do config (executa silenciosamente em background).
(async () => {
  try {
    const { data } = await supabase
      .from('config')
      .select('valor')
      .eq('chave', 'lancamento.editar_categoria_minutos')
      .maybeSingle();
    if (data?.valor != null) janelaEditarCategoriaMin = Number(data.valor) || JANELA_EDITAR_CAT_MIN_DEFAULT;
  } catch (_) { /* fallback default */ }
})();

// Ícones SVG inline reusados no layout amplo v2 (modo gerenciar).
const ICON_LAPIS = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11.6 2.4a1.4 1.4 0 0 1 2 2L5.5 12.5 2.5 13.5l1-3 8.1-8.1Z"/><path d="M10.5 3.5l2 2"/></svg>`;
const ICON_ALERTA = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 5.5v3M8 11h.01M8 1.5 1 14h14L8 1.5Z"/></svg>`;
const ICON_SETA = `<svg width="13" height="9" viewBox="0 0 16 10" fill="none" aria-hidden="true"><path d="M1 5 H14 M10 1 L14 5 L10 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// Estado interno do drawer (limpo a cada abertura).
let estado = null;

export function abrirModalEditarLancamento({ lancamento, dataCaixa, aoSalvar = () => {}, origemEvento = null } = {}) {
  estado = {
    lancamento,                              // pode ser null se for criacao direta
    dataCaixa,
    aoSalvar,
    origemEvento,                            // pra animacao origin-based dos sub-modos
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
  if (!l || l.categoria == null || l.estado === 'pendente' || l.estado === 'em_preenchimento') {
    return 'categorizar';
  }
  if (['finalizado','cancelado_pos','resolvido','cancelado'].includes(l.estado)) {
    return 'finalizado';
  }
  return 'gerenciar';
}

// ════════════════════════════════════════════════════════════════════════
// MODO 1 — CATEGORIZAR
// ════════════════════════════════════════════════════════════════════════
function abrirModoCategorizar() {
  const l = estado.lancamento;
  // Em estado pendente, lancamento existente também pode ser editado
  // sem categorizar OU excluído (com motivo). Sub-modos disponíveis
  // pelo gating de permissão no rodapé.
  const podeEditar = l && temPermissaoSync('lancamento.editar');
  const podeExcluir = l && temPermissaoSync('lancamento.excluir');

  abrirModal({
    lateral: false,
    origemEvento: estado.origemEvento,
    eyebrow: l ? `NF ${l.numero_nf} · em análise` : `Novo lançamento · ${formatarDataPt(estado.dataCaixa)}`,
    titulo:  l ? 'Categorizar lançamento.' : 'Adicionar uma página ao caixa.',
    conteudo: corpoFormCategorizar(),
    rodape: `
      <div id="erro-form" role="alert" aria-live="polite" class="hidden alert" style="margin-bottom:0.85rem"></div>
      ${(podeEditar || podeExcluir) ? `
        <div class="painel-acoes-secundarias">
          ${podeEditar  ? `<button type="button" id="btn-editar"  class="btn-link">✎ Editar sem categorizar</button>` : ''}
          ${podeExcluir ? `<button type="button" id="btn-excluir" class="btn-link" style="color:var(--c-alerta);text-decoration-color:rgba(154,42,31,0.4)">Excluir lançamento</button>` : ''}
        </div>` : ''}
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
  // Botões secundários: só aparecem pra lancamento existente em
  // pendente. Sub-modos editar/excluir reaproveitam funções do modo
  // gerenciar.
  document.querySelector('#btn-editar')?.addEventListener('click', () => abrirSubModoEditar());
  document.querySelector('#btn-excluir')?.addEventListener('click', () => abrirSubModoExcluir());
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

    // Caso A: lancamento ja existe em pendente -> usa RPC categorizar_lancamento
    //         (transicao pendente -> completo, validada no banco).
    // Caso B: lancamento ainda nao existe (criacao direta full) -> upsert_lancamento.
    const { error } = estado.lancamento?.id
      ? await supabase.rpc('categorizar_lancamento', {
          p_lancamento_id:   estado.lancamento.id,
          p_categoria:       payload.p_categoria,
          p_dados_categoria: payload.p_dados_categoria,
        })
      : await supabase.rpc('upsert_lancamento', payload);

    btn.removeAttribute('aria-busy');

    if (error) {
      // Validação esperada (NF duplicada etc) tem code conhecido — log.warn.
      // Falha real (rede/RPC) — log.erro pra Sentry.
      const codigoConhecido = ['23505', '23514', '42501', 'P0001'].includes(error.code);
      if (codigoConhecido) {
        log.warn(`erro de validação ao categorizar/upsert NF ${codigoConhecido ? error.code : ''}`, { code: error.code });
      } else {
        log.erro('falha ao categorizar/upsert lançamento', error, { lancamentoId: payload.p_id || payload.lancamento_id });
      }
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

    case 'disponivel_retirada':
      container.innerHTML = `
        ${campoTextarea('motivo_interno', 'Motivo interno (por que aguarda retirada)', { required: true, minlength: 10, maxlength: 240 })}
        ${campoTexto('previsao_retirada', 'Previsão de retirada', { type: 'date' })}

        <div class="mel-retirada-toggle-bloco mt-5">
          <label class="mel-toggle">
            <input type="checkbox" id="campo-pago" name="pago" />
            <span class="mel-toggle-pill"><span class="mel-toggle-dot"></span></span>
            <div>
              <span class="mel-toggle-title">Cliente já pagou</span>
              <span class="mel-toggle-sub">Marque pra registrar a forma e a data do pagamento</span>
            </div>
          </label>
        </div>

        <div id="bloco-pagamento" class="hidden mt-4">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            ${campoSelect('forma_pagamento', 'Forma de pagamento', ['Pix','Cartão','Dinheiro','Transferência','Outro'], { required: true })}
            ${campoTexto('data_pagamento', 'Data do pagamento', { type: 'date', required: true })}
          </div>
        </div>
      `;
      // Toggle pago expande sub-bloco
      const toggle = container.querySelector('#campo-pago');
      const bloco  = container.querySelector('#bloco-pagamento');
      toggle?.addEventListener('change', () => {
        const ativo = toggle.checked;
        bloco?.classList.toggle('hidden', !ativo);
        // se desativar, limpa filhos pra nao virem no payload
        if (!ativo) {
          bloco?.querySelectorAll('input, select').forEach(el => { el.value = ''; });
        }
        revalidar();
      });
      // Pre-popula estado salvo (modo edicao)
      if (estado.dadosCategoria?.pago) {
        toggle.checked = true;
        bloco?.classList.remove('hidden');
      }
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
    if (el.type === 'checkbox') {
      // Boolean explicito pra campos toggle (ex: pago em disponivel_retirada)
      if (el.checked) dadosCategoria[el.name] = true;
    } else if (el.name && el.value !== '') {
      dadosCategoria[el.name] = el.value;
    }
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
  // Editar/excluir
  if (m.includes('motivo da edição') || m.includes('motivo da exclusão')) return 'O motivo precisa ter pelo menos 10 caracteres.';
  if (m.includes('janela para editar categoria expirou')) return error.message;
  if (m.includes('nenhum campo enviado para edição')) return 'Nenhum campo foi alterado.';
  if (m.includes('lancamento.editar_categoria') || m.includes('permissão negada (lancamento.editar_categoria')) return 'Você não tem permissão para alterar a categoria.';
  if (m.includes('lancamento.editar') || m.includes('permissão negada (lancamento.editar')) return 'Você não tem permissão para editar lançamentos.';
  if (m.includes('lancamento.excluir') || m.includes('permissão negada (lancamento.excluir')) return 'Você não tem permissão para excluir lançamentos.';
  if (m.includes('lançamentos com estado')) return error.message;
  if (m.includes('já está excluido')) return 'Este lançamento já foi excluído.';
  // Categorizar/upsert
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
// MODOS 2/3 — GERENCIAR (estado=completo) e FINALIZADO (estado=finalizado |
// cancelado_pos | resolvido | cancelado).
// Observacoes vem de lancamento_observacao (tabela real, CP4).
// ════════════════════════════════════════════════════════════════════════
function abrirModoGerenciarOuFinalizado() {
  const l = estado.lancamento;

  abrirModal({
    lateral: false,
    amplo: true,
    origemEvento: estado.origemEvento,
    eyebrow: `Nota fiscal · ${l.numero_nf}`,
    titulo:  l.cliente_nome || '— sem cliente —',
    headerBadge: badgeEstado(l.estado),
    conteudo: corpoGerenciar(),
    rodape:   rodapeGerenciar(),
    onConfirmarFechar: () => { desligarRealtimeObs(); return true; },
  });

  ligarGerenciar();
  carregarObservacoes();   // popula linha do tempo + anotações
  ligarRealtimeObs();      // subscribe em lancamento_observacao
}

// Badge de estado mostrado no header do modal amplo.
function badgeEstado(est) {
  const map = {
    completo:      ['Em curso',   'curso'],
    finalizado:    ['Finalizado', 'ok'],
    resolvido:     ['Finalizado', 'ok'],
    cancelado_pos: ['Cancelado',  'alerta'],
    cancelado:     ['Cancelado',  'alerta'],
  };
  const [txt, tom] = map[est] || ['—', 'curso'];
  return `<span class="painel-header-badge painel-header-badge--${tom}">${esc(txt)}</span>`;
}

// Corpo do modo gerenciar — layout amplo split: esquerda 1/3 (resumo
// + linha do tempo / anotações com filtro), direita 2/3 (detalhes do
// pagamento + anotar  /  formulário de edição in-place).
function corpoGerenciar() {
  const l = estado.lancamento;
  const finalizadoOuCancelado = ['finalizado','cancelado_pos','resolvido','cancelado'].includes(l.estado);
  const ehCancelado = ['cancelado_pos','cancelado'].includes(l.estado);
  const tsFinal = l.resolvido_em || l.atualizado_em;
  const podeEditar = !finalizadoOuCancelado && temPermissaoSync('lancamento.editar');
  const detalhes = dadosCategoriaLeitura(l);

  return `
    <div class="mel2" id="mel2" data-modo="leitura" data-filtro="tudo">
      <div class="mel2-split">
        <aside class="mel2-esq">
          <div class="mel2-resumo">
            <span class="mel2-resumo-cat" style="background:${corBgCat(l.categoria)};color:${corTextoCat(l.categoria)}">
              ${esc(LABEL_CATEGORIA[l.categoria] || l.categoria)}
            </span>
            <span class="mel2-resumo-valor">${formatBRL(l.valor_nf)}</span>
            <span class="mel2-resumo-ped">Pedido ${esc(l.codigo_pedido)} · NF ${esc(l.numero_nf)}</span>
          </div>

          <div class="mel2-hist">
            <div class="mel2-filtro" role="group" aria-label="Filtrar histórico">
              <span class="mel2-filtro-ind" aria-hidden="true"></span>
              <button type="button" class="mel2-fbtn" data-f="tudo"  aria-selected="true">Tudo</button>
              <button type="button" class="mel2-fbtn" data-f="tempo" aria-selected="false">Linha do tempo</button>
              <button type="button" class="mel2-fbtn" data-f="anot"  aria-selected="false">Anotações</button>
            </div>
            <div data-grupo="tempo">
              <p class="mel2-sub">Linha do tempo</p>
              <ul class="mel2-tl" id="mel2-timeline">
                <li class="mel2-vazio">Carregando…</li>
              </ul>
            </div>
            <div data-grupo="anot">
              <p class="mel2-sub">Anotações</p>
              <ul class="mel2-anot" id="mel2-anotacoes">
                <li class="mel2-vazio">Carregando…</li>
              </ul>
            </div>
          </div>
        </aside>

        <section class="mel2-dir">
          <div class="mel2-dir-barra">
            <span class="mel2-dir-label" data-leitura>Detalhes do pagamento</span>
            <span class="mel2-dir-label" data-edicao hidden>Editar lançamento</span>
            ${podeEditar ? `
              <button type="button" id="mel2-btn-editar" class="mel2-editar" aria-label="Editar lançamento">
                ${ICON_LAPIS}<span>Editar</span>
              </button>` : ''}
          </div>

          <div data-leitura>
            ${finalizadoOuCancelado ? bannerFinal(ehCancelado, tsFinal) : ''}
            ${detalhes || `<p class="mel2-sem-detalhe">Sem detalhes de pagamento registrados para esta categoria.</p>`}
            <div class="mel2-anot-add">
              <p class="mel2-anot-add-titulo">Adicionar anotação</p>
              <textarea id="nova-obs" rows="2" maxlength="2000"
                        placeholder="ex.: avisei o cliente em 02/05, vence dia 05/05"></textarea>
              <button type="button" id="btn-add-obs" class="mel2-btn-anotar" disabled>Anotar</button>
            </div>
          </div>

          <div data-edicao hidden>
            ${podeEditar ? formEditarInline(l) : ''}
          </div>
        </section>
      </div>
    </div>
  `;
}

// Formulário de edição renderizado in-place na direita do modal amplo.
// Espelha o mockup /demo-modal (.dmm-form): campos básicos (NF, pedido,
// cliente, categoria, valor) sempre editáveis no topo; separador; o
// 'Motivo da edição'; e por fim o bloco de detalhes da categoria, que
// fica bloqueado até o motivo ter 10+ caracteres.
function formEditarInline(l) {
  const podeEditarCategoria = temPermissaoSync('lancamento.editar_categoria');
  return `
    <form id="form-editar" novalidate class="mel2-form">
      <div class="mel2-grid2">
        <label class="mel2-campo">
          <span class="mel2-campo-label">Número da NF</span>
          <input id="ed-numero_nf" name="numero_nf" maxlength="15" value="${esc(l.numero_nf || '')}" />
        </label>
        <label class="mel2-campo">
          <span class="mel2-campo-label">Código do pedido</span>
          <input id="ed-codigo_pedido" name="codigo_pedido" maxlength="20" value="${esc(l.codigo_pedido || '')}" />
        </label>
      </div>
      <label class="mel2-campo">
        <span class="mel2-campo-label">Cliente</span>
        <input id="ed-cliente_nome" name="cliente_nome" maxlength="120" value="${esc(l.cliente_nome || '')}" />
      </label>

      <div class="mel2-form-sep"></div>

      <div class="mel2-grid2">
        ${podeEditarCategoria ? `
          <label class="mel2-campo">
            <span class="mel2-campo-label">Categoria</span>
            <select id="ed-categoria" name="categoria">
              ${CATEGORIAS.map(c => `<option value="${c.valor}" ${c.valor === l.categoria ? 'selected' : ''}>${c.rotulo}</option>`).join('')}
            </select>
          </label>` : `
          <label class="mel2-campo">
            <span class="mel2-campo-label">Categoria</span>
            <input value="${esc(LABEL_CATEGORIA[l.categoria] || l.categoria)}" readonly />
          </label>`}
        <label class="mel2-campo">
          <span class="mel2-campo-label">Valor (R$)</span>
          <input id="ed-valor_nf" name="valor_nf" type="number" step="0.01" min="0.01"
                 inputmode="decimal" value="${esc(l.valor_nf ?? '')}" />
        </label>
      </div>

      <label class="mel2-campo mel2-campo--motivo">
        <span class="mel2-campo-label">Motivo da edição <em class="mel2-req">*</em></span>
        <textarea id="ed-motivo" name="motivo" rows="2" minlength="10" maxlength="500" required
                  placeholder="Explique a edição — mínimo 10 caracteres"></textarea>
      </label>

      <div class="mel2-edit-campos" id="mel2-edit-campos" data-bloqueado="true">
        <div class="mel2-edit-aviso">
          ${ICON_ALERTA}<span>Preencha o motivo da edição acima para liberar os detalhes da categoria.</span>
        </div>
        <div class="mel2-edit-form" id="mel2-edit-detalhes">
          ${camposDetalheEdicao(l, podeEditarCategoria)}
        </div>
      </div>
      <div id="erro-edit" role="alert" aria-live="polite" class="mel2-erro hidden"></div>
    </form>
  `;
}

// Campos de detalhe da categoria (dados_categoria) renderizados dentro
// do bloco bloqueado da edição in-place. Espelham o .dmm-cat-form do
// mockup /demo-modal. Pré-preenchidos com o que já está salvo. Cada
// campo carrega data-cd com a chave de dados_categoria pra coleta.
function camposDetalheEdicao(l, editavel) {
  const d     = l.dados_categoria || {};
  const ro    = editavel ? '' : 'readonly';
  const roSel = editavel ? '' : 'disabled';

  const txt = (name, label, valor, tipo = 'text') => `
    <label class="mel2-campo">
      <span class="mel2-campo-label">${esc(label)}</span>
      <input id="ed-cd-${name}" data-cd="${name}" type="${tipo}" value="${esc(valor ?? '')}" ${ro} />
    </label>`;
  const area = (name, label, valor) => `
    <label class="mel2-campo">
      <span class="mel2-campo-label">${esc(label)}</span>
      <textarea id="ed-cd-${name}" data-cd="${name}" rows="2" ${ro}>${esc(valor ?? '')}</textarea>
    </label>`;
  const sel = (name, label, valor, opcoes) => `
    <label class="mel2-campo">
      <span class="mel2-campo-label">${esc(label)}</span>
      <select id="ed-cd-${name}" data-cd="${name}" ${roSel}>
        <option value="">— selecionar —</option>
        ${opcoes.map(o => `<option value="${esc(o)}" ${String(o) === String(valor ?? '') ? 'selected' : ''}>${esc(o)}</option>`).join('')}
      </select>
    </label>`;
  const grid = (a, b) => `<div class="mel2-grid2">${a}${b}</div>`;

  switch (l.categoria) {
    case 'pix':
      return grid(
          txt('comprovante_id_externo', 'Identificador do comprovante', d.comprovante_id_externo),
          txt('data_hora_pix', 'Data e hora do Pix', (d.data_hora_pix || '').slice(0, 16), 'datetime-local'))
        + txt('chave_recebedora', 'Chave Pix recebedora', d.chave_recebedora)
        + txt('nome_remetente', 'Nome do remetente', d.nome_remetente);

    case 'cartao':
      return txt('codigo_autorizacao', 'Código de autorização', d.codigo_autorizacao)
        + grid(
            sel('bandeira', 'Bandeira', d.bandeira, BANDEIRAS),
            sel('modalidade', 'Modalidade', d.modalidade, MODALIDADES))
        + grid(
            txt('parcelas', 'Parcelas', d.parcelas, 'number'),
            txt('ultimos_4_digitos', 'Últimos 4 dígitos', d.ultimos_4_digitos));

    case 'dinheiro':
      return `
        <label class="mel2-campo">
          <span class="mel2-campo-label">Vendedora que recebeu</span>
          <select id="ed-cd-vendedora_id" data-cd="vendedora_id" ${roSel}>
            <option value="${esc(d.vendedora_id || '')}" selected>${esc(d.vendedora_nome_cache || '— selecionar —')}</option>
          </select>
        </label>`
        + grid(
            txt('valor_recebido', 'Valor recebido (R$)', d.valor_recebido, 'number'),
            txt('troco', 'Troco (R$)', d.troco, 'number'))
        + area('observacao_caixa', 'Observação', d.observacao_caixa);

    case 'cancelado':
      return area('motivo_cancelamento', 'Motivo do cancelamento', d.motivo_cancelamento)
        + grid(
            txt('cancelado_por', 'Cancelado por', d.cancelado_por),
            txt('data_cancelamento', 'Data do cancelamento', (d.data_cancelamento || '').slice(0, 10), 'date'))
        + txt('numero_estorno', 'Número do estorno', d.numero_estorno);

    case 'cartao_link':
      return txt('link_url', 'URL do link de pagamento', d.link_url, 'url')
        + grid(
            sel('status_link', 'Status', d.status_link, STATUS_LINK),
            txt('data_envio_link', 'Data de envio', (d.data_envio_link || '').slice(0, 16), 'datetime-local'));

    case 'obs':
      return sel('tipo_obs', 'Tipo de observação', d.tipo_obs, TIPOS_OBS)
        + area('descricao', 'Descrição', d.descricao);

    case 'disponivel_retirada':
      return area('motivo_interno', 'Motivo interno', d.motivo_interno)
        + grid(
            txt('previsao_retirada', 'Previsão de retirada', (d.previsao_retirada || '').slice(0, 10), 'date'),
            txt('forma_pagamento', 'Forma de pagamento', d.forma_pagamento))
        + txt('data_pagamento', 'Data do pagamento', (d.data_pagamento || '').slice(0, 10), 'date');

    default:
      return '<p class="mel2-edit-nota">Sem detalhes específicos para esta categoria.</p>';
  }
}

function rodapeGerenciar() {
  const l  = estado.lancamento;
  const finalizadoOuCancelado = ['finalizado','cancelado_pos','resolvido','cancelado'].includes(l.estado);
  const podeEditar  = !finalizadoOuCancelado && temPermissaoSync('lancamento.editar');
  const podeExcluir = temPermissaoSync('lancamento.excluir');

  // OBS pode ser resolvida em qualquer estado (exceto excluido — esse
  // nao chega aqui pq nem aparece no caixa). Backend ja permite isso
  // via resolver_obs_lancamento sem janela de tempo.
  const ehObs = l.categoria === 'obs';
  const podeResolver = ehObs && temPermissaoSync('lancamento.editar_categoria');

  return `
    <div id="erro-form" role="alert" aria-live="polite" class="hidden alert" style="margin-bottom:0.7rem"></div>

    <div id="mel2-rodape-leitura" class="mel2-rodape">
      <a href="/lancamento/${esc(l.id)}" data-link id="link-historico-completo" class="mel2-link-hist">
        Ver histórico completo ${ICON_SETA}
      </a>
      <div class="mel2-rodape-acoes">
        ${podeResolver ? `<button type="button" id="btn-resolver-obs" class="btn-link mel2-acao-musgo">↻ Resolver OBS</button>` : ''}
        ${podeExcluir  ? `<button type="button" id="btn-excluir" class="btn-link mel2-acao-alerta">Excluir</button>` : ''}
        ${finalizadoOuCancelado ? `
          <button type="button" id="btn-fechar-leitura" class="btn-secundario">Fechar</button>
        ` : `
          <button type="button" id="btn-cancelar-pos" class="btn-secundario btn-secundario--alerta">✕ Cancelar lançamento</button>
          <button type="button" id="btn-finalizar" class="btn-primary">✓ Finalizar</button>
        `}
      </div>
    </div>

    <div id="mel2-rodape-edicao" class="mel2-rodape" hidden>
      <span class="mel2-rodape-aviso">A edição preserva o histórico — gera registro com motivo e autor.</span>
      <div class="mel2-rodape-acoes">
        <button type="button" id="btn-edit-cancelar" class="btn-link">Cancelar edição</button>
        <button type="submit" form="form-editar" id="btn-edit-salvar" class="btn-primary" disabled>Salvar edição</button>
      </div>
    </div>`;
}

function bannerFinal(cancelado, ts) {
  return `
    <div class="lanc-banner lanc-banner--${cancelado ? 'cancelado' : 'finalizado'}">
      <div class="lanc-banner-icone">${cancelado ? '✕' : '✓'}</div>
      <div>
        <p class="lanc-banner-titulo">${cancelado ? 'Cancelado' : 'Finalizado'}${ts ? ' em ' + formatarTs(ts) : ''}</p>
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
  else if (cat === 'disponivel_retirada') pares = [
    ['Motivo interno',   d.motivo_interno],
    ['Previsão retirada', d.previsao_retirada],
    ['Pago',             d.pago ? 'Sim' : null],
    ['Forma pagamento',  d.forma_pagamento],
    ['Data pagamento',   d.data_pagamento],
  ];

  pares = pares.filter(([, v]) => v != null && v !== '');
  if (!pares.length) return '';

  // Sem heading interno: o rótulo "Detalhes do pagamento" já vem na
  // barra superior da direita (.mel2-dir-label), igual ao mockup.
  return `
    <section class="lanc-leitura-detalhes">
      <dl class="lanc-leitura-dl">
        ${pares.map(([k, v]) => `
          <dt>${esc(k)}</dt>
          <dd>${esc(v)}</dd>
        `).join('')}
      </dl>
    </section>`;
}

// Rótulo/cor da linha do tempo conforme a fonte da observação-evento.
function rotuloFonte(fonte) {
  return ({
    edicao: 'Edição', resolucao_obs: 'Resolução de OBS', exclusao: 'Exclusão',
    sistema: 'Sistema', finalizacao: 'Finalização', cancelamento: 'Cancelamento',
  })[fonte] || 'Evento';
}
function toneFonte(fonte) {
  return ({
    edicao: 'edicao', resolucao_obs: 'resolucao', exclusao: 'alerta',
    cancelamento: 'alerta', finalizacao: 'ok', sistema: 'sistema',
  })[fonte] || 'sistema';
}

function itemTimeline(ev) {
  const autor = (ev.autor || 'sistema').split('@')[0];
  return `
    <li class="mel2-tl-item" data-tone="${esc(ev.tone)}">
      <span class="mel2-tl-dot"></span>
      <div class="mel2-tl-corpo">
        <div class="mel2-tl-head">
          <span class="mel2-tl-tipo">${esc(ev.tipo)}</span>
          <time>${formatarTs(ev.criado_em)}</time>
        </div>
        <p class="mel2-tl-texto">${esc(ev.texto)}</p>
        <p class="mel2-tl-autor">por ${esc(autor)}</p>
      </div>
    </li>`;
}
function itemAnotacao(o) {
  // Email truncado em "@" para visual mais limpo.
  const autor = (o.autor_email || 'operador').split('@')[0];
  return `
    <li class="mel2-anot-item" data-obs-id="${esc(o.id)}">
      <p class="mel2-anot-texto">${esc(o.texto)}</p>
      <p class="mel2-anot-meta">${esc(autor)} · ${formatarTs(o.criado_em)}</p>
    </li>`;
}

// ─── Carrega observacoes da tabela lancamento_observacao ─────────────
async function carregarObservacoes() {
  const { data, error } = await supabase
    .from('lancamento_observacao')
    .select('id, texto, autor_email, criado_em, fonte')
    .eq('lancamento_id', estado.lancamento.id)
    .order('criado_em', { ascending: false });

  if (error) {
    const tl = document.querySelector('#mel2-timeline');
    const an = document.querySelector('#mel2-anotacoes');
    const msg = `<li class="mel2-vazio">Não foi possível carregar.</li>`;
    if (tl) tl.innerHTML = msg;
    if (an) an.innerHTML = msg;
    return;
  }
  estado.observacoes = data || [];
  renderHistorico();
}

// Separa as observações: fonte 'manual' (ou vazia) vira Anotação;
// o resto vira evento da Linha do tempo. O evento sintético de
// Criação é derivado do próprio lançamento, quando disponível.
function renderHistorico() {
  const l = estado.lancamento;
  const obs = estado.observacoes || [];
  const anotacoes  = obs.filter(o => !o.fonte || o.fonte === 'manual');
  const eventosObs = obs.filter(o => o.fonte && o.fonte !== 'manual');

  const eventos = [];
  if (l.criado_em) {
    eventos.push({
      tipo: 'Criação', tone: 'criacao', criado_em: l.criado_em,
      texto: `NF ${l.numero_nf} registrada — ${formatBRL(l.valor_nf)}`,
      autor: l.criado_por,
    });
  }
  for (const o of eventosObs) {
    eventos.push({
      tipo: rotuloFonte(o.fonte), tone: toneFonte(o.fonte),
      criado_em: o.criado_em, texto: o.texto, autor: o.autor_email,
    });
  }
  eventos.sort((a, b) => new Date(a.criado_em) - new Date(b.criado_em));

  const tl = document.querySelector('#mel2-timeline');
  if (tl) {
    tl.innerHTML = eventos.length
      ? eventos.map(itemTimeline).join('')
      : `<li class="mel2-vazio">Sem eventos registrados.</li>`;
  }
  const an = document.querySelector('#mel2-anotacoes');
  if (an) {
    an.innerHTML = anotacoes.length
      ? anotacoes.map(itemAnotacao).join('')
      : `<li class="mel2-vazio">Nenhuma anotação ainda.</li>`;
  }
}

// ─── Realtime: subscribe em lancamento_observacao do lancamento atual ─
let canalObs = null;
function ligarRealtimeObs() {
  desligarRealtimeObs();
  const lid = estado.lancamento.id;
  canalObs = supabase.channel(`lanc-obs-${lid}`)
    .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'lancamento_observacao',
          filter: `lancamento_id=eq.${lid}` },
        (payload) => {
          const nova = payload.new;
          const arr = estado.observacoes || [];
          // Anti-duplicacao: se ja temos pela inserção otimista, ignora.
          if (arr.some(o => o.id === nova.id)) return;
          estado.observacoes = [nova, ...arr];
          renderHistorico();
          // Flash ambar leve na anotação recem-chegada
          requestAnimationFrame(() => {
            const el = document.querySelector(`.mel2-anot-item[data-obs-id="${nova.id}"]`);
            if (el) el.classList.add('lanc-row--flash');
          });
        })
    .subscribe();
}
function desligarRealtimeObs() {
  if (canalObs) {
    supabase.removeChannel(canalObs).catch(() => {});
    canalObs = null;
  }
}

function ligarGerenciar() {
  const l = estado.lancamento;
  const finalizadoOuCancelado = ['finalizado','cancelado_pos','resolvido','cancelado'].includes(l.estado);
  const mel2 = document.querySelector('#mel2');

  // Link "Ver histórico completo" — fecha modal antes da navegação client-side
  document.querySelector('#link-historico-completo')?.addEventListener('click', () => {
    desligarRealtimeObs();
    fecharModal(true);
  });

  // Filtro Tudo / Linha do tempo / Anotações (pílula deslizante).
  ligarFiltroHistorico();

  // Adicionar anotação.
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
      mostrarToast('Anotação adicionada.', 'ok', 1800);
      await carregarObservacoes();   // re-fetch reflete o novo + outros que chegaram
    });
  }

  // Botões secundários do rodapé.
  document.querySelector('#btn-excluir')?.addEventListener('click', () => abrirSubModoExcluir());
  document.querySelector('#btn-resolver-obs')?.addEventListener('click', () => abrirSubModoResolverObs());
  document.querySelector('#btn-fechar-leitura')?.addEventListener('click', () => {
    desligarRealtimeObs(); fecharModal(true);
  });

  // Editar in-place: o lápis troca a direita por formulário; o rodapé
  // alterna entre o grupo de leitura e o de edição.
  const btnEditar = document.querySelector('#mel2-btn-editar');
  if (btnEditar && mel2) {
    btnEditar.addEventListener('click', () => entrarModoEdicao(mel2));
    document.querySelector('#btn-edit-cancelar')?.addEventListener('click', () => sairModoEdicao(mel2));
    ligarEdicaoInline();
  }

  // Modos finalizado/cancelado: sem finalizar/cancelar.
  if (finalizadoOuCancelado) return;

  document.querySelector('#btn-finalizar')?.addEventListener('click', async () => {
    if (!confirm('Confirma que o cliente buscou e o lançamento está finalizado?')) return;
    await chamarMarcarFinalizado();
  });
  document.querySelector('#btn-cancelar-pos')?.addEventListener('click', async () => {
    const motivo = prompt('Motivo do cancelamento:');
    if (motivo == null) return;
    if (motivo.trim().length < 5) {
      alert('Informe um motivo com ao menos 5 caracteres.');
      return;
    }
    await chamarMarcarCanceladoPos(motivo.trim());
  });
}

// ─── Alternância leitura ⇄ edição (in-place na direita) ──────────────
function entrarModoEdicao(mel2) {
  mel2.dataset.modo = 'edicao';
  mel2.querySelectorAll('[data-leitura]').forEach(el => { el.hidden = true; });
  mel2.querySelectorAll('[data-edicao]').forEach(el => { el.hidden = false; });
  document.querySelector('#mel2-rodape-leitura')?.setAttribute('hidden', '');
  document.querySelector('#mel2-rodape-edicao')?.removeAttribute('hidden');
  document.querySelector('#mel2-btn-editar')?.classList.add('is-ativo');
  document.querySelector('#ed-motivo')?.focus();
}
function sairModoEdicao(mel2) {
  mel2.dataset.modo = 'leitura';
  mel2.querySelectorAll('[data-leitura]').forEach(el => { el.hidden = false; });
  mel2.querySelectorAll('[data-edicao]').forEach(el => { el.hidden = true; });
  document.querySelector('#mel2-rodape-edicao')?.setAttribute('hidden', '');
  document.querySelector('#mel2-rodape-leitura')?.removeAttribute('hidden');
  document.querySelector('#mel2-btn-editar')?.classList.remove('is-ativo');
}

// ─── Filtro do histórico com indicador deslizante ────────────────────
function ligarFiltroHistorico() {
  const grupo = document.querySelector('.mel2-filtro');
  const mel2  = document.querySelector('#mel2');
  if (!grupo || !mel2) return;
  const ind = grupo.querySelector('.mel2-filtro-ind');
  const botoes = [...grupo.querySelectorAll('.mel2-fbtn')];

  const mover = (btn) => {
    ind.style.width = `${btn.offsetWidth}px`;
    ind.style.left  = `${btn.offsetLeft}px`;
  };
  requestAnimationFrame(() => {
    mover(grupo.querySelector('.mel2-fbtn[aria-selected="true"]') || botoes[0]);
  });

  botoes.forEach(b => {
    b.addEventListener('click', () => {
      const alvo = b.dataset.f;
      botoes.forEach(x => x.setAttribute('aria-selected', String(x.dataset.f === alvo)));
      mover(b);
      mel2.dataset.filtro = alvo;
    });
  });
}

// ─── Formulário de edição in-place ───────────────────────────────────
// O motivo destrava o bloco de detalhes da categoria (10+ chars). Os
// campos básicos ficam sempre editáveis. Submit usa editar_lancamento.
function ligarEdicaoInline() {
  const form = document.querySelector('#form-editar');
  if (!form) return;
  const l = estado.lancamento;
  const podeEditarCategoria = temPermissaoSync('lancamento.editar_categoria');
  const motivoEl   = document.querySelector('#ed-motivo');
  const campos     = document.querySelector('#mel2-edit-campos');
  const detalhesEl = document.querySelector('#mel2-edit-detalhes');
  const erroEl     = document.querySelector('#erro-edit');
  const btnSalvar  = document.querySelector('#btn-edit-salvar');
  const catSel     = document.querySelector('#ed-categoria');

  // Categoria cujos campos de detalhe estão renderizados agora. Vira
  // null se o operador trocar a categoria — os detalhes da nova
  // categoria são preenchidos depois, na tela completa do lançamento.
  let catDetalhe = l.categoria;

  const sincronizar = () => {
    const motivoOk = (motivoEl.value || '').trim().length >= 10;
    campos.dataset.bloqueado = motivoOk ? 'false' : 'true';
    detalhesEl.querySelectorAll('input:not([readonly]), select:not([disabled]), textarea:not([readonly])')
      .forEach(c => { c.disabled = !motivoOk; });
    if (btnSalvar) btnSalvar.disabled = !motivoOk;
  };

  // Popula o select de vendedora (categoria dinheiro) de forma assíncrona.
  const popularVendedoras = () => {
    const vsel = detalhesEl.querySelector('#ed-cd-vendedora_id');
    if (!vsel) return;
    supabase.from('vendedora').select('id, nome').eq('ativa', true).order('nome')
      .then(({ data }) => {
        if (!data || !detalhesEl.contains(vsel)) return;
        const atual = vsel.value;
        const estavaDesabilitado = vsel.disabled;
        vsel.innerHTML = `<option value="">— selecionar —</option>`
          + data.map(v => `<option value="${esc(v.id)}" ${v.id === atual ? 'selected' : ''}>${esc(v.nome)}</option>`).join('');
        vsel.disabled = estavaDesabilitado;
      });
  };

  if (l.categoria === 'dinheiro' && podeEditarCategoria) popularVendedoras();
  sincronizar();
  motivoEl.addEventListener('input', sincronizar);

  // Trocar a categoria: detalhes da MESMA categoria continuam editáveis;
  // ao escolher OUTRA categoria, mostra aviso (detalhes preenchidos depois).
  catSel?.addEventListener('change', () => {
    if (catSel.value === l.categoria) {
      catDetalhe = l.categoria;
      detalhesEl.innerHTML = camposDetalheEdicao(l, podeEditarCategoria);
      if (l.categoria === 'dinheiro' && podeEditarCategoria) popularVendedoras();
    } else {
      catDetalhe = null;
      detalhesEl.innerHTML = `<p class="mel2-edit-nota">Os detalhes específicos de `
        + `${esc(LABEL_CATEGORIA[catSel.value] || catSel.value)} são preenchidos na tela `
        + `completa do lançamento depois de salvar a nova categoria.</p>`;
    }
    sincronizar();
  });

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    erroEl.classList.add('hidden');

    const f = (id) => document.querySelector(`#${id}`);
    const dados = {};
    const novoNumero  = f('ed-numero_nf')?.value.trim();
    const novoCodigo  = f('ed-codigo_pedido')?.value.trim();
    const novoCliente = f('ed-cliente_nome')?.value.trim();
    const novoValor   = Number(f('ed-valor_nf')?.value);
    const novaCat     = f('ed-categoria')?.value || null;

    if (novoNumero  && novoNumero  !== (l.numero_nf || ''))     dados.numero_nf     = novoNumero;
    if (novoCodigo  && novoCodigo  !== (l.codigo_pedido || '')) dados.codigo_pedido = novoCodigo;
    if (novoCliente && novoCliente !== (l.cliente_nome || ''))  dados.cliente_nome  = novoCliente;
    if (novoValor   && novoValor   !== Number(l.valor_nf))      dados.valor_nf      = novoValor;
    if (novaCat     && novaCat     !== l.categoria)             dados.categoria     = novaCat;

    // Detalhes da categoria → dados_categoria. A RPC editar_lancamento
    // substitui o jsonb inteiro, então mandamos o objeto completo
    // (valores já salvos + edições). Só quando a categoria não mudou.
    if (podeEditarCategoria && catDetalhe === l.categoria) {
      const detalheEls = detalhesEl.querySelectorAll('[data-cd]');
      if (detalheEls.length) {
        const dcat = { ...(l.dados_categoria || {}) };
        let mudou = false;
        detalheEls.forEach(el => {
          const key = el.dataset.cd;
          const bruto = el.value;
          if (bruto == null || bruto === '') {
            if (dcat[key] != null) { delete dcat[key]; mudou = true; }
            return;
          }
          const val = el.type === 'number' ? Number(bruto) : bruto;
          if (String(dcat[key] ?? '') !== String(val)) mudou = true;
          dcat[key] = val;
        });
        if (mudou) {
          if (l.categoria === 'dinheiro' && dcat.vendedora_id) {
            const opt = detalhesEl.querySelector('#ed-cd-vendedora_id')?.selectedOptions?.[0];
            if (opt && opt.value) dcat.vendedora_nome_cache = opt.textContent.trim();
          }
          dados.dados_categoria = dcat;
        }
      }
    }

    if (Object.keys(dados).length === 0) {
      erroEl.classList.remove('hidden');
      erroEl.textContent = 'Nenhum campo foi alterado.';
      return;
    }

    if (btnSalvar) { btnSalvar.setAttribute('aria-busy', 'true'); btnSalvar.disabled = true; }

    const { data, error } = await supabase.rpc('editar_lancamento', {
      p_lancamento_id: l.id,
      p_dados:         dados,
      p_motivo:        motivoEl.value.trim(),
    });

    if (btnSalvar) btnSalvar.removeAttribute('aria-busy');

    if (error) {
      if (btnSalvar) btnSalvar.disabled = false;
      erroEl.classList.remove('hidden');
      erroEl.textContent = traduzirErroBanco(error);
      log.warn('falha ao editar lancamento', { code: error.code, msg: error.message });
      return;
    }

    if (data) estado.lancamento = data;
    mostrarToast('Lançamento editado.', 'ok', 2200);
    estado.aoSalvar();
    desligarRealtimeObs();
    fecharModal(true);
  });
}

// ════════════════════════════════════════════════════════════════════════
// SUB-MODOS — Editar e Excluir (disponiveis em pendente/completo/finalizado).
// Substituem o conteudo do drawer atual; "Voltar" usa voltarAoModoOriginal()
// que decide entre categorizar (pendente) e gerenciar (completo+).
// Realtime de observacao e desligado durante estes sub-modos pra evitar
// estado intermediario.
// ════════════════════════════════════════════════════════════════════════

function voltarAoModoOriginal() {
  const l = estado.lancamento;
  if (!l) return fecharModal(false);
  // Modo categorizar pra pendente/em_preenchimento; gerenciar/finalizado pro resto
  if (l.estado === 'pendente' || l.estado === 'em_preenchimento') {
    return abrirModoCategorizar();
  }
  return abrirModoGerenciarOuFinalizado();
}

function abrirSubModoEditar() {
  const l = estado.lancamento;
  desligarRealtimeObs();

  // Janela de 30min foi REMOVIDA — categoria pode ser editada
  // enquanto o caixa estiver aberto/em_conferencia. A checagem real
  // fica no backend (RPC editar_lancamento valida o caixa.estado).
  // Aqui liberamos pra qualquer permissionado.
  const podeEditarCategoria = temPermissaoSync('lancamento.editar_categoria');

  abrirModal({
    lateral: false,
    origemEvento: estado.origemEvento,
    eyebrow: `NF ${l.numero_nf} · editar`,
    titulo:  'Editar lançamento.',
    conteudo: `
      <p class="text-body" style="font-size:0.9rem;color:var(--c-tinta-3);margin-bottom:1.2rem;line-height:1.5">
        Edição de campos preserva o histórico do lançamento — toda alteração
        gera observação registrada com motivo e autor.
      </p>

      <form id="form-editar" novalidate>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div class="field" style="margin-bottom:0">
            <label class="field-label" for="ed-numero_nf">Número da NF</label>
            <input id="ed-numero_nf" name="numero_nf" maxlength="15" class="field-input"
                   value="${esc(l.numero_nf || '')}" />
          </div>
          <div class="field" style="margin-bottom:0">
            <label class="field-label" for="ed-codigo_pedido">Código do pedido</label>
            <input id="ed-codigo_pedido" name="codigo_pedido" maxlength="20" class="field-input"
                   value="${esc(l.codigo_pedido || '')}" />
          </div>
        </div>
        <div class="field mt-5">
          <label class="field-label" for="ed-cliente_nome">Cliente</label>
          <input id="ed-cliente_nome" name="cliente_nome" maxlength="120" class="field-input"
                 value="${esc(l.cliente_nome || '')}" />
        </div>
        <div class="field mt-5">
          <label class="field-label" for="ed-valor_nf">Valor (R$)</label>
          <input id="ed-valor_nf" name="valor_nf" type="number" step="0.01" min="0.01" class="field-input"
                 inputmode="decimal" value="${esc(l.valor_nf ?? '')}" />
        </div>

        <div class="mt-7 pt-6" style="border-top:1px solid var(--c-papel-3)">
          <p class="h-eyebrow" style="margin:0 0 0.5rem">Forma de pagamento</p>
          ${podeEditarCategoria ? `
            <p class="text-body" style="font-size:0.82rem;color:var(--c-tinta-3);margin-bottom:0.85rem">
              Pode trocar a categoria enquanto o caixa estiver aberto.
            </p>
            <div class="field" style="margin-bottom:0">
              <label class="field-label" for="ed-categoria">Categoria</label>
              <select id="ed-categoria" name="categoria" class="field-input">
                ${CATEGORIAS.map(c => `
                  <option value="${c.valor}" ${c.valor === l.categoria ? 'selected' : ''}>${c.rotulo}</option>
                `).join('')}
              </select>
            </div>
            <p class="text-body" style="font-size:0.78rem;color:var(--c-tinta-3);margin-top:0.5rem;font-style:italic">
              Para alterar detalhes específicos da categoria (chave Pix, autorização do cartão, etc),
              use a tela completa do lançamento após salvar a categoria nova.
            </p>
          ` : `
            <p class="text-body" style="font-size:0.82rem;color:var(--c-tinta-3);margin-bottom:0">
              Você não tem permissão para alterar a categoria.
            </p>
          `}
        </div>

        <div class="field mt-7 pt-6" style="border-top:1px solid var(--c-papel-3);margin-bottom:0">
          <label class="field-label" for="ed-motivo">
            Motivo da edição <span style="color:var(--c-alerta)">*</span>
            <span style="font-weight:400;color:var(--c-tinta-3);font-size:0.82rem">(mínimo 10 caracteres)</span>
          </label>
          <textarea id="ed-motivo" name="motivo" rows="3" minlength="10" maxlength="500" required
                    class="field-input" style="resize:vertical"
                    placeholder="Ex.: cliente informou valor correto após emissão"></textarea>
        </div>
      </form>
    `,
    rodape: `
      <div id="erro-edit" role="alert" aria-live="polite" class="hidden alert" style="margin-bottom:0.85rem"></div>
      <div class="painel-rodape-acoes">
        <button type="button" id="btn-edit-voltar" class="btn-link">← Voltar</button>
        <button type="submit" form="form-editar" id="btn-edit-salvar" class="btn-primary" disabled>
          Salvar edição
        </button>
      </div>`,
    onConfirmarFechar: () => true,
  });

  ligarSubModoEditar(podeEditarCategoria);
}

function ligarSubModoEditar(podeEditarCategoria) {
  const form = document.querySelector('#form-editar');
  if (!form) return;
  instalarPopSelectsEm(form);

  const l = estado.lancamento;
  const f = (id) => document.querySelector(`#${id}`);
  const erroEl = f('erro-edit');
  const btnSalvar = f('btn-edit-salvar');
  const motivoEl = f('ed-motivo');

  setTimeout(() => f('ed-numero_nf')?.focus(), 360);

  // Habilita Salvar quando tem alteração + motivo válido
  const reavaliar = () => {
    const motivoOk = (motivoEl?.value || '').trim().length >= 10;
    btnSalvar.disabled = !motivoOk;
  };
  form.addEventListener('input', reavaliar);

  f('btn-edit-voltar').addEventListener('click', () => voltarAoModoOriginal());

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    erroEl.classList.add('hidden');

    const dados = {};
    const novoNumero  = f('ed-numero_nf').value.trim();
    const novoCodigo  = f('ed-codigo_pedido').value.trim();
    const novoCliente = f('ed-cliente_nome').value.trim();
    const novoValor   = Number(f('ed-valor_nf').value);
    const novaCat     = podeEditarCategoria ? f('ed-categoria')?.value : null;

    if (novoNumero  && novoNumero  !== (l.numero_nf || ''))     dados.numero_nf     = novoNumero;
    if (novoCodigo  && novoCodigo  !== (l.codigo_pedido || '')) dados.codigo_pedido = novoCodigo;
    if (novoCliente && novoCliente !== (l.cliente_nome || ''))  dados.cliente_nome  = novoCliente;
    if (novoValor   && novoValor   !== Number(l.valor_nf))      dados.valor_nf      = novoValor;
    if (novaCat     && novaCat     !== l.categoria)             dados.categoria     = novaCat;

    if (Object.keys(dados).length === 0) {
      erroEl.classList.remove('hidden');
      erroEl.textContent = 'Nenhum campo foi alterado.';
      return;
    }

    btnSalvar.setAttribute('aria-busy', 'true');
    btnSalvar.disabled = true;

    const { data, error } = await supabase.rpc('editar_lancamento', {
      p_lancamento_id: l.id,
      p_dados:         dados,
      p_motivo:        motivoEl.value.trim(),
    });

    btnSalvar.removeAttribute('aria-busy');

    if (error) {
      btnSalvar.disabled = false;
      erroEl.classList.remove('hidden');
      erroEl.textContent = traduzirErroBanco(error);
      log.warn('falha ao editar lancamento', { code: error.code, msg: error.message });
      return;
    }

    estado.lancamento = data;
    mostrarToast('Lançamento editado.', 'ok', 2200);
    estado.aoSalvar();
    fecharModal(true);
  });
}

function abrirSubModoExcluir() {
  const l = estado.lancamento;
  desligarRealtimeObs();

  abrirModal({
    lateral: false,
    origemEvento: estado.origemEvento,
    eyebrow: `NF ${l.numero_nf} · excluir`,
    titulo:  'Excluir lançamento.',
    conteudo: `
      <div class="alert" style="margin-bottom:1.1rem;background:var(--c-alerta-bg);border-left:3px solid var(--c-alerta);color:var(--c-alerta);padding:0.85rem 1rem;border-radius:var(--r-sm)">
        Esta ação remove o lançamento da lista do caixa. O registro permanece
        no histórico (soft-delete) e pode ser auditado, mas não aparece mais
        em telas operacionais.
      </div>

      <p class="text-body" style="font-size:0.9rem;color:var(--c-tinta-2);margin-bottom:1.2rem;line-height:1.5">
        <strong style="color:var(--c-tinta)">${esc(l.cliente_nome || '— sem cliente —')}</strong>
        · NF ${esc(l.numero_nf)} · ${formatBRL(l.valor_nf)}
        ${l.categoria ? ` · ${esc(LABEL_CATEGORIA[l.categoria] || l.categoria)}` : ''}
      </p>

      <form id="form-excluir" novalidate>
        <div class="field" style="margin-bottom:0">
          <label class="field-label" for="ex-motivo">
            Motivo da exclusão <span style="color:var(--c-alerta)">*</span>
            <span style="font-weight:400;color:var(--c-tinta-3);font-size:0.82rem">(mínimo 10 caracteres)</span>
          </label>
          <textarea id="ex-motivo" name="motivo" rows="3" minlength="10" maxlength="500" required
                    class="field-input" style="resize:vertical"
                    placeholder="Ex.: lançamento duplicado em erro, NF cancelada na origem"></textarea>
        </div>
      </form>
    `,
    rodape: `
      <div id="erro-exc" role="alert" aria-live="polite" class="hidden alert" style="margin-bottom:0.85rem"></div>
      <div class="painel-rodape-acoes">
        <button type="button" id="btn-exc-voltar" class="btn-link">← Voltar</button>
        <button type="submit" form="form-excluir" id="btn-exc-confirmar"
                class="btn-secundario btn-secundario--alerta" disabled>
          ✕ Excluir lançamento
        </button>
      </div>`,
    onConfirmarFechar: () => true,
  });

  ligarSubModoExcluir();
}

function ligarSubModoExcluir() {
  const form = document.querySelector('#form-excluir');
  if (!form) return;
  const f = (id) => document.querySelector(`#${id}`);
  const erroEl = f('erro-exc');
  const btn = f('btn-exc-confirmar');
  const motivoEl = f('ex-motivo');

  setTimeout(() => motivoEl?.focus(), 360);

  motivoEl.addEventListener('input', () => {
    btn.disabled = motivoEl.value.trim().length < 10;
  });

  f('btn-exc-voltar').addEventListener('click', () => voltarAoModoOriginal());

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    erroEl.classList.add('hidden');
    btn.setAttribute('aria-busy', 'true');
    btn.disabled = true;

    const { error } = await supabase.rpc('excluir_lancamento', {
      p_lancamento_id: estado.lancamento.id,
      p_motivo:        motivoEl.value.trim(),
    });

    btn.removeAttribute('aria-busy');

    if (error) {
      btn.disabled = false;
      erroEl.classList.remove('hidden');
      erroEl.textContent = traduzirErroBanco(error);
      log.warn('falha ao excluir lancamento', { code: error.code, msg: error.message });
      return;
    }

    mostrarToast('Lançamento excluído.', 'ok', 2200);
    estado.aoSalvar();
    fecharModal(true);
  });
}

// ════════════════════════════════════════════════════════════════════════
// SUB-MODO — Resolver OBS
// Disponivel quando categoria atual = 'obs'. Permite trocar pra categoria
// definitiva SEM janela de 30min, exigindo devolutiva (>=10c) que vira
// observacao com fonte=resolucao_obs registrando como o problema foi
// resolvido. RPC: resolver_obs_lancamento.
// ════════════════════════════════════════════════════════════════════════

function abrirSubModoResolverObs() {
  const l = estado.lancamento;
  desligarRealtimeObs();

  // Catalogo filtrado — sem 'obs' (a resolucao nao pode ir pra obs de novo).
  const opcoes = CATEGORIAS
    .filter(c => c.valor !== 'obs')
    .map(c => `<option value="${c.valor}">${c.rotulo}</option>`)
    .join('');

  abrirModal({
    lateral: false,
    origemEvento: estado.origemEvento,
    eyebrow: `NF ${l.numero_nf} · resolver OBS`,
    titulo:  'Resolver categoria.',
    conteudo: `
      <div class="alert alert--info" style="margin-bottom:1.2rem;display:flex;gap:0.7rem;align-items:flex-start;padding:0.85rem 1rem;border-radius:0 var(--r-md) var(--r-md) 0">
        <span style="font-family:'Fraunces',serif;font-style:italic;font-size:1.3rem;line-height:1;color:var(--c-musgo);margin-top:-0.05rem">↻</span>
        <span style="font-family:'Manrope',sans-serif;font-size:0.88rem;line-height:1.5;color:var(--c-tinta-2)">
          Esta nota está como <strong style="color:var(--c-ambar-2);font-weight:600">OBS</strong>
          desde a categorização — informação faltando ou pendência interna.
          Agora você pode dar a categoria definitiva. <strong>A devolutiva é obrigatória</strong>
          e fica registrada no histórico como o problema foi resolvido.
        </span>
      </div>

      <p class="text-body" style="font-size:0.88rem;color:var(--c-tinta-2);margin-bottom:1.4rem;line-height:1.55">
        <strong style="color:var(--c-tinta)">${esc(l.cliente_nome || '— sem cliente —')}</strong>
        · NF ${esc(l.numero_nf)} · ${formatBRL(l.valor_nf)}
      </p>

      <form id="form-resolver-obs" novalidate>
        <div class="field">
          <label class="field-label" for="ro-categoria">
            Nova categoria <span style="color:var(--c-alerta)">*</span>
          </label>
          <select id="ro-categoria" name="categoria" class="field-input" required>
            <option value="" disabled selected>— escolher categoria —</option>
            ${opcoes}
          </select>
          <span class="field-underline"></span>
        </div>

        <!-- Slot que renderiza os campos especificos da categoria
             escolhida. Reusa renderCamposCategoria(cat) — mesmo ID
             bloco-cat-campos (so 1 modal aberto por vez, sem conflito). -->
        <div id="ro-cat-wrapper" class="hidden mt-6">
          <p class="h-eyebrow" style="margin:0 0 0.6rem">Detalhes da forma de pagamento</p>
          <div id="bloco-cat-campos"></div>
          <div id="bloco-cat-vazio" class="hidden"></div>
        </div>

        <div class="field mt-7 pt-6" style="border-top:1px solid var(--c-papel-3);margin-bottom:0">
          <label class="field-label" for="ro-devolutiva">
            Devolutiva — o problema da OBS foi resolvido como?
            <span style="color:var(--c-alerta)">*</span>
            <span style="font-weight:400;color:var(--c-tinta-3);font-size:0.82rem;display:block;margin-top:0.2rem">
              Mínimo 10 caracteres. Fica no histórico do lançamento para auditoria.
            </span>
          </label>
          <textarea id="ro-devolutiva" name="devolutiva" rows="3" minlength="10" maxlength="1000" required
                    class="field-input" style="resize:vertical;margin-top:0.45rem"
                    placeholder="Ex.: cliente confirmou pagamento via Pix em 08/05, comprovante anexado ao físico"></textarea>
        </div>
      </form>
    `,
    rodape: `
      <div id="erro-ro" role="alert" aria-live="polite" class="hidden alert" style="margin-bottom:0.85rem"></div>
      <div class="painel-rodape-acoes">
        <button type="button" id="btn-ro-voltar" class="btn-link">← Voltar</button>
        <button type="submit" form="form-resolver-obs" id="btn-ro-confirmar"
                class="btn-primary" disabled>
          ↻ Resolver categoria
        </button>
      </div>`,
    onConfirmarFechar: () => true,
  });

  ligarSubModoResolverObs();
}

function ligarSubModoResolverObs() {
  const form = document.querySelector('#form-resolver-obs');
  if (!form) return;
  instalarPopSelectsEm(form);

  const f = (id) => document.querySelector(`#${id}`);
  const erroEl = f('erro-ro');
  const btn = f('btn-ro-confirmar');
  const catEl = f('ro-categoria');
  const devEl = f('ro-devolutiva');
  const wrapperCat = f('ro-cat-wrapper');

  setTimeout(() => catEl?.focus(), 360);

  // Quando seleciona categoria, renderiza os campos especificos
  catEl?.addEventListener('change', async () => {
    const cat = catEl.value;
    if (!cat) {
      wrapperCat.classList.add('hidden');
      return;
    }
    wrapperCat.classList.remove('hidden');
    // Reset estado.dadosCategoria pra nao herdar campos antigos da OBS
    estado.dadosCategoria = {};
    await renderCamposCategoria(cat);
    reavaliar();
  });

  const reavaliar = () => {
    const catOk = catEl?.value && catEl.value !== 'obs';
    const devOk = (devEl?.value || '').trim().length >= 10;
    // Valida campos especificos da categoria escolhida (HTML5 required)
    const camposCatOk = !catOk || verificarCamposCategoria();
    btn.disabled = !(catOk && devOk && camposCatOk);
  };
  form.addEventListener('input', reavaliar);
  form.addEventListener('change', reavaliar);

  f('btn-ro-voltar').addEventListener('click', () => voltarAoModoOriginal());

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    erroEl.classList.add('hidden');
    btn.setAttribute('aria-busy', 'true');
    btn.disabled = true;

    // Coleta os campos especificos da categoria (igual construirPayload
    // do modo categorizar). Reusa #bloco-cat-campos que esta dentro
    // do wrapper.
    const dadosCategoria = {};
    document.querySelectorAll('#bloco-cat-campos input, #bloco-cat-campos select, #bloco-cat-campos textarea').forEach(el => {
      if (el.type === 'checkbox') {
        if (el.checked) dadosCategoria[el.name] = true;
      } else if (el.name && el.value !== '') {
        dadosCategoria[el.name] = el.value;
      }
    });
    if (dadosCategoria.parcelas) dadosCategoria.parcelas = Number(dadosCategoria.parcelas);
    if (dadosCategoria.valor_recebido) dadosCategoria.valor_recebido = Number(dadosCategoria.valor_recebido);
    if (dadosCategoria.troco != null && dadosCategoria.troco !== '') dadosCategoria.troco = Number(dadosCategoria.troco);
    if (catEl.value === 'dinheiro' && dadosCategoria.vendedora_id) {
      const v = estado.vendedoras?.find(x => x.id === dadosCategoria.vendedora_id);
      if (v) dadosCategoria.vendedora_nome_cache = v.nome;
    }

    const { error } = await supabase.rpc('resolver_obs_lancamento', {
      p_lancamento_id:   estado.lancamento.id,
      p_categoria_nova:  catEl.value,
      p_dados:           dadosCategoria,
      p_devolutiva:      devEl.value.trim(),
    });

    btn.removeAttribute('aria-busy');

    if (error) {
      btn.disabled = false;
      erroEl.classList.remove('hidden');
      erroEl.textContent = traduzirErroBanco(error);
      log.warn('falha ao resolver obs', { code: error.code, msg: error.message });
      return;
    }

    mostrarToast('Categoria resolvida com sucesso.', 'ok', 2200);
    estado.aoSalvar();
    fecharModal(true);
  });
}

// Checa HTML5 validity dos campos especificos da categoria selecionada
function verificarCamposCategoria() {
  const campos = document.querySelectorAll('#bloco-cat-campos input, #bloco-cat-campos select, #bloco-cat-campos textarea');
  for (const el of campos) {
    if (!el.checkValidity()) return false;
  }
  return true;
}

async function persistirObservacao(texto) {
  const { error } = await supabase.rpc('adicionar_observacao', {
    p_lancamento_id: estado.lancamento.id,
    p_texto:         texto,
  });
  if (error) {
    alert('Não foi possível salvar a observação: ' + error.message);
    return false;
  }
  return true;
}

async function chamarMarcarFinalizado() {
  const { error } = await supabase.rpc('marcar_finalizado', {
    p_lancamento_id: estado.lancamento.id,
  });
  if (error) {
    document.querySelector('#erro-form')?.classList.remove('hidden');
    document.querySelector('#erro-form').textContent = 'Não foi possível finalizar: ' + error.message;
    return;
  }
  mostrarToast('Lançamento finalizado.', 'ok', 2000);
  desligarRealtimeObs();
  fecharModal(true);
  estado.aoSalvar();
}

async function chamarMarcarCanceladoPos(motivo) {
  const { error } = await supabase.rpc('marcar_cancelado_pos', {
    p_lancamento_id: estado.lancamento.id,
    p_motivo:        motivo,
  });
  if (error) {
    document.querySelector('#erro-form')?.classList.remove('hidden');
    document.querySelector('#erro-form').textContent = 'Não foi possível cancelar: ' + error.message;
    return;
  }
  mostrarToast('Lançamento cancelado.', 'ok', 2000);
  desligarRealtimeObs();
  fecharModal(true);
  estado.aoSalvar();
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
