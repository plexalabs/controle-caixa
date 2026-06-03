// modal-adicionar-nf.js — drawer simples para criar lancamento minimal:
// numero NF + valor (+ cliente opcional). O lancamento entra no caixa
// em estado "pendente" (em analise) e categoria=null. A categorizacao
// vem depois, via modal-editar-lancamento.js, quando o operador
// descobrir como foi pago.

import { supabase } from '../app/supabase.js';
import { comRetry } from '../app/supabase-wrapper.js';
import { abrirModal, fecharModal } from './modal.js';
import { mostrarToast } from '../app/notifications.js';
import {
  debounce, soDigitos, formatarNomeCliente, instalarMascarasFormulario,
} from '../app/utils.js';

let estado = null;

export function abrirModalAdicionarNF({ dataCaixa, aoSalvar = () => {}, origemEvento = null } = {}) {
  estado = { dataCaixa, aoSalvar, sujo: false, origemEvento };

  abrirModal({
    lateral: false,
    amplo: true,
    origemEvento,
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
    <div class="man2">
      <div class="man2-split">
        <aside class="man2-esq" aria-label="Como funciona">
          <h3 class="man2-esq-headline">
            Só o essencial.
            <span class="man2-esq-headline-accent">O resto vem depois.</span>
          </h3>

          <p class="man2-esq-texto">
            Só o pedido é obrigatório. NF e valor entram quando faturar —
            você tem até <strong>1 hora</strong> pra preencher esses dois.
          </p>
        </aside>

        <form id="form-add-nf" class="man2-dir" novalidate>
          <div class="field" style="margin-bottom:0">
            <label class="field-label" for="codigo_pedido">Código do pedido *</label>
            <input id="codigo_pedido" name="codigo_pedido" required maxlength="11" class="field-input"
                   autocomplete="off" inputmode="numeric"
                   placeholder="123.456.789" />
          </div>

          <div class="man2-grid">
            <div class="field" style="margin-bottom:0">
              <label class="field-label" for="valor_nf">Valor (R$)</label>
              <input id="valor_nf" name="valor_nf" type="number" step="0.01" min="0"
                     class="field-input" inputmode="decimal"
                     placeholder="preencher depois" />
            </div>
            <div class="field" style="margin-bottom:0">
              <label class="field-label" for="numero_nf">Número da NF</label>
              <input id="numero_nf" name="numero_nf" maxlength="6" class="field-input"
                     autocomplete="off" inputmode="numeric"
                     placeholder="12.345" />
            </div>
          </div>

          <div class="field" style="margin-bottom:0">
            <label class="field-label" for="cliente_nome">Cliente</label>
            <input id="cliente_nome" name="cliente_nome" maxlength="120" class="field-input"
                   autocomplete="off" autocapitalize="words"
                   placeholder="Nome do cliente" />
          </div>
        </form>
      </div>
    </div>
  `;
}

function ligarComportamento() {
  const form = document.querySelector('#form-add-nf');
  if (!form) return;
  const f = (id) => document.querySelector(`#${id}`);
  const erroEl = document.querySelector('#erro-form');

  setTimeout(() => f('codigo_pedido')?.focus(), 360);

  form.addEventListener('input', () => {
    estado.sujo = true;
    f('btn-salvar').disabled = !form.checkValidity();
  });

  f('btn-cancel').addEventListener('click', () => fecharModal(false));

  // Mascaras NF (XX.XXX), pedido (XXX.XXX.XXX), cliente (title-case
  // no blur). Helper unica do utils — comportamento identico ao dos
  // modais de edicao/categorizar.
  instalarMascarasFormulario(form, {
    idNF: 'numero_nf',
    idPedido: 'codigo_pedido',
    idCliente: 'cliente_nome',
  });

  // Auto-preenche cliente pelo cliente_cache no blur do codigo_pedido.
  // O cache armazena o codigo SEM pontos — buscamos so com digitos.
  const buscar = debounce(async () => {
    const codigo = soDigitos(f('codigo_pedido').value);
    if (!codigo) return;
    const { data } = await supabase
      .from('cliente_cache')
      .select('cliente_nome, valor_nf_ultimo')
      .eq('codigo_pedido', codigo)
      .maybeSingle();
    if (!data) return;
    if (!f('cliente_nome').value && data.cliente_nome) {
      // Se o cache devolver tudo em caixa alta, normaliza tambem.
      const nome = data.cliente_nome;
      f('cliente_nome').value = (nome === nome.toUpperCase()) ? titleCasePtBR(nome) : nome;
    }
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

    // Cliente: normaliza title case AGORA (e nao so no blur) — clique
    // direto no Salvar com input focado nem sempre dispara blur antes
    // do submit; sem isto, "JOAO DA SILVA" ia pro banco em caps.
    const nomeCliente = formatarNomeCliente(f('cliente_nome').value);
    f('cliente_nome').value = nomeCliente;

    // Pedido e obrigatorio. NF e valor opcionais — schema aceita NULL.
    // Operador tem janela de 1h (config lancamento.editar_nf_valor_minutos)
    // pra preencher/editar esses dois apos criar.
    const codigoPedido = soDigitos(f('codigo_pedido').value);
    const numeroNF     = soDigitos(f('numero_nf').value);
    const valorStr     = f('valor_nf').value.trim();
    const payload = {
      p_data_caixa:      estado.dataCaixa,
      p_numero_nf:       numeroNF || null,
      p_codigo_pedido:   codigoPedido,
      p_cliente_nome:    nomeCliente || '— sem cliente —',
      p_valor_nf:        valorStr ? Number(valorStr) : null,
      // categoria=NULL + estado=pendente passa pelo check
      // lancamento_categoria_estado e marca a NF como "em análise".
      p_categoria:       null,
      p_estado:          'pendente',
      p_dados_categoria: { em_analise: true },
      p_fonte_origem:    'web',
    };

    // Criar lançamento "em análise": tolerância a instabilidade transitória
    // via comRetry. Erros de validação (NF duplicada etc) NÃO retentam.
    const { error } = await comRetry(
      () => supabase.rpc('upsert_lancamento', payload),
      'criar lançamento'
    );
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

// Helpers de formatacao (soDigitos, formatarNumeroNF, formatarCodigoPedido,
// formatarNomeCliente) ficam em ../app/utils.js — sao compartilhados com
// os renderers de caixa, pendencias, topbar etc.
