-- ============================================================
-- CP-AUDIT-1: adiciona check tem_permissao() em 4 RPCs
--
-- Auditoria identificou que 4 RPCs SECURITY DEFINER mudam estado
-- de lancamento checando apenas auth.uid() IS NOT NULL. Hoje
-- dormente porque o unico usuario e super_admin (bypass total),
-- mas qualquer 2o usuario authenticated poderia chamar.
--
-- Cada RPC ganha o check no inicio. Corpo preservado integralmente.
-- super_admin continua bypassando via tem_permissao().
-- ============================================================

-- ── A. categorizar_lancamento → lancamento.categorizar ──────────────
CREATE OR REPLACE FUNCTION public.categorizar_lancamento(
  p_lancamento_id   uuid,
  p_categoria       categoria_lancamento,
  p_dados_categoria jsonb
)
RETURNS public.lancamento
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_lanc public.lancamento;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão não autenticada.' USING ERRCODE = '28000';
  END IF;
  IF NOT public.tem_permissao(auth.uid(), 'lancamento.categorizar') THEN
    RAISE EXCEPTION 'Permissão negada (lancamento.categorizar).' USING ERRCODE = '42501';
  END IF;
  IF p_categoria IS NULL THEN
    RAISE EXCEPTION 'Categoria é obrigatória.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_lanc FROM public.lancamento WHERE id = p_lancamento_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lançamento % não encontrado.', p_lancamento_id USING ERRCODE = 'no_data_found';
  END IF;
  IF v_lanc.estado NOT IN ('pendente', 'em_preenchimento') THEN
    RAISE EXCEPTION 'Apenas lançamentos pendentes podem ser categorizados. Estado atual: %.', v_lanc.estado
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.lancamento
     SET categoria       = p_categoria,
         dados_categoria = COALESCE(p_dados_categoria, '{}'::jsonb),
         estado          = 'completo',
         atualizado_por  = auth.uid()
   WHERE id = p_lancamento_id
   RETURNING * INTO v_lanc;

  RETURN v_lanc;
END;
$$;

COMMENT ON FUNCTION public.categorizar_lancamento(uuid, categoria_lancamento, jsonb) IS
  'Transiciona lancamento pendente -> completo aplicando categoria e dados_categoria. Falha se estado nao for pendente. Exige permissao lancamento.categorizar.';


-- ── B. marcar_finalizado → lancamento.finalizar ─────────────────────
CREATE OR REPLACE FUNCTION public.marcar_finalizado(p_lancamento_id uuid)
RETURNS public.lancamento
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_lanc public.lancamento;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão não autenticada.' USING ERRCODE = '28000';
  END IF;
  IF NOT public.tem_permissao(auth.uid(), 'lancamento.finalizar') THEN
    RAISE EXCEPTION 'Permissão negada (lancamento.finalizar).' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_lanc FROM public.lancamento WHERE id = p_lancamento_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lançamento % não encontrado.', p_lancamento_id USING ERRCODE = 'no_data_found';
  END IF;
  IF v_lanc.estado <> 'completo' THEN
    RAISE EXCEPTION 'Só lançamentos completos podem ser finalizados. Estado atual: %.', v_lanc.estado
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.lancamento
     SET estado         = 'finalizado',
         resolvido_em   = now(),
         resolvido_por  = auth.uid(),
         atualizado_por = auth.uid()
   WHERE id = p_lancamento_id
   RETURNING * INTO v_lanc;

  INSERT INTO public.lancamento_observacao (lancamento_id, texto, autor_id, fonte)
  VALUES (p_lancamento_id, 'Lançamento marcado como finalizado.', auth.uid(), 'finalizar');

  RETURN v_lanc;
END;
$$;

COMMENT ON FUNCTION public.marcar_finalizado(uuid) IS
  'Transiciona lancamento completo -> finalizado e registra observacao automatica. Exige permissao lancamento.finalizar.';


-- ── C. marcar_cancelado_pos → lancamento.cancelar_pos ───────────────
CREATE OR REPLACE FUNCTION public.marcar_cancelado_pos(
  p_lancamento_id uuid,
  p_motivo        text
)
RETURNS public.lancamento
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_lanc public.lancamento;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão não autenticada.' USING ERRCODE = '28000';
  END IF;
  IF NOT public.tem_permissao(auth.uid(), 'lancamento.cancelar_pos') THEN
    RAISE EXCEPTION 'Permissão negada (lancamento.cancelar_pos).' USING ERRCODE = '42501';
  END IF;
  IF p_motivo IS NULL OR length(trim(p_motivo)) < 5 THEN
    RAISE EXCEPTION 'Motivo do cancelamento é obrigatório (mínimo 5 caracteres).' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_lanc FROM public.lancamento WHERE id = p_lancamento_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lançamento % não encontrado.', p_lancamento_id USING ERRCODE = 'no_data_found';
  END IF;
  IF v_lanc.estado <> 'completo' THEN
    RAISE EXCEPTION 'Só lançamentos completos podem ser cancelados pós-pagamento. Estado atual: %.', v_lanc.estado
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.lancamento
     SET estado         = 'cancelado_pos',
         atualizado_por = auth.uid()
   WHERE id = p_lancamento_id
   RETURNING * INTO v_lanc;

  INSERT INTO public.lancamento_observacao (lancamento_id, texto, autor_id, fonte)
  VALUES (p_lancamento_id, 'Cancelado pós-pagamento. Motivo: ' || trim(p_motivo), auth.uid(), 'cancelar_pos');

  RETURN v_lanc;
END;
$$;

COMMENT ON FUNCTION public.marcar_cancelado_pos(uuid, text) IS
  'Transiciona lancamento completo -> cancelado_pos com motivo (>=5 chars). Cria observacao automatica. Exige permissao lancamento.cancelar_pos.';


-- ── D. adicionar_observacao → lancamento.adicionar_observacao ───────
CREATE OR REPLACE FUNCTION public.adicionar_observacao(
  p_lancamento_id uuid,
  p_texto         text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_obs_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão não autenticada.' USING ERRCODE = '28000';
  END IF;
  IF NOT public.tem_permissao(v_uid, 'lancamento.adicionar_observacao') THEN
    RAISE EXCEPTION 'Permissão negada (lancamento.adicionar_observacao).' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.lancamento WHERE id = p_lancamento_id) THEN
    RAISE EXCEPTION 'Lançamento % não encontrado.', p_lancamento_id USING ERRCODE = 'no_data_found';
  END IF;
  IF p_texto IS NULL OR length(trim(p_texto)) = 0 THEN
    RAISE EXCEPTION 'Texto da observação não pode ser vazio.' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.lancamento_observacao (lancamento_id, texto, autor_id, fonte)
  VALUES (p_lancamento_id, trim(p_texto), v_uid, 'manual')
  RETURNING id INTO v_obs_id;

  RETURN v_obs_id;
END;
$$;

COMMENT ON FUNCTION public.adicionar_observacao(uuid, text) IS
  'Adiciona observacao manual a um lancamento. Autor = auth.uid(). Append-only. Exige permissao lancamento.adicionar_observacao.';
