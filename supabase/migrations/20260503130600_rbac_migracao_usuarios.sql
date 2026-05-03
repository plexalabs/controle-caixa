-- ============================================================
-- CP-RBAC Sessao 1 / 7: atribui perfil aos usuarios existentes
--
-- Mapeia papel atual -> perfil do RBAC:
--   admin     -> perfil 'admin'
--   operador  -> perfil 'operador'
--
-- super_admin nao recebe perfil (bypass total na funcao tem_permissao).
--
-- usuario_perfil tem PRIMARY KEY (usuario_id) -> 1 perfil principal.
-- Se usuario tem multiplos papeis ativos (ex: operador+admin), atribui
-- o de maior nivel: admin > operador.
-- ============================================================

-- 1. Quem tem 'admin' ativo recebe perfil 'admin'
INSERT INTO public.usuario_perfil (usuario_id, perfil_id)
SELECT
  up.usuario_id,
  (SELECT id FROM public.perfil WHERE codigo = 'admin')
FROM public.usuario_papel up
WHERE up.papel = 'admin' AND up.ativo = true
ON CONFLICT (usuario_id) DO NOTHING;

-- 2. Quem so tem 'operador' (sem admin) recebe perfil 'operador'
INSERT INTO public.usuario_perfil (usuario_id, perfil_id)
SELECT
  up.usuario_id,
  (SELECT id FROM public.perfil WHERE codigo = 'operador')
FROM public.usuario_papel up
WHERE up.papel = 'operador' AND up.ativo = true
ON CONFLICT (usuario_id) DO NOTHING;

DO $$
DECLARE
  v_super integer;
  v_perfis integer;
BEGIN
  SELECT count(*) INTO v_super  FROM public.usuario_papel WHERE papel = 'super_admin';
  SELECT count(*) INTO v_perfis FROM public.usuario_perfil;
  RAISE NOTICE '[OK] super_admins: % | usuarios com perfil atribuido: %', v_super, v_perfis;
END$$;
