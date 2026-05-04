-- ============================================================
-- FIX-VISUALIZAR: nova permissao lancamento.visualizar (todos os perfis)
--
-- Estado anterior:
--   policy lancamento_select usa lancamento.visualizar_todos OR criado_por=uid
--   - admin/gerente/contador tem visualizar_todos -> ve tudo
--   - operador/vendedor: ve so os proprios lancamentos
--
-- Operador relatou: na conta operadora, caixa fechado parece vazio
-- pois lancamentos foram criados pelo super_admin e RLS esconde.
-- Decisao de produto: TODOS os perfis devem enxergar os lancamentos
-- do caixa pra ter noção do dia, mesmo sem poder editar.
--
-- Solucao: nova permissao lancamento.visualizar (menor, atribuida aos
-- 5 perfis). visualizar_todos permanece intocada (uso futuro:
-- relatorios consolidados, exports gerenciais).
--
-- Tambem: lancamento.visualizar_observacoes ao vendedor (consistencia:
-- se ve o lancamento, ve as observacoes anexadas).
-- ============================================================

INSERT INTO public.permissao (codigo, modulo, descricao, destrutiva) VALUES
  ('lancamento.visualizar', 'lancamento', 'Visualizar lancamentos do caixa (todos, nao apenas os proprios)', false)
ON CONFLICT (codigo) DO NOTHING;

-- Atribui lancamento.visualizar a TODOS os 5 perfis catalogados
INSERT INTO public.perfil_permissao (perfil_id, permissao_codigo)
SELECT p.id, 'lancamento.visualizar'
FROM public.perfil p
WHERE p.codigo IN ('admin', 'gerente', 'operador', 'contador', 'vendedor')
ON CONFLICT DO NOTHING;

-- Consistencia: vendedor passa a ver observacoes (ja tinha acesso ao lancamento
-- via criado_por mas observacoes ficavam invisiveis)
INSERT INTO public.perfil_permissao (perfil_id, permissao_codigo)
SELECT p.id, 'lancamento.visualizar_observacoes'
FROM public.perfil p
WHERE p.codigo = 'vendedor'
ON CONFLICT DO NOTHING;
