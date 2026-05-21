-- ============================================================
-- FEAT-PERFIL: bucket Storage `avatares` — fotos de perfil.
--
-- Público para leitura (avatar não é dado sensível, e assim aparece
-- direto na sidebar / menu do usuário sem precisar de signed URL).
-- 2 MB, só imagens. Cada usuário escreve APENAS na própria pasta:
-- o caminho é {uid}/avatar — a RLS confere o primeiro segmento.
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'avatares',
    'avatares',
    true,
    2097152,                                  -- 2 MB
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
    public             = EXCLUDED.public,
    file_size_limit    = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Leitura: qualquer autenticado (e via URL pública, qualquer um).
DROP POLICY IF EXISTS avatares_select ON storage.objects;
CREATE POLICY avatares_select
    ON storage.objects FOR SELECT
    TO authenticated
    USING (bucket_id = 'avatares');

-- Upload: só na própria pasta {uid}/.
DROP POLICY IF EXISTS avatares_insert ON storage.objects;
CREATE POLICY avatares_insert
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'avatares'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

-- Substituir a própria foto (upload com upsert).
DROP POLICY IF EXISTS avatares_update ON storage.objects;
CREATE POLICY avatares_update
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (
        bucket_id = 'avatares'
        AND (storage.foldername(name))[1] = auth.uid()::text
    )
    WITH CHECK (
        bucket_id = 'avatares'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

-- Remover a própria foto.
DROP POLICY IF EXISTS avatares_delete ON storage.objects;
CREATE POLICY avatares_delete
    ON storage.objects FOR DELETE
    TO authenticated
    USING (
        bucket_id = 'avatares'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );
