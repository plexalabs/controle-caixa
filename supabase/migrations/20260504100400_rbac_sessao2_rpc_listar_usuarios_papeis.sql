-- ============================================================
-- CP-RBAC Sessao 2: migra listar_usuarios_papeis para tem_permissao()
--
-- ANTES: exigia papel='admin' AND ativo=true
-- DEPOIS: exige tem_permissao('usuario.visualizar')
--
-- IMPACTO: admin RBAC TEM 'usuario.visualizar' na seed da Sessao 1
-- (eh permissao basica de leitura). Equivalencia 100% preservada
-- pra admins; gerente tambem ganha acesso (que ja era o desenho).
--
-- Toda a query (LEFT JOIN auth.users, array_agg de papel, GROUP BY)
-- preservada integralmente.
-- ============================================================

CREATE OR REPLACE FUNCTION public.listar_usuarios_papeis()
RETURNS TABLE(
  user_id           uuid,
  email             text,
  nome              text,
  sobrenome         text,
  papeis            text[],
  cadastrado_em     timestamp with time zone,
  email_confirmado  boolean,
  ultimo_acesso     timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
BEGIN
  -- Permissao: usuario.visualizar (substitui check papel='admin')
  IF NOT public.tem_permissao(auth.uid(), 'usuario.visualizar') THEN
    RAISE EXCEPTION 'Apenas administradores podem listar usuários.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.email::text,
    coalesce(u.raw_user_meta_data->>'nome', '')      AS nome,
    coalesce(u.raw_user_meta_data->>'sobrenome', '') AS sobrenome,
    coalesce(
      array_agg(up.papel::text ORDER BY up.papel) FILTER (WHERE up.papel IS NOT NULL),
      ARRAY[]::text[]
    ) AS papeis,
    u.created_at,
    u.email_confirmed_at IS NOT NULL,
    u.last_sign_in_at
  FROM auth.users u
  LEFT JOIN public.usuario_papel up
    ON up.usuario_id = u.id AND up.ativo = true
  WHERE u.deleted_at IS NULL
  GROUP BY u.id
  ORDER BY u.created_at ASC;
END;
$function$;
