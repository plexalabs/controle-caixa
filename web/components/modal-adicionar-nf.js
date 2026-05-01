// modal-adicionar-nf.js — drawer simples para criar lancamento minimal:
// numero NF + valor (+ cliente opcional). O lancamento entra no caixa
// em estado "pendente" (em analise) e categoria=null. A categorizacao
// vem depois, via modal-editar-lancamento.js, quando o operador
// descobrir como foi pago.

import { supabase } from '../app/supabase.js';
import { abrirModal, fecharModal } from './modal.js';
import { mostrarToast } from '../app/notifications.js';
import { debounce } from '../app/utils.js';

let estado = null;

export function abrirModalAdicionarNF({ dataCaixa, aoSalvar = () => {} } = {}) {
  estado = { dataCaixa, aoSalvar, sujo: false };

  abrirModal({
    lateral: true,
    eyebrow: `Em análise · ${formatarDataPt(dataCaixa)}`,
    titulo:  'Anotar uma nota fiscal.',
    conteudo: corpoForm(),
    rodape: `
      <div id="erro-form" role="alert" aria-live="polite" class="hidden alert" style="margin-bottom:0.85rem"></div>
      <div class="painel-rodape-acoes">
        <button type="button" id="btn-cancel" class="btn-link">Cancelar</button>
        <button type="submit" form="form-add-nf" id="btn-salvar" class="btn-primary" disabled>Adicionar à análise</button>
      </div>`,
    onConfirmarFechar: () => {
      if (!estado?.sujo) return true;
      return confirm('Os dados preenchidos serão descartados. Continuar?');
    },
  });

  ligarComportamento();
}

function corpoForm() {
  return `
    <p class="text-body" style="font-size:0.92rem;color:var(--c-tinta-3);margin-bottom:1.5rem;line-height:1.5">
      Anote o que sabe agora. A categoria — Cartão, Pix, Dinheiro, Link
      ou Observação — você define depois, quando o pagamento estiver claro.
    </p>

    <form id="form-add-nf" novalidate>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div class="field" style="margin-bottom:0">
          <label class="field-label" for="numero_nf">Número da NF *</label>
          <input id="numero_nf" name="numero_nf" required maxlength="15" class="field-input"
                 autocomplete="off" inputmode="numeric" />
        </div>
        <div class="field" style="margin-bottom:0">
          <label class="field-label" for="valor_nf">Valor (R$) *</label>
          <input id="valor_nf" name="valor_nf" type="number" step="0.01" min="0.01" required
                 class="field-input" inputmode="decimal" />
        </div>
      </div>

      <div class="field mt-5">
        <label class="field-label" for="codigo_pedido">Código do pedido</label>
        <input id="codigo_pedido" name="codigo_pedido" maxlength="20" class="field-input"
               autocomplete="off" placeholder="opcional, ajuda a localizar o cliente" />
      </div>

      <div class="field mt-5">
        <label class="field-label" for="cliente_nome">Cliente</label>
        <input id="cliente_nome" name="cliente_nome" maxlength="120" class="field-input"
               autocomplete="off" placeholder="opcional, pode preencher depois" />
      </div>
    </form>
  `;
}

function ligarComportamento() {
  const form = document.querySelector('#form-add-nf');
  if (!form) return;
  const f = (id) => document.querySelector(`#${id}`);
  const erroEl = document.querySelector('#erro-form');

  setTimeout(() => f('numero_nf')?.focus(), 360);

  form.addEventListener('input', () => {
    estado.sujo = true;
    f('btn-salvar').disabled = !form.checkValidity();
  });

  f('btn-cancel').addEventListener('click', () => fecharModal(false));

  // Auto-preenche cliente pelo cliente_cache no blur do codigo_pedido.
  const buscar = debounce(async () => {
    const codigo = f('codigo_pedido').value.trim();
    if (!codigo) return;
    const { data } = await supabase
      .from('cliente_cache')
      .select('cliente_nome, valor_nf_ultimo')
      .eq('codigo_pedido', codigo)
      .maybeSingle();
    if (!data) return;
    if (!f('cliente_nome').value) f('cliente_nome').value = data.cliente_nome;
    if (!f('valor_nf').value && data.valor_nf_ultimo) {
      f('valor_nf').value = Number(data.valor_nf_ultimo).toFixed(2);
    }
    f('btn-salvar').disabled = !form.checkValidity();
  }, 350);
  f('codigo_pedido').addEventListener('blur', buscar);

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    erroEl.classList.add('hidden');
    const btn = f('btn-salvar');
    btn.setAttribute('aria-busy', 'true');
    btn.disabled = true;

    const payload = {
      p_data_caixa:      estado.dataCaixa,
      p_numero_nf:       f('numero_nf').value.trim(),
      p_codigo_pedido:   f('codigo_pedido').value.trim() || '—',
      p_cliente_nome:    f('cliente_nome').value.trim() || '— sem cliente —',
      p_valor_nf:        Number(f('valor_nf').value),
      // categoria=NULL + estado=pendente passa pelo check
      // lancamento_categoria_estado e marca a NF como "em análise".
      p_categoria:       null,
      p_estado:          'pendente',
      p_dados_categoria: { em_analise: true },
      p_fonte_origem:    'web',
    };

    const { error } = await supabase.rpc('upsert_lancamento', payload);
    btn.removeAttribute('aria-busy');

    if (error) {
      btn.disabled = false;
      erroEl.classList.remove('hidden');
      erroEl.textContent = error.message || 'Não foi possível registrar a NF.';
      return;
    }

    estado.sujo = false;
    fecharModal(true);
    mostrarToast('NF anotada em análise.', 'ok', 2400);
    estado.aoSalvar();
  });
}

function formatarDataPt(iso) {
  const d = new Date(iso + 'T00:00:00');
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long' }).format(d);
}
