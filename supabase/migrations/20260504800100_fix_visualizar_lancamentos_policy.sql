-- ============================================================
-- FIX-VISUALIZAR: migra policy lancamento_select para usar a nova
-- permissao lancamento.visualizar
--
-- Antes:
--   USING (tem_permissao('lancamento.visualizar_todos')
--          OR criado_por = auth.uid())
-- Depois:
--   USING (tem_permissao('lancamento.visualizar'))
--
-- Como lancamento.visualizar foi atribuida a todos os 5 perfis no
-- commit anterior, a clausula `criado_por = auth.uid()` se torna
-- redundante e e removida (qualquer authenticated com perfil RBAC
-- atribuido pode ver tudo). super_admin continua via bypass.
--
-- visualizar_todos NAO eh dropada: permanece no catalogo pra uso
-- futuro (relatorios consolidados, exports gerenciais que exigem
-- ver lancamentos de todos os caixas, nao apenas do caixa que o
-- usuario esta vendo).
-- ============================================================

DROP POLICY IF EXISTS lancamento_select ON public.lancamento;

CREATE POLICY lancamento_select ON public.lancamento
  FOR SELECT TO authenticated
  USING (
    public.tem_permissao(auth.uid(), 'lancamento.visualizar')
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
