-- Migration 201: adiciona estados finais ao ciclo de vida do lancamento.
--
-- Decisao alinhada (CP4): "cancelado" vira ESTADO pos-pagamento, mantendo
-- a categoria "cancelado" do enum categoria_lancamento com semantica nova
-- ("NF nasceu cancelada, sem pagamento"). Para distinguir os dois casos
-- a nivel de estado, criamos:
--
--   pendente       -> NF + valor anotados, aguardando categorizacao
--   completo       -> categorizado e com dados de pagamento preenchidos
--   finalizado     -> pagamento confirmado e cliente finalizou (ex.: buscou)
--   cancelado_pos  -> pagamento ocorreu mas foi cancelado depois (estorno)
--   excluido       -> soft-delete administrativo
--
-- ALTER TYPE ADD VALUE e idempotente via IF NOT EXISTS.

ALTER TYPE estado_lancamento ADD VALUE IF NOT EXISTS 'finalizado';
ALTER TYPE estado_lancamento ADD VALUE IF NOT EXISTS 'cancelado_pos';

COMMENT ON TYPE estado_lancamento IS
  'Ciclo de vida: pendente -> completo -> {finalizado | cancelado_pos | excluido}. '
  '"pendente" = aguardando categorizacao (NF + valor apenas). '
  '"em_preenchimento" = legado, mesmo significado pratico de pendente. '
  '"completo" = categorizado e com dados de pagamento preenchidos. '
  '"resolvido" = legado (pre-CP4), equivalente a "finalizado". '
  '"finalizado" = pagamento confirmado e cliente finalizou (ex.: buscou produto). '
  '"cancelado" = legado (pre-CP4), equivalente a "cancelado_pos". '
  '"cancelado_pos" = pagamento ocorreu mas foi cancelado depois (estorno). '
  '"excluido" = soft-delete administrativo. '
  'A categoria "cancelado" do enum categoria_lancamento mantem o nome mas '
  'passa a significar "NF nasceu cancelada, sem pagamento" (nao confundir '
  'com o estado cancelado_pos).';
