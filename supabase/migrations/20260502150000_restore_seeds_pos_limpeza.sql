-- ===========================================================================
-- Migration: restauração de seeds após limpeza de teste do banco.
-- Data: 2026-05-02
-- Contexto: durante teste de "sistema limpo" no CP-PRE-DEPLOY-1, a tabela
-- config foi truncada junto com tabelas operacionais. Esta migration
-- restaura os valores padrão de configuração e (preventivamente) também
-- os feriados — caso uma limpeza futura também os pegue, basta rerodar.
--
-- IMPORTANTE: idempotente. ON CONFLICT DO NOTHING em ambas tabelas.
-- Pode ser rerodada sem efeito colateral nos dados existentes.
--
-- Os valores aqui refletem os SEEDS REAIS do banco antes da limpeza
-- (não os do spec genérico). Carnaval/Cinzas/Corpus são tipo 'empresa'
-- na convenção da Caixa Boti, descrições com acentuação correta.
-- ===========================================================================

-- ---- 1. config: 8 chaves originais + dias_retencao_arquivamento (CP-PRE-1) -

INSERT INTO public.config (chave, valor, tipo, descricao, editavel) VALUES
  ('notificacao.intervalo_horas',  '4'::jsonb,             'number',  'Frequência base de notificações',                          true),
  ('notificacao.horario_inicio',   '"08:00"'::jsonb,       'time',    'Início da janela de notificação',                          true),
  ('notificacao.horario_fim',      '"18:00"'::jsonb,       'time',    'Fim da janela de notificação',                             true),
  ('pendencia.dias_alerta_atraso', '3'::jsonb,             'number',  'Dias úteis para virar urgente',                            true),
  ('caixa.gerar_sabado',           'true'::jsonb,          'boolean', 'Gerar caixa aos sábados',                                  true),
  ('caixa.gerar_domingo',          'false'::jsonb,         'boolean', 'Gerar caixa aos domingos',                                 true),
  ('sync.intervalo_minutos',       '5'::jsonb,             'number',  'Intervalo entre syncs (Excel→Supabase)',                   true),
  ('auth.dominio_permitido',       '"vdboti.com.br"'::jsonb, 'text',  'Domínio único aceito no login Google OAuth',               false),
  ('dias_retencao_arquivamento',   '365'::jsonb,           'number',  'Dias após finalizado/cancelado_pos antes de arquivar.',    true)
ON CONFLICT (chave) DO NOTHING;

-- ---- 2. feriado: SEEDS REAIS do banco (15 = 11 nacional + 1 estadual + 4 empresa)

INSERT INTO public.feriado (data, descricao, tipo, ativo) VALUES
  ('2026-01-01', 'Confraternização Universal',     'nacional', true),
  ('2026-02-16', 'Carnaval (segunda)',             'empresa',  true),
  ('2026-02-17', 'Carnaval (terça)',               'empresa',  true),
  ('2026-02-18', 'Quarta-feira de Cinzas',         'empresa',  true),
  ('2026-04-03', 'Sexta-feira Santa',              'nacional', true),
  ('2026-04-21', 'Tiradentes',                     'nacional', true),
  ('2026-05-01', 'Dia do Trabalho',                'nacional', true),
  ('2026-06-04', 'Corpus Christi',                 'empresa',  true),
  ('2026-07-09', 'Revolução Constitucionalista',   'estadual', true),
  ('2026-09-07', 'Independência do Brasil',        'nacional', true),
  ('2026-10-12', 'Nossa Senhora Aparecida',        'nacional', true),
  ('2026-11-02', 'Finados',                        'nacional', true),
  ('2026-11-15', 'Proclamação da República',       'nacional', true),
  ('2026-11-20', 'Dia da Consciência Negra',       'nacional', true),
  ('2026-12-25', 'Natal',                          'nacional', true)
ON CONFLICT (data) DO NOTHING;

-- ---- 3. Sanity check ------------------------------------------------------

DO $$
DECLARE
  v_config   integer;
  v_feriados integer;
BEGIN
  SELECT count(*) INTO v_config   FROM public.config;
  SELECT count(*) INTO v_feriados FROM public.feriado WHERE ativo = true;

  IF v_config < 9 THEN
    RAISE EXCEPTION 'Restauração falhou: esperado >=9 chaves em config, encontrado %', v_config;
  END IF;
  IF v_feriados < 14 THEN
    RAISE EXCEPTION 'Restauração falhou: esperado >=14 feriados ativos, encontrado %', v_feriados;
  END IF;

  RAISE NOTICE 'Restauração ok: % chaves config + % feriados ativos', v_config, v_feriados;
END $$;
