-- ============================================================
-- CP-RBAC Sessao 6 / Bloco D: migra public.lancamento lancamento_select
--
-- Antes:
--   USING (fn_tem_papel('operador') OR fn_tem_papel('supervisor')
--          OR fn_tem_papel('auditor') OR fn_tem_papel('admin'))
-- Depois:
--   USING (tem_permissao('lancamento.visualizar_todos')
--          OR criado_por = auth.uid())
--
-- IMPACTO: 'lancamento.visualizar_todos' esta em admin/gerente/contador
-- no seed RBAC. operador NAO tem (semantica: operador ve apenas os
-- lancamentos que ele criou). super_admin via bypass.
--
-- ATENCAO: a clausula `OR criado_por = auth.uid()` e ADICIONADA nesta
-- migracao -- a policy antiga nao tinha. Sem ela, operador comum sem
-- visualizar_todos nao conseguiria ver os proprios lancamentos.
-- Mudanca semantica deliberada (nao bug introduzido). Realtime
-- subscription depende de SELECT passar -- a clausula garante que
-- usuario continue recebendo eventos dos proprios lancamentos.
-- ============================================================

DROP POLICY IF EXISTS lancamento_select ON public.lancamento;

CREATE POLICY lancamento_select ON public.lancamento
  FOR SELECT TO authenticated
  USING (
    public.tem_permissao(auth.uid(), 'lancamento.visualizar_todos')
    OR criado_por = auth.uid()
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'lancamento'
      AND policyname = 'lancamento_select'
  ) THEN
    RAISE EXCEPTION 'lancamento_select nao foi recriada';
  END IF;
END$$;
