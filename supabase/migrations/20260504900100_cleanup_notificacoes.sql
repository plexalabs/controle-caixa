-- ============================================================
-- CLEANUP PRÉ-PRODUÇÃO (parte 2): notificações
--
-- Limpa também a tabela public.notificacao (faltou no commit
-- anterior). 2 entries de teste removidas.
-- ============================================================

SET LOCAL session_replication_role = 'replica';
DELETE FROM public.notificacao;
