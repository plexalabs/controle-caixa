-- Migration 061: audit_log.usuario_id ON DELETE SET NULL.
-- Permite remover user de auth.users sem perder auditoria. usuario_email
-- (varchar) e cacheado no momento do evento, entao nao se perde a referencia.

ALTER TABLE public.audit_log
    DROP CONSTRAINT audit_log_usuario_id_fkey,
    ADD  CONSTRAINT audit_log_usuario_id_fkey
        FOREIGN KEY (usuario_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.sync_log
    DROP CONSTRAINT sync_log_usuario_id_fkey,
    ADD  CONSTRAINT sync_log_usuario_id_fkey
        FOREIGN KEY (usuario_id) REFERENCES auth.users(id) ON DELETE SET NULL;
