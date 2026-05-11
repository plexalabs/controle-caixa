-- ============================================================
-- CAT-7: nova categoria 'disponivel_retirada'.
--
-- Usada quando o pedido ja foi faturado (NF emitida) por questao
-- interna mas o produto fisicamente ainda esta na empresa
-- aguardando o cliente retirar. Distinta de:
--   * cartao/pix/dinheiro — venda paga e entregue
--   * cancelado / cancelado_pos — venda nao aconteceu
--   * obs — categoria temporaria pra "nao sei classificar"
--   * cartao_link — fluxo especifico de link de pagamento
--
-- ALTER TYPE ADD VALUE precisa rodar em sua propria transacao
-- — supabase aplica cada migration em tx separada, OK.
-- ============================================================

ALTER TYPE public.categoria_lancamento ADD VALUE IF NOT EXISTS 'disponivel_retirada';
