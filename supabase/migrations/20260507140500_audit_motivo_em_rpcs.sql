-- ATL-2: propaga app.motivo nas RPCs editar/excluir lancamento.
--
-- Sem esse SET, o trigger fn_audit_row pega motivo NULL — perde o
-- principal contexto que justifica a operação. Atualizamos as 2 RPCs
-- pra setar `set_config('app.motivo', motivo, true)` (true = local
-- à transação) logo após validar.
--
-- Como excluir_lancamento já foi alterada em 20260507130000 pra
-- descartar notificações, regravamos a versão FINAL aqui (com motivo
-- + descarte de notif). editar_lancamento ganha apenas o set_config.

-- ============================================================
-- editar_lancamento (alter: adiciona set_config app.motivo)
-- Mantém todo o corpo da versao anterior, apenas insere o set_config
-- no inicio do bloco que ja valida o motivo.
-- ============================================================
CREATE OR REPLACE FUNCTION public.editar_lancamento(
  p_lancamento_id uuid,
  p_dados         jsonb,
  p_motivo        text
)
RETURNS public.lancamento
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_uid                uuid := auth.uid();
  v_lanc               public.lancamento;
  v_motivo             text := nullif(trim(coalesce(p_motivo, '')), '');
  v_pode_basico        boolean;
  v_pode_categoria     boolean;
  v_quer_basico        boolean;
  v_quer_categoria     boolean;
  v_minutos_janela     integer;
  v_idade_minutos      numeric;
  v_obs_texto          text := '';
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão não autenticada.' USING ERRCODE = '28000';
  END IF;
  IF v_motivo IS NULL OR length(v_motivo) < 10 THEN
    RAISE EXCEPTION 'Motivo da edição é obrigatório (mínimo 10 caracteres).' USING ERRCODE = '22023';
  END IF;

  -- ATL-2: propaga motivo pra trigger genérico de auditoria
  PERFORM set_config('app.motivo', v_motivo, true);

  SELECT * INTO v_lanc FROM public.lancamento WHERE id = p_lancamento_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lançamento % não encontrado.', p_lancamento_id USING ERRCODE = 'P0002';
  END IF;
  IF v_lanc.estado IN ('finalizado', 'cancelado_pos', 'excluido') THEN
    RAISE EXCEPTION 'Lançamento em estado % não pode ser editado.', v_lanc.estado USING ERRCODE = 'check_violation';
  END IF;

  v_quer_basico := (p_dados ? 'numero_nf') OR (p_dados ? 'codigo_pedido')
                OR (p_dados ? 'cliente_nome') OR (p_dados ? 'valor_nf');
  v_quer_categoria := (p_dados ? 'categoria') OR (p_dados ? 'dados_categoria');

  IF NOT v_quer_basico AND NOT v_quer_categoria THEN
    RAISE EXCEPTION 'Nada para editar (p_dados vazio).' USING ERRCODE = '22023';
  END IF;

  v_pode_basico    := public.tem_permissao(v_uid, 'lancamento.editar');
  v_pode_categoria := public.tem_permissao(v_uid, 'lancamento.editar_categoria');

  IF v_quer_basico AND NOT v_pode_basico THEN
    RAISE EXCEPTION 'Permissão negada (lancamento.editar).' USING ERRCODE = '42501';
  END IF;
  IF v_quer_categoria AND NOT v_pode_categoria THEN
    RAISE EXCEPTION 'Permissão negada (lancamento.editar_categoria).' USING ERRCODE = '42501';
  END IF;

  -- Janela de tempo pra editar categoria
  IF v_quer_categoria THEN
    SELECT (valor::integer) INTO v_minutos_janela FROM public.config WHERE chave = 'lancamento.editar_categoria_minutos';
    IF v_minutos_janela IS NULL THEN v_minutos_janela := 30; END IF;

    v_idade_minutos := EXTRACT(EPOCH FROM (now() - v_lanc.criado_em)) / 60;
    IF v_idade_minutos > v_minutos_janela THEN
      RAISE EXCEPTION 'Categoria só pode ser editada dentro de % minutos da criação (lançamento tem % minutos).',
                       v_minutos_janela, round(v_idade_minutos) USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Bypass o trigger fn_lancamento_travar_pos_categoria pra UPDATE
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

  v_obs_texto := 'Edição. Motivo: ' || v_motivo || E'\nCampos: ' || (p_dados::text);

  INSERT INTO public.lancamento_observacao (lancamento_id, texto, autor_id, fonte)
  VALUES (p_lancamento_id, v_obs_texto, v_uid, 'edicao');

  RETURN v_lanc;
END;
$$;

GRANT EXECUTE ON FUNCTION public.editar_lancamento(uuid, jsonb, text) TO authenticated;

-- ============================================================
-- excluir_lancamento (alter final: motivo no app.motivo + descarte
-- de notificações vinculadas — funde a versão de 20260507130000
-- com o set_config do motivo)
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

  -- ATL-2: motivo vai pra trigger genérico de auditoria
  PERFORM set_config('app.motivo', v_motivo, true);

  SELECT * INTO v_lanc FROM public.lancamento WHERE id = p_lancamento_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lançamento % não encontrado.', p_lancamento_id USING ERRCODE = 'P0002';
  END IF;
  IF v_lanc.estado = 'excluido' THEN
    RAISE EXCEPTION 'Lançamento já está excluido.' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.lancamento_observacao (lancamento_id, texto, autor_id, fonte)
  VALUES (p_lancamento_id,
          'Exclusão. Estado anterior: ' || v_lanc.estado || '. Motivo: ' || v_motivo,
          v_uid, 'exclusao');

  UPDATE public.lancamento
     SET estado         = 'excluido',
         atualizado_por = v_uid
   WHERE id = p_lancamento_id
   RETURNING * INTO v_lanc;

  -- ATL-1: descarte cascata das notificações vinculadas
  UPDATE public.notificacao
     SET descartada_em = now()
   WHERE lancamento_id = p_lancamento_id
     AND descartada_em IS NULL;
  GET DIAGNOSTICS v_descartadas = ROW_COUNT;

  IF v_descartadas > 0 THEN
    RAISE NOTICE 'excluir_lancamento: % notificacoes descartadas para %', v_descartadas, p_lancamento_id;
  END IF;

  RETURN v_lanc;
END;
$$;

GRANT EXECUTE ON FUNCTION public.excluir_lancamento(uuid, text) TO authenticated;
