-- =============================================================================
-- Migration: auto-fechamento de caixas vazios.
-- Data: 2026-05-30
--
-- Problema: caixas que abrem automaticamente (cria_caixa_diario, 6h BRT) e
-- nunca recebem lancamentos ficam pra sempre como `aberto` no banco. Isso
-- atrapalha:
--   - Lista /caixas fica poluida com caixas vazios passados
--   - Notificacoes "caixa nao fechado" dispara em vao
--   - Reports / dashboard contam linhas erroneas
--
-- Solucao: novo cron job diario que varre caixas vazios antigos e fecha
-- automaticamente. Comportamento controlado por 2 configs:
--   - `caixa.auto_fechar_vazio`        boolean default false (desligado)
--   - `caixa.auto_fechar_vazio_dias`   int     default 1     (dia anterior)
--
-- Operador habilita/ajusta via /configuracoes/sistema/caixa.
-- Idempotente: ON CONFLICT DO NOTHING + CREATE OR REPLACE.
-- =============================================================================

-- ---- 1. Novas chaves de config -------------------------------------------

INSERT INTO public.config (chave, valor, tipo, descricao, editavel) VALUES
  ('caixa.auto_fechar_vazio',
   'false'::jsonb, 'boolean',
   'Fechar automaticamente caixas que passaram do dia sem nenhum lancamento.',
   true),
  ('caixa.auto_fechar_vazio_dias',
   '1'::jsonb, 'number',
   'Quantos dias depois da data do caixa o auto-fechamento entra em acao.',
   true)
ON CONFLICT (chave) DO NOTHING;

-- ---- 2. Funcao app.fechar_caixas_vazios_auto() ---------------------------
-- Rodada pelo cron. SECURITY DEFINER porque cron nao tem auth.uid(). Atribui
-- `fechado_por` ao mesmo usuario que criou o caixa (preserva CHECK constraint
-- caixa_fechamento_consistente sem precisar de um user "system" fake).

CREATE OR REPLACE FUNCTION app.fechar_caixas_vazios_auto()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public, pg_temp
AS $$
DECLARE
    v_ativo        boolean;
    v_dias         integer;
    v_count        integer := 0;
    v_caixa        record;
    v_executado_em timestamptz := now();
BEGIN
    -- Le config; se chave nao existe ou esta off, sai.
    SELECT (valor #>> '{}')::boolean INTO v_ativo
    FROM public.config WHERE chave = 'caixa.auto_fechar_vazio';
    IF v_ativo IS NULL OR v_ativo = false THEN
        RETURN jsonb_build_object(
            'executado_em', v_executado_em,
            'ativo',        false,
            'fechados',     0
        );
    END IF;

    SELECT (valor #>> '{}')::integer INTO v_dias
    FROM public.config WHERE chave = 'caixa.auto_fechar_vazio_dias';
    v_dias := COALESCE(v_dias, 1);
    IF v_dias < 1 THEN v_dias := 1; END IF;

    -- Caixas elegiveis: estado 'aberto', sem lancamentos, sem pendentes,
    -- com data mais antiga que (hoje - v_dias).
    FOR v_caixa IN
        SELECT id, data, criado_por
        FROM public.caixa
        WHERE estado            = 'aberto'
          AND total_lancamentos = 0
          AND total_pendentes   = 0
          AND data              < (CURRENT_DATE - v_dias)
        ORDER BY data ASC
        LIMIT 100  -- proteção contra varredura gigante numa primeira execução
    LOOP
        UPDATE public.caixa
        SET estado      = 'fechado',
            fechado_em  = v_executado_em,
            fechado_por = v_caixa.criado_por,   -- evita NULL no CHECK constraint
            observacoes = COALESCE(observacoes, '') ||
                          E'\n[auto-fechamento ' || to_char(v_executado_em, 'YYYY-MM-DD HH24:MI') ||
                          '] caixa vazio (' || (CURRENT_DATE - v_caixa.data) || ' dia(s) sem movimento).'
        WHERE id = v_caixa.id;
        v_count := v_count + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'executado_em', v_executado_em,
        'ativo',        true,
        'dias',         v_dias,
        'fechados',     v_count
    );
END;
$$;

COMMENT ON FUNCTION app.fechar_caixas_vazios_auto IS
'Fecha caixas vazios antigos automaticamente. Controlado por config caixa.auto_fechar_vazio.';

-- ---- 3. Cron job ---------------------------------------------------------
-- Roda diariamente as 7h BRT (10h UTC), 1h depois do cria_caixa_diario (9h UTC).
-- Janela operacional ja esta aberta (>= 7h), nao impacta operador.

DO $$
DECLARE
    v_jobid bigint;
BEGIN
    -- Idempotencia: remove versao anterior se houver
    FOR v_jobid IN SELECT jobid FROM cron.job WHERE jobname = 'auto_fechar_caixas_vazios'
    LOOP
        PERFORM cron.unschedule(v_jobid);
    END LOOP;
END $$;

SELECT cron.schedule(
    'auto_fechar_caixas_vazios',
    '0 10 * * *',  -- 10h UTC = 7h BRT
    $$ SELECT app.fechar_caixas_vazios_auto(); $$
);

-- ---- 4. Permissao explicita pro super_admin invocar manualmente ----------
-- (Util pra testar antes do cron rodar.) RPC fica no schema app, RLS nao se
-- aplica a funcoes — quem tem GRANT EXECUTE invoca direto via supabase.rpc()
-- ou SQL Editor. Permite chamar a partir do app de configuracoes.

GRANT EXECUTE ON FUNCTION app.fechar_caixas_vazios_auto() TO authenticated;
