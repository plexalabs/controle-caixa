-- Migration 006: tabelas operacionais (papéis, auditoria, notificações, sync log).

-- Tabela de papéis: prepara multi-tenancy futuro mantendo single-user MVP.
CREATE TABLE IF NOT EXISTS public.usuario_papel (
    usuario_id   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    papel        varchar(40) NOT NULL CHECK (papel IN ('operador','supervisor','auditor','admin')),
    concedido_em timestamptz NOT NULL DEFAULT now(),
    concedido_por uuid       REFERENCES auth.users(id),

    CONSTRAINT usuario_papel_pk PRIMARY KEY (usuario_id, papel)
);

CREATE INDEX IF NOT EXISTS usuario_papel_papel ON public.usuario_papel (papel);

COMMENT ON TABLE public.usuario_papel IS 'Papéis por usuário. Operador é único hoje; admin é concedido manual.';

-- audit_log imutável (sem UPDATE nem DELETE — RN-072 e §4.9 do doc 03).
CREATE TABLE IF NOT EXISTS public.audit_log (
    id            uuid              NOT NULL DEFAULT gen_random_uuid(),
    tabela        varchar(50)       NOT NULL,
    registro_id   uuid              NOT NULL,
    acao          public.acao_audit NOT NULL,
    dados_antes   jsonb,
    dados_depois  jsonb,
    usuario_id    uuid              REFERENCES auth.users(id),
    usuario_email varchar(120),
    fonte         varchar(20),
    ip            inet,
    user_agent    text,
    criado_em     timestamptz       NOT NULL DEFAULT now(),

    CONSTRAINT audit_log_pk PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS audit_log_tabela_registro ON public.audit_log (tabela, registro_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS audit_log_usuario         ON public.audit_log (usuario_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS audit_log_acao            ON public.audit_log (acao, criado_em DESC);

COMMENT ON TABLE public.audit_log IS 'Imutável (RN-072). Bloqueia UPDATE/DELETE via trigger fn_audit_log_imutavel.';

-- Notificações (UI bell + email).
CREATE TABLE IF NOT EXISTS public.notificacao (
    id              uuid                            NOT NULL DEFAULT gen_random_uuid(),
    tipo            public.tipo_notificacao         NOT NULL,
    severidade      public.severidade_notificacao   NOT NULL DEFAULT 'info',
    titulo          varchar(120)                    NOT NULL,
    mensagem        text                            NOT NULL,
    lancamento_id   uuid                            REFERENCES public.lancamento(id) ON DELETE SET NULL,
    caixa_id        uuid                            REFERENCES public.caixa(id)      ON DELETE SET NULL,
    -- usuario_destino NULL = broadcast (todos os usuários veem).
    usuario_destino uuid                            REFERENCES auth.users(id),
    lida_em         timestamptz,
    descartada_em   timestamptz,
    criada_em       timestamptz                     NOT NULL DEFAULT now(),

    CONSTRAINT notificacao_pk PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS notificacao_destino_lida ON public.notificacao (usuario_destino, lida_em);
CREATE INDEX IF NOT EXISTS notificacao_criada       ON public.notificacao (criada_em DESC);
CREATE INDEX IF NOT EXISTS notificacao_severidade   ON public.notificacao (severidade, criada_em DESC);

COMMENT ON TABLE public.notificacao IS 'Notificações inteligentes. Usuario_destino NULL = broadcast.';

-- sync_log: cada cliente reporta sincronizações para diagnóstico.
CREATE TABLE IF NOT EXISTS public.sync_log (
    id            uuid        NOT NULL DEFAULT gen_random_uuid(),
    cliente       varchar(20) NOT NULL CHECK (cliente IN ('excel','web','apps_script','edge')),
    tipo          varchar(10) NOT NULL CHECK (tipo IN ('push','pull')),
    inicio        timestamptz NOT NULL,
    fim           timestamptz,
    qtd_enviados  integer     NOT NULL DEFAULT 0,
    qtd_recebidos integer     NOT NULL DEFAULT 0,
    qtd_conflitos integer     NOT NULL DEFAULT 0,
    qtd_erros     integer     NOT NULL DEFAULT 0,
    mensagem      text,
    usuario_id    uuid        REFERENCES auth.users(id),
    criado_em     timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT sync_log_pk PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS sync_log_cliente_inicio ON public.sync_log (cliente, inicio DESC);
CREATE INDEX IF NOT EXISTS sync_log_erros          ON public.sync_log (qtd_erros) WHERE qtd_erros > 0;

COMMENT ON TABLE public.sync_log IS 'Rastreia sincronizações entre clientes. Limpeza automática via pg_cron (>90d).';
