-- CP-PRE-DEPLOY-1 — RPC arquivar_antigos.
--
-- Decisão de design (após investigação): observações de lançamento são
-- IMUTÁVEIS por trigger BEFORE DELETE (`trg_lanc_obs_no_delete`) — parte
-- da auditoria. Não dá pra mover/deletar do banco vivo. Como o FK
-- `lancamento_observacao.lancamento_id` é ON DELETE RESTRICT, lançamentos
-- COM observações simplesmente NÃO são arquivados. Ficam vivos pra
-- preservar o histórico completo.
--
-- A RPC retorna 3 colunas:
--   arquivados: quantos lançamentos foram movidos (sem observações)
--   ignorados_com_observacoes: quantos eram elegíveis mas têm histórico
--   erro: NULL em caso de sucesso

DROP TABLE IF EXISTS public.lancamento_observacao_arquivada;
DROP FUNCTION IF EXISTS public.arquivar_antigos();

CREATE OR REPLACE FUNCTION public.arquivar_antigos()
RETURNS TABLE(arquivados integer, ignorados_com_observacoes integer, erro text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_dias       integer;
  v_data_corte date;
  v_count      integer := 0;
  v_ignorados  integer := 0;
BEGIN
  SELECT (valor #>> '{}')::integer INTO v_dias
    FROM public.config WHERE chave = 'dias_retencao_arquivamento';

  IF v_dias IS NULL OR v_dias <= 0 THEN
    RETURN QUERY SELECT 0, 0, 'Configuração inválida: dias_retencao_arquivamento ausente ou <= 0';
    RETURN;
  END IF;

  v_data_corte := current_date - v_dias;

  -- Conta elegíveis que serão IGNORADOS (têm observações imutáveis)
  SELECT count(*) INTO v_ignorados
    FROM public.lancamento l
    JOIN public.caixa c ON c.id = l.caixa_id
   WHERE l.estado IN ('finalizado', 'cancelado_pos')
     AND c.data < v_data_corte
     AND EXISTS (SELECT 1 FROM public.lancamento_observacao lo WHERE lo.lancamento_id = l.id);

  -- Move lançamentos elegíveis SEM observações
  WITH movidos AS (
    INSERT INTO public.lancamento_arquivado
    SELECT l.*, now(), 'sistema'
      FROM public.lancamento l
      JOIN public.caixa c ON c.id = l.caixa_id
     WHERE l.estado IN ('finalizado', 'cancelado_pos')
       AND c.data < v_data_corte
       AND NOT EXISTS (SELECT 1 FROM public.lancamento_observacao lo WHERE lo.lancamento_id = l.id)
    RETURNING id
  )
  DELETE FROM public.lancamento WHERE id IN (SELECT id FROM movidos);

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN QUERY SELECT v_count, v_ignorados, NULL::text;
END;
$$;

GRANT EXECUTE ON FUNCTION public.arquivar_antigos() TO authenticated;
