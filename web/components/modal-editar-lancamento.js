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

  // Modos gerenciar/finalizado — fallback ate proximo commit.
  abrirModal({
    lateral: true,
    eyebrow: `NF ${lancamento?.numero_nf || ''}`,
    titulo:  'Em construção.',
    conteudo: `
      <p class="text-body" style="margin-bottom:1rem">
        A visualização e gestão deste lançamento estará disponível no próximo
        ajuste. Por enquanto, ele já está categorizado e seguro no caixa.
      </p>`,
    rodape: `
      <div class="painel-rodape-acoes">
        <span></span>
        <button type="button" class="btn-primary" data-fechar>Fechar</button>
      </div>`,
  });
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

  setTimeout(() => {
    const alvo = estado.lancamento ? f('categoria') : f('numero_nf');
    alvo?.focus();
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
