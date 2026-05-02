-- CP7.1 — RPC listar_usuarios_papeis
--
-- Junta auth.users com usuario_papel (filtrando ativo=true). Retorna
-- todos os usuários, com array dos papéis ativos. Apenas admins podem
-- chamar (defesa em profundidade — UI também filtra).
--
-- Inclui usuários com 0 papéis ativos (papeis = '{}'): essencial para
-- admin reativar acesso de quem foi todo desativado.

CREATE OR REPLACE FUNCTION public.listar_usuarios_papeis()
RETURNS TABLE(
  user_id          uuid,
  email            text,
  nome             text,
  sobrenome        text,
  papeis           text[],
  cadastrado_em    timestamptz,
  email_confirmado boolean,
  ultimo_acesso    timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.usuario_papel
     WHERE usuario_id = auth.uid() AND papel = 'admin' AND ativo = true
  ) THEN
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
$$;

GRANT EXECUTE ON FUNCTION public.listar_usuarios_papeis() TO authenticated;
