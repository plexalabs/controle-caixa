-- ============================================================
-- CP-RBAC Sessao 2: migra revelar_pii para tem_permissao()
--
-- ANTES: usava fn_tem_papel('operador'|'supervisor'|'auditor'|'admin')
-- DEPOIS: tem_permissao('lancamento.revelar_pii')
--
-- A permissao 'lancamento.revelar_pii' foi criada na migration
-- 20260504100000 e atribuida a admin, gerente e operador --
-- preservando o conjunto de papeis que tinha acesso (supervisor e
-- auditor nao existem como perfil RBAC; sua intencao operacional
-- fica coberta por gerente).
--
-- Whitelist de campos + insercao em audit_log preservados integralmente.
-- ============================================================

CREATE OR REPLACE FUNCTION public.revelar_pii(
  p_lancamento_id uuid,
  p_campo         character varying
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_dados jsonb;
  v_valor jsonb;
BEGIN
  -- Permissao: lancamento.revelar_pii
  -- (substitui check fn_tem_papel('operador'/'supervisor'/'auditor'/'admin'))
  IF NOT public.tem_permissao(auth.uid(), 'lancamento.revelar_pii') THEN
    RAISE EXCEPTION 'Acesso negado: usuario sem papel valido';
  END IF;

  -- Whitelist de campos que podem ser revelados (defesa em profundidade).
  IF p_campo NOT IN (
    'ultimos_4_digitos', 'chave_recebedora',
    'link_url', 'comprovante_id_externo'
  ) THEN
    RAISE EXCEPTION 'Campo % nao esta na whitelist de revelacao', p_campo;
  END IF;

  SELECT dados_categoria INTO v_dados FROM public.lancamento WHERE id = p_lancamento_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lancamento % nao encontrado', p_lancamento_id;
  END IF;

  v_valor := v_dados -> p_campo;

  -- Registra revelacao em audit_log (RN-080).
  INSERT INTO public.audit_log (
    tabela, registro_id, acao,
    dados_antes, dados_depois,
    usuario_id, usuario_email
  )
  VALUES (
    'lancamento',
    p_lancamento_id,
    'REVEAL_PII',
    jsonb_build_object('campo', p_campo),
    NULL,
    auth.uid(),
    (SELECT email FROM auth.users WHERE id = auth.uid())
  );

  RETURN v_valor;
END;
$function$;
