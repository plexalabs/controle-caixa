-- REVERSA da migration 20260504401400_rbac_sessao6_caixa_insert.sql
--
-- Cole no Supabase Dashboard SQL Editor se INSERT na tabela caixa
-- quebrar para o perfil gerente (que ganhou capacidade na nova policy).

DROP POLICY IF EXISTS caixa_insert ON public.caixa;

CREATE POLICY caixa_insert ON public.caixa
  FOR INSERT TO authenticated
  WITH CHECK (
    (
      public.fn_tem_papel('operador'::character varying)
      OR public.fn_tem_papel('admin'::character varying)
    )
    AND criado_por = auth.uid()
  );
