-- Migration 003: tabela `caixa` (raiz do dia operacional).
-- Um caixa = um dia útil. Cada lançamento pertence a um caixa.

CREATE TABLE IF NOT EXISTS public.caixa (
    id                uuid          NOT NULL DEFAULT gen_random_uuid(),
    data              date          NOT NULL,
    -- Nomes derivados — Excel não aceita "/" em aba; Web usa "/" para legibilidade.
    -- Formula manual com lpad+extract porque to_char(date) não é IMMUTABLE.
    nome_aba_excel    varchar(20)   GENERATED ALWAYS AS (
        'Caixa ' ||
        lpad(extract(day   from data)::int::text, 2, '0') || '-' ||
        lpad(extract(month from data)::int::text, 2, '0')
    ) STORED,
    nome_aba_web      varchar(20)   GENERATED ALWAYS AS (
        'Caixa ' ||
        lpad(extract(day   from data)::int::text, 2, '0') || '/' ||
        lpad(extract(month from data)::int::text, 2, '0')
    ) STORED,
    estado            public.estado_caixa NOT NULL DEFAULT 'aberto',
    total_lancamentos integer       NOT NULL DEFAULT 0,
    total_pendentes   integer       NOT NULL DEFAULT 0,
    total_valor       numeric(12,2) NOT NULL DEFAULT 0,
    observacoes       text,
    criado_em         timestamptz   NOT NULL DEFAULT now(),
    criado_por        uuid          NOT NULL REFERENCES auth.users(id),
    fechado_em        timestamptz,
    fechado_por       uuid          REFERENCES auth.users(id),
    atualizado_em     timestamptz   NOT NULL DEFAULT now(),

    CONSTRAINT caixa_pk PRIMARY KEY (id),
    CONSTRAINT caixa_data_uk UNIQUE (data),
    CONSTRAINT caixa_fechamento_consistente CHECK (
        (estado = 'fechado' AND fechado_em IS NOT NULL AND fechado_por IS NOT NULL)
        OR (estado <> 'fechado')
    )
);

CREATE INDEX IF NOT EXISTS caixa_data_desc ON public.caixa (data DESC);
CREATE INDEX IF NOT EXISTS caixa_estado    ON public.caixa (estado);

COMMENT ON TABLE  public.caixa IS 'Cada linha = um dia útil operacional. Espelhada no Excel como aba ''Caixa DD-MM''.';
COMMENT ON COLUMN public.caixa.nome_aba_excel IS 'Nome da aba no Excel — formato com hífen.';
COMMENT ON COLUMN public.caixa.nome_aba_web   IS 'Nome exibido na Web — formato com barra.';
COMMENT ON COLUMN public.caixa.total_lancamentos IS 'Cache atualizado por trigger fn_recalcular_caixa.';
COMMENT ON COLUMN public.caixa.total_pendentes   IS 'Cache de pendentes em aberto. Trigger recalcula a cada mutação em lancamento.';
COMMENT ON COLUMN public.caixa.total_valor       IS 'Soma dos valor_nf não cancelados nem excluídos. Cache.';
