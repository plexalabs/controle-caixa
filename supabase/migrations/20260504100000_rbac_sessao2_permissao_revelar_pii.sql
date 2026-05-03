-- ============================================================
-- CP-RBAC Sessao 2: nova permissao lancamento.revelar_pii
--
-- A RPC public.revelar_pii() hoje aceita papel='operador',
-- 'supervisor', 'auditor' ou 'admin' via fn_tem_papel(). Pra
-- migrar pra tem_permissao() preservando esse acesso, criamos
-- a permissao 'lancamento.revelar_pii' e atribuimos aos perfis
-- equivalentes do RBAC: admin, gerente e operador.
--
-- (supervisor e auditor nao existem como perfil no RBAC; o caso
-- de uso desses papeis legacy fica coberto por gerente, que tem
-- acesso a relatorios e visualizacao ampla.)
-- ============================================================

INSERT INTO public.permissao (codigo, modulo, descricao, destrutiva) VALUES
  ('lancamento.revelar_pii', 'lancamento', 'Revelar dados sensiveis (PII) de lancamentos', false)
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO public.perfil_permissao (perfil_id, permissao_codigo) VALUES
  ((SELECT id FROM public.perfil WHERE codigo = 'admin'),    'lancamento.revelar_pii'),
  ((SELECT id FROM public.perfil WHERE codigo = 'gerente'),  'lancamento.revelar_pii'),
  ((SELECT id FROM public.perfil WHERE codigo = 'operador'), 'lancamento.revelar_pii')
ON CONFLICT DO NOTHING;

DO $$
DECLARE
  v_total_perm integer;
  v_perfis     integer;
BEGIN
  SELECT count(*) INTO v_total_perm FROM public.permissao;
  SELECT count(*) INTO v_perfis
    FROM public.perfil_permissao WHERE permissao_codigo = 'lancamento.revelar_pii';
  RAISE NOTICE '[OK] permissao = %. lancamento.revelar_pii em % perfis.', v_total_perm, v_perfis;

  IF v_total_perm < 39 THEN
    RAISE EXCEPTION 'Esperado >= 39 permissoes. Atual: %', v_total_perm;
  END IF;

  IF v_perfis < 3 THEN
    RAISE EXCEPTION 'lancamento.revelar_pii deveria estar em 3 perfis. Atual: %', v_perfis;
  END IF;
END$$;
