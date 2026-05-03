-- REVERSA da migration 20260504401600_rbac_sessao6_lancamento_select.sql
--
-- Cole no Supabase Dashboard SQL Editor se SELECT em public.lancamento
-- quebrar (lista de lancamentos vazia, realtime nao atualiza, etc).
--
-- NOTA: a policy original NAO tinha `OR criado_por = auth.uid()`. A
-- reversa restaura o comportamento ORIGINAL (sem essa clausula).

DROP POLICY IF EXISTS lancamento_select ON public.lancamento;

CREATE POLICY lancamento_select ON public.lancamento
  FOR SELECT TO authenticated
  USING (
    public.fn_tem_papel('operador'::character varying)
    OR public.fn_tem_papel('supervisor'::character varying)
    OR public.fn_tem_papel('auditor'::character varying)
    OR public.fn_tem_papel('admin'::character varying)
  );
