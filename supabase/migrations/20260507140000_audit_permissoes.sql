-- ATL-2: 3 permissões novas pro módulo de Auditoria + Lixeira.
--
-- Atribui ao perfil 'admin'. super_admin pega tudo via wildcard '*'
-- na função tem_permissao() — não precisa atribuir explicitamente.

INSERT INTO public.permissao (codigo, modulo, descricao, destrutiva) VALUES
  ('auditoria.visualizar', 'auditoria',
   'Ver a linha do tempo de auditoria (logs de tudo que aconteceu no sistema).', false),
  ('lixeira.visualizar', 'auditoria',
   'Ver itens em soft-delete (lançamentos excluídos, notificações descartadas, subs removidas).', false),
  ('lixeira.restaurar', 'auditoria',
   'Restaurar itens da lixeira (reativar lançamentos excluídos).', true)
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO public.perfil_permissao (perfil_id, permissao_codigo)
SELECT p.id, c.codigo
FROM public.perfil p
CROSS JOIN (VALUES
  ('auditoria.visualizar'),
  ('lixeira.visualizar'),
  ('lixeira.restaurar')
) AS c(codigo)
WHERE p.codigo = 'admin'
ON CONFLICT (perfil_id, permissao_codigo) DO NOTHING;
