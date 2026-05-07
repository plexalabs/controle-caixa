-- ============================================================
-- FEAT-EDITAR-EXCLUIR (parte 2): RPC editar_lancamento
--
-- Edita campos de lancamento ja existente. SECURITY DEFINER pra
-- bypassar a trigger fn_lancamento_travar_pos_categoria via
-- session_replication_role='replica' (a propria RPC e o ponto de
-- controle: valida permissoes, janela, motivo, e cria observacao
-- automatica).
--
-- Aceita p_dados jsonb com campos opcionais:
--   numero_nf      text
--   codigo_pedido  text
--   cliente_nome   text
--   valor_nf       numeric
--   categoria      categoria_lancamento
--   dados_categoria jsonb
--
-- Permissoes:
--   - Mexer em qualquer campo basico (NF/codigo/cliente/valor):
--     exige tem_permissao('lancamento.editar')
--   - Mexer em categoria/dados_categoria:
--     exige tem_permissao('lancamento.editar_categoria')
--     E lancamento dentro da janela (config lancamento.editar_categoria_minutos)
--
-- Estados aceitos: pendente, em_preenchimento, completo.
-- finalizado/cancelado_pos/excluido nao podem ser editados (RPC recusa).
--
-- Motivo: obrigatorio, >= 10 caracteres. Vai pra
-- lancamento_observacao com fonte='edicao'.
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
  v_uid       uuid := auth.uid();
  v_lanc      public.lancamento;
  v_motivo    text := nullif(trim(coalesce(p_motivo, '')), '');
  v_pode_basico    boolean;
  v_pode_categoria boolean;
  v_mexe_basico    boolean;
  v_mexe_categoria boolean;
  v_janela_min     int;
  v_idade_min      numeric;
  v_resumo_dados   text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão não autenticada.' USING ERRCODE = '28000';
  END IF;
  IF v_motivo IS NULL OR length(v_motivo) < 10 THEN
    RAISE EXCEPTION 'Motivo da edição é obrigatório (mínimo 10 caracteres).' USING ERRCODE = '22023';
  END IF;
  IF p_dados IS NULL OR p_dados = '{}'::jsonb THEN
    RAISE EXCEPTION 'Nenhum campo enviado para edição.' USING ERRCODE = '22023';
  END IF;

  -- Identifica quais grupos de campos estao sendo alterados
  v_mexe_basico := p_dados ?| array['numero_nf','codigo_pedido','cliente_nome','valor_nf'];
  v_mexe_categoria := p_dados ?| array['categoria','dados_categoria'];

  -- Permissoes
  v_pode_basico    := public.tem_permissao(v_uid, 'lancamento.editar');
  v_pode_categoria := public.tem_permissao(v_uid, 'lancamento.editar_categoria');
  IF v_mexe_basico AND NOT v_pode_basico THEN
    RAISE EXCEPTION 'Permissão negada (lancamento.editar).' USING ERRCODE = '42501';
  END IF;
  IF v_mexe_categoria AND NOT v_pode_categoria THEN
    RAISE EXCEPTION 'Permissão negada (lancamento.editar_categoria).' USING ERRCODE = '42501';
  END IF;

  -- Lock
  SELECT * INTO v_lanc FROM public.lancamento WHERE id = p_lancamento_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lançamento % não encontrado.', p_lancamento_id USING ERRCODE = 'P0002';
  END IF;

  -- Estado
  IF v_lanc.estado IN ('finalizado','cancelado_pos','excluido','resolvido','cancelado') THEN
    RAISE EXCEPTION 'Lançamentos com estado % não podem ser editados (use cancelar/excluir).', v_lanc.estado
      USING ERRCODE = 'check_violation';
  END IF;

  -- Janela pra mexer em categoria
  IF v_mexe_categoria THEN
    SELECT (valor::text)::int INTO v_janela_min
      FROM public.config WHERE chave = 'lancamento.editar_categoria_minutos';
    v_janela_min := COALESCE(v_janela_min, 30);
    v_idade_min := EXTRACT(EPOCH FROM (now() - v_lanc.criado_em)) / 60.0;
    IF v_idade_min > v_janela_min THEN
      RAISE EXCEPTION 'Janela para editar categoria expirou (% min, lançamento criado há % min).',
        v_janela_min, round(v_idade_min)
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Aplica UPDATE bypassando a trigger de imutabilidade
  -- (a propria RPC e o ponto de controle).
  PERFORM set_config('session_replication_role', 'replica', true);

  UPDATE public.lancamento
     SET numero_nf       = COALESCE(p_dados->>'numero_nf',      numero_nf),
         codigo_pedido   = COALESCE(p_dados->>'codigo_pedido',  codigo_pedido),
         cliente_nome    = COALESCE(p_dados->>'cliente_nome',   cliente_nome),
         valor_nf        = COALESCE((p_dados->>'valor_nf')::numeric, valor_nf),
         categoria       = COALESCE((p_dados->>'categoria')::categoria_lancamento, categoria),
         dados_categoria = COALESCE(p_dados->'dados_categoria', dados_categoria),
         atualizado_por  = v_uid
   WHERE id = p_lancamento_id
   RETURNING * INTO v_lanc;

  PERFORM set_config('session_replication_role', 'origin', true);

  -- Resumo dos campos alterados pra observacao
  v_resumo_dados := '';
  IF p_dados ? 'numero_nf'      THEN v_resumo_dados := v_resumo_dados || 'NF, '; END IF;
  IF p_dados ? 'codigo_pedido'  THEN v_resumo_dados := v_resumo_dados || 'código, '; END IF;
  IF p_dados ? 'cliente_nome'   THEN v_resumo_dados := v_resumo_dados || 'cliente, '; END IF;
  IF p_dados ? 'valor_nf'       THEN v_resumo_dados := v_resumo_dados || 'valor, '; END IF;
  IF p_dados ? 'categoria'      THEN v_resumo_dados := v_resumo_dados || 'categoria, '; END IF;
  IF p_dados ? 'dados_categoria' THEN v_resumo_dados := v_resumo_dados || 'detalhes pagamento, '; END IF;
  v_resumo_dados := rtrim(v_resumo_dados, ', ');

  -- Trilha auditavel
  INSERT INTO public.lancamento_observacao (lancamento_id, texto, autor_id, fonte)
  VALUES (
    p_lancamento_id,
    'Edição: ' || v_resumo_dados || '. Motivo: ' || v_motivo,
    v_uid,
    'edicao'
  );

  RETURN v_lanc;
END;
$$;

GRANT EXECUTE ON FUNCTION public.editar_lancamento(uuid, jsonb, text) TO authenticated;

COMMENT ON FUNCTION public.editar_lancamento(uuid, jsonb, text) IS
  'Edita campos de lancamento. Exige permissoes lancamento.editar (campos basicos) e/ou lancamento.editar_categoria (categoria, dentro da janela). Motivo >=10 chars, registrado em observacao com fonte=edicao.';
