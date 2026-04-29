-- Migration 005: tabelas de domínio simples (vendedora, cliente_cache, feriado, config).

-- Lista controlada para categoria 'dinheiro' (RN: vendedora_recebedora).
CREATE TABLE IF NOT EXISTS public.vendedora (
    id          uuid         NOT NULL DEFAULT gen_random_uuid(),
    nome        varchar(80)  NOT NULL,
    apelido     varchar(40),
    ativa       boolean      NOT NULL DEFAULT true,
    criada_em   timestamptz  NOT NULL DEFAULT now(),
    criada_por  uuid         REFERENCES auth.users(id),
    atualizada_em timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT vendedora_pk PRIMARY KEY (id),
    CONSTRAINT vendedora_nome_uk UNIQUE (nome)
);

CREATE INDEX IF NOT EXISTS vendedora_ativa ON public.vendedora (ativa) WHERE ativa = true;

COMMENT ON TABLE public.vendedora IS 'Lista controlada — usada no combobox de Dinheiro. Soft-delete via ativa=false.';

-- Cache derivado para autocomplete na UI (Excel coluna D, Web modal).
-- Não é fonte da verdade; o mybucks é. Atualizado por trigger ao inserir/atualizar lancamento.
CREATE TABLE IF NOT EXISTS public.cliente_cache (
    codigo_pedido     varchar(20)  NOT NULL,
    cliente_nome      varchar(120) NOT NULL,
    valor_nf_ultimo   numeric(12,2),
    ultima_vez_visto  timestamptz  NOT NULL DEFAULT now(),

    CONSTRAINT cliente_cache_pk PRIMARY KEY (codigo_pedido)
);

CREATE INDEX IF NOT EXISTS cliente_cache_visto ON public.cliente_cache (ultima_vez_visto DESC);

COMMENT ON TABLE public.cliente_cache IS 'Espelho derivado para autocomplete. Atualizado por fn_atualizar_cliente_cache.';

-- Calendário de feriados (impacta geração automática de caixa, fechamento de mês).
CREATE TABLE IF NOT EXISTS public.feriado (
    data        date         NOT NULL,
    descricao   varchar(120) NOT NULL,
    tipo        varchar(20)  NOT NULL CHECK (tipo IN ('nacional','estadual','municipal','empresa')),
    ativo       boolean      NOT NULL DEFAULT true,

    CONSTRAINT feriado_pk PRIMARY KEY (data)
);

COMMENT ON TABLE public.feriado IS 'Datas em que o sistema NÃO cria caixa automaticamente.';

-- Configurações chave-valor do sistema (intervalos, horários, dias úteis).
CREATE TABLE IF NOT EXISTS public.config (
    chave         varchar(60)  NOT NULL,
    valor         jsonb        NOT NULL,
    descricao     text,
    -- editavel=false bloqueia alteração via API (apenas DDL). Ex.: dominio permitido.
    editavel      boolean      NOT NULL DEFAULT true,
    atualizado_em timestamptz  NOT NULL DEFAULT now(),
    atualizado_por uuid        REFERENCES auth.users(id),

    CONSTRAINT config_pk PRIMARY KEY (chave)
);

-- Seed inicial (idempotente).
INSERT INTO public.config (chave, valor, descricao, editavel) VALUES
    ('notificacao.intervalo_horas',   '4'::jsonb,             'Frequência base de notificações',                true),
    ('notificacao.horario_inicio',    '"08:00"'::jsonb,       'Início da janela de notificação',                true),
    ('notificacao.horario_fim',       '"18:00"'::jsonb,       'Fim da janela de notificação',                   true),
    ('pendencia.dias_alerta_atraso',  '3'::jsonb,             'Dias úteis para virar urgente',                  true),
    ('caixa.gerar_sabado',            'true'::jsonb,          'Gerar caixa aos sábados',                        true),
    ('caixa.gerar_domingo',           'false'::jsonb,         'Gerar caixa aos domingos',                       true),
    ('sync.intervalo_minutos',        '5'::jsonb,             'Intervalo entre syncs (Excel→Supabase)',         true),
    -- Domínio aceito no login Google OAuth. Inalterável via API (camada extra de proteção).
    ('auth.dominio_permitido',        '"vdboti.com.br"'::jsonb, 'Domínio único aceito no login Google OAuth',   false)
ON CONFLICT (chave) DO NOTHING;

COMMENT ON TABLE public.config IS 'Parâmetros do sistema. Editáveis pelo admin via UI; alguns (auth.*) inalteráveis.';
