-- Migration 024: trigger AFTER INSERT em auth.users atribui papel automatico.
-- Primeiro usuario do sistema vira admin+operador; demais viram apenas operador.
-- Single-user MVP, RLS ja preparado para multi.

CREATE OR REPLACE FUNCTION public.fn_auto_papel_inicial()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.usuario_papel) THEN
        INSERT INTO public.usuario_papel (usuario_id, papel)
        VALUES (NEW.id, 'operador'), (NEW.id, 'admin')
        ON CONFLICT DO NOTHING;
    ELSE
        INSERT INTO public.usuario_papel (usuario_id, papel)
        VALUES (NEW.id, 'operador')
        ON CONFLICT DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auth_users_papel_inicial ON auth.users;
CREATE TRIGGER trg_auth_users_papel_inicial
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.fn_auto_papel_inicial();

COMMENT ON FUNCTION public.fn_auto_papel_inicial IS
'Atribui papel automatico ao novo usuario. Primeiro = admin+operador, demais = operador.';
