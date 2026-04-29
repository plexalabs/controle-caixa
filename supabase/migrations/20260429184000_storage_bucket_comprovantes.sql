-- Migration 040: bucket Storage `comprovantes` (privado, 5 MB max, MIME restrito).
-- Recebe anexos de Pix e cancelamentos. Caminho: {caixa_id}/{lancamento_id}/{ts}-{nome}.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'comprovantes',
    'comprovantes',
    false,
    5242880,                                      -- 5 MB
    ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
    public             = EXCLUDED.public,
    file_size_limit    = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Bucket adicional para backups semanais (privado, sem limite de tamanho).
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES (
    'backups',
    'backups',
    false,
    NULL
)
ON CONFLICT (id) DO NOTHING;

-- =========================================================================
-- Policies — bucket comprovantes
-- =========================================================================

DROP POLICY IF EXISTS comprovantes_upload ON storage.objects;
CREATE POLICY comprovantes_upload
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'comprovantes'
        AND (public.fn_tem_papel('operador') OR public.fn_tem_papel('admin'))
    );

DROP POLICY IF EXISTS comprovantes_select ON storage.objects;
CREATE POLICY comprovantes_select
    ON storage.objects FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'comprovantes'
        AND (
            public.fn_tem_papel('operador') OR
            public.fn_tem_papel('supervisor') OR
            public.fn_tem_papel('auditor') OR
            public.fn_tem_papel('admin')
        )
    );

-- DELETE bloqueado em comprovantes (auditoria).
DROP POLICY IF EXISTS comprovantes_no_delete ON storage.objects;
CREATE POLICY comprovantes_no_delete
    ON storage.objects FOR DELETE
    TO authenticated
    USING (false);

-- UPDATE bloqueado (substituicao = upload novo + cancelamento do anterior).
DROP POLICY IF EXISTS comprovantes_no_update ON storage.objects;
CREATE POLICY comprovantes_no_update
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (false);

-- =========================================================================
-- Policies — bucket backups (apenas service_role e admin)
-- =========================================================================

DROP POLICY IF EXISTS backups_admin_only ON storage.objects;
CREATE POLICY backups_admin_only
    ON storage.objects FOR ALL
    TO authenticated
    USING (bucket_id <> 'backups' OR public.fn_tem_papel('admin'))
    WITH CHECK (bucket_id <> 'backups' OR public.fn_tem_papel('admin'));
