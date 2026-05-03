-- REVERSA da migration 20260504401300_rbac_sessao6_caixa_select.sql
--
-- Cole no Supabase Dashboard SQL Editor se SELECT na tabela caixa
-- quebrar para algum perfil que devia ter acesso.

DROP POLICY IF EXISTS caixa_select ON public.caixa;

CREATE POLICY caixa_select ON public.caixa
  FOR SELECT TO authenticated
  USING (
    public.fn_tem_papel('operador'::character varying)
    OR public.fn_tem_papel('supervisor'::character varying)
    OR public.fn_tem_papel('auditor'::character varying)
    OR public.fn_tem_papel('admin'::character varying)
  );
