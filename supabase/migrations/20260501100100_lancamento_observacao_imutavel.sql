-- Migration 202: tabela lancamento_observacao com historico imutavel.
--
-- Cada observacao e uma linha NOVA — nunca atualizada nem deletada.
-- Triggers de imutabilidade rejeitam UPDATE/DELETE inclusive para
-- service_role. autor_email e snapshot do email no momento da escrita
-- (auditoria persistente mesmo se o email do autor mudar depois).
--
-- fonte: indica origem da observacao
--   'manual'        — operador escreveu via drawer
--   'sistema'       — registro automatico do banco/edge function
--   'finalizar'     — observacao auto criada por marcar_finalizado
--   'cancelar_pos'  — observacao auto criada por marcar_cancelado_pos

CREATE TABLE IF NOT EXISTS public.lancamento_observacao (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  lancamento_id uuid        NOT NULL REFERENCES public.lancamento(id) ON DELETE RESTRICT,
  texto         text        NOT NULL CHECK (length(trim(texto)) BETWEEN 1 AND 2000),
  autor_id      uuid        NOT NULL REFERENCES auth.users(id),
  autor_email   text        NOT NULL,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  fonte         text        NOT NULL DEFAULT 'manual' CHECK (fonte IN ('manual','sistema','finalizar','cancelar_pos'))
);

CREATE INDEX IF NOT EXISTS idx_lanc_obs_lancamento_data
  ON public.lancamento_observacao(lancamento_id, criado_em DESC);

ALTER TABLE public.lancamento_observacao ENABLE ROW LEVEL SECURITY;

-- ── RLS: operadores e admins leem/escrevem ────────────────────────────
DROP POLICY IF EXISTS "lanc_obs_select" ON public.lancamento_observacao;
CREATE POLICY "lanc_obs_select"
  ON public.lancamento_observacao FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.usuario_papel
      WHERE usuario_id = auth.uid() AND papel IN ('admin','operador')
    )
  );

DROP POLICY IF EXISTS "lanc_obs_insert" ON public.lancamento_observacao;
CREATE POLICY "lanc_obs_insert"
  ON public.lancamento_observacao FOR INSERT
  WITH CHECK (
    auth.uid() = autor_id
    AND EXISTS (
      SELECT 1 FROM public.usuario_papel
      WHERE usuario_id = auth.uid() AND papel IN ('admin','operador')
    )
  );

-- Sem policy de UPDATE/DELETE — triggers abaixo tambem bloqueiam mesmo
-- para service_role, que ignora RLS.

-- ── Imutabilidade: rejeita UPDATE e DELETE ────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_lanc_obs_imutavel()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Observação de lançamento é imutável (auditoria). Para retificar, adicione uma nova observação.'
    USING ERRCODE = 'check_violation';
END;
$$;

DROP TRIGGER IF EXISTS trg_lanc_obs_no_update ON public.lancamento_observacao;
CREATE TRIGGER trg_lanc_obs_no_update BEFORE UPDATE ON public.lancamento_observacao
  FOR EACH ROW EXECUTE FUNCTION public.fn_lanc_obs_imutavel();

DROP TRIGGER IF EXISTS trg_lanc_obs_no_delete ON public.lancamento_observacao;
CREATE TRIGGER trg_lanc_obs_no_delete BEFORE DELETE ON public.lancamento_observacao
  FOR EACH ROW EXECUTE FUNCTION public.fn_lanc_obs_imutavel();

-- ── Auto-fill autor_email pelo auth.uid() ─────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_lanc_obs_autor_email()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF NEW.autor_email IS NULL OR NEW.autor_email = '' THEN
    SELECT email INTO NEW.autor_email FROM auth.users WHERE id = NEW.autor_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lanc_obs_autor_email ON public.lancamento_observacao;
CREATE TRIGGER trg_lanc_obs_autor_email BEFORE INSERT ON public.lancamento_observacao
  FOR EACH ROW EXECUTE FUNCTION public.fn_lanc_obs_autor_email();

COMMENT ON TABLE public.lancamento_observacao IS
  'Historico cronologico imutavel de observacoes por lancamento. Cada linha e uma nota nova; nunca atualizar nem deletar (auditoria).';
COMMENT ON COLUMN public.lancamento_observacao.fonte IS
  'Origem: manual | sistema | finalizar | cancelar_pos';
COMMENT ON COLUMN public.lancamento_observacao.autor_email IS
  'Snapshot do email no momento da escrita — preserva auditoria mesmo se o email do autor mudar depois.';
