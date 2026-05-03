-- ============================================================
-- CP-AUDIT-2: migra policy lanc_obs_insert
--
-- Antes:
--   WITH CHECK (auth.uid() = autor_id
--               AND EXISTS (SELECT 1 FROM usuario_papel
--                           WHERE usuario_id = auth.uid()
--                             AND papel IN ('admin','operador')))
-- Depois:
--   WITH CHECK (autor_id = auth.uid()
--               AND tem_permissao('lancamento.adicionar_observacao'))
-- ============================================================

DROP POLICY IF EXISTS "lanc_obs_insert" ON public.lancamento_observacao;

CREATE POLICY "lanc_obs_insert" ON public.lancamento_observacao
  FOR INSERT TO authenticated
  WITH CHECK (
    autor_id = auth.uid()
    AND public.tem_permissao(auth.uid(), 'lancamento.adicionar_observacao')
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'lancamento_observacao' AND policyname = 'lanc_obs_insert'
  ) THEN
    RAISE EXCEPTION 'Policy nao foi recriada';
  END IF;
END$$;
