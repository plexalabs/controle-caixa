-- CP7 — Migration de fundação para Admin (CP7.1) e Sistema (CP7.3).
--
-- 1) usuario_papel.ativo: soft-delete de papéis. Sem isso, "remover papel"
--    significaria DELETE da linha — perderíamos histórico de atribuições.
--    Os helpers (papeis.js, RLS) passam a filtrar ativo=true.
--
-- 2) config.tipo: classifica cada chave para validação por tipo
--    (number / text / boolean / date). O valor permanece JSONB nativo,
--    mas a edição passa por uma RPC que confere o tipo antes de gravar.
--
-- Idempotente — pode rodar várias vezes sem efeito colateral.

-- ─── usuario_papel ──────────────────────────────────────────────────────────
ALTER TABLE public.usuario_papel
  ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.usuario_papel.ativo IS
  'Soft-delete de papel. UI/RLS devem filtrar ativo=true. Linhas inativas '
  'preservam histórico de quem teve cada papel.';

CREATE INDEX IF NOT EXISTS idx_usuario_papel_ativo
  ON public.usuario_papel(usuario_id) WHERE ativo = true;

-- ─── config: drop trigger de auditoria pré-quebrado ────────────────────────
-- O trigger trg_config_audit chamava fn_auditar_mutacao(), que assume NEW.id.
-- config usa chave (varchar) como PK — o trigger nunca rodou (ninguém deu
-- UPDATE em config até CP7). Dropamos: config já tem atualizado_em/_por
-- embutidos, suficientes para a auditoria visível na tela /configuracoes/sistema.
DROP TRIGGER IF EXISTS trg_config_audit ON public.config;

-- ─── config.tipo ────────────────────────────────────────────────────────────
ALTER TABLE public.config
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'text'
  CHECK (tipo IN ('text', 'number', 'boolean', 'date', 'time'));

COMMENT ON COLUMN public.config.tipo IS
  'Classificação semântica da chave para validação na edição. valor segue '
  'JSONB; a RPC atualizar_config(chave,valor) faz cast e checagem por tipo.';

-- Inferência de tipos para as 7 chaves existentes (idempotente — só sobrescreve
-- quando ainda está no default 'text', preservando classificações futuras).
UPDATE public.config SET tipo = 'boolean'
 WHERE chave IN ('caixa.gerar_domingo', 'caixa.gerar_sabado')
   AND tipo = 'text';

UPDATE public.config SET tipo = 'time'
 WHERE chave IN ('notificacao.horario_inicio', 'notificacao.horario_fim')
   AND tipo = 'text';

UPDATE public.config SET tipo = 'number'
 WHERE chave IN ('notificacao.intervalo_horas',
                 'pendencia.dias_alerta_atraso',
                 'sync.intervalo_minutos')
   AND tipo = 'text';
