-- ============================================================
-- BOOT-1: Reescreve trigger 'primeiro usuario do sistema' pra
-- promover a SUPER_ADMIN (em vez de admin), e tambem atribuir
-- o perfil RBAC 'admin' via usuario_perfil — assim o usuario
-- ja entra com bypass total + perfil completo na UI.
--
-- Comportamento:
--   * Sistema vazio (nenhum super_admin)  → NEW.id vira super_admin
--                                            + perfil 'admin'
--   * Sistema ja tem super_admin           → NEW.id vira operador
--                                            + perfil 'operador'
--                                            (admin promove via UI depois)
--
-- Risco aceito pelo operador (joaopedro@plexalabs.com): primeiro a
-- chegar pega super_admin. Apos bootstrap inicial, sistema sempre
-- tera 1 super_admin existente, entao novos signups nunca mais
-- ganham privilegio elevado por essa via.
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_promove_primeiro_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_total_super integer;
  v_papel_legacy varchar(40);
  v_codigo_perfil text;
  v_perfil_id uuid;
BEGIN
  SELECT count(*) INTO v_total_super
  FROM public.usuario_papel
  WHERE papel = 'super_admin';

  IF v_total_super = 0 THEN
    v_papel_legacy  := 'super_admin';
    v_codigo_perfil := 'admin';
    RAISE NOTICE '[primeiro-super_admin] Sistema sem super_admin. % vira super_admin + perfil admin.', NEW.email;
  ELSE
    v_papel_legacy  := 'operador';
    v_codigo_perfil := 'operador';
    RAISE NOTICE '[primeiro-super_admin] Sistema ja tem super_admin. % vira operador.', NEW.email;
  END IF;

  -- Modelo legacy: usuario_papel (consultado por tem_permissao() pra bypass)
  INSERT INTO public.usuario_papel (usuario_id, papel, concedido_por, concedido_em)
  VALUES (NEW.id, v_papel_legacy, NEW.id, now())
  ON CONFLICT (usuario_id, papel) DO NOTHING;

  -- Modelo novo: usuario_perfil — busca id do perfil pelo codigo
  SELECT id INTO v_perfil_id FROM public.perfil WHERE codigo = v_codigo_perfil;
  IF v_perfil_id IS NOT NULL THEN
    INSERT INTO public.usuario_perfil (usuario_id, perfil_id, atribuido_por, atribuido_em)
    VALUES (NEW.id, v_perfil_id, NEW.id, now())
    ON CONFLICT (usuario_id) DO UPDATE SET perfil_id = EXCLUDED.perfil_id;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_promove_primeiro_admin() IS
  'BOOT-1: Promove primeiro usuario a super_admin (legacy) + perfil admin (RBAC novo). Demais viram operador. Risco do "primeiro a chegar" aceito pelo operador.';
