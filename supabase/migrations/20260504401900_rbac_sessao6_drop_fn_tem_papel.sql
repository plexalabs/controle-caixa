-- ============================================================
-- CP-RBAC Sessao 6 -- DROP final de fn_tem_papel
--
-- Apos as 17 policies migradas para tem_permissao() ao longo dos
-- blocos A, B, C e D, a funcao legacy fn_tem_papel(varchar) nao tem
-- mais dependentes ativos. Esta migration confirma e dropa.
--
-- Validado em PROD pelo Operador: smoke completo passou em todos os
-- blocos + realtime entre 2 abas funcionando (Bloco D).
--
-- Ponto de NAO RETORNO controlado. Apos esta migration, reverter
-- qualquer policy individual exige recriar fn_tem_papel antes
-- (ver docs/RBAC_SESSAO6_ROLLBACK.md secao "DROP aplicado").
-- ============================================================

-- Guard 1: confirma zero policies usando fn_tem_papel antes de dropar
DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM pg_policies
  WHERE qual::text ~ 'fn_tem_papel'
     OR with_check::text ~ 'fn_tem_papel';

  IF v_count > 0 THEN
    RAISE EXCEPTION 'Ainda ha % policies usando fn_tem_papel. NAO DROPAR.', v_count;
  END IF;
END$$;

-- Guard 2: confirma que nenhuma function/view/trigger faz referencia
DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
    AND p.proname <> 'fn_tem_papel'
    AND p.prokind = 'f'
    AND pg_get_functiondef(p.oid) ~ 'fn_tem_papel';

  IF v_count > 0 THEN
    RAISE EXCEPTION 'Ainda ha % funcoes referenciando fn_tem_papel. NAO DROPAR.', v_count;
  END IF;
END$$;

-- DROP da funcao legacy (apenas a assinatura existente)
DROP FUNCTION IF EXISTS public.fn_tem_papel(character varying);

-- Confirma que sumiu
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_tem_papel'
  ) THEN
    RAISE EXCEPTION 'fn_tem_papel ainda existe apos DROP';
  END IF;
  RAISE NOTICE 'OK: fn_tem_papel removida do banco';
END$$;
