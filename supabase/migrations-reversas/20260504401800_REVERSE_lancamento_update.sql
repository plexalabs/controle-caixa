-- REVERSA da migration 20260504401800_rbac_sessao6_lancamento_update.sql
--
-- Cole no Supabase Dashboard SQL Editor se UPDATE em public.lancamento
-- (ex.: categorizar lancamento) quebrar para algum perfil.

DROP POLICY IF EXISTS lancamento_update ON public.lancamento;

CREATE POLICY lancamento_update ON public.lancamento
  FOR UPDATE TO authenticated
  USING (
    public.fn_tem_papel('operador'::character varying)
    OR public.fn_tem_papel('admin'::character varying)
  );
