-- CP7.3 — RPC atualizar_config(chave, valor) com validação por tipo
--
-- config.valor é JSONB. A RPC recebe o valor como JSONB e valida que
-- ele bate com o tipo declarado em config.tipo (text/number/boolean/
-- date/time). O cliente passa qualquer JSON válido; o servidor garante
-- a coerência semântica antes de gravar.

CREATE OR REPLACE FUNCTION public.atualizar_config(
  p_chave text,
  p_valor jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_tipo     text;
  v_editavel boolean;
  v_texto    text;
  v_numero   numeric;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão sem usuário autenticado.' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.usuario_papel
     WHERE usuario_id = auth.uid() AND papel = 'admin' AND ativo = true
  ) THEN
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

  -- Validação por tipo. Cada caminho rejeita com mensagem pt-BR antes
  -- de gravar — protege contra UI quebrada e contra clientes diretos via PostgREST.
  CASE v_tipo
    WHEN 'boolean' THEN
      IF jsonb_typeof(p_valor) <> 'boolean' THEN
        RAISE EXCEPTION 'Valor da chave % deve ser booleano (true ou false).', p_chave
          USING ERRCODE = 'check_violation';
      END IF;

    WHEN 'number' THEN
      IF jsonb_typeof(p_valor) <> 'number' THEN
        -- Aceita string numérica também — cliente pode passar "5" do input type=number
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
$$;

GRANT EXECUTE ON FUNCTION public.atualizar_config(text, jsonb) TO authenticated;

-- ─── Helper para a tela: nome amigável de quem atualizou ────────────
-- Retorna tudo de config + o email do último editor. JOIN com auth.users.
CREATE OR REPLACE VIEW public.config_visualizacao AS
SELECT
  c.chave,
  c.valor,
  c.descricao,
  c.tipo,
  c.editavel,
  c.atualizado_em,
  c.atualizado_por,
  u.email AS atualizado_por_email
FROM public.config c
LEFT JOIN auth.users u ON u.id = c.atualizado_por;

GRANT SELECT ON public.config_visualizacao TO authenticated;
