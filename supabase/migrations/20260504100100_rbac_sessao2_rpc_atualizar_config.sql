-- ============================================================
-- CP-RBAC Sessao 2: migra atualizar_config para tem_permissao()
--
-- ANTES: exigia papel='admin' AND ativo=true
-- DEPOIS: exige tem_permissao('config.editar_sistema')
--
-- IMPACTO: admin no perfil RBAC NAO tem essa permissao por desenho
-- da Sessao 1 (so super_admin). Operador atual eh super_admin via
-- bypass, entao continua funcionando. Admins futuros precisarao da
-- permissao via override extra ou perfil customizado.
--
-- Logica de negocio (validacao por tipo, jsonb_typeof, UPDATE)
-- preservada integralmente.
-- ============================================================

CREATE OR REPLACE FUNCTION public.atualizar_config(p_chave text, p_valor jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_tipo     text;
  v_editavel boolean;
  v_texto    text;
  v_numero   numeric;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão sem usuário autenticado.' USING ERRCODE = '42501';
  END IF;

  -- Permissao: config.editar_sistema (substitui check papel='admin')
  IF NOT public.tem_permissao(auth.uid(), 'config.editar_sistema') THEN
    RAISE EXCEPTION 'Apenas administradores podem editar configurações.'
      USING ERRCODE = '42501';
  END IF;

  SELECT tipo, editavel INTO v_tipo, v_editavel
    FROM public.config WHERE chave = p_chave;

  IF v_tipo IS NULL THEN
    RAISE EXCEPTION 'Chave de configuração não encontrada: %', p_chave
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT v_editavel THEN
    RAISE EXCEPTION 'Chave % não é editável (marcada como sistema).', p_chave
      USING ERRCODE = '42501';
  END IF;

  CASE v_tipo
    WHEN 'boolean' THEN
      IF jsonb_typeof(p_valor) <> 'boolean' THEN
        RAISE EXCEPTION 'Valor da chave % deve ser booleano (true ou false).', p_chave
          USING ERRCODE = 'check_violation';
      END IF;

    WHEN 'number' THEN
      IF jsonb_typeof(p_valor) <> 'number' THEN
        IF jsonb_typeof(p_valor) = 'string' THEN
          v_texto := p_valor #>> '{}';
          BEGIN
            v_numero := v_texto::numeric;
            p_valor := to_jsonb(v_numero);
          EXCEPTION WHEN OTHERS THEN
            RAISE EXCEPTION 'Valor da chave % deve ser numérico.', p_chave
              USING ERRCODE = 'check_violation';
          END;
        ELSE
          RAISE EXCEPTION 'Valor da chave % deve ser numérico.', p_chave
            USING ERRCODE = 'check_violation';
        END IF;
      END IF;

    WHEN 'text' THEN
      IF jsonb_typeof(p_valor) <> 'string' THEN
        RAISE EXCEPTION 'Valor da chave % deve ser texto.', p_chave
          USING ERRCODE = 'check_violation';
      END IF;

    WHEN 'date' THEN
      IF jsonb_typeof(p_valor) <> 'string' THEN
        RAISE EXCEPTION 'Valor da chave % deve ser data (YYYY-MM-DD).', p_chave
          USING ERRCODE = 'check_violation';
      END IF;
      v_texto := p_valor #>> '{}';
      BEGIN
        PERFORM v_texto::date;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Valor da chave % deve ser data válida (YYYY-MM-DD), recebi %.', p_chave, v_texto
          USING ERRCODE = 'check_violation';
      END;

    WHEN 'time' THEN
      IF jsonb_typeof(p_valor) <> 'string' THEN
        RAISE EXCEPTION 'Valor da chave % deve ser horário (HH:MM).', p_chave
          USING ERRCODE = 'check_violation';
      END IF;
      v_texto := p_valor #>> '{}';
      BEGIN
        PERFORM v_texto::time;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Valor da chave % deve ser horário válido (HH:MM), recebi %.', p_chave, v_texto
          USING ERRCODE = 'check_violation';
      END;

    ELSE
      RAISE EXCEPTION 'Tipo % não suportado para a chave %.', v_tipo, p_chave
        USING ERRCODE = 'check_violation';
  END CASE;

  UPDATE public.config
     SET valor = p_valor,
         atualizado_em = now(),
         atualizado_por = auth.uid()
   WHERE chave = p_chave;

  RETURN p_valor;
END;
$function$;
