-- ============================================================
-- CP-RBAC Sessao 1 / 1: adiciona papel 'super_admin'
--
-- usuario_papel.papel hoje tem CHECK com 4 valores:
--   ('operador', 'supervisor', 'auditor', 'admin')
-- Acrescenta 'super_admin' (novo topo da hierarquia, com bypass
-- total de checagem de permissao no RBAC).
--
-- Promove o operador real do sistema (joaopedro.botucatu@vdboti.com.br)
-- de papel='admin' para 'super_admin'. Mantem o registro papel='operador'
-- (multi-papel ja eh suportado pela PK composta).
-- ============================================================

ALTER TABLE public.usuario_papel
  DROP CONSTRAINT IF EXISTS usuario_papel_papel_check;

ALTER TABLE public.usuario_papel
  ADD CONSTRAINT usuario_papel_papel_check
  CHECK (papel IN ('super_admin', 'admin', 'supervisor', 'auditor', 'operador'));

-- Promocao do operador real. WHERE inclui o filtro papel='admin' para
-- nao tocar em outros registros (ex.: o registro 'operador' do mesmo user).
UPDATE public.usuario_papel
SET papel = 'super_admin'
WHERE usuario_id = (
        SELECT id FROM auth.users
        WHERE email = 'joaopedro.botucatu@vdboti.com.br'
      )
  AND papel = 'admin';

-- Fallback defensivo: se o email mudar e o UPDATE acima nao casar,
-- promove o primeiro admin existente (qualquer um). Garante que o
-- sistema sempre tenha pelo menos 1 super_admin pos-migration.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.usuario_papel WHERE papel = 'super_admin') THEN
    UPDATE public.usuario_papel
    SET papel = 'super_admin'
    WHERE (usuario_id, papel) = (
      SELECT usuario_id, papel FROM public.usuario_papel
      WHERE papel = 'admin' AND ativo = true
      ORDER BY concedido_em
      LIMIT 1
    );
    RAISE NOTICE '[fallback] Email do operador nao casou; promovi o primeiro admin existente.';
  END IF;
END$$;

DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.usuario_papel WHERE papel = 'super_admin';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'Nenhum super_admin foi criado. Reverter a migration.';
  END IF;
  RAISE NOTICE '[OK] super_admin existente: % registro(s).', v_count;
END$$;
