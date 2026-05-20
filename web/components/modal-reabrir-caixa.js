// modal-reabrir-caixa.js — drawer pra reabrir caixa fechado.
//
// Operação destrutiva: requer permissão caixa.reabrir_fechado e motivo
// >=10 chars. Backend (RPC reabrir_caixa) faz append em observacao_fechamento
// preservando fechado_em/fechado_por (trilha auditavel).
//
// Quem chama (caixa.js) ja gateou o botão por temPermissaoSync, mas a RPC
// re-checa via tem_permissao no banco — defesa em profundidade.

import { supabase } from '../app/supabase.js';
import { abrirModal, fecharModal } from './modal.js';
import { mostrarToast } from '../app/notifications.js';
import { dataLonga } from '../app/dominio.js';

let estado = null;

export function abrirModalReabrirCaixa({ caixaId, dataCaixa, aoConcluir = () => {} } = {}) {
  estado = { caixaId, dataCaixa, aoConcluir, sujo: false };

  abrirModal({
    lateral: false,
    eyebrow: `Reabertura · ${dataLonga(dataCaixa)}`,
    titulo:  'Reabrir este caixa.',
    conteudo: corpoForm(),
    rodape: `
      <div id="erro-reabrir" role="alert" aria-live="polite" class="hidden alert" style="margin-bottom:0.85rem"></div>
      <div class="painel-rodape-acoes">
        <button type="button" id="btn-cancel" class="btn-link">Cancelar</button>
        <button type="submit" form="form-reabrir" id="btn-confirmar" class="btn-primary" disabled>
          Reabrir caixa
        </button>
      </div>`,
    onConfirmarFechar: () => {
      if (!estado?.sujo) return true;
      return confirm('O motivo digitado será descartado. Continuar?');
    },
  });

  ligarComportamento();
}

function corpoForm() {
  return `
    <p class="text-body" style="font-size:0.92rem;color:var(--c-tinta-3);margin-bottom:1rem;line-height:1.5">
      Reabrir devolve o caixa ao estado <strong>aberto</strong> e libera novos
      lançamentos. O fechamento original permanece registrado — quem fechou,
      quando, e a observação anterior — e a reabertura é anexada à mesma
      trilha para auditoria.
    </p>
    <p class="text-body" style="font-size:0.88rem;color:var(--c-tinta-3);margin-bottom:1.5rem;line-height:1.5">
      Use só quando for realmente necessário (correção de lançamento esquecido,
      conferência divergente etc).
    </p>

    <form id="form-reabrir" novalidate>
      <div class="field">
        <label class="field-label" for="motivo-reabertura">
          Motivo da reabertura <span style="color:var(--c-alerta)">*</span>
          <span style="font-weight:400;color:var(--c-tinta-3);font-size:0.82rem">
            (mínimo 10 caracteres)
          </span>
        </label>
        <textarea id="motivo-reabertura" name="motivo" rows="4" maxlength="500" required
                  minlength="10" class="field-input"
                  placeholder="Ex.: lançamento de NF 12345 esquecido, ajuste após conferência com mybucks"
                  style="resize:vertical;min-height:5rem"></textarea>
        <p id="contador-motivo" class="field-hint" style="margin-top:0.4rem;font-size:0.8rem;color:var(--c-tinta-3)">
          0 / 10 caracteres mínimos
        </p>
      </div>
    </form>
  `;
}

function ligarComportamento() {
  const form = document.querySelector('#form-reabrir');
  if (!form) return;
  const txt   = document.querySelector('#motivo-reabertura');
  const cont  = document.querySelector('#contador-motivo');
  const btn   = document.querySelector('#btn-confirmar');
  const erroEl = document.querySelector('#erro-reabrir');

  setTimeout(() => txt?.focus(), 360);

  function reavaliar() {
    const v = (txt.value || '').trim();
    estado.sujo = v.length > 0;
    const ok = v.length >= 10;
    btn.disabled = !ok;
    cont.textContent = ok
      ? `${v.length} caracteres`
      : `${v.length} / 10 caracteres mínimos`;
    cont.style.color = ok ? 'var(--c-tinta-3)' : 'var(--c-alerta)';
  }

  txt.addEventListener('input', () => {
    erroEl.classList.add('hidden');
    reavaliar();
  });

  document.querySelector('#btn-cancel')?.addEventListener('click', () => fecharModal(false));

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    erroEl.classList.add('hidden');

    const motivo = (txt.value || '').trim();
    if (motivo.length < 10) {
      erroEl.classList.remove('hidden');
      erroEl.textContent = 'O motivo precisa ter pelo menos 10 caracteres.';
      txt.focus();
      return;
    }

    btn.setAttribute('aria-busy', 'true');
    btn.disabled = true;

    const { error } = await supabase.rpc('reabrir_caixa', {
      p_caixa_id: estado.caixaId,
      p_motivo:   motivo,
    });

    btn.removeAttribute('aria-busy');

    if (error) {
      btn.disabled = false;
      erroEl.classList.remove('hidden');
      erroEl.textContent = traduzirErro(error);
      return;
    }

    estado.sujo = false;
    mostrarToast('Caixa reaberto.', 'ok', 2800);
    fecharModal(true);
    estado.aoConcluir();
  });
}

function traduzirErro(err) {
  const m = err.message || '';
  const ml = m.toLowerCase();
  if (ml.includes('permissão negada') || ml.includes('permissao negada') || ml.includes('42501')) {
    return 'Você não tem permissão para reabrir caixas.';
  }
  if (ml.includes('arquivad')) {
    return 'Caixas arquivados não podem ser reabertos.';
  }
  if (ml.includes('apenas caixas fechados')) {
    return 'Este caixa já está aberto. Recarregue a página.';
  }
  if (ml.includes('motivo')) {
    return 'O motivo precisa ter pelo menos 10 caracteres.';
  }
  return 'Não foi possível reabrir o caixa: ' + m;
}
