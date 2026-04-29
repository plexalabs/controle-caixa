-- Migration 004: tabela `lancamento` (entidade central).
-- Cada lançamento = uma linha do caixa, representa uma NF auditada.

CREATE TABLE IF NOT EXISTS public.lancamento (
    id              uuid           NOT NULL DEFAULT gen_random_uuid(),
    caixa_id        uuid           NOT NULL REFERENCES public.caixa(id) ON DELETE RESTRICT,

    numero_nf       varchar(15)    NOT NULL,
    codigo_pedido   varchar(20)    NOT NULL,
    cliente_nome    varchar(120)   NOT NULL,
    valor_nf        numeric(12,2)  NOT NULL CHECK (valor_nf >= 0),

    -- Categoria pode ser NULL apenas quando estado='pendente' (RN-014).
    categoria       public.categoria_lancamento,
    estado          public.estado_lancamento NOT NULL DEFAULT 'pendente',

    -- Campos específicos da categoria — JSONB validado por trigger fn_validar_dados_categoria.
    dados_categoria jsonb          NOT NULL DEFAULT '{}'::jsonb,

    -- Pendência: marca de origem e quem/quando resolveu (RN-031, RN-032).
    origem_pendencia varchar(40),
    resolvido_em     timestamptz,
    resolvido_por    uuid          REFERENCES auth.users(id),

    -- Anexo (Pix). Caminho relativo no bucket 'comprovantes'.
    comprovante_storage_path varchar(500),

    -- Tags livres do Operador.
    tags             text[]         NOT NULL DEFAULT '{}',

    -- Controle de sincronização (Excel ↔ Supabase ↔ Web).
    versao           integer        NOT NULL DEFAULT 1,
    fonte_origem     varchar(20)    NOT NULL DEFAULT 'web',
    sync_hash        varchar(64),
    -- Hash de integridade dos campos críticos. Preenchido por trigger.
    hash_conteudo    varchar(64),

    -- Timestamps & autoria.
    criado_em        timestamptz    NOT NULL DEFAULT now(),
    criado_por       uuid           NOT NULL REFERENCES auth.users(id),
    atualizado_em    timestamptz    NOT NULL DEFAULT now(),
    atualizado_por   uuid           NOT NULL REFERENCES auth.users(id),

    CONSTRAINT lancamento_pk PRIMARY KEY (id),
    -- Estado pendente exige categoria NULL e vice-versa (RN-014, RN-022).
    CONSTRAINT lancamento_categoria_estado CHECK (
        (estado = 'pendente' AND categoria IS NULL)
        OR (estado <> 'pendente' AND categoria IS NOT NULL)
    ),
    -- Estado resolvido exige metadados de resolução.
    CONSTRAINT lancamento_resolvido_consistente CHECK (
        (estado = 'resolvido' AND resolvido_em IS NOT NULL AND resolvido_por IS NOT NULL)
        OR (estado <> 'resolvido')
    ),
    -- Origem da fonte de dados.
    CONSTRAINT lancamento_fonte_origem_valida CHECK (
        fonte_origem IN ('web', 'excel', 'apps_script', 'import', 'system')
    )
);

-- Partial unique: dentro de um caixa, um numero_nf não-excluído só aparece uma vez.
-- Soft-deleted (estado='excluido') é ignorado pelo UNIQUE — permite reemissão pós exclusão.
-- RN-011 falava em alerta-amarelo-sem-bloquear, mas a sincronia idempotente
-- exige uma chave estável; o RPC upsert_lancamento usa ON CONFLICT contra este índice.
CREATE UNIQUE INDEX IF NOT EXISTS lancamento_nf_caixa_uk
    ON public.lancamento (caixa_id, numero_nf)
    WHERE estado <> 'excluido';

CREATE INDEX IF NOT EXISTS lancamento_caixa      ON public.lancamento (caixa_id);
CREATE INDEX IF NOT EXISTS lancamento_estado     ON public.lancamento (estado)
    WHERE estado IN ('pendente', 'em_preenchimento');
CREATE INDEX IF NOT EXISTS lancamento_categoria  ON public.lancamento (categoria);
CREATE INDEX IF NOT EXISTS lancamento_atualizado ON public.lancamento (atualizado_em DESC);
CREATE INDEX IF NOT EXISTS lancamento_dados_categoria_gin ON public.lancamento USING gin (dados_categoria);
CREATE INDEX IF NOT EXISTS lancamento_tags_gin   ON public.lancamento USING gin (tags);
-- Index para sincronia incremental Excel→Web (puxa só registros mais novos).
CREATE INDEX IF NOT EXISTS lancamento_caixa_atualizado ON public.lancamento (caixa_id, atualizado_em DESC);

COMMENT ON TABLE  public.lancamento IS 'Linha do caixa — representa uma NF auditada. Soft-delete via estado=excluido.';
COMMENT ON COLUMN public.lancamento.dados_categoria IS 'Schema varia por categoria; valida por trigger (Apêndice A do arquivo 01).';
COMMENT ON COLUMN public.lancamento.hash_conteudo   IS 'SHA-256 dos campos críticos. Detecta corrupção em sincronia.';
COMMENT ON COLUMN public.lancamento.fonte_origem    IS 'Cliente que originou esta versão: web | excel | apps_script | import | system.';
