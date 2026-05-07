-- ============================================================
-- FEAT-EDITAR-EXCLUIR (parte 3): RPC excluir_lancamento
--
-- Soft-delete de lancamento (estado='excluido'). Trigger
-- fn_lancamento_travar_pos_categoria ja permite transicao
-- pra excluido de qualquer estado, entao nao precisa bypass.
--
-- Cria observacao automatica com fonte='exclusao' antes do
-- update (a observacao DEPOIS do estado='excluido' poderia
-- ser bloqueada por RLS de SELECT em queries futuras).
-- ============================================================

CREATE OR REPLACE FUNCTION public.excluir_lancamento(
  p_lancamento_id uuid,
  p_motivo        text
)
RETURNS public.lancamento
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_lanc   public.lancamento;
  v_motivo text := nullif(trim(coalesce(p_motivo, '')), '');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão não autenticada.' USING ERRCODE = '28000';
  END IF;
  IF NOT public.tem_permissao(v_uid, 'lancamento.excluir') THEN
    RAISE EXCEPTION 'Permissão negada (lancamento.excluir).' USING ERRCODE = '42501';
  END IF;
  IF v_motivo IS NULL OR length(v_motivo) < 10 THEN
    RAISE EXCEPTION 'Motivo da exclusão é obrigatório (mínimo 10 caracteres).' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_lanc FROM public.lancamento WHERE id = p_lancamento_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lançamento % não encontrado.', p_lancamento_id USING ERRCODE = 'P0002';
  END IF;
  IF v_lanc.estado = 'excluido' THEN
    RAISE EXCEPTION 'Lançamento já está excluido.' USING ERRCODE = 'check_violation';
  END IF;

  -- Trilha auditavel ANTES do soft-delete (porque depois RLS pode
  -- esconder o lancamento de queries futuras de leitura).
  INSERT INTO public.lancamento_observacao (lancamento_id, texto, autor_id, fonte)
  VALUES (
    p_lancamento_id,
    'Exclusão. Estado anterior: ' || v_lanc.estado || '. Motivo: ' || v_motivo,
    v_uid,
    'exclusao'
  );

  UPDATE public.lancamento
     SET estado         = 'excluido',
         atualizado_por = v_uid
   WHERE id = p_lancamento_id
   RETURNING * INTO v_lanc;

  RETURN v_lanc;
END;
$$;

GRANT EXECUTE ON FUNCTION public.excluir_lancamento(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.excluir_lancamento(uuid, text) IS
  'Soft-delete de lancamento (estado=excluido). Exige permissao lancamento.excluir, motivo >=10 chars, registrado em observacao com fonte=exclusao.';
