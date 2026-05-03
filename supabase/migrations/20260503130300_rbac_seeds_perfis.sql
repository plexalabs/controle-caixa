-- ============================================================
-- CP-RBAC Sessao 1 / 4: 5 perfis pre-definidos + suas permissoes
--
-- Pre-definidos: admin, gerente, operador, vendedor, contador
-- Todos com e_sistema=true (nao podem ser deletados pela UI).
-- Permissoes editaveis pela UI na Sessao 4.
-- ============================================================

INSERT INTO public.perfil (codigo, nome, descricao, e_sistema) VALUES
  ('admin',    'Administrador',  'Acesso total exceto operacoes RBAC e estruturais', true),
  ('gerente',  'Gerente',        'Acesso operacional amplo + relatorios completos',  true),
  ('operador', 'Operador',       'Operacoes diarias de caixa e lancamento',          true),
  ('vendedor', 'Vendedor',       'Visualizacao de proprios dados',                   true),
  ('contador', 'Contador',       'Acesso de leitura + relatorios e exportacoes',     true)
ON CONFLICT (codigo) DO NOTHING;

-- ---------- ADMIN: tudo exceto RBAC + estruturais ----------
INSERT INTO public.perfil_permissao (perfil_id, permissao_codigo)
SELECT (SELECT id FROM public.perfil WHERE codigo = 'admin'), p.codigo
FROM public.permissao p
WHERE p.codigo NOT IN (
  'perfil.criar',
  'perfil.deletar',
  'perfil.editar_permissoes',
  'usuario.atribuir_perfil',
  'usuario.conceder_extra',
  'config.editar_sistema'
)
ON CONFLICT DO NOTHING;

-- ---------- GERENTE: operacional amplo + relatorios ----------
INSERT INTO public.perfil_permissao (perfil_id, permissao_codigo) VALUES
  ((SELECT id FROM public.perfil WHERE codigo = 'gerente'), 'caixa.abrir'),
  ((SELECT id FROM public.perfil WHERE codigo = 'gerente'), 'caixa.fechar'),
  ((SELECT id FROM public.perfil WHERE codigo = 'gerente'), 'caixa.visualizar'),
  ((SELECT id FROM public.perfil WHERE codigo = 'gerente'), 'caixa.exportar'),
  ((SELECT id FROM public.perfil WHERE codigo = 'gerente'), 'lancamento.criar'),
  ((SELECT id FROM public.perfil WHERE codigo = 'gerente'), 'lancamento.editar_pre_categoria'),
  ((SELECT id FROM public.perfil WHERE codigo = 'gerente'), 'lancamento.categorizar'),
  ((SELECT id FROM public.perfil WHERE codigo = 'gerente'), 'lancamento.adicionar_observacao'),
  ((SELECT id FROM public.perfil WHERE codigo = 'gerente'), 'lancamento.visualizar_todos'),
  ((SELECT id FROM public.perfil WHERE codigo = 'gerente'), 'lancamento.exportar'),
  ((SELECT id FROM public.perfil WHERE codigo = 'gerente'), 'vendedora.criar'),
  ((SELECT id FROM public.perfil WHERE codigo = 'gerente'), 'vendedora.editar'),
  ((SELECT id FROM public.perfil WHERE codigo = 'gerente'), 'vendedora.visualizar'),
  ((SELECT id FROM public.perfil WHERE codigo = 'gerente'), 'usuario.visualizar'),
  ((SELECT id FROM public.perfil WHERE codigo = 'gerente'), 'config.gerenciar_feriados'),
  ((SELECT id FROM public.perfil WHERE codigo = 'gerente'), 'config.gerenciar_categorias'),
  ((SELECT id FROM public.perfil WHERE codigo = 'gerente'), 'config.visualizar'),
  ((SELECT id FROM public.perfil WHERE codigo = 'gerente'), 'relatorio.diario'),
  ((SELECT id FROM public.perfil WHERE codigo = 'gerente'), 'relatorio.mensal'),
  ((SELECT id FROM public.perfil WHERE codigo = 'gerente'), 'relatorio.anual'),
  ((SELECT id FROM public.perfil WHERE codigo = 'gerente'), 'relatorio.exportar_pdf'),
  ((SELECT id FROM public.perfil WHERE codigo = 'gerente'), 'relatorio.exportar_excel'),
  ((SELECT id FROM public.perfil WHERE codigo = 'gerente'), 'notificacao.visualizar'),
  ((SELECT id FROM public.perfil WHERE codigo = 'gerente'), 'notificacao.marcar_lida'),
  ((SELECT id FROM public.perfil WHERE codigo = 'gerente'), 'arquivamento.visualizar_arquivados')
ON CONFLICT DO NOTHING;

-- ---------- OPERADOR: operacao diaria ----------
INSERT INTO public.perfil_permissao (perfil_id, permissao_codigo) VALUES
  ((SELECT id FROM public.perfil WHERE codigo = 'operador'), 'caixa.abrir'),
  ((SELECT id FROM public.perfil WHERE codigo = 'operador'), 'caixa.fechar'),
  ((SELECT id FROM public.perfil WHERE codigo = 'operador'), 'caixa.visualizar'),
  ((SELECT id FROM public.perfil WHERE codigo = 'operador'), 'lancamento.criar'),
  ((SELECT id FROM public.perfil WHERE codigo = 'operador'), 'lancamento.editar_pre_categoria'),
  ((SELECT id FROM public.perfil WHERE codigo = 'operador'), 'lancamento.categorizar'),
  ((SELECT id FROM public.perfil WHERE codigo = 'operador'), 'lancamento.adicionar_observacao'),
  ((SELECT id FROM public.perfil WHERE codigo = 'operador'), 'vendedora.visualizar'),
  ((SELECT id FROM public.perfil WHERE codigo = 'operador'), 'config.visualizar'),
  ((SELECT id FROM public.perfil WHERE codigo = 'operador'), 'notificacao.visualizar'),
  ((SELECT id FROM public.perfil WHERE codigo = 'operador'), 'notificacao.marcar_lida')
ON CONFLICT DO NOTHING;

-- ---------- VENDEDOR: visualizacao restrita ----------
INSERT INTO public.perfil_permissao (perfil_id, permissao_codigo) VALUES
  ((SELECT id FROM public.perfil WHERE codigo = 'vendedor'), 'caixa.visualizar'),
  ((SELECT id FROM public.perfil WHERE codigo = 'vendedor'), 'lancamento.criar'),
  ((SELECT id FROM public.perfil WHERE codigo = 'vendedor'), 'notificacao.visualizar'),
  ((SELECT id FROM public.perfil WHERE codigo = 'vendedor'), 'notificacao.marcar_lida')
ON CONFLICT DO NOTHING;

-- ---------- CONTADOR: leitura + exportacao ----------
INSERT INTO public.perfil_permissao (perfil_id, permissao_codigo) VALUES
  ((SELECT id FROM public.perfil WHERE codigo = 'contador'), 'caixa.visualizar'),
  ((SELECT id FROM public.perfil WHERE codigo = 'contador'), 'caixa.exportar'),
  ((SELECT id FROM public.perfil WHERE codigo = 'contador'), 'lancamento.visualizar_todos'),
  ((SELECT id FROM public.perfil WHERE codigo = 'contador'), 'lancamento.exportar'),
  ((SELECT id FROM public.perfil WHERE codigo = 'contador'), 'relatorio.diario'),
  ((SELECT id FROM public.perfil WHERE codigo = 'contador'), 'relatorio.mensal'),
  ((SELECT id FROM public.perfil WHERE codigo = 'contador'), 'relatorio.anual'),
  ((SELECT id FROM public.perfil WHERE codigo = 'contador'), 'relatorio.exportar_pdf'),
  ((SELECT id FROM public.perfil WHERE codigo = 'contador'), 'relatorio.exportar_excel'),
  ((SELECT id FROM public.perfil WHERE codigo = 'contador'), 'arquivamento.visualizar_arquivados'),
  ((SELECT id FROM public.perfil WHERE codigo = 'contador'), 'config.visualizar')
ON CONFLICT DO NOTHING;

DO $$
DECLARE
  r RECORD;
BEGIN
  RAISE NOTICE 'Resumo de permissoes por perfil:';
  FOR r IN
    SELECT p.nome, count(pp.permissao_codigo) AS total_permissoes
    FROM public.perfil p
    LEFT JOIN public.perfil_permissao pp ON pp.perfil_id = p.id
    GROUP BY p.id, p.nome
    ORDER BY p.nome
  LOOP
    RAISE NOTICE '  %: % permissoes', r.nome, r.total_permissoes;
  END LOOP;
END$$;
