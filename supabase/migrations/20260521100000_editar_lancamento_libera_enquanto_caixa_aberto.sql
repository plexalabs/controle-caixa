-- ATL: editar_lancamento — remove janela de 30min, permite enquanto
-- caixa estiver 'aberto' ou 'em_conferencia'. Operador pediu:
-- evitar excluir + relancar so pra corrigir categoria. Enquanto o
-- caixa estiver aberto, qualquer categoria pode ser ajustada.
--
-- A protecao contra bagunca apos-fechamento permanece via checagem
-- do estado do caixa (fechado/arquivado bloqueiam).

CREATE OR REPLACE FUNCTION public.editar_lancamento(
  p_lancamento_id uuid,
  p_dados         jsonb,
  p_motivo        text
) RETURNS public.lancamento
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_uid            uuid := auth.uid();
  v_lanc           public.lancamento;
  v_caixa_estado   text;
  v_motivo         text := nullif(trim(coalesce(p_motivo, '')), '');
  v_pode_basico    boolean;
  v_pode_categoria boolean;
  v_quer_basico    boolean;
  v_quer_categoria boolean;
  v_obs_texto      text := '';
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessao nao autenticada.' USING ERRCODE = '28000';
  END IF;
  IF v_motivo IS NULL OR length(v_motivo) < 10 THEN
    RAISE EXCEPTION 'Motivo da edicao e obrigatorio (minimo 10 caracteres).' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.motivo', v_motivo, true);

  SELECT * INTO v_lanc FROM public.lancamento WHERE id = p_lancamento_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lancamento % nao encontrado.', p_lancamento_id USING ERRCODE = 'P0002';
  END IF;
  IF v_lanc.estado IN ('finalizado', 'cancelado_pos', 'excluido') THEN
    RAISE EXCEPTION 'Lancamento em estado % nao pode ser editado.', v_lanc.estado USING ERRCODE = 'check_violation';
  END IF;

  v_quer_basico    := (p_dados ? 'numero_nf') OR (p_dados ? 'codigo_pedido')
                   OR (p_dados ? 'cliente_nome') OR (p_dados ? 'valor_nf');
  v_quer_categoria := (p_dados ? 'categoria') OR (p_dados ? 'dados_categoria');

  IF NOT v_quer_basico AND NOT v_quer_categoria THEN
    RAISE EXCEPTION 'Nada para editar (p_dados vazio).' USING ERRCODE = '22023';
  END IF;

  v_pode_basico    := public.tem_permissao(v_uid, 'lancamento.editar');
  v_pode_categoria := public.tem_permissao(v_uid, 'lancamento.editar_categoria');

  IF v_quer_basico AND NOT v_pode_basico THEN
    RAISE EXCEPTION 'Permissao negada (lancamento.editar).' USING ERRCODE = '42501';
  END IF;
  IF v_quer_categoria AND NOT v_pode_categoria THEN
    RAISE EXCEPTION 'Permissao negada (lancamento.editar_categoria).' USING ERRCODE = '42501';
  END IF;

  -- Categoria editavel enquanto o caixa estiver aberto/em_conferencia.
  -- Sem janela de tempo. Janela antiga (30min) removida.
  IF v_quer_categoria THEN
    SELECT estado INTO v_caixa_estado FROM public.caixa WHERE id = v_lanc.caixa_id;
    IF v_caixa_estado NOT IN ('aberto', 'em_conferencia') THEN
      RAISE EXCEPTION
        'Categoria so pode ser editada enquanto o caixa estiver aberto ou em conferencia. Caixa atual: %.',
        v_caixa_estado USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  SET LOCAL session_replication_role = replica;

  UPDATE public.lancamento
     SET numero_nf       = COALESCE(nullif(p_dados->>'numero_nf', ''), numero_nf),
         codigo_pedido   = COALESCE(nullif(p_dados->>'codigo_pedido', ''), codigo_pedido),
         cliente_nome    = COALESCE(nullif(p_dados->>'cliente_nome', ''), cliente_nome),
         valor_nf        = COALESCE((p_dados->>'valor_nf')::numeric, valor_nf),
         categoria       = COALESCE((p_dados->>'categoria')::categoria_lancamento, categoria),
         dados_categoria = COALESCE(p_dados->'dados_categoria', dados_categoria),
         atualizado_por  = v_uid
   WHERE id = p_lancamento_id
   RETURNING * INTO v_lanc;

  SET LOCAL session_replication_role = origin;

  v_obs_texto := 'Edicao. Motivo: ' || v_motivo || E'\nCampos: ' || (p_dados::text);
  INSERT INTO public.lancamento_observacao (lancamento_id, texto, autor_id, fonte)
  VALUES (p_lancamento_id, v_obs_texto, v_uid, 'edicao');

  RETURN v_lanc;
END;
$$;

GRANT EXECUTE ON FUNCTION public.editar_lancamento(uuid, jsonb, text) TO authenticated;
