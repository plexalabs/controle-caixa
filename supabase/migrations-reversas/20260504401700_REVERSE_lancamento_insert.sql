-- REVERSA da migration 20260504401700_rbac_sessao6_lancamento_insert.sql
--
-- Cole no Supabase Dashboard SQL Editor se INSERT em public.lancamento
-- quebrar para o perfil gerente (que ganhou capacidade na nova policy).

DROP POLICY IF EXISTS lancamento_insert ON public.lancamento;

CREATE POLICY lancamento_insert ON public.lancamento
  FOR INSERT TO authenticated
  WITH CHECK (
    (
      public.fn_tem_papel('operador'::character varying)
      OR public.fn_tem_papel('admin'::character varying)
    )
    AND criado_por = auth.uid()
  );
