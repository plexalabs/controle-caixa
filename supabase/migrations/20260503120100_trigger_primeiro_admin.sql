-- ==========================================================================
-- Trigger: primeiro usuário a se cadastrar (sistema vazio) vira admin.
--
-- Operador (joaopedro@plexalabs.com) aceitou em 2026-05-03 o risco de
-- "primeiro a chegar = admin" porque vai se cadastrar segundos depois
-- do reset. Esta lógica DEVE ser removida ou protegida quando o sistema
-- ficar acessível a usuários externos.
--
-- Implementação:
--   - AFTER INSERT em auth.users (dispara no signUp(), antes da
--     confirmação de email — operador precisa do papel já antes de logar)
--   - Conta admins existentes em public.usuario_papel
--   - Se zero, novo user vira 'admin'; senão 'operador'
--   - PK (usuario_id, papel) → ON CONFLICT DO NOTHING (idempotência se
--     algo já tiver inserido o papel; nunca deveria, mas defesa em
--     profundidade)
--
-- IMPORTANTE: a tabela usuario_papel NÃO tem coluna 'ativo' (apesar do
-- nome do checkpoint "usuario_papel_ativo_e_config_tipo_cp7" sugerir
-- isso). Schema real: usuario_id, papel, concedido_em, concedido_por.
-- ==========================================================================

CREATE OR REPLACE FUNCTION public.fn_promove_primeiro_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_total_admins integer;
  v_papel_a_atribuir varchar(40);
BEGIN
  SELECT count(*) INTO v_total_admins
  FROM public.usuario_papel
  WHERE papel = 'admin';

  IF v_total_admins = 0 THEN
    v_papel_a_atribuir := 'admin';
    RAISE NOTICE '[primeiro-admin] Sistema sem admins. % vira admin.', NEW.email;
  ELSE
    v_papel_a_atribuir := 'operador';
    RAISE NOTICE '[primeiro-admin] Sistema ja tem admin. % vira operador.', NEW.email;
  END IF;

  INSERT INTO public.usuario_papel (usuario_id, papel, concedido_por, concedido_em)
  VALUES (NEW.id, v_papel_a_atribuir, NEW.id, now())
  ON CONFLICT (usuario_id, papel) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_primeiro_admin ON auth.users;
CREATE TRIGGER trg_primeiro_admin
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.fn_promove_primeiro_admin();

COMMENT ON FUNCTION public.fn_promove_primeiro_admin() IS
'Promove primeiro usuário cadastrado a admin se sistema não tiver nenhum admin. Demais cadastros viram operador. Risco: primeiro a chegar pega admin. Operador (joaopedro@plexalabs.com) aceitou esse risco em 2026-05-03.';
