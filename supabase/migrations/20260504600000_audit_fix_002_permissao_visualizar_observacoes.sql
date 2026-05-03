-- ============================================================
-- CP-AUDIT-2: nova permissao lancamento.visualizar_observacoes
--
-- Necessaria pra migrar policy lanc_obs_select para tem_permissao().
-- Separa LER (admin/gerente/operador/contador) de ESCREVER
-- (admin/gerente/operador via lancamento.adicionar_observacao
-- existente).
-- ============================================================

INSERT INTO public.permissao (codigo, modulo, descricao, destrutiva) VALUES
  ('lancamento.visualizar_observacoes', 'lancamento', 'Visualizar observacoes adicionadas em lancamentos', false)
ON CONFLICT (codigo) DO NOTHING;

-- Atribui a admin, gerente, operador, contador (quem precisa ler observacoes)
INSERT INTO public.perfil_permissao (perfil_id, permissao_codigo)
SELECT p.id, 'lancamento.visualizar_observacoes'
FROM public.perfil p
WHERE p.codigo IN ('admin', 'gerente', 'operador', 'contador')
ON CONFLICT DO NOTHING;
