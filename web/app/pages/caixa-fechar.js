// caixa-fechar.js — Tela /caixa/:data/fechar (CP6.2).
// Fluxo formal de fechamento de caixa: sumário + checklist + observações.
// Operador precisa marcar conscientemente os checkboxes; submit chama a
// RPC fechar_caixa que valida pendências e força justificativa quando
// houver.

import { supabase } from '../supabase.js';
import { renderShell, ligarShell } from '../shell.js';
import { dataLonga, isoData, ESTADO_CAIXA } from '../dominio.js';
import { formatBRL } from '../utils.js';
import { mostrarToast } from '../notifications.js';
import { navegar } from '../router.js';

let caixaAtual = null;
let pendentesAtual = [];

export async function renderCaixaFechar({ params }) {
  const dataAlvo = params?.[0] ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataAlvo)) {
    return mostrarErro('Data inválida.', '/dashboard');
  }

  // 1. Carrega caixa com TODOS os totais auditáveis
  const { data: caixa, error } = await supabase
    .from('caixa')
    .select('id, data, estado, total_lancamentos, total_pendentes, total_resolvidas, total_valor, total_cancelado_pos, valor_cancelado_pos, total_finalizado, valor_finalizado, observacao_fechamento')
    .eq('data', dataAlvo)
    .maybeSingle();

  if (error) return mostrarErro('Não foi possível carregar o caixa: ' + error.message, '/dashboard');
  if (!caixa)  return mostrarErro('Não há caixa nessa data.', '/dashboard');

  caixaAtual = caixa;

  // Caixa já fechado — redireciona pra leitura
  if (caixa.estado === 'fechado' || caixa.estado === 'arquivado') {
    mostrarToast('Este caixa já está fechado.', 'info', 3000);
    return navegar(`/caixa/${dataAlvo}`);
  }

  // 2. Carrega pendentes pra mostrar na checklist + permitir resolver
  const { data: pend } = await supabase
    .from('lancamento')
    .select('id, numero_nf, cliente_nome, valor_nf, estado, categoria')
    .eq('caixa_id', caixa.id)
    .in('estado', ['pendente','em_preenchimento','completo'])
    .neq('estado', 'excluido');
  pendentesAtual = pend || [];

  // 3. Render
  document.querySelector('#app').innerHTML = await renderShell({
    rotaAtiva: 'caixas',
    conteudo: `
    <main id="main" class="fechar-tela">
      <nav class="mb-5 reveal reveal-1" aria-label="Voltar">
        <a href="/caixa/${dataAlvo}" data-link class="btn-link" style="font-size:0.85rem">← Voltar ao caixa</a>
      </nav>

      <header class="fechar-cabec reveal reveal-2" data-etiqueta="FECHAR">
        <div class="fechar-cabec-conteudo">
          <p class="h-eyebrow">Fechamento formal · ${esc(ESTADO_CAIXA[caixa.estado] || caixa.estado)}</p>
          <h1 class="h-display fechar-titulo">Fechar caixa de ${dataLonga(dataAlvo)}.</h1>
          <p class="fechar-subtitulo text-body">
            Confira os totais, marque cada item da checklist com atenção, registre
            divergências se houver, e finalize. Após o fechamento, este caixa não
            aceita novos lançamentos.
          </p>
        </div>
      </header>

      <section class="fechar-sumario reveal reveal-3" aria-label="Sumário do dia">
        ${cardSumario({ eyebrow: 'Lançamentos', valor: caixa.total_lancamentos, sub: caixa.total_lancamentos === 1 ? 'lançamento no dia' : 'lançamentos no dia' })}
        ${cardSumario({ eyebrow: 'Valor líquido', valor: formatBRL(caixa.total_valor), sub: 'soma sem cancelados', tom: 'destaque' })}
        ${cardSumario({
          eyebrow: 'Pendências',
          valor: caixa.total_pendentes,
          sub: caixa.total_pendentes > 0
            ? '<a href="/pendencias?busca=' + esc(dataAlvo) + '" data-link class="btn-link">Resolver pendências</a>'
            : 'tudo resolvido',
          tom: caixa.total_pendentes > 0 ? 'warn' : 'good',
          html: caixa.total_pendentes > 0,
        })}
        ${cardSumario({ eyebrow: 'Finalizados', valor: formatBRL(caixa.valor_finalizado), sub: `${caixa.total_finalizado} ${caixa.total_finalizado === 1 ? 'NF' : 'NFs'}`, tom: 'good' })}
        ${cardSumario({
          eyebrow: 'Cancelados pós-pagamento',
          valor: formatBRL(caixa.valor_cancelado_pos),
          sub: `${caixa.total_cancelado_pos} ${caixa.total_cancelado_pos === 1 ? 'NF' : 'NFs'}`,
          tom: caixa.total_cancelado_pos > 0 ? 'alerta' : '',
        })}
      </section>

      ${(() => {
        const ehHoje = dataAlvo === isoData(new Date());
        const avisos = [];
        if (!ehHoje) {
          avisos.push(`
            <aside class="fechar-aviso reveal reveal-3" data-tom="retroativo" role="alert">
              <p class="h-eyebrow">Fechamento retroativo</p>
              <p class="fechar-aviso-texto">
                Você está fechando o caixa de <strong>${esc(dataLonga(dataAlvo))}</strong>,
                que não é o dia atual. A justificativa abaixo é obrigatória
                (mínimo 10 caracteres) para registrar o motivo.
              </p>
            </aside>`);
        }
        if (pendentesAtual.length > 0) {
          avisos.push(`
            <aside class="fechar-aviso reveal reveal-3" data-tom="pendencias" role="alert">
              <p class="h-eyebrow">Atenção</p>
              <p class="fechar-aviso-texto">
                <strong>${pendentesAtual.length} ${pendentesAtual.length === 1 ? 'lançamento' : 'lançamentos'} ainda em aberto.</strong>
                Se prosseguir sem resolver, será preciso justificar com pelo menos 20 caracteres.
              </p>
            </aside>`);
        }
        return avisos.join('');
      })()}

      <section class="fechar-checklist reveal reveal-4" aria-label="Checklist de fechamento">
        <h2 class="h-eyebrow">Checklist</h2>
        <ol class="fechar-itens">
          ${itemCheck(1, 'check-totais',     'Conferi os totais do dia',                                   true)}
          ${itemCheck(2, 'check-pendencias', 'Resolvi todas as pendências possíveis',                      true,
                       pendentesAtual.length > 0 ? 'Há pendências em aberto — siga só se ciente.' : null)}
          ${itemCheck(3, 'check-mybucks',    'Comparei com o relatório do mybucks',                        true)}
          ${itemCheck(4, 'check-ciencia',    'Estou ciente que este caixa não receberá mais lançamentos', true)}
        </ol>

        <div class="fechar-divergencia">
          ${(() => {
            const ehHoje = dataAlvo === isoData(new Date());
            const minChars = pendentesAtual.length > 0 ? 20
                           : !ehHoje                   ? 10
                           : 0;
            const labelTxt = pendentesAtual.length > 0
              ? `Justificativa obrigatória (mín. 20 caracteres) *`
              : !ehHoje
                ? `Justificativa obrigatória (mín. 10 caracteres) *`
                : `Observação sobre divergências (opcional)`;
            const placeholder = pendentesAtual.length > 0
              ? 'Por que está fechando com pendências em aberto?'
              : !ehHoje
                ? 'Por que este caixa não foi fechado no dia?'
                : 'Anote aqui qualquer divergência encontrada com o mybucks ou ajuste manual feito.';
            return `
              <label class="field-label" for="obs-fechamento">${esc(labelTxt)}</label>
              <textarea id="obs-fechamento" rows="4" maxlength="800"
                        class="field-input"
                        data-min-chars="${minChars}"
                        placeholder="${esc(placeholder)}"
                        style="resize:vertical;min-height:5rem"></textarea>`;
          })()}
        </div>
      </section>

      <div id="erro-fechamento" role="alert" aria-live="polite" class="hidden alert reveal reveal-5"></div>

      <footer class="fechar-rodape reveal reveal-5">
        <a href="/caixa/${dataAlvo}" data-link class="btn-link">Voltar sem fechar</a>
        <button id="btn-fechar" type="button" class="btn-primary" disabled>
          Fechar caixa do dia
        </button>
      </footer>
    </main>
  `,
  });

  ligarShell();
  ligarComportamento(dataAlvo);
}

// ─── Comportamento ──────────────────────────────────────────────────
function ligarComportamento(dataAlvo) {
  const checks = ['#check-totais', '#check-pendencias', '#check-mybucks', '#check-ciencia']
    .map(s => document.querySelector(s));
  const btn = document.querySelector('#btn-fechar');
  const obs = document.querySelector('#obs-fechamento');
  const erroEl = document.querySelector('#erro-fechamento');

  function reavaliarBtn() {
    const todosMarcados = checks.every(c => c?.checked);
    btn.disabled = !todosMarcados;
  }

  checks.forEach(c => c?.addEventListener('change', reavaliarBtn));
  obs?.addEventListener('input', () => erroEl.classList.add('hidden'));

  btn.addEventListener('click', async () => {
    erroEl.classList.add('hidden');
    btn.setAttribute('aria-busy', 'true');
    btn.disabled = true;

    const justificativa = (obs.value || '').trim() || null;
    const temPendencias = pendentesAtual.length > 0;
    const minChars = parseInt(obs.dataset.minChars || '0', 10);
    const ehHoje = dataAlvo === isoData(new Date());

    // Validação client-side antes de chamar RPC
    if (temPendencias && (!justificativa || justificativa.length < 20)) {
      btn.removeAttribute('aria-busy');
      btn.disabled = false;
      erroEl.classList.remove('hidden');
      erroEl.textContent = 'Há pendências em aberto. Justifique com pelo menos 20 caracteres no campo abaixo.';
      obs.focus();
      return;
    }
    if (!temPendencias && !ehHoje && (!justificativa || justificativa.length < 10)) {
      btn.removeAttribute('aria-busy');
      btn.disabled = false;
      erroEl.classList.remove('hidden');
      erroEl.textContent = 'Fechamento retroativo exige justificativa de pelo menos 10 caracteres.';
      obs.focus();
      return;
    }

    const { error } = await supabase.rpc('fechar_caixa', {
      p_caixa_id:      caixaAtual.id,
      p_forcar:        temPendencias,
      p_justificativa: justificativa,
    });

    btn.removeAttribute('aria-busy');

    if (error) {
      btn.disabled = false;
      erroEl.classList.remove('hidden');
      erroEl.textContent = traduzirErro(error);
      return;
    }

    mostrarToast(`Caixa de ${formatarDataCurta(dataAlvo)} fechado com sucesso.`, 'ok', 3200);
    navegar(`/caixa/${dataAlvo}`);
  });
}

function traduzirErro(err) {
  const m = err.message || '';
  const ml = m.toLowerCase();
  if (ml.includes('retroativo')) {
    return 'Fechamento retroativo exige justificativa de pelo menos 10 caracteres.';
  }
  if (ml.includes('justificativa')) {
    return 'Justificativa obrigatória (mínimo 20 caracteres) ao forçar fechamento com pendências.';
  }
  if (ml.includes('ja esta fechado') || ml.includes('já está fechado')) {
    return 'Este caixa já foi fechado por outra sessão. Recarregue a página.';
  }
  if (ml.includes('pendencias') || ml.includes('pendências')) {
    return m;
  }
  return 'Não foi possível fechar o caixa: ' + m;
}

// ─── Helpers ────────────────────────────────────────────────────────
function cardSumario({ eyebrow, valor, sub, tom = '', html = false }) {
  return `
    <article class="fechar-card" data-tom="${esc(tom)}">
      <p class="h-eyebrow">${esc(eyebrow)}</p>
      <p class="fechar-card-num">${esc(String(valor))}</p>
      <p class="fechar-card-sub">${html ? sub : esc(sub)}</p>
    </article>`;
}

function itemCheck(num, id, rotulo, obrigatorio, aviso = null) {
  return `
    <li class="fechar-item">
      <span class="fechar-item-num" aria-hidden="true">${String(num).padStart(2, '0')}</span>
      <label for="${id}" class="fechar-item-label">
        <input type="checkbox" id="${id}" class="fechar-item-check" ${obrigatorio ? 'data-obrigatorio="1"' : ''} />
        <span class="fechar-item-texto">${esc(rotulo)}</span>
        ${aviso ? `<span class="fechar-item-aviso">${esc(aviso)}</span>` : ''}
      </label>
    </li>`;
}

function formatarDataCurta(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}`;
}

function mostrarErro(msg, voltar) {
  document.querySelector('#app').innerHTML = `
    <main class="min-h-screen flex items-center justify-center p-8 text-center">
      <div>
        <p class="h-eyebrow" style="color:var(--c-alerta)">Erro</p>
        <h1 class="h-display text-4xl mt-1 mb-4">${esc(msg)}</h1>
        <a href="${voltar}" data-link class="btn-link">Voltar</a>
      </div>
    </main>`;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
