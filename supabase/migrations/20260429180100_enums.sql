-- Migration 002: tipos enum canônicos.
-- Cada enum reflete um vocabulário fechado do dicionário de dados (docs/01).
-- Todos no schema public para que clientes (Excel/Web) possam referenciar.

-- Categoria do lançamento (6 valores canônicos do arquivo 01 §5).
DO $$ BEGIN
    CREATE TYPE public.categoria_lancamento AS ENUM (
        'cartao',
        'pix',
        'dinheiro',
        'cancelado',
        'cartao_link',
        'obs'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Estado do lançamento na máquina de estados (Apêndice B do arquivo 01).
DO $$ BEGIN
    CREATE TYPE public.estado_lancamento AS ENUM (
        'pendente',
        'em_preenchimento',
        'completo',
        'resolvido',
        'cancelado',
        'excluido'  -- soft-delete (RN-073)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Status do caixa (aberto → em_conferencia → fechado → arquivado).
DO $$ BEGIN
    CREATE TYPE public.estado_caixa AS ENUM (
        'aberto',
        'em_conferencia',
        'fechado',
        'arquivado'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Status do link de cartão (categoria 'cartao_link').
DO $$ BEGIN
    CREATE TYPE public.status_link AS ENUM (
        'enviado',
        'pago',
        'expirado',
        'cancelado'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Severidade de notificação (info < aviso < urgente).
DO $$ BEGIN
    CREATE TYPE public.severidade_notificacao AS ENUM (
        'info',
        'aviso',
        'urgente'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Tipos de notificação inteligentes (arquivo 01 §11.2).
DO $$ BEGIN
    CREATE TYPE public.tipo_notificacao AS ENUM (
        'pendencia_aberta',
        'pendencia_atrasada',
        'caixa_nao_fechado',
        'valor_divergente',
        'comprovante_faltando',
        'link_expirando',
        'bom_dia_resumo'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Ação registrada no audit_log.
DO $$ BEGIN
    CREATE TYPE public.acao_audit AS ENUM (
        'INSERT',
        'UPDATE',
        'DELETE',
        'REVEAL_PII'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
