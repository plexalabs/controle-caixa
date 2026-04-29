-- Migration 023: trigger BEFORE INSERT em auth.users que rejeita emails fora
-- de @vdboti.com.br. Esta é a CAMADA DE SEGURANÇA REAL — o parâmetro `hd`
-- na URL OAuth (no front) é apenas dica visual ao Google, não segurança.
-- Camada principal externa: OAuth consent screen com User Type=Internal no Google.

CREATE OR REPLACE FUNCTION public.fn_validar_dominio_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_dominio_permitido text;
BEGIN
    -- Le configuracao via tabela public.config — chave inalteravel (editavel=false).
    SELECT (valor #>> '{}') INTO v_dominio_permitido
    FROM public.config
    WHERE chave = 'auth.dominio_permitido';

    -- Fallback seguro: se config nao existir por algum motivo, hardcode.
    IF v_dominio_permitido IS NULL THEN
        v_dominio_permitido := 'vdboti.com.br';
    END IF;

    -- Valida dominio do email. Compara case-insensitive.
    IF NEW.email IS NULL
       OR lower(split_part(NEW.email, '@', 2)) <> lower(v_dominio_permitido)
    THEN
        RAISE EXCEPTION 'Acesso restrito ao domínio %', v_dominio_permitido
            USING ERRCODE = '42501',
                  HINT    = 'Use uma conta corporativa autorizada (@vdboti.com.br) ou peca acesso ao TI.';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auth_users_validar_dominio ON auth.users;
CREATE TRIGGER trg_auth_users_validar_dominio
    BEFORE INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.fn_validar_dominio_email();

COMMENT ON FUNCTION public.fn_validar_dominio_email IS
'Camada de SEGURANCA REAL de restricao de dominio. Rejeita inserts em auth.users com email fora de auth.dominio_permitido. O parametro hd da URL OAuth e apenas UI/UX, nao seguranca.';
