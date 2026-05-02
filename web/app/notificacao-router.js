// notificacao-router.js — Mapeamento tipo de notificação → URL de destino
// (CP-PRE-DEPLOY-1, entrega 6).
//
// Recebe notificação JÁ ENRIQUECIDA com `caixa_data` e `numero_nf`
// resolvidos via batch query no client (ver enriquecerNotificacoes em
// pages/notificacoes.js). Devolve { url, motivo } onde:
//   - 'ok'           → url válida pra navegar
//   - 'invalida'     → falta dado essencial no payload (loga warn)
//   - 'sem_destino'  → tipo desconhecido ou notificação informativa
//
// Tipos atualmente no banco (verificado via SQL em 2026-05-02):
//   pendencia_aberta, caixa_nao_fechado, bom_dia_resumo

export function destinoNotificacao(notif) {
  const tipo       = notif.tipo;
  const caixaData  = notif.caixa_data;     // resolvido no client (string YYYY-MM-DD)
  const numeroNf   = notif.numero_nf;       // resolvido no client (texto)

  switch (tipo) {
    case 'pendencia_aberta':
      // Vai pro caixa que originou + destaca a NF na lista (?nf=NUMERO).
      if (caixaData) {
        const url = `/caixa/${caixaData}` +
                    (numeroNf ? `?nf=${encodeURIComponent(numeroNf)}` : '');
        return { url, motivo: 'ok' };
      }
      return { motivo: 'invalida', erro: 'sem caixa_data resolvido' };

    case 'caixa_nao_fechado':
      // Mostra o caixa em questão; o operador decide fechar ou não.
      if (caixaData) return { url: `/caixa/${caixaData}`, motivo: 'ok' };
      return { motivo: 'invalida', erro: 'sem caixa_data resolvido' };

    case 'bom_dia_resumo':
      // TODO: quando /caderno-do-dia for criado (sub-rodada futura), trocar
      // pra essa rota dedicada. Hoje cai em /dashboard como solução temporária.
      return { url: '/dashboard', motivo: 'ok' };

    // Tipos previstos pra futuro (não existem no banco hoje):
    //   caixa_fechado, lancamento_finalizado, observacao_adicionada,
    //   lancamento_cancelado_pos
    // Quando forem implementados, adicionar destinos aqui.

    default:
      console.warn(`[notificacao-router] tipo desconhecido: ${tipo}`);
      return { motivo: 'sem_destino' };
  }
}

/**
 * Enriquece um array de notificações resolvendo caixa_id → caixa.data e
 * lancamento_id → lancamento.numero_nf via 2 batch queries paralelas.
 *
 * Custo: O(1) queries adicionais por carga, não O(N). Lookup local em Map.
 *
 * @param {Array} notifs — array de notificações cruas
 * @param {object} supabase — cliente supabase-js
 * @returns {Promise<Array>} mesmas notifs com `caixa_data` e `numero_nf` setados
 */
export async function enriquecerNotificacoes(notifs, supabase) {
  if (!notifs || notifs.length === 0) return notifs || [];

  const caixaIds       = [...new Set(notifs.map(n => n.caixa_id).filter(Boolean))];
  const lancamentoIds  = [...new Set(notifs.map(n => n.lancamento_id).filter(Boolean))];

  const [caixasResp, lancamentosResp] = await Promise.all([
    caixaIds.length
      ? supabase.from('caixa').select('id, data').in('id', caixaIds)
      : Promise.resolve({ data: [] }),
    lancamentoIds.length
      ? supabase.from('lancamento').select('id, numero_nf').in('id', lancamentoIds)
      : Promise.resolve({ data: [] }),
  ]);

  const caixaPorId      = new Map((caixasResp.data || []).map(c => [c.id, c.data]));
  const lancamentoPorId = new Map((lancamentosResp.data || []).map(l => [l.id, l.numero_nf]));

  return notifs.map(n => ({
    ...n,
    caixa_data: n.caixa_id      ? (caixaPorId.get(n.caixa_id) ?? null) : null,
    numero_nf:  n.lancamento_id ? (lancamentoPorId.get(n.lancamento_id) ?? null) : null,
  }));
}
