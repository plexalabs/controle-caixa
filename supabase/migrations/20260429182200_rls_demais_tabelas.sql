-- Migration 022: policies de RLS para tabelas auxiliares e operacionais.

-- =========================================================================
-- vendedora — leitura todos autenticados, escrita admin/operador.
-- =========================================================================

DROP POLICY IF EXISTS vendedora_select ON public.vendedora;
CREATE POLICY vendedora_select ON public.vendedora FOR SELECT
    TO authenticated USING (true);

DROP POLICY IF EXISTS vendedora_insert ON public.vendedora;
CREATE POLICY vendedora_insert ON public.vendedora FOR INSERT
    TO authenticated
    WITH CHECK (public.fn_tem_papel('admin') OR public.fn_tem_papel('operador'));

DROP POLICY IF EXISTS vendedora_update ON public.vendedora;
CREATE POLICY vendedora_update ON public.vendedora FOR UPDATE
    TO authenticated
    USING (public.fn_tem_papel('admin') OR public.fn_tem_papel('operador'));

-- DELETE bloqueado (soft-delete via ativa=false).
DROP POLICY IF EXISTS vendedora_delete ON public.vendedora;
CREATE POLICY vendedora_delete ON public.vendedora FOR DELETE
    TO authenticated USING (false);

-- =========================================================================
-- cliente_cache — leitura todos. Escrita apenas via trigger SECURITY DEFINER.
-- =========================================================================

DROP POLICY IF EXISTS cliente_cache_select ON public.cliente_cache;
CREATE POLICY cliente_cache_select ON public.cliente_cache FOR SELECT
    TO authenticated USING (true);

-- (sem INSERT/UPDATE/DELETE para clientes — apenas trigger fn_atualizar_cliente_cache).

-- =========================================================================
-- feriado — leitura todos, escrita admin.
-- =========================================================================

DROP POLICY IF EXISTS feriado_select ON public.feriado;
CREATE POLICY feriado_select ON public.feriado FOR SELECT
    TO authenticated USING (true);

DROP POLICY IF EXISTS feriado_modify ON public.feriado;
CREATE POLICY feriado_modify ON public.feriado FOR ALL
    TO authenticated
    USING (public.fn_tem_papel('admin'))
    WITH CHECK (public.fn_tem_papel('admin'));

-- =========================================================================
-- config — leitura todos, UPDATE admin (apenas chaves editavel=true).
-- =========================================================================

DROP POLICY IF EXISTS config_select ON public.config;
CREATE POLICY config_select ON public.config FOR SELECT
    TO authenticated USING (true);

DROP POLICY IF EXISTS config_update ON public.config;
CREATE POLICY config_update ON public.config FOR UPDATE
    TO authenticated
    USING (public.fn_tem_papel('admin') AND editavel = true)
    WITH CHECK (public.fn_tem_papel('admin') AND editavel = true);

-- =========================================================================
-- audit_log — leitura por admin/auditor ou pelo proprio usuario.
-- INSERT/UPDATE/DELETE bloqueados — apenas trigger SECURITY DEFINER.
-- =========================================================================

DROP POLICY IF EXISTS audit_log_select_admin ON public.audit_log;
CREATE POLICY audit_log_select_admin ON public.audit_log FOR SELECT
    TO authenticated
    USING (
        public.fn_tem_papel('admin') OR
        public.fn_tem_papel('auditor') OR
        usuario_id = auth.uid()
    );

-- =========================================================================
-- notificacao — leitura propria (ou broadcast); UPDATE para marcar lida.
-- =========================================================================

DROP POLICY IF EXISTS notificacao_select_propria ON public.notificacao;
CREATE POLICY notificacao_select_propria ON public.notificacao FOR SELECT
    TO authenticated
    USING (usuario_destino = auth.uid() OR usuario_destino IS NULL);

DROP POLICY IF EXISTS notificacao_update_propria ON public.notificacao;
CREATE POLICY notificacao_update_propria ON public.notificacao FOR UPDATE
    TO authenticated
    USING (usuario_destino = auth.uid() OR usuario_destino IS NULL);

-- =========================================================================
-- sync_log — INSERT por authenticated, leitura admin/auditor.
-- =========================================================================

DROP POLICY IF EXISTS sync_log_insert ON public.sync_log;
CREATE POLICY sync_log_insert ON public.sync_log FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS sync_log_select ON public.sync_log;
CREATE POLICY sync_log_select ON public.sync_log FOR SELECT
    TO authenticated
    USING (
        usuario_id = auth.uid() OR
        public.fn_tem_papel('admin') OR
        public.fn_tem_papel('auditor')
    );

-- =========================================================================
-- usuario_papel — leitura propria; INSERT/UPDATE/DELETE apenas admin.
-- =========================================================================

DROP POLICY IF EXISTS usuario_papel_select ON public.usuario_papel;
CREATE POLICY usuario_papel_select ON public.usuario_papel FOR SELECT
    TO authenticated
    USING (usuario_id = auth.uid() OR public.fn_tem_papel('admin'));

DROP POLICY IF EXISTS usuario_papel_admin_modify ON public.usuario_papel;
CREATE POLICY usuario_papel_admin_modify ON public.usuario_papel FOR ALL
    TO authenticated
    USING (public.fn_tem_papel('admin'))
    WITH CHECK (public.fn_tem_papel('admin'));
