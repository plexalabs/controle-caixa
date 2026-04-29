-- Migration 021: policies de RLS para `caixa` e `lancamento`.

-- =========================================================================
-- caixa
-- =========================================================================

DROP POLICY IF EXISTS caixa_select ON public.caixa;
CREATE POLICY caixa_select ON public.caixa FOR SELECT
    TO authenticated
    USING (
        public.fn_tem_papel('operador')   OR
        public.fn_tem_papel('supervisor') OR
        public.fn_tem_papel('auditor')    OR
        public.fn_tem_papel('admin')
    );

DROP POLICY IF EXISTS caixa_insert ON public.caixa;
CREATE POLICY caixa_insert ON public.caixa FOR INSERT
    TO authenticated
    WITH CHECK (
        (public.fn_tem_papel('operador') OR public.fn_tem_papel('admin'))
        AND criado_por = auth.uid()
    );

DROP POLICY IF EXISTS caixa_update ON public.caixa;
CREATE POLICY caixa_update ON public.caixa FOR UPDATE
    TO authenticated
    USING (public.fn_tem_papel('operador') OR public.fn_tem_papel('admin'));

-- DELETE proibido via API (RN-073). Soft-delete via mudança de estado.
DROP POLICY IF EXISTS caixa_delete ON public.caixa;
CREATE POLICY caixa_delete ON public.caixa FOR DELETE
    TO authenticated
    USING (false);

-- =========================================================================
-- lancamento
-- =========================================================================

DROP POLICY IF EXISTS lancamento_select ON public.lancamento;
CREATE POLICY lancamento_select ON public.lancamento FOR SELECT
    TO authenticated
    USING (
        public.fn_tem_papel('operador')   OR
        public.fn_tem_papel('supervisor') OR
        public.fn_tem_papel('auditor')    OR
        public.fn_tem_papel('admin')
    );

DROP POLICY IF EXISTS lancamento_insert ON public.lancamento;
CREATE POLICY lancamento_insert ON public.lancamento FOR INSERT
    TO authenticated
    WITH CHECK (
        (public.fn_tem_papel('operador') OR public.fn_tem_papel('admin'))
        AND criado_por = auth.uid()
    );

DROP POLICY IF EXISTS lancamento_update ON public.lancamento;
CREATE POLICY lancamento_update ON public.lancamento FOR UPDATE
    TO authenticated
    USING (public.fn_tem_papel('operador') OR public.fn_tem_papel('admin'));

DROP POLICY IF EXISTS lancamento_delete ON public.lancamento;
CREATE POLICY lancamento_delete ON public.lancamento FOR DELETE
    TO authenticated
    USING (false);
