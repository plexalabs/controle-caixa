-- ============================================================
-- CP-AUDIT-2: migra policy lanc_obs_select
--
-- Antes:
--   USING (EXISTS (SELECT 1 FROM usuario_papel
--                  WHERE usuario_id = auth.uid()
--                    AND papel IN ('admin','operador')))
-- Depois:
--   USING (tem_permissao('lancamento.visualizar_observacoes'))
--
-- IMPACTO: gerente e contador GANHAM acesso. operador legacy sem
-- perfil 'operador' atribuido PERDE acesso. super_admin via bypass.
-- ============================================================

DROP POLICY IF EXISTS "lanc_obs_select" ON public.lancamento_observacao;

CREATE POLICY "lanc_obs_select" ON public.lancamento_observacao
  FOR SELECT TO authenticated
  USING (
    public.tem_permissao(auth.uid(), 'lancamento.visualizar_observacoes')
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'lancamento_observacao' AND policyname = 'lanc_obs_select'
  ) THEN
    RAISE EXCEPTION 'Policy nao foi recriada';
  END IF;
END$$;
