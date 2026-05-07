-- ATL-2: tabela append-only `auditoria`.
--
-- Append-only: nem o dono dos dados pode UPDATE/DELETE nessa tabela
-- (RLS bloqueia). INSERT só via funções SECURITY DEFINER (trigger
-- generico fn_audit_row + RPCs como excluir_lancamento que anotam
-- motivo).
--
-- Particionamento por mês: NÃO neste momento (volume estimado <100k
-- linhas/ano). Quando passar de 1M, criar partições por ts.

CREATE TABLE IF NOT EXISTS public.auditoria (
  id                       bigserial   PRIMARY KEY,
  ts                       timestamptz NOT NULL DEFAULT now(),
  usuario_id               uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  usuario_email_snapshot   text,                                -- denormalizado, resiste a delete de user
  acao                     text        NOT NULL CHECK (acao = ANY (ARRAY[
                                         'INSERT', 'UPDATE', 'DELETE',
                                         'SOFT_DELETE', 'RESTAURACAO',
                                         'LOGIN', 'LOGOUT',
                                         'RPC', 'PUSH_ENVIADO', 'CONFIG_ALTERADA'
                                       ])),
  entidade                 text        NOT NULL,                -- nome da tabela ou nome da RPC
  entidade_id              text,                                -- TEXT (não UUID) — RPCs podem ter id composto/null
  dados_antes              jsonb,
  dados_depois             jsonb,
  motivo                   text,                                -- preenchido quando RPC seta app.motivo
  ip                       inet,
  user_agent               text
);

CREATE INDEX IF NOT EXISTS ix_auditoria_ts          ON public.auditoria (ts DESC);
CREATE INDEX IF NOT EXISTS ix_auditoria_usuario     ON public.auditoria (usuario_id, ts DESC);
CREATE INDEX IF NOT EXISTS ix_auditoria_entidade    ON public.auditoria (entidade, ts DESC);
CREATE INDEX IF NOT EXISTS ix_auditoria_entidade_id ON public.auditoria (entidade, entidade_id);
CREATE INDEX IF NOT EXISTS ix_auditoria_acao        ON public.auditoria (acao, ts DESC);

ALTER TABLE public.auditoria ENABLE ROW LEVEL SECURITY;

-- SELECT: quem tem permissao auditoria.visualizar
DROP POLICY IF EXISTS auditoria_select ON public.auditoria;
CREATE POLICY auditoria_select
  ON public.auditoria FOR SELECT
  USING (public.tem_permissao(auth.uid(), 'auditoria.visualizar'));

-- INSERT/UPDATE/DELETE direto: NEGADO. Inserções vêm via funções
-- SECURITY DEFINER (que bypassam RLS).
DROP POLICY IF EXISTS auditoria_no_insert ON public.auditoria;
CREATE POLICY auditoria_no_insert
  ON public.auditoria FOR INSERT
  WITH CHECK (false);

DROP POLICY IF EXISTS auditoria_no_update ON public.auditoria;
CREATE POLICY auditoria_no_update
  ON public.auditoria FOR UPDATE
  USING (false);

DROP POLICY IF EXISTS auditoria_no_delete ON public.auditoria;
CREATE POLICY auditoria_no_delete
  ON public.auditoria FOR DELETE
  USING (false);

COMMENT ON TABLE public.auditoria IS
  'Trilha append-only de tudo que acontece no sistema. Inserts apenas via SECURITY DEFINER. Sem UPDATE/DELETE — imutável.';
