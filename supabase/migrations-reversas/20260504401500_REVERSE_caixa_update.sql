-- REVERSA da migration 20260504401500_rbac_sessao6_caixa_update.sql
--
-- Cole no Supabase Dashboard SQL Editor se UPDATE na tabela caixa
-- (ex.: fechar caixa) quebrar para algum perfil.

DROP POLICY IF EXISTS caixa_update ON public.caixa;

CREATE POLICY caixa_update ON public.caixa
  FOR UPDATE TO authenticated
  USING (
    public.fn_tem_papel('operador'::character varying)
    OR public.fn_tem_papel('admin'::character varying)
  );
