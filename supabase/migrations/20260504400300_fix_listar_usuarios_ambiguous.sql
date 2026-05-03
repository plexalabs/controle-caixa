-- ============================================================
-- FIX: ambiguidade em column reference "usuario_id"
--
-- Bug detectado em PROD durante smoke da Sessao 6: tela
-- /configuracoes/usuarios mostrava "Nao foi possivel carregar"
-- com erro PostgREST 400.
--
-- Causa: a RPC declara RETURN TABLE com campo `usuario_id`. Duas
-- subqueries internas referenciavam `usuario_id` SEM prefixo de
-- tabela:
--
--   EXISTS (SELECT 1 FROM public.usuario_papel
--           WHERE usuario_id = u.id AND papel = 'super_admin' AND ativo = true)
--                 ^^^^^^^^^ ambiguo: e' usuario_papel.usuario_id ou
--                                     o output column do RETURN TABLE?
--
--   (SELECT count(*) FROM public.usuario_permissao_extra
--    WHERE usuario_id = u.id)
--          ^^^^^^^^^ mesmo problema
--
-- Fix:
--   1. Aliases de tabela explicitos nas subqueries (papel_check,
--      extra_check) -- referencias passam a ser papel_check.usuario_id
--      e extra_check.usuario_id, sem ambiguidade
--   2. AS explicito no SELECT principal pra clareza (usuario_id,
--      perfil_id, perfil_codigo, perfil_nome, criado_em)
--   3. Cast text em p.codigo e p.nome (consistencia com PostgREST)
--
-- Preservado da versao atual:
--   - STABLE
--   - SET search_path com 'pg_temp'
--   - WHERE u.deleted_at IS NULL (filtra users soft-deleted)
--   - GRANT EXECUTE TO authenticated (continua valido pelo CREATE OR REPLACE)
-- ============================================================

CREATE OR REPLACE FUNCTION public.listar_usuarios_com_perfis_e_extras()
RETURNS TABLE (
  usuario_id     uuid,
  email          text,
  e_super_admin  boolean,
  perfil_id      uuid,
  perfil_codigo  text,
  perfil_nome    text,
  total_extras   bigint,
  criado_em      timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF NOT public.tem_permissao(auth.uid(), 'usuario.visualizar') THEN
    RAISE EXCEPTION 'Permissao negada' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    u.id          AS usuario_id,
    u.email::text AS email,
    EXISTS (
      SELECT 1 FROM public.usuario_papel papel_check
      WHERE papel_check.usuario_id = u.id
        AND papel_check.papel = 'super_admin'
        AND papel_check.ativo = true
    ) AS e_super_admin,
    p.id           AS perfil_id,
    p.codigo::text AS perfil_codigo,
    p.nome::text   AS perfil_nome,
    (
      SELECT count(*) FROM public.usuario_permissao_extra extra_check
      WHERE extra_check.usuario_id = u.id
    ) AS total_extras,
    u.created_at AS criado_em
  FROM auth.users u
  LEFT JOIN public.usuario_perfil up ON up.usuario_id = u.id
  LEFT JOIN public.perfil p          ON p.id = up.perfil_id
  WHERE u.deleted_at IS NULL
  ORDER BY u.created_at ASC;
END;
$$;

COMMENT ON FUNCTION public.listar_usuarios_com_perfis_e_extras() IS
'Lista usuarios com perfil principal e contagem de extras. Fix de ambiguidade aplicado em 2026-05-04.';
