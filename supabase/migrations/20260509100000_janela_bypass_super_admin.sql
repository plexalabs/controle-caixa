-- ============================================================
-- JANELA BYPASS: super_admin tem acesso irrestrito.
--
-- Acrescenta no inicio de dentro_da_janela_operacional() a checagem
-- de papel='super_admin'. Se for, retorna true imediatamente — sem
-- janela, sem restricao de horario, sem checagem de dia da semana.
--
-- Demais usuarios continuam sujeitos a janela 6h-20h seg-sex.
-- ============================================================

CREATE OR REPLACE FUNCTION public.dentro_da_janela_operacional()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ativa boolean; v_ini integer; v_fim integer; v_dias text;
  v_brt timestamp; v_hora integer; v_dow integer;
BEGIN
  -- BYPASS SUPER_ADMIN — acesso total sem restricao
  IF v_uid IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.usuario_papel
    WHERE usuario_id = v_uid AND papel = 'super_admin'
  ) THEN
    RETURN true;
  END IF;

  SELECT (valor #>> '{}')::boolean INTO v_ativa FROM public.config WHERE chave = 'janela_op_ativa';
  IF v_ativa IS NULL OR v_ativa = false THEN RETURN true; END IF;

  SELECT (valor #>> '{}')::integer INTO v_ini  FROM public.config WHERE chave = 'janela_op_hora_ini';
  SELECT (valor #>> '{}')::integer INTO v_fim  FROM public.config WHERE chave = 'janela_op_hora_fim';
  SELECT (valor #>> '{}')              INTO v_dias FROM public.config WHERE chave = 'janela_op_dias_semana';

  IF v_ini  IS NULL THEN v_ini  := 6;  END IF;
  IF v_fim  IS NULL THEN v_fim  := 20; END IF;
  IF v_dias IS NULL OR v_dias = '' THEN v_dias := '1,2,3,4,5'; END IF;

  v_brt  := now() AT TIME ZONE 'America/Sao_Paulo';
  v_hora := EXTRACT(HOUR FROM v_brt)::integer;
  v_dow  := EXTRACT(ISODOW FROM v_brt)::integer;

  IF NOT (v_dow::text = ANY (string_to_array(v_dias, ','))) THEN RETURN false; END IF;
  IF v_hora < v_ini OR v_hora >= v_fim THEN RETURN false; END IF;
  RETURN true;
END;
$$;
