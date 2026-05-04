-- REVERSA da migration 20260504800100_fix_visualizar_lancamentos_policy.sql
--
-- NÃO aplicar automaticamente. Cole no Supabase Dashboard → SQL Editor
-- se a leitura ampla de lancamentos precisar ser revertida (decisao de
-- produto reverter, ou restauracao do comportamento original do RBAC
-- onde operador/vendedor viam apenas os proprios).
--
-- Restaura a policy lancamento_select para o estado pos-Sessao 6 do
-- RBAC (CP-RBAC Sessao 6 / Bloco D, migration 20260504401600).

DROP POLICY IF EXISTS lancamento_select ON public.lancamento;

CREATE POLICY lancamento_select ON public.lancamento
  FOR SELECT TO authenticated
  USING (
    public.tem_permissao(auth.uid(), 'lancamento.visualizar_todos')
    OR criado_por = auth.uid()
  );
