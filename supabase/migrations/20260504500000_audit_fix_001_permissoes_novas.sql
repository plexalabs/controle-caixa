-- ============================================================
-- CP-AUDIT-1: 2 permissoes novas no catalogo
--
-- lancamento.finalizar e lancamento.cancelar_pos sao adicionadas
-- pra serem checadas em marcar_finalizado e marcar_cancelado_pos.
-- ============================================================

INSERT INTO public.permissao (codigo, modulo, descricao, destrutiva) VALUES
  ('lancamento.finalizar',     'lancamento', 'Marcar lancamento como finalizado', false),
  ('lancamento.cancelar_pos',  'lancamento', 'Cancelar lancamento pos-categoria', true)
ON CONFLICT (codigo) DO NOTHING;

-- Atribui as 2 a admin, gerente, operador (quem hoje pode fazer essas operacoes)
INSERT INTO public.perfil_permissao (perfil_id, permissao_codigo)
SELECT p.id, perm.codigo
FROM public.perfil p
CROSS JOIN (
  VALUES ('lancamento.finalizar'), ('lancamento.cancelar_pos')
) perm(codigo)
WHERE p.codigo IN ('admin', 'gerente', 'operador')
ON CONFLICT DO NOTHING;
