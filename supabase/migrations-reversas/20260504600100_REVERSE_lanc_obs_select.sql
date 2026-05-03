-- REVERSA da migration 20260504600100_audit_fix_002_lanc_obs_select.sql
--
-- NÃO aplicar automaticamente. Cole no Supabase Dashboard → SQL Editor
-- se queries em lancamento_observacao começarem a falhar.
--
-- NOTA: a reversa NÃO depende de fn_tem_papel (que foi dropado na Sessão 6),
-- pois usa EXISTS direto contra a coluna papel de usuario_papel.

DROP POLICY IF EXISTS "lanc_obs_select" ON public.lancamento_observacao;

CREATE POLICY "lanc_obs_select" ON public.lancamento_observacao
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuario_papel
      WHERE usuario_id = auth.uid()
        AND papel IN ('admin','operador')
    )
  );
