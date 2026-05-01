# PROMPT 03 — BACKEND SUPABASE: BANCO DE DADOS, RLS, EDGE FUNCTIONS

> **Pré-requisitos de leitura:**
> - `01_VISAO_GERAL_E_REGRAS_DE_NEGOCIO.md` — contexto e dicionário de dados.
> - `02_PLANILHA_EXCEL_ESPECIFICACAO_COMPLETA.md` — o Excel chama RPCs descritas aqui.
>
> Este arquivo é a fonte da verdade do **backend**: schema Postgres, políticas de RLS, triggers, funções RPC, edge functions, autenticação e storage. Tudo deve ser idempotente — todos os scripts podem ser rodados várias vezes sem efeito colateral.

---

## SUMÁRIO

1. Visão geral da stack Supabase
2. Setup inicial do projeto
3. Variáveis de ambiente
4. Schema Postgres — DDL completo
5. Tabelas auxiliares (config, vendedoras, feriados, audit_log, notificacao)
6. Tipos enum
7. Triggers e funções automáticas
8. Row-Level Security (RLS)
9. RPCs (funções acessadas pelo cliente)
10. Edge Functions (Deno)
11. Storage — buckets e políticas
12. Realtime — channels
13. Autenticação — Email + senha + OTP via Resend SMTP
14. pg_cron — agendamentos
15. Backup e disaster recovery
16. Migrations
17. Observabilidade
18. Testes
19. Apêndice H — DDL completo concatenado
20. Apêndice I — Roteiro de deploy passo a passo

---

## 1. VISÃO GERAL DA STACK SUPABASE

| Componente | Função |
|------------|--------|
| **Postgres 15+** | Banco de dados relacional, fonte da verdade. |
| **PostgREST** | API REST automática sobre tabelas e RPCs. |
| **GoTrue** | Auth com OAuth (Google é o provider deste projeto), magic link, SSO SAML disponível mas não usado aqui. |
| **Storage** | Buckets S3-compatíveis para arquivos (comprovantes). |
| **Realtime** | WebSocket para alterações em tempo real. |
| **Edge Functions** | Deno serverless functions para lógica complexa, schedulers, integrações. |
| **pg_cron** | Cron jobs nativos do Postgres. |

### Plano e limites

- Plano **Pro** (pago) — confirmado pelo Operador.
- Capacidade incluída: 8 GB DB, 100 GB Storage, 2M Edge Function invocations/mês.
- Para o volume esperado (50-150 lançamentos/dia × 365 dias × ~5 anos ≈ 270k linhas), folga **enorme**.

---

## 2. SETUP INICIAL DO PROJETO

### 2.1. Criar projeto

1. Acessar `app.supabase.com` autenticado.
2. **New project**.
3. **Nome:** `controle-caixa-prod`.
4. **Database password:** gerar e armazenar em gerenciador de senhas.
5. **Region:** `sa-east-1` (São Paulo) — mínima latência para o Operador.
6. **Pricing plan:** Pro.

### 2.2. Configurações iniciais

- Habilitar extensões: `pgcrypto`, `uuid-ossp`, `pg_cron`, `pgjwt`, `http`.
- Senha do `service_role`: armazenar separadamente (uso apenas em Edge Functions).
- Configurar timezone do projeto: `America/Sao_Paulo`.

```sql
ALTER DATABASE postgres SET timezone TO 'America/Sao_Paulo';
SET timezone TO 'America/Sao_Paulo';
```

---

## 3. VARIÁVEIS DE AMBIENTE

Configuradas em **Project Settings → API** e em **Edge Functions → Secrets**.

| Variável | Onde | Descrição |
|----------|------|-----------|
| `SUPABASE_URL` | cliente Excel/Web | URL pública do projeto. |
| `SUPABASE_ANON_KEY` | cliente Excel/Web | Chave anônima JWT pública. |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Functions | Chave service role (bypass RLS). |
| `SUPABASE_DB_PASSWORD` | Gerenciador de senhas | Senha do Postgres. |
| `RESEND_API_KEY` | Supabase Dashboard → Auth → Providers → SMTP Settings → Password | API key do Resend (formato `re_...`) usada como senha SMTP. Cadastrada no Dashboard. |
| `EMAIL_FROM` | Supabase Dashboard → Auth → Providers → SMTP Settings → Sender | `Caixa Boti <noreply@plexalabs.com>` |
| `MASTER_ENCRYPTION_KEY` | Edge Functions | Chave usada para encrypt/decrypt PII (AES-256-GCM). |
| `SMTP_HOST`/`USER`/`PASSWORD` | Edge Functions | Para envio de e-mails de notificação. |

> **Nunca** comitar essas variáveis. Usar `.env.local` no desenvolvimento, gerenciador de secrets em produção.

---

## 4. SCHEMA POSTGRES — DDL COMPLETO

Todas as tabelas em schema `public`. Funções administrativas em schema `app`.

### 4.1. Schema `app`

```sql
CREATE SCHEMA IF NOT EXISTS app;
```

### 4.2. Tipos enum

```sql
-- Categoria do lançamento (6 valores canônicos + reservado para evolução)
CREATE TYPE public.categoria_lancamento AS ENUM (
    'cartao',
    'pix',
    'dinheiro',
    'cancelado',
    'cartao_link',
    'obs'
);

-- Estado do lançamento na máquina de estados (Apêndice B do arquivo 01)
CREATE TYPE public.estado_lancamento AS ENUM (
    'pendente',
    'em_preenchimento',
    'completo',
    'resolvido',
    'cancelado',
    'excluido'  -- soft delete
);

-- Status do caixa
CREATE TYPE public.estado_caixa AS ENUM (
    'aberto',
    'em_conferencia',
    'fechado',
    'arquivado'
);

-- Status do link de cartão
CREATE TYPE public.status_link AS ENUM (
    'enviado',
    'pago',
    'expirado',
    'cancelado'
);

-- Severidade da notificação
CREATE TYPE public.severidade_notificacao AS ENUM (
    'info',
    'aviso',
    'urgente'
);

-- Tipos de notificação
CREATE TYPE public.tipo_notificacao AS ENUM (
    'pendencia_aberta',
    'pendencia_atrasada',
    'caixa_nao_fechado',
    'valor_divergente',
    'comprovante_faltando',
    'link_expirando',
    'bom_dia_resumo'
);

-- Ação de auditoria
CREATE TYPE public.acao_audit AS ENUM (
    'INSERT', 'UPDATE', 'DELETE', 'REVEAL_PII'
);
```

### 4.3. Tabela `caixa`

```sql
CREATE TABLE IF NOT EXISTS public.caixa (
    id              uuid        NOT NULL DEFAULT gen_random_uuid(),
    data            date        NOT NULL,
    nome_aba_excel  varchar(20) GENERATED ALWAYS AS ('Caixa ' || to_char(data, 'DD-MM')) STORED,
    nome_aba_web    varchar(20) GENERATED ALWAYS AS ('Caixa ' || to_char(data, 'DD/MM')) STORED,
    estado          public.estado_caixa NOT NULL DEFAULT 'aberto',
    total_lancamentos integer   NOT NULL DEFAULT 0,
    total_pendentes   integer   NOT NULL DEFAULT 0,
    total_valor       numeric(12,2) NOT NULL DEFAULT 0,
    observacoes     text,
    criado_em       timestamptz NOT NULL DEFAULT now(),
    criado_por      uuid        NOT NULL REFERENCES auth.users(id),
    fechado_em      timestamptz,
    fechado_por     uuid        REFERENCES auth.users(id),
    atualizado_em   timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT caixa_pk PRIMARY KEY (id),
    CONSTRAINT caixa_data_uk UNIQUE (data),
    CONSTRAINT caixa_fechamento_consistente CHECK (
        (estado = 'fechado' AND fechado_em IS NOT NULL AND fechado_por IS NOT NULL)
        OR (estado != 'fechado')
    )
);

CREATE INDEX caixa_data_desc ON public.caixa (data DESC);
CREATE INDEX caixa_estado ON public.caixa (estado);
```

### 4.4. Tabela `lancamento`

```sql
CREATE TABLE IF NOT EXISTS public.lancamento (
    id              uuid        NOT NULL DEFAULT gen_random_uuid(),
    caixa_id        uuid        NOT NULL REFERENCES public.caixa(id) ON DELETE RESTRICT,
    numero_nf       varchar(15) NOT NULL,
    codigo_pedido   varchar(20) NOT NULL,
    cliente_nome    varchar(120) NOT NULL,
    valor_nf        numeric(12,2) NOT NULL CHECK (valor_nf >= 0),

    categoria       public.categoria_lancamento, -- pode ser NULL para pendentes
    estado          public.estado_lancamento NOT NULL DEFAULT 'pendente',

    -- Campos específicos da categoria — JSONB validado por trigger
    dados_categoria jsonb       NOT NULL DEFAULT '{}'::jsonb,

    -- Pendência
    origem_pendencia varchar(40), -- 'mybucks_generica', 'monetaria_ambigua', etc.
    resolvido_em    timestamptz,
    resolvido_por   uuid        REFERENCES auth.users(id),

    -- Anexos
    comprovante_storage_path varchar(500),

    -- Tags livres
    tags            text[]      NOT NULL DEFAULT '{}',

    -- Conflict tracking
    versao          integer     NOT NULL DEFAULT 1,
    fonte_origem    varchar(20) NOT NULL DEFAULT 'web', -- 'web' | 'excel' | 'apps_script'
    sync_hash       varchar(64),

    -- Timestamps & autoria
    criado_em       timestamptz NOT NULL DEFAULT now(),
    criado_por      uuid        NOT NULL REFERENCES auth.users(id),
    atualizado_em   timestamptz NOT NULL DEFAULT now(),
    atualizado_por  uuid        NOT NULL REFERENCES auth.users(id),

    CONSTRAINT lancamento_pk PRIMARY KEY (id),
    CONSTRAINT lancamento_nf_caixa_uk UNIQUE (caixa_id, numero_nf, estado),
    CONSTRAINT lancamento_resolvido_consistente CHECK (
        (estado = 'resolvido' AND resolvido_em IS NOT NULL AND resolvido_por IS NOT NULL)
        OR (estado != 'resolvido')
    ),
    CONSTRAINT lancamento_categoria_estado CHECK (
        (estado = 'pendente' AND categoria IS NULL)
        OR (estado != 'pendente' AND categoria IS NOT NULL)
    )
);

CREATE INDEX lancamento_caixa ON public.lancamento (caixa_id);
CREATE INDEX lancamento_estado ON public.lancamento (estado) WHERE estado IN ('pendente', 'em_preenchimento');
CREATE INDEX lancamento_categoria ON public.lancamento (categoria);
CREATE INDEX lancamento_atualizado ON public.lancamento (atualizado_em DESC);
CREATE INDEX lancamento_dados_categoria_gin ON public.lancamento USING gin (dados_categoria);
CREATE INDEX lancamento_tags_gin ON public.lancamento USING gin (tags);
```

### 4.5. Tabela `vendedora`

```sql
CREATE TABLE IF NOT EXISTS public.vendedora (
    id          uuid        NOT NULL DEFAULT gen_random_uuid(),
    nome        varchar(80) NOT NULL,
    apelido     varchar(40),
    ativa       boolean     NOT NULL DEFAULT true,
    criada_em   timestamptz NOT NULL DEFAULT now(),
    criada_por  uuid        NOT NULL REFERENCES auth.users(id),

    CONSTRAINT vendedora_pk PRIMARY KEY (id),
    CONSTRAINT vendedora_nome_uk UNIQUE (nome)
);

CREATE INDEX vendedora_ativa ON public.vendedora (ativa) WHERE ativa = true;
```

### 4.6. Tabela `cliente_cache`

```sql
CREATE TABLE IF NOT EXISTS public.cliente_cache (
    codigo_pedido     varchar(20) NOT NULL,
    cliente_nome      varchar(120) NOT NULL,
    valor_nf_ultimo   numeric(12,2),
    ultima_vez_visto  timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT cliente_cache_pk PRIMARY KEY (codigo_pedido)
);
```

### 4.7. Tabela `feriado`

```sql
CREATE TABLE IF NOT EXISTS public.feriado (
    data        date        NOT NULL,
    descricao   varchar(120) NOT NULL,
    tipo        varchar(20) NOT NULL CHECK (tipo IN ('nacional','estadual','municipal','empresa')),
    ativo       boolean     NOT NULL DEFAULT true,

    CONSTRAINT feriado_pk PRIMARY KEY (data)
);
```

### 4.8. Tabela `config`

```sql
CREATE TABLE IF NOT EXISTS public.config (
    chave       varchar(60) NOT NULL,
    valor       jsonb       NOT NULL,
    descricao   text,
    editavel    boolean     NOT NULL DEFAULT true,
    atualizado_em timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT config_pk PRIMARY KEY (chave)
);

INSERT INTO public.config (chave, valor, descricao, editavel) VALUES
    ('notificacao.intervalo_horas', '4'::jsonb, 'Frequência base de notificações', true),
    ('notificacao.horario_inicio', '"08:00"'::jsonb, 'Início da janela de notificação', true),
    ('notificacao.horario_fim', '"18:00"'::jsonb, 'Fim da janela de notificação', true),
    ('pendencia.dias_alerta_atraso', '3'::jsonb, 'Dias úteis para virar urgente', true),
    ('caixa.gerar_sabado', 'true'::jsonb, 'Gerar caixa aos sábados', true),
    ('caixa.gerar_domingo', 'false'::jsonb, 'Gerar caixa aos domingos', true),
    ('sync.intervalo_minutos', '5'::jsonb, 'Intervalo entre syncs', true)
ON CONFLICT (chave) DO NOTHING;
```

### 4.9. Tabela `audit_log`

Imutável: ninguém — nem service_role — pode fazer UPDATE/DELETE.

```sql
CREATE TABLE IF NOT EXISTS public.audit_log (
    id              uuid        NOT NULL DEFAULT gen_random_uuid(),
    tabela          varchar(50) NOT NULL,
    registro_id     uuid        NOT NULL,
    acao            public.acao_audit NOT NULL,
    dados_antes     jsonb,
    dados_depois    jsonb,
    usuario_id      uuid        REFERENCES auth.users(id),
    usuario_email   varchar(120),
    fonte           varchar(20), -- 'web' | 'excel' | 'edge_function'
    ip              inet,
    user_agent      text,
    criado_em       timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT audit_log_pk PRIMARY KEY (id)
);

CREATE INDEX audit_log_tabela_registro ON public.audit_log (tabela, registro_id, criado_em DESC);
CREATE INDEX audit_log_usuario ON public.audit_log (usuario_id, criado_em DESC);

-- Bloqueia UPDATE/DELETE
CREATE OR REPLACE FUNCTION public.audit_log_imutavel()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'audit_log é imutável';
END;
$$;

CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON public.audit_log
    FOR EACH ROW EXECUTE FUNCTION public.audit_log_imutavel();
CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON public.audit_log
    FOR EACH ROW EXECUTE FUNCTION public.audit_log_imutavel();
```

### 4.10. Tabela `notificacao`

```sql
CREATE TABLE IF NOT EXISTS public.notificacao (
    id              uuid        NOT NULL DEFAULT gen_random_uuid(),
    tipo            public.tipo_notificacao NOT NULL,
    severidade      public.severidade_notificacao NOT NULL DEFAULT 'info',
    titulo          varchar(120) NOT NULL,
    mensagem        text        NOT NULL,
    lancamento_id   uuid        REFERENCES public.lancamento(id) ON DELETE SET NULL,
    caixa_id        uuid        REFERENCES public.caixa(id) ON DELETE SET NULL,
    usuario_destino uuid        REFERENCES auth.users(id),
    lida_em         timestamptz,
    descartada_em   timestamptz,
    criada_em       timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT notificacao_pk PRIMARY KEY (id)
);

CREATE INDEX notificacao_destino_lida ON public.notificacao (usuario_destino, lida_em);
CREATE INDEX notificacao_criada ON public.notificacao (criada_em DESC);
```

### 4.11. View `pendencia` (derivada)

```sql
CREATE OR REPLACE VIEW public.pendencia AS
SELECT
    l.id,
    l.caixa_id,
    c.data AS data_caixa,
    l.numero_nf,
    l.codigo_pedido,
    l.cliente_nome,
    l.valor_nf,
    l.estado,
    l.criado_em,
    l.atualizado_em,
    l.criado_por,
    EXTRACT(DAY FROM age(now(), l.criado_em))::int AS idade_dias_corridos,
    public.dias_uteis_entre(l.criado_em::date, current_date) AS idade_dias_uteis,
    CASE
        WHEN public.dias_uteis_entre(l.criado_em::date, current_date) > (SELECT (valor::text)::int FROM public.config WHERE chave = 'pendencia.dias_alerta_atraso')
        THEN 'urgente'
        WHEN public.dias_uteis_entre(l.criado_em::date, current_date) > 1 THEN 'aviso'
        ELSE 'normal'
    END AS severidade
FROM public.lancamento l
JOIN public.caixa c ON c.id = l.caixa_id
WHERE l.estado IN ('pendente', 'em_preenchimento');
```

### 4.12. Função utilitária `dias_uteis_entre`

```sql
CREATE OR REPLACE FUNCTION public.dias_uteis_entre(d_ini date, d_fim date)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
    SELECT COUNT(*)::int
    FROM generate_series(d_ini, d_fim, interval '1 day') AS dt
    WHERE EXTRACT(ISODOW FROM dt) < 7  -- 1 a 6 = seg a sáb
      AND dt::date NOT IN (SELECT data FROM public.feriado WHERE ativo = true);
$$;
```

---

## 5. TRIGGERS E FUNÇÕES AUTOMÁTICAS

### 5.1. Atualizar `atualizado_em` em qualquer UPDATE

```sql
CREATE OR REPLACE FUNCTION public.fn_atualizar_timestamp()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.atualizado_em = now();
    NEW.atualizado_por = auth.uid();
    NEW.versao = COALESCE(OLD.versao, 0) + 1;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_lancamento_atualizar_ts BEFORE UPDATE ON public.lancamento
    FOR EACH ROW EXECUTE FUNCTION public.fn_atualizar_timestamp();
```

### 5.2. Atualizar caches em `caixa` ao inserir/atualizar lançamento

```sql
CREATE OR REPLACE FUNCTION public.fn_recalcular_caixa()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    cx_id uuid;
BEGIN
    cx_id := COALESCE(NEW.caixa_id, OLD.caixa_id);
    UPDATE public.caixa
    SET
        total_lancamentos = (SELECT COUNT(*) FROM public.lancamento WHERE caixa_id = cx_id AND estado != 'excluido'),
        total_pendentes = (SELECT COUNT(*) FROM public.lancamento WHERE caixa_id = cx_id AND estado IN ('pendente','em_preenchimento')),
        total_valor = (SELECT COALESCE(SUM(valor_nf), 0) FROM public.lancamento WHERE caixa_id = cx_id AND estado NOT IN ('cancelado','excluido')),
        atualizado_em = now()
    WHERE id = cx_id;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_lancamento_recalcular_caixa
AFTER INSERT OR UPDATE OR DELETE ON public.lancamento
FOR EACH ROW EXECUTE FUNCTION public.fn_recalcular_caixa();
```

### 5.3. Auditoria automática

Função genérica que pode ser anexada a qualquer tabela:

```sql
CREATE OR REPLACE FUNCTION public.fn_auditar_mutacao()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    rec_id uuid;
    user_id uuid;
    user_email varchar;
BEGIN
    rec_id := COALESCE(NEW.id, OLD.id);
    user_id := auth.uid();
    SELECT email INTO user_email FROM auth.users WHERE id = user_id;

    INSERT INTO public.audit_log (tabela, registro_id, acao, dados_antes, dados_depois, usuario_id, usuario_email, fonte)
    VALUES (
        TG_TABLE_NAME,
        rec_id,
        TG_OP::public.acao_audit,
        CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
        user_id,
        user_email,
        current_setting('app.fonte_origem', true)
    );
    RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_lancamento_audit
AFTER INSERT OR UPDATE OR DELETE ON public.lancamento
FOR EACH ROW EXECUTE FUNCTION public.fn_auditar_mutacao();

CREATE TRIGGER trg_caixa_audit
AFTER INSERT OR UPDATE OR DELETE ON public.caixa
FOR EACH ROW EXECUTE FUNCTION public.fn_auditar_mutacao();

CREATE TRIGGER trg_vendedora_audit
AFTER INSERT OR UPDATE OR DELETE ON public.vendedora
FOR EACH ROW EXECUTE FUNCTION public.fn_auditar_mutacao();
```

### 5.4. Validação do JSONB `dados_categoria` por categoria

```sql
CREATE OR REPLACE FUNCTION public.fn_validar_dados_categoria()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.estado = 'pendente' THEN
        RETURN NEW; -- pendente não exige dados_categoria
    END IF;
    
    CASE NEW.categoria
        WHEN 'cartao' THEN
            IF NOT (NEW.dados_categoria ? 'codigo_autorizacao' AND NEW.dados_categoria ? 'bandeira' AND NEW.dados_categoria ? 'modalidade' AND NEW.dados_categoria ? 'parcelas') THEN
                IF NEW.estado IN ('completo', 'resolvido') THEN
                    RAISE EXCEPTION 'Dados de Cartão incompletos: requer codigo_autorizacao, bandeira, modalidade, parcelas';
                END IF;
            END IF;
        WHEN 'pix' THEN
            IF NOT (NEW.dados_categoria ? 'comprovante_id_externo' AND NEW.dados_categoria ? 'chave_recebedora' AND NEW.dados_categoria ? 'data_hora_pix') THEN
                IF NEW.estado IN ('completo', 'resolvido') THEN
                    RAISE EXCEPTION 'Dados de Pix incompletos';
                END IF;
            END IF;
        WHEN 'dinheiro' THEN
            IF NOT (NEW.dados_categoria ? 'vendedora_id' AND NEW.dados_categoria ? 'valor_recebido') THEN
                IF NEW.estado IN ('completo', 'resolvido') THEN
                    RAISE EXCEPTION 'Dados de Dinheiro incompletos';
                END IF;
            END IF;
        WHEN 'cancelado' THEN
            IF NOT (NEW.dados_categoria ? 'motivo_cancelamento' AND NEW.dados_categoria ? 'cancelado_por' AND NEW.dados_categoria ? 'data_cancelamento') THEN
                RAISE EXCEPTION 'Dados de Cancelamento incompletos';
            END IF;
            IF length(NEW.dados_categoria->>'motivo_cancelamento') < 10 THEN
                RAISE EXCEPTION 'Motivo de cancelamento muito curto (mín. 10 chars)';
            END IF;
        WHEN 'cartao_link' THEN
            IF NOT (NEW.dados_categoria ? 'link_url' AND NEW.dados_categoria ? 'status_link') THEN
                IF NEW.estado IN ('completo', 'resolvido') THEN
                    RAISE EXCEPTION 'Dados de Cartão Link incompletos';
                END IF;
            END IF;
            IF NEW.dados_categoria->>'link_url' NOT LIKE 'https://%' THEN
                RAISE EXCEPTION 'Link deve começar com https://';
            END IF;
            IF NEW.dados_categoria->>'status_link' = 'pago' AND NOT (NEW.dados_categoria ? 'codigo_autorizacao') THEN
                RAISE EXCEPTION 'Link pago requer codigo_autorizacao';
            END IF;
        WHEN 'obs' THEN
            IF NOT (NEW.dados_categoria ? 'tipo_obs' AND NEW.dados_categoria ? 'descricao') THEN
                IF NEW.estado IN ('completo', 'resolvido') THEN
                    RAISE EXCEPTION 'Dados de Obs incompletos';
                END IF;
            END IF;
            IF length(NEW.dados_categoria->>'descricao') < 20 THEN
                RAISE EXCEPTION 'Descrição de Obs muito curta (mín. 20 chars)';
            END IF;
    END CASE;
    
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_lancamento_validar BEFORE INSERT OR UPDATE ON public.lancamento
    FOR EACH ROW EXECUTE FUNCTION public.fn_validar_dados_categoria();
```

### 5.5. Notificação automática ao criar pendência

```sql
CREATE OR REPLACE FUNCTION public.fn_notificar_pendencia_criada()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.estado = 'pendente' THEN
        INSERT INTO public.notificacao (tipo, severidade, titulo, mensagem, lancamento_id, caixa_id)
        VALUES (
            'pendencia_aberta',
            'info',
            'Nova pendência aberta',
            format('NF %s — cliente %s — valor R$ %s. Investigar e classificar.',
                   NEW.numero_nf, NEW.cliente_nome, NEW.valor_nf::text),
            NEW.id,
            NEW.caixa_id
        );
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_lancamento_notif_pendencia AFTER INSERT ON public.lancamento
    FOR EACH ROW EXECUTE FUNCTION public.fn_notificar_pendencia_criada();
```

### 5.6. Atualizar `cliente_cache` automaticamente

```sql
CREATE OR REPLACE FUNCTION public.fn_atualizar_cliente_cache()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO public.cliente_cache (codigo_pedido, cliente_nome, valor_nf_ultimo, ultima_vez_visto)
    VALUES (NEW.codigo_pedido, NEW.cliente_nome, NEW.valor_nf, now())
    ON CONFLICT (codigo_pedido) DO UPDATE SET
        cliente_nome = EXCLUDED.cliente_nome,
        valor_nf_ultimo = EXCLUDED.valor_nf_ultimo,
        ultima_vez_visto = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_lancamento_cache_cliente AFTER INSERT OR UPDATE ON public.lancamento
    FOR EACH ROW EXECUTE FUNCTION public.fn_atualizar_cliente_cache();
```

---

## 6. ROW-LEVEL SECURITY (RLS)

> Estratégia MVP: **um único usuário** com permissão de escrita. RLS preparado para futura ampliação.

### 6.1. Habilitar RLS

```sql
ALTER TABLE public.caixa             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lancamento        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendedora         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cliente_cache     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feriado           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.config            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificacao       ENABLE ROW LEVEL SECURITY;
```

### 6.2. Tabela auxiliar de papéis

```sql
CREATE TABLE IF NOT EXISTS public.usuario_papel (
    usuario_id  uuid    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    papel       varchar(40) NOT NULL CHECK (papel IN ('operador','supervisor','auditor','admin')),
    concedido_em timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT usuario_papel_pk PRIMARY KEY (usuario_id, papel)
);
```

### 6.3. Função helper

```sql
CREATE OR REPLACE FUNCTION public.fn_tem_papel(p varchar)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT EXISTS (SELECT 1 FROM public.usuario_papel WHERE usuario_id = auth.uid() AND papel = p);
$$;
```

### 6.4. Políticas — `caixa`

```sql
-- SELECT: qualquer usuário autenticado com papel
CREATE POLICY caixa_select ON public.caixa FOR SELECT
    TO authenticated
    USING (auth.uid() IS NOT NULL AND (
        public.fn_tem_papel('operador') OR
        public.fn_tem_papel('supervisor') OR
        public.fn_tem_papel('auditor') OR
        public.fn_tem_papel('admin')
    ));

-- INSERT: somente operador e admin
CREATE POLICY caixa_insert ON public.caixa FOR INSERT
    TO authenticated
    WITH CHECK (public.fn_tem_papel('operador') OR public.fn_tem_papel('admin'));

-- UPDATE: operador, admin
CREATE POLICY caixa_update ON public.caixa FOR UPDATE
    TO authenticated
    USING (public.fn_tem_papel('operador') OR public.fn_tem_papel('admin'));

-- DELETE: ninguém via API; apenas service_role
CREATE POLICY caixa_delete ON public.caixa FOR DELETE
    TO authenticated
    USING (false);
```

### 6.5. Políticas — `lancamento`

(Análogas — SELECT amplo entre papéis, INSERT/UPDATE para operador/admin, DELETE = false.)

```sql
CREATE POLICY lancamento_select ON public.lancamento FOR SELECT
    TO authenticated
    USING (auth.uid() IS NOT NULL AND (
        public.fn_tem_papel('operador') OR
        public.fn_tem_papel('supervisor') OR
        public.fn_tem_papel('auditor') OR
        public.fn_tem_papel('admin')
    ));

CREATE POLICY lancamento_insert ON public.lancamento FOR INSERT
    TO authenticated
    WITH CHECK (
        (public.fn_tem_papel('operador') OR public.fn_tem_papel('admin'))
        AND criado_por = auth.uid()
    );

CREATE POLICY lancamento_update ON public.lancamento FOR UPDATE
    TO authenticated
    USING (public.fn_tem_papel('operador') OR public.fn_tem_papel('admin'))
    WITH CHECK (atualizado_por = auth.uid());

CREATE POLICY lancamento_delete ON public.lancamento FOR DELETE
    TO authenticated
    USING (false);
```

### 6.6. Políticas — `vendedora`, `cliente_cache`, `feriado`, `config`

```sql
-- vendedora: leitura para todos autenticados, escrita admin
CREATE POLICY vendedora_select ON public.vendedora FOR SELECT TO authenticated USING (true);
CREATE POLICY vendedora_modify ON public.vendedora FOR INSERT TO authenticated WITH CHECK (public.fn_tem_papel('admin') OR public.fn_tem_papel('operador'));
CREATE POLICY vendedora_update ON public.vendedora FOR UPDATE TO authenticated USING (public.fn_tem_papel('admin') OR public.fn_tem_papel('operador'));

-- cliente_cache: leitura todos, escrita só via trigger (service_role)
CREATE POLICY cliente_cache_select ON public.cliente_cache FOR SELECT TO authenticated USING (true);

-- feriado: leitura todos, escrita admin
CREATE POLICY feriado_select ON public.feriado FOR SELECT TO authenticated USING (true);
CREATE POLICY feriado_modify ON public.feriado FOR ALL TO authenticated USING (public.fn_tem_papel('admin'));

-- config: leitura todos, escrita admin
CREATE POLICY config_select ON public.config FOR SELECT TO authenticated USING (true);
CREATE POLICY config_modify ON public.config FOR UPDATE TO authenticated USING (public.fn_tem_papel('admin') AND editavel = true);
```

### 6.7. Políticas — `audit_log`

```sql
CREATE POLICY audit_log_select_admin ON public.audit_log FOR SELECT
    TO authenticated
    USING (public.fn_tem_papel('admin') OR public.fn_tem_papel('auditor') OR usuario_id = auth.uid());

-- Não há policies de INSERT/UPDATE/DELETE — apenas via trigger
```

### 6.8. Políticas — `notificacao`

```sql
CREATE POLICY notificacao_select_propria ON public.notificacao FOR SELECT
    TO authenticated
    USING (usuario_destino = auth.uid() OR usuario_destino IS NULL);

CREATE POLICY notificacao_update_propria ON public.notificacao FOR UPDATE
    TO authenticated
    USING (usuario_destino = auth.uid() OR usuario_destino IS NULL);
```

---

## 7. RPCs (FUNÇÕES ACESSADAS PELO CLIENTE)

> RPCs são chamadas tanto pelo Excel (VBA via REST) quanto pela web (supabase-js).

### 7.1. `upsert_lancamento`

Inserção ou atualização idempotente baseada em `caixa_id + numero_nf`. Usada pela sincronização Excel→Supabase.

```sql
CREATE OR REPLACE FUNCTION public.upsert_lancamento(
    p_data_caixa date,
    p_numero_nf varchar,
    p_codigo_pedido varchar,
    p_cliente_nome varchar,
    p_valor_nf numeric,
    p_categoria public.categoria_lancamento,
    p_estado public.estado_lancamento,
    p_dados_categoria jsonb,
    p_fonte_origem varchar DEFAULT 'excel'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    v_caixa_id uuid;
    v_lancamento_id uuid;
BEGIN
    -- Garante caixa
    SELECT id INTO v_caixa_id FROM public.caixa WHERE data = p_data_caixa;
    IF v_caixa_id IS NULL THEN
        INSERT INTO public.caixa (data, criado_por)
        VALUES (p_data_caixa, auth.uid())
        RETURNING id INTO v_caixa_id;
    END IF;
    
    -- Configura fonte
    PERFORM set_config('app.fonte_origem', p_fonte_origem, true);
    
    -- Upsert lançamento
    INSERT INTO public.lancamento (
        caixa_id, numero_nf, codigo_pedido, cliente_nome, valor_nf,
        categoria, estado, dados_categoria, fonte_origem,
        criado_por, atualizado_por
    )
    VALUES (
        v_caixa_id, p_numero_nf, p_codigo_pedido, p_cliente_nome, p_valor_nf,
        p_categoria, p_estado, p_dados_categoria, p_fonte_origem,
        auth.uid(), auth.uid()
    )
    ON CONFLICT (caixa_id, numero_nf, estado) WHERE estado != 'excluido'
    DO UPDATE SET
        codigo_pedido = EXCLUDED.codigo_pedido,
        cliente_nome = EXCLUDED.cliente_nome,
        valor_nf = EXCLUDED.valor_nf,
        categoria = EXCLUDED.categoria,
        estado = EXCLUDED.estado,
        dados_categoria = EXCLUDED.dados_categoria
    RETURNING id INTO v_lancamento_id;
    
    RETURN v_lancamento_id;
END;
$$;
```

### 7.2. `resolver_pendencia`

```sql
CREATE OR REPLACE FUNCTION public.resolver_pendencia(
    p_lancamento_id uuid,
    p_categoria public.categoria_lancamento,
    p_dados_categoria jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER AS $$
BEGIN
    UPDATE public.lancamento
    SET
        categoria = p_categoria,
        estado = 'resolvido',
        dados_categoria = p_dados_categoria,
        resolvido_em = now(),
        resolvido_por = auth.uid()
    WHERE id = p_lancamento_id;
    
    -- Notificação de resolução
    INSERT INTO public.notificacao (tipo, severidade, titulo, mensagem, lancamento_id)
    VALUES ('pendencia_aberta', 'info', 'Pendência resolvida',
            format('Pendência %s classificada como %s', p_lancamento_id, p_categoria),
            p_lancamento_id);
    
    RETURN p_lancamento_id;
END;
$$;
```

### 7.3. `cancelar_lancamento`

```sql
CREATE OR REPLACE FUNCTION public.cancelar_lancamento(
    p_lancamento_id uuid,
    p_motivo text,
    p_cancelado_por varchar,
    p_data_cancelamento date,
    p_numero_estorno varchar DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER AS $$
DECLARE
    v_categoria_anterior public.categoria_lancamento;
    v_dados_anteriores jsonb;
BEGIN
    IF length(p_motivo) < 10 THEN
        RAISE EXCEPTION 'Motivo deve ter ao menos 10 caracteres';
    END IF;
    
    SELECT categoria, dados_categoria INTO v_categoria_anterior, v_dados_anteriores
    FROM public.lancamento WHERE id = p_lancamento_id;
    
    UPDATE public.lancamento
    SET
        categoria = 'cancelado',
        estado = 'cancelado',
        dados_categoria = jsonb_build_object(
            'motivo_cancelamento', p_motivo,
            'cancelado_por', p_cancelado_por,
            'data_cancelamento', p_data_cancelamento,
            'numero_estorno', p_numero_estorno,
            'categoria_anterior', v_categoria_anterior,
            '_archived_dados_categoria_anterior', v_dados_anteriores
        )
    WHERE id = p_lancamento_id;
    
    RETURN p_lancamento_id;
END;
$$;
```

### 7.4. `criar_caixa_se_nao_existe`

```sql
CREATE OR REPLACE FUNCTION public.criar_caixa_se_nao_existe(p_data date)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER AS $$
DECLARE
    v_id uuid;
BEGIN
    SELECT id INTO v_id FROM public.caixa WHERE data = p_data;
    IF v_id IS NULL THEN
        INSERT INTO public.caixa (data, criado_por)
        VALUES (p_data, auth.uid())
        RETURNING id INTO v_id;
    END IF;
    RETURN v_id;
END;
$$;
```

### 7.5. `fechar_caixa`

```sql
CREATE OR REPLACE FUNCTION public.fechar_caixa(
    p_caixa_id uuid,
    p_forcar boolean DEFAULT false,
    p_justificativa text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER AS $$
DECLARE
    v_pendentes int;
BEGIN
    SELECT total_pendentes INTO v_pendentes FROM public.caixa WHERE id = p_caixa_id;
    
    IF v_pendentes > 0 AND p_forcar = false THEN
        RAISE EXCEPTION 'Caixa possui % pendências em aberto. Resolva ou use p_forcar=true.', v_pendentes;
    END IF;
    
    IF v_pendentes > 0 AND (p_justificativa IS NULL OR length(p_justificativa) < 20) THEN
        RAISE EXCEPTION 'Justificativa obrigatória (>=20 chars) ao forçar fechamento com pendências';
    END IF;
    
    UPDATE public.caixa
    SET estado = 'fechado',
        fechado_em = now(),
        fechado_por = auth.uid(),
        observacoes = COALESCE(observacoes,'') || E'\n[fechamento] ' || COALESCE(p_justificativa,'sem pendências')
    WHERE id = p_caixa_id;
    
    RETURN p_caixa_id;
END;
$$;
```

### 7.6. `dashboard_resumo`

```sql
CREATE OR REPLACE FUNCTION public.dashboard_resumo(
    p_data_ini date DEFAULT (current_date - interval '30 days')::date,
    p_data_fim date DEFAULT current_date
)
RETURNS TABLE (
    total_lancamentos bigint,
    total_pendentes bigint,
    total_cancelados bigint,
    valor_liquido numeric,
    por_categoria jsonb,
    por_dia jsonb
)
LANGUAGE sql STABLE SECURITY INVOKER AS $$
    WITH base AS (
        SELECT l.* FROM public.lancamento l
        JOIN public.caixa c ON c.id = l.caixa_id
        WHERE c.data BETWEEN p_data_ini AND p_data_fim
          AND l.estado != 'excluido'
    ),
    cat AS (
        SELECT jsonb_object_agg(categoria::text, cnt) AS por_categoria FROM (
            SELECT categoria, COUNT(*) AS cnt FROM base GROUP BY categoria
        ) c
    ),
    dia AS (
        SELECT jsonb_agg(jsonb_build_object('data', data, 'total', total) ORDER BY data) AS por_dia FROM (
            SELECT c.data, COUNT(*) AS total
            FROM public.lancamento l JOIN public.caixa c ON c.id = l.caixa_id
            WHERE c.data BETWEEN p_data_ini AND p_data_fim
            GROUP BY c.data
        ) d
    )
    SELECT
        (SELECT COUNT(*) FROM base),
        (SELECT COUNT(*) FROM base WHERE estado IN ('pendente','em_preenchimento')),
        (SELECT COUNT(*) FROM base WHERE categoria = 'cancelado'),
        (SELECT COALESCE(SUM(valor_nf), 0) FROM base WHERE categoria != 'cancelado'),
        cat.por_categoria,
        dia.por_dia
    FROM cat, dia;
$$;
```

### 7.7. `revelar_pii`

Audita revelações de campos sensíveis.

```sql
CREATE OR REPLACE FUNCTION public.revelar_pii(
    p_lancamento_id uuid,
    p_campo varchar
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
    v_dados jsonb;
    v_valor jsonb;
BEGIN
    SELECT dados_categoria INTO v_dados FROM public.lancamento WHERE id = p_lancamento_id;
    v_valor := v_dados -> p_campo;
    
    INSERT INTO public.audit_log (tabela, registro_id, acao, dados_antes, dados_depois, usuario_id)
    VALUES ('lancamento', p_lancamento_id, 'REVEAL_PII',
            jsonb_build_object('campo', p_campo),
            NULL,
            auth.uid());
    
    RETURN v_valor;
END;
$$;
```

---

## 8. EDGE FUNCTIONS (DENO)

Cada função fica em `supabase/functions/<nome>/index.ts`.

### 8.1. `cria_caixa_diario`

Trigger: cron diário às 06:00. Garante caixa do dia + caixa de sábado se for segunda.

```typescript
// supabase/functions/cria_caixa_diario/index.ts
import { serve } from "https://deno.land/std@0.220.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

function ehFeriado(data: string): Promise<boolean> {
  return supabase.from("feriado")
    .select("data").eq("data", data).eq("ativo", true)
    .single()
    .then(({ data }) => !!data);
}

function diaSemana(d: Date) { return d.getDay(); }
function isoDate(d: Date) { return d.toISOString().slice(0, 10); }

serve(async (_req) => {
  const tz = "America/Sao_Paulo";
  const agora = new Date(new Date().toLocaleString("en-US", { timeZone: tz }));
  const datas: string[] = [];

  // Hoje
  if (diaSemana(agora) !== 0) datas.push(isoDate(agora));

  // Se é segunda, garantir sábado anterior
  if (diaSemana(agora) === 1) {
    const sabado = new Date(agora);
    sabado.setDate(agora.getDate() - 2);
    datas.push(isoDate(sabado));
  }

  const resultados = [];
  for (const dt of datas) {
    if (await ehFeriado(dt)) {
      resultados.push({ data: dt, status: "skipped_holiday" });
      continue;
    }
    const { data, error } = await supabase.rpc("criar_caixa_se_nao_existe", { p_data: dt });
    resultados.push({ data: dt, id: data, error: error?.message });
  }

  return new Response(JSON.stringify({ resultados }), {
    headers: { "Content-Type": "application/json" }
  });
});
```

### 8.2. `disparar_notificacoes`

Trigger: cron a cada 4h em horário comercial. Gera notificações pendentes.

```typescript
// supabase/functions/disparar_notificacoes/index.ts
import { serve } from "https://deno.land/std@0.220.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

serve(async (_req) => {
  const tz = "America/Sao_Paulo";
  const agora = new Date(new Date().toLocaleString("en-US", { timeZone: tz }));
  const dow = agora.getDay();
  const hora = agora.getHours();

  if (dow === 0 || hora < 8 || hora >= 18) {
    return new Response(JSON.stringify({ skipped: true, reason: "fora_janela" }));
  }

  // 1. Pendências atrasadas
  const { data: atrasadas } = await supabase
    .from("pendencia")
    .select("*")
    .eq("severidade", "urgente");

  for (const p of atrasadas ?? []) {
    await supabase.from("notificacao").insert({
      tipo: "pendencia_atrasada",
      severidade: "urgente",
      titulo: "Pendência atrasada",
      mensagem: `NF ${p.numero_nf} aberta há ${p.idade_dias_uteis} dias úteis (cliente ${p.cliente_nome}).`,
      lancamento_id: p.id,
      caixa_id: p.caixa_id
    });
  }

  // 2. Caixa do dia anterior não fechado
  const ontem = new Date(agora);
  ontem.setDate(ontem.getDate() - 1);
  const ontemISO = ontem.toISOString().slice(0, 10);
  
  const { data: caixaOntem } = await supabase
    .from("caixa")
    .select("*")
    .eq("data", ontemISO)
    .single();
  
  if (caixaOntem && caixaOntem.estado !== "fechado" && hora >= 9) {
    await supabase.from("notificacao").insert({
      tipo: "caixa_nao_fechado",
      severidade: "aviso",
      titulo: "Caixa de ontem não fechado",
      mensagem: `Caixa de ${caixaOntem.data} ainda está em estado ${caixaOntem.estado}.`,
      caixa_id: caixaOntem.id
    });
  }

  // 3. Bom dia (apenas primeira execução do dia)
  if (hora === 8) {
    const { data: pend } = await supabase.rpc("contar_pendencias_abertas");
    await supabase.from("notificacao").insert({
      tipo: "bom_dia_resumo",
      severidade: "info",
      titulo: "Bom dia!",
      mensagem: `Você tem ${pend ?? 0} pendência(s) em aberto. Bom trabalho!`
    });
  }

  return new Response(JSON.stringify({ ok: true, atrasadas: atrasadas?.length ?? 0 }));
});
```

### 8.3. `enviar_email_notificacao`

```typescript
// supabase/functions/enviar_email_notificacao/index.ts
import { serve } from "https://deno.land/std@0.220.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

serve(async (req) => {
  const { to, subject, html } = await req.json();

  const client = new SMTPClient({
    connection: {
      hostname: Deno.env.get("SMTP_HOST")!,
      port: 587,
      tls: true,
      auth: {
        username: Deno.env.get("SMTP_USER")!,
        password: Deno.env.get("SMTP_PASSWORD")!
      }
    }
  });

  await client.send({ from: "noreply@empresa.com", to, subject, html });
  await client.close();

  return new Response(JSON.stringify({ ok: true }));
});
```

### 8.4. `arquivar_ano`

Trigger: 1 de janeiro 00:30. Move dados do ano anterior para schema `arquivo_<ano>`.

```typescript
// supabase/functions/arquivar_ano/index.ts
import { serve } from "https://deno.land/std@0.220.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

serve(async (_req) => {
  const anoAnterior = new Date().getFullYear() - 1;
  const sql = `
    CREATE SCHEMA IF NOT EXISTS arquivo_${anoAnterior};
    CREATE TABLE arquivo_${anoAnterior}.caixa AS
      SELECT * FROM public.caixa WHERE EXTRACT(YEAR FROM data) = ${anoAnterior};
    CREATE TABLE arquivo_${anoAnterior}.lancamento AS
      SELECT l.* FROM public.lancamento l
      JOIN public.caixa c ON c.id = l.caixa_id
      WHERE EXTRACT(YEAR FROM c.data) = ${anoAnterior};
    UPDATE public.caixa SET estado = 'arquivado'
      WHERE EXTRACT(YEAR FROM data) = ${anoAnterior};
  `;
  const { error } = await supabase.rpc("exec_sql", { sql });
  return new Response(JSON.stringify({ ok: !error, error }));
});
```

---

## 9. STORAGE — BUCKETS E POLÍTICAS

### 9.1. Bucket `comprovantes`

```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'comprovantes',
    'comprovantes',
    false,
    5242880, -- 5 MB
    ARRAY['application/pdf','image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO NOTHING;
```

### 9.2. Políticas

```sql
-- Operador pode fazer upload no caminho {caixa_id}/{lancamento_id}/...
CREATE POLICY "comprovantes_upload"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'comprovantes'
    AND (public.fn_tem_papel('operador') OR public.fn_tem_papel('admin'))
);

-- Leitura: qualquer autenticado com papel
CREATE POLICY "comprovantes_select"
ON storage.objects FOR SELECT TO authenticated
USING (
    bucket_id = 'comprovantes'
    AND (
        public.fn_tem_papel('operador')
        OR public.fn_tem_papel('supervisor')
        OR public.fn_tem_papel('auditor')
        OR public.fn_tem_papel('admin')
    )
);

-- DELETE proibido
CREATE POLICY "comprovantes_no_delete"
ON storage.objects FOR DELETE TO authenticated USING (false);
```

### 9.3. Convenção de nome

`comprovantes/{caixa_id_uuid}/{lancamento_id_uuid}/{timestamp}-{nome_original_sanitizado}`

Sanitização: remover acentos, espaços → `_`, somente `[a-zA-Z0-9._-]`.

### 9.4. URLs assinadas

Frontend gera URL com expiração curta (5 min) usando `supabase.storage.from('comprovantes').createSignedUrl(path, 300)`.

---

## 10. REALTIME — CHANNELS

Habilitar replicação para as tabelas:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.lancamento;
ALTER PUBLICATION supabase_realtime ADD TABLE public.caixa;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notificacao;
```

Cliente subscreve:

```javascript
supabase
  .channel('lancamentos')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'lancamento' }, payload => {
    // Atualiza UI em tempo real
  })
  .subscribe();
```

---

## 11. AUTENTICAÇÃO — Email + senha + OTP via Resend SMTP

> **Decisão revisada (2026-04-29 fim do dia):** abandonado Google OAuth/SSO. Auth passa a ser **email + senha gerenciado pelo Supabase Auth nativo**, com **confirmação obrigatória via OTP de 6 dígitos** enviado por **Resend SMTP**. Cadastro aberto a qualquer email — defesa de acesso vem da confirmação obrigatória + RLS por papel.
>
> Migrations relacionadas: `190` (drop trigger de domínio), `191` (papel inicial sem domínio), `192` (`app.invocar_edge` robusta com validação JWT).

### 11.1. Resend SMTP — configurado pelo admin no Dashboard

O MCP do Supabase **não cobre** Auth/SMTP/Templates. Configuração é manual via Dashboard, **uma vez**, seguindo o roteiro em `docs/SETUP_RESEND_SMTP.md`. Resumo:

| Campo (Auth → Providers → SMTP Settings) | Valor |
|---|---|
| Sender email | `noreply@plexalabs.com` |
| Sender name | `Caixa Boti` |
| Host | `smtp.resend.com` |
| Port | `465` (SSL implícito) |
| Username | `resend` |
| Password | `RESEND_API_KEY` do vault corporativo (formato `re_...`) |
| Minimum interval between emails | `60` |

Pré-requisitos no Resend:
- Conta criada.
- Domínio `plexalabs.com` verificado (DKIM + SPF).
- API key gerada com escopo "Sending access" apenas.

### 11.2. Confirm Email + OTP

Em **Auth → Providers → Email**:

| Toggle | Valor |
|---|---|
| Enabled | ON (padrão) |
| Confirm email | **ON** (obrigatório — sem isso, signup não dispara email) |
| Secure email change | ON |
| Secure password change | ON |
| Allow signups | ON (cadastro aberto) |
| Email OTP Length | 6 |
| Email OTP Expiration | 3600 (1h, mínimo configurável via Dashboard) |

### 11.3. Templates de email em pt-BR

Em **Auth → Email Templates**, reescrever o "Confirm signup" com `{{ .Token }}` (variável validada na [doc oficial](https://supabase.com/docs/guides/auth/auth-email-passwordless#with-otp)). A presença dessa variável no template muda o comportamento do Supabase: em vez de enviar magic link (`{{ .ConfirmationURL }}`), envia o OTP de 6 dígitos.

```html
<!-- Template "Confirm signup" -->
<h2>Bem-vindo ao Caixa Boti</h2>
<p>Seu código de verificação é:</p>
<h1 style="font-size:32px;letter-spacing:8px;font-family:monospace">{{ .Token }}</h1>
<p>Esse código expira em 1 hora.</p>
<p>Se você não solicitou esse código, ignore este email.</p>
```

Templates equivalentes em pt-BR para "Reset Password", "Magic Link" e "Change Email" estão em `docs/SETUP_RESEND_SMTP.md` Passo 4.

### 11.4. Trigger de papel automático (sem dependência de domínio)

Migration 191 reescreveu `fn_auto_papel_inicial`:

```sql
CREATE OR REPLACE FUNCTION public.fn_auto_papel_inicial()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.usuario_papel) THEN
        -- Primeiro usuário do sistema: anchor admin (admin + operador).
        INSERT INTO public.usuario_papel (usuario_id, papel, concedido_por)
        VALUES (NEW.id, 'operador', NEW.id),
               (NEW.id, 'admin',    NEW.id)
        ON CONFLICT DO NOTHING;
    ELSE
        -- Demais: apenas operador. Admin promove via SQL.
        INSERT INTO public.usuario_papel (usuario_id, papel)
        VALUES (NEW.id, 'operador') ON CONFLICT DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auth_users_papel_inicial
AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.fn_auto_papel_inicial();
```

Promoção manual de operador a admin (pelo admin existente):

```sql
INSERT INTO public.usuario_papel (usuario_id, papel, concedido_por)
VALUES ('<uid_a_promover>', 'admin', auth.uid())
ON CONFLICT DO NOTHING;
```

### 11.5. Fluxo no cliente (supabase-js)

```js
// Signup
const { data, error } = await supabase.auth.signUp({
  email: 'usuario@exemplo.com',
  password: 'senha-forte-com-numero-1'
});
// data.user.email_confirmed_at === null → email enviado com OTP

// Verify OTP (após usuário inserir código de 6 dígitos)
const { data, error } = await supabase.auth.verifyOtp({
  email: 'usuario@exemplo.com',
  token: '123456',
  type: 'signup'  // 'signup' para confirmar conta nova
});
// data.session !== null → confirmado e logado

// Login subsequente
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'usuario@exemplo.com',
  password: 'senha-forte-com-numero-1'
});
// Se email_confirmed_at NULL → erro 'email_not_confirmed'

// Reset de senha
await supabase.auth.resetPasswordForEmail('usuario@exemplo.com');
// Email com OTP chega; usuário entra OTP + nova senha
await supabase.auth.verifyOtp({ email, token, type: 'recovery' });
await supabase.auth.updateUser({ password: 'nova-senha-123' });
```

### 11.6. URL Configuration (Auth → URL Configuration)

- **Site URL** (dev): `https://controle-caixa.pages.dev`
- **Site URL** (prod, após UAT): `https://caixa-boti.plexalabs.com`
- **Redirect URLs (Additional)**: incluir ambos com sufixo `/**`, mais `http://localhost:5173/**` para dev local (porta padrão do Vite).

---

## 12. PG_CRON — AGENDAMENTOS

> **Importante (cloud-compatible):** o método `current_setting('app.service_key')` proposto em versões anteriores deste documento **não funciona em Supabase Cloud** porque depende de `ALTER DATABASE postgres SET ...`, que exige privilégio `superuser` indisponível em managed Postgres.
>
> A solução adotada é usar a extensão **`supabase_vault`** (já habilitada por padrão) para armazenar a `service_role_key` cifrada, e ler em runtime via `vault.decrypted_secrets` dentro de uma função wrapper `app.invocar_edge`. Os jobs de `pg_cron` chamam essa função em vez de embutir a chave inline.

### 12.1. Função wrapper que lê o Vault

```sql
-- Aplicado pela migration 187 (refatorar_invocar_edge).
CREATE OR REPLACE FUNCTION app.invocar_edge(p_nome text, p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
    v_url   constant text := 'https://<project-ref>.supabase.co'; -- hardcoded, não é segredo
    v_token text;
    v_request_id bigint;
BEGIN
    SELECT secret INTO v_token
    FROM vault.decrypted_secrets
    WHERE name = 'service_role_key'
    LIMIT 1;

    IF v_token IS NULL THEN
        RAISE WARNING 'service_role_key não cadastrada no Vault';
        RETURN NULL;
    END IF;

    SELECT net.http_post(
        url     := v_url || '/functions/v1/' || p_nome,
        body    := p_payload,
        headers := jsonb_build_object(
            'Authorization', 'Bearer ' || v_token,
            'Content-Type',  'application/json'
        )
    ) INTO v_request_id;

    RETURN v_request_id;
END;
$$;
```

### 12.2. Cadastro do segredo (executado UMA VEZ pelo admin no SQL Editor)

```sql
SELECT vault.create_secret(
    '<COLE_SERVICE_ROLE_DO_VAULT_CORPORATIVO>',
    'service_role_key',
    'Chave service_role para invocação de edge functions via pg_cron'
);
```

> **Nunca** comitar a chave em arquivo. Pegar do vault corporativo, colar diretamente no SQL Editor do Supabase, executar e fechar a aba. A chave fica cifrada na tabela `vault.secrets` (acesso restrito) e é descifrada apenas pela view `vault.decrypted_secrets` quando consultada por roles autorizados.

Para **rotação** (substituir a chave existente):

```sql
SELECT vault.update_secret(
    (SELECT id FROM vault.secrets WHERE name = 'service_role_key'),
    '<NOVA_SERVICE_ROLE>'
);
```

### 12.3. Jobs do pg_cron

```sql
-- Habilitar pg_cron e pg_net (idempotente).
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Cria caixa diariamente às 06:00 BRT (09:00 UTC).
SELECT cron.schedule(
    'cria_caixa_diario',
    '0 9 * * *',
    $$ SELECT app.invocar_edge('cria_caixa_diario'); $$
);

-- Notificações a cada 4h em horário comercial seg-sáb.
SELECT cron.schedule(
    'disparar_notificacoes_4h',
    '0 11,15,19 * * 1-6',
    $$ SELECT app.invocar_edge('disparar_notificacoes'); $$
);

-- Arquivar ano: 01/01 00:30 BRT (03:30 UTC).
SELECT cron.schedule(
    'arquivar_ano',
    '30 3 1 1 *',
    $$ SELECT app.invocar_edge('arquivar_ano'); $$
);

-- Backup semanal: domingo 04:00 BRT (07:00 UTC).
SELECT cron.schedule(
    'backup_semanal',
    '0 7 * * 0',
    $$ SELECT app.invocar_edge('backup_semanal'); $$
);
```

Notificações simples (atrasada, caixa não fechado) e limpeza de logs são SQL puro em funções `app.gerar_notificacoes_*` e `app.limpar_logs_antigos` — não precisam de edge function nem de service_role.

### 12.4. Validação pós-cadastro

```sql
SELECT app.invocar_edge('cria_caixa_diario', '{}'::jsonb);
```

Resultado esperado: um `bigint` (request id do `net.http_post`). Qualquer status HTTP retornado pela edge (200, 401, 500) prova que o circuito **banco → vault → HTTP → edge** está vivo. Retorno `NULL` + `WARNING` significa que a secret ainda não foi cadastrada.

> Para a função `net.http_post` funcionar, habilitar a extensão `pg_net` no painel.

---

## 13. BACKUP E DISASTER RECOVERY

### 13.1. Backup nativo Supabase

- **Diário automático** (incluído no plano Pro): 7 dias de retenção.
- **Point-in-time recovery (PITR):** habilitar em Settings → Database (custo adicional, opcional).

### 13.2. Backup adicional manual

Edge Function semanal exporta tudo para Storage e envia link por e-mail:

```typescript
// supabase/functions/backup_semanal/index.ts
serve(async () => {
  const ano = new Date().getFullYear();
  const semana = Math.ceil((new Date().getDate()) / 7);
  
  const { data: caixas } = await supabase.from("caixa").select("*");
  const { data: lancamentos } = await supabase.from("lancamento").select("*");
  
  const dump = JSON.stringify({ caixas, lancamentos });
  const path = `backups/${ano}-S${semana}.json`;
  
  await supabase.storage.from("backups").upload(path, dump, {
    contentType: "application/json"
  });
  
  return new Response("ok");
});
```

### 13.3. Roteiro de restore

1. Criar novo projeto Supabase.
2. Aplicar migrations (DDL).
3. `pg_restore` do dump diário Supabase.
4. Validar contagens (`SELECT count(*) FROM lancamento`).
5. Reapontar cliente Web/Excel para nova URL.

### 13.4. Drill semestral

Documentar e executar restore para projeto staging duas vezes ao ano.

---

## 14. MIGRATIONS

### 14.1. Estrutura

```
supabase/
├── migrations/
│   ├── 20260101000000_initial_schema.sql
│   ├── 20260101000100_rls.sql
│   ├── 20260101000200_rpcs.sql
│   ├── 20260101000300_triggers.sql
│   ├── 20260101000400_seed_config.sql
│   └── 20260201120000_add_tags_index.sql  -- futuro
└── seed.sql
```

### 14.2. Convenção de nomes

`YYYYMMDDHHMMSS_descricao_curta.sql`. Cada migration **idempotente** (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`).

### 14.3. CLI

```bash
supabase db push
supabase db reset  # local apenas
supabase migration new <nome>
```

---

## 15. OBSERVABILIDADE

### 15.1. Logs Postgres

Habilitar `log_min_duration_statement = 1000` (logar queries > 1s).

### 15.2. Logs Edge Functions

Acessíveis em Dashboard → Functions → Logs. Estruturados em JSON via `console.log(JSON.stringify({...}))`.

### 15.3. Métricas chave

| Métrica | Threshold de alerta |
|---------|---------------------|
| Latência p95 de RPC | > 500ms |
| Erros HTTP 5xx | > 1% em 5 min |
| Falhas de sync (Excel→Supabase) | > 3 consecutivas |
| Backup diário | falha = alerta imediato |
| Uso de DB | > 80% do plano |

### 15.4. Alertas via e-mail

Configurar em Project Settings → Notifications.

---

## 16. TESTES

### 16.1. Unitários — pgTAP

```sql
BEGIN;
SELECT plan(5);
SELECT has_table('public', 'lancamento', 'tabela lancamento existe');
SELECT has_column('public', 'lancamento', 'numero_nf', 'campo numero_nf existe');
SELECT col_not_null('public', 'lancamento', 'numero_nf', 'numero_nf é obrigatório');

-- Trigger de validação
SELECT throws_ok(
    $$ INSERT INTO public.lancamento (caixa_id, numero_nf, codigo_pedido, cliente_nome, valor_nf, categoria, estado, criado_por, atualizado_por)
       VALUES (gen_random_uuid(), 'X', 'Y', 'Z', 100, 'cancelado', 'cancelado', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001') $$,
    'Dados de Cancelamento incompletos'
);

SELECT * FROM finish();
ROLLBACK;
```

### 16.2. Integração — Edge Functions

Testar cada endpoint com `curl`:

```bash
curl -X POST https://<projeto>.supabase.co/functions/v1/cria_caixa_diario \
  -H "Authorization: Bearer $SERVICE_KEY"
```

### 16.3. Carga

`pgbench` ou `k6` simulando 100 inserts/min durante 1h.

---

## 17. APÊNDICE H — DDL COMPLETO CONCATENADO

> Consolidação de tudo acima em ordem correta de execução. Salvar como `supabase/migrations/20260101000000_initial_schema.sql`.

(Conteúdo: junção das seções 4, 5, 6, 7 — cada `CREATE` em ordem topológica, sem repetição.)

---

## 18. APÊNDICE I — ROTEIRO DE DEPLOY PASSO A PASSO

### Pré-requisitos
- Acesso ao Supabase com conta da empresa, plano Pro ativo.
- Acesso ao Google Cloud Console com conta admin do Workspace `vdboti.com.br` (para criar OAuth Client).
- `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` gerados.
- Senhas geradas: DB password, master encryption key.
- MCPs autorizados: Supabase MCP (criação de projeto, migrations, edge functions, secrets) e Cloudflare MCP (Pages, DNS).

### Passo 1 — Criar projeto
- Region `sa-east-1`, plano Pro.

### Passo 2 — Configurar variáveis
- Em **Project Settings → Edge Functions → Secrets**: cadastrar todas as variáveis de ambiente.
- Em **Database → Settings**: confirmar timezone `America/Sao_Paulo`.

### Passo 3 — Aplicar migrations
```bash
supabase link --project-ref <ref>
supabase db push
```

### Passo 4 — Configurar Google OAuth
- Authentication → Providers → Google → habilitar.
- Cadastrar `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`.
- Authentication → URL Configuration → Site URL e Redirect URLs (dev e produção).
- Aplicar trigger de validação de domínio (§11.4) — sem ele a restrição não é real.
- Testar login com conta `@vdboti.com.br` (deve passar) e com conta de outro domínio (deve falhar com `Acesso restrito ao domínio vdboti.com.br`).

### Passo 5 — Deploy Edge Functions
```bash
supabase functions deploy cria_caixa_diario
supabase functions deploy disparar_notificacoes
supabase functions deploy enviar_email_notificacao
supabase functions deploy arquivar_ano
supabase functions deploy backup_semanal
```

### Passo 6 — Habilitar pg_cron
- SQL Editor → executar comandos da seção 12.

### Passo 7 — Criar bucket Storage
- SQL Editor → executar seção 9.

### Passo 8 — Smoke test
- Login via Google OAuth com conta `@vdboti.com.br` → confirmar criação do usuário em `auth.users`.
- Tentar login com conta de outro domínio → confirmar bloqueio com mensagem clara.
- Verificar atribuição automática de papel em `usuario_papel`.
- Inserir lançamento via RPC `upsert_lancamento`.
- Inserir 50 lançamentos em batch via RPC `upsert_lancamento_lote`.
- Confirmar trigger de auditoria gerou linhas em `audit_log` (com `dados_antes`/`dados_depois`).
- Confirmar `hash_conteudo` preenchido.
- Confirmar `audit_log` rejeita UPDATE/DELETE mesmo com `service_role`.

### Passo 9 — Configurar clientes
- Excel: preencher `_CONFIG` com URL e anon key.
- Web: configurar `.env`.

### Passo 10 — Documentação interna
- Anotar URL, anon key, project ref em vault da empresa.
- Salvar dump inicial em backup separado.

---

## FIM DO DOCUMENTO 03

> Próxima leitura: `04_FRONTEND_WEB_MICROSITE.md`.

