-- CP6.1B — fn_recalcular_caixa Escola 1 + colunas auxiliares.
-- Estratégia: criar versão parametrizada (uuid) que faz o trabalho real,
-- e atualizar a versão trigger (sem args) para delegar à parametrizada.
-- Ambas as assinaturas coexistem (Postgres permite overload por args).

CREATE OR REPLACE FUNCTION public.fn_recalcular_caixa(p_caixa_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.caixa SET
    total_lancamentos    = (SELECT count(*) FROM public.lancamento
                            WHERE caixa_id = p_caixa_id AND estado <> 'excluido'),
    total_pendentes      = (SELECT count(*) FROM public.lancamento
                            WHERE caixa_id = p_caixa_id
                              AND estado IN ('pendente','em_preenchimento')),
    total_resolvidas     = (SELECT count(*) FROM public.lancamento
                            WHERE caixa_id = p_caixa_id
                              AND estado IN ('completo','finalizado')),
    -- Escola 1: total_valor exclui cancelado, cancelado_pos e excluido
    total_valor          = (SELECT coalesce(sum(valor_nf), 0) FROM public.lancamento
                            WHERE caixa_id = p_caixa_id
                              AND estado NOT IN ('cancelado','cancelado_pos','excluido')),
    total_cancelado_pos  = (SELECT count(*) FROM public.lancamento
                            WHERE caixa_id = p_caixa_id AND estado = 'cancelado_pos'),
    valor_cancelado_pos  = (SELECT coalesce(sum(valor_nf), 0) FROM public.lancamento
                            WHERE caixa_id = p_caixa_id AND estado = 'cancelado_pos'),
    total_finalizado     = (SELECT count(*) FROM public.lancamento
                            WHERE caixa_id = p_caixa_id AND estado = 'finalizado'),
    valor_finalizado     = (SELECT coalesce(sum(valor_nf), 0) FROM public.lancamento
                            WHERE caixa_id = p_caixa_id AND estado = 'finalizado'),
    atualizado_em        = now()
  WHERE id = p_caixa_id;
END;
$$;

COMMENT ON FUNCTION public.fn_recalcular_caixa(uuid) IS
  'CP6 — recalcula todos os totais auditáveis de um caixa. Escola 1: '
  'total_valor exclui cancelado_pos. As linhas canceladas viram contagem '
  'em total_cancelado_pos / valor_cancelado_pos.';

CREATE OR REPLACE FUNCTION public.fn_recalcular_caixa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.fn_recalcular_caixa(COALESCE(NEW.caixa_id, OLD.caixa_id));
  IF TG_OP = 'UPDATE' AND OLD.caixa_id IS DISTINCT FROM NEW.caixa_id THEN
    PERFORM public.fn_recalcular_caixa(OLD.caixa_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION public.fn_recalcular_caixa() IS
  'Trigger AFTER INSERT/UPDATE/DELETE em lancamento — delega para fn_recalcular_caixa(uuid).';

GRANT EXECUTE ON FUNCTION public.fn_recalcular_caixa(uuid) TO authenticated;

-- Backfill: recalcula todos os caixas existentes para popular as novas colunas.
DO $$
DECLARE
  v_caixa_id uuid;
  v_n integer := 0;
BEGIN
  FOR v_caixa_id IN SELECT id FROM public.caixa LOOP
    PERFORM public.fn_recalcular_caixa(v_caixa_id);
    v_n := v_n + 1;
  END LOOP;
  RAISE NOTICE 'CP6 backfill: % caixas recalculados', v_n;
END$$;
