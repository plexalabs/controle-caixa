-- ============================================================
-- CP-RBAC Sessao 1 / 5: funcao tem_permissao()
--
-- Verifica se um usuario tem uma permissao especifica considerando:
--   1. Bypass total se papel='super_admin' (qualquer registro ativo)
--   2. Permissao via perfil principal (usuario_perfil -> perfil_permissao)
--   3. Permissao via override pontual (usuario_permissao_extra)
--
-- LANGUAGE sql + STABLE permite o planner inlinear/cachear.
-- SECURITY DEFINER pra ler usuario_papel e usuario_perfil sem depender
-- de RLS no contexto do caller.
-- ============================================================

CREATE OR REPLACE FUNCTION public.tem_permissao(
  p_usuario_id uuid,
  p_codigo     text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM public.usuario_papel up
      WHERE up.usuario_id = p_usuario_id
        AND up.papel = 'super_admin'
        AND up.ativo = true
    )
    OR EXISTS (
      SELECT 1 FROM public.usuario_perfil uperf
      JOIN public.perfil_permissao pp ON pp.perfil_id = uperf.perfil_id
      WHERE uperf.usuario_id = p_usuario_id
        AND pp.permissao_codigo = p_codigo
    )
    OR EXISTS (
      SELECT 1 FROM public.usuario_permissao_extra upe
      WHERE upe.usuario_id = p_usuario_id
        AND upe.permissao_codigo = p_codigo
    );
$$;

COMMENT ON FUNCTION public.tem_permissao IS
'Verifica se o usuario tem uma permissao especifica. Considera super_admin (bypass), perfil principal e permissoes extras pontuais.';

GRANT EXECUTE ON FUNCTION public.tem_permissao(uuid, text) TO authenticated;
