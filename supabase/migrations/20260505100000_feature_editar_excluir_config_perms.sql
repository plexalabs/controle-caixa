-- ============================================================
-- FEAT-EDITAR-EXCLUIR (parte 1): config + 3 permissões novas
--
-- Catálogo:
--   lancamento.editar           -> admin/gerente/operador (campos básicos)
--   lancamento.editar_categoria -> admin/gerente (destrutiva, janela)
--   lancamento.excluir          -> admin/gerente (destrutiva, soft-delete)
--
-- Config:
--   lancamento.editar_categoria_minutos = 30 (janela em minutos
--   após criação do lancamento dentro da qual a categoria/dados_categoria
--   ainda podem ser alterados via RPC editar_lancamento).
-- ============================================================

-- 1) Config: janela de edição de categoria em minutos
INSERT INTO public.config (chave, valor, descricao, editavel, tipo)
VALUES (
  'lancamento.editar_categoria_minutos',
  '30'::jsonb,
  'Janela em minutos após a criação do lançamento dentro da qual a categoria/dados_categoria ainda podem ser alterados via RPC editar_lancamento.',
  true,
  'number'
)
ON CONFLICT (chave) DO NOTHING;

-- 2) Permissoes novas
INSERT INTO public.permissao (codigo, modulo, descricao, destrutiva) VALUES
  ('lancamento.editar',
   'lancamento',
   'Editar campos basicos de lancamento (NF, codigo, cliente, valor)',
   false),
  ('lancamento.editar_categoria',
   'lancamento',
   'Editar categoria/dados_categoria de lancamento ja categorizado (dentro da janela)',
   true),
  ('lancamento.excluir',
   'lancamento',
   'Excluir (soft-delete) lancamento com motivo',
   true)
ON CONFLICT (codigo) DO NOTHING;

-- 3) Atribuicoes:
--    lancamento.editar -> admin, gerente, operador
INSERT INTO public.perfil_permissao (perfil_id, permissao_codigo)
SELECT p.id, 'lancamento.editar'
FROM public.perfil p
WHERE p.codigo IN ('admin', 'gerente', 'operador')
ON CONFLICT DO NOTHING;

--    lancamento.editar_categoria -> admin, gerente
INSERT INTO public.perfil_permissao (perfil_id, permissao_codigo)
SELECT p.id, 'lancamento.editar_categoria'
FROM public.perfil p
WHERE p.codigo IN ('admin', 'gerente')
ON CONFLICT DO NOTHING;

--    lancamento.excluir -> admin, gerente
INSERT INTO public.perfil_permissao (perfil_id, permissao_codigo)
SELECT p.id, 'lancamento.excluir'
FROM public.perfil p
WHERE p.codigo IN ('admin', 'gerente')
ON CONFLICT DO NOTHING;
