-- ATL-1: ao excluir lancamento, descartar TODAS as notificacoes que
-- apontam pra ele (lancamento_id = id). Realtime na UI faz o feed e
-- o sino sumirem em tempo real para todos os usuarios online.
--
-- Mantemos descartada_em (NÃO DELETE) — assim o histórico continua
-- disponível para o audit log e a aba "Descartadas" do feed.

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
  v_descartadas integer := 0;
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

  -- Trilha auditavel ANTES do soft-delete
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

  -- ATL-1: descarta notificacoes orfas desse lancamento.
  -- Filtra por descartada_em IS NULL pra nao sobrescrever timestamp
  -- de quem ja foi descartado manualmente antes.
  UPDATE public.notificacao
     SET descartada_em = now()
   WHERE lancamento_id = p_lancamento_id
     AND descartada_em IS NULL;
  GET DIAGNOSTICS v_descartadas = ROW_COUNT;

  -- Loga quantas notificacoes foram descartadas (debugging)
  IF v_descartadas > 0 THEN
    RAISE NOTICE 'excluir_lancamento: % notificacoes descartadas para %', v_descartadas, p_lancamento_id;
  END IF;

  RETURN v_lanc;
END;
$$;

GRANT EXECUTE ON FUNCTION public.excluir_lancamento(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.excluir_lancamento(uuid, text) IS
  'Soft-delete de lancamento (estado=excluido). Exige permissao lancamento.excluir, motivo >=10 chars, registrado em observacao com fonte=exclusao. ATL-1: tambem descarta notificacoes vinculadas ao lancamento.';
