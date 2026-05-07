-- ============================================================
-- JANELA-1: Janela operacional 6h-20h, segunda a sexta.
--
-- Cria duas funcoes utilitarias:
--   * dentro_da_janela_operacional() boolean — checa hora atual
--     em America/Sao_Paulo. true se 6 ≤ hora < 20 E weekday 1-5.
--   * assert_janela_operacional() void — RAISE EXCEPTION com
--     errcode 'P0001' (custom) se fora da janela.
--
-- Configs em public.config controlam a janela (admin pode ajustar
-- via /configuracoes/sistema sem precisar nova migration):
--   janela_op_hora_ini       integer (default 6,  0-23)
--   janela_op_hora_fim       integer (default 20, 1-24, exclusivo)
--   janela_op_dias_semana    text    '1,2,3,4,5' (ISO: 1=seg..7=dom)
--   janela_op_ativa          boolean (default true) — kill-switch
--
-- super_admin NAO tem bypass automatico — operador ja avisou que
-- a regra vale pra todos. Pra emergencia, basta SET janela_op_ativa
-- = false (faz a fn devolver true sempre).
-- ============================================================

-- 1) Configs (default — operador ajusta depois se quiser)
INSERT INTO public.config (chave, valor, tipo, descricao) VALUES
  ('janela_op_ativa',     'true', 'boolean',
   'Kill-switch da janela operacional. Quando false, sistema fica acessivel 24/7.'),
  ('janela_op_hora_ini',  '6',    'number',
   'Hora de abertura (America/Sao_Paulo, 0-23). Inclusiva.'),
  ('janela_op_hora_fim',  '20',   'number',
   'Hora de fechamento (America/Sao_Paulo, 1-24). Exclusiva — 20 = ate 19:59.'),
  ('janela_op_dias_semana', '1,2,3,4,5', 'text',
   'Dias da semana liberados (ISO: 1=seg, 7=dom). Lista separada por virgula.')
ON CONFLICT (chave) DO NOTHING;


-- 2) Funcao de checagem
CREATE OR REPLACE FUNCTION public.dentro_da_janela_operacional()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ativa boolean;
  v_ini   integer;
  v_fim   integer;
  v_dias  text;
  v_agora timestamptz := now();
  v_brt   timestamp;
  v_hora  integer;
  v_dow   integer;          -- ISO: 1=seg..7=dom
BEGIN
  SELECT (valor::boolean) INTO v_ativa FROM public.config WHERE chave = 'janela_op_ativa';
  IF v_ativa IS NULL OR v_ativa = false THEN
    RETURN true;            -- janela desligada → libera geral
  END IF;

  SELECT (valor::integer) INTO v_ini  FROM public.config WHERE chave = 'janela_op_hora_ini';
  SELECT (valor::integer) INTO v_fim  FROM public.config WHERE chave = 'janela_op_hora_fim';
  SELECT valor             INTO v_dias FROM public.config WHERE chave = 'janela_op_dias_semana';

  IF v_ini  IS NULL THEN v_ini  := 6;  END IF;
  IF v_fim  IS NULL THEN v_fim  := 20; END IF;
  IF v_dias IS NULL OR v_dias = '' THEN v_dias := '1,2,3,4,5'; END IF;

  v_brt  := v_agora AT TIME ZONE 'America/Sao_Paulo';
  v_hora := EXTRACT(HOUR FROM v_brt)::integer;
  v_dow  := EXTRACT(ISODOW FROM v_brt)::integer;     -- 1=seg..7=dom

  -- Dia liberado?
  IF NOT (v_dow::text = ANY (string_to_array(v_dias, ','))) THEN
    RETURN false;
  END IF;
  -- Hora liberada?
  IF v_hora < v_ini OR v_hora >= v_fim THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.dentro_da_janela_operacional() TO authenticated;
GRANT EXECUTE ON FUNCTION public.dentro_da_janela_operacional() TO anon;


-- 3) Assert que dispara excecao
CREATE OR REPLACE FUNCTION public.assert_janela_operacional()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.dentro_da_janela_operacional() THEN
    RAISE EXCEPTION 'Sistema fora do horário de operação. Tente novamente entre 6h e 20h, segunda a sexta.'
      USING ERRCODE = 'P0001', HINT = 'janela_operacional';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assert_janela_operacional() TO authenticated;
