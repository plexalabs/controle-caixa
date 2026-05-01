-- tools/migrar_temporarios.sql — migracao unica dos placeholders CP3 → CP4.
--
-- Como rodar (uma vez, manualmente):
--   psql "postgresql://postgres:<DB_PASSWORD>@db.shjtwrojdgotmxdbpbta.supabase.co:5432/postgres" \
--        -f tools/migrar_temporarios.sql
--
-- Pre-requisitos:
--   - Migrations CP4 ja aplicadas (estados finalizado/cancelado_pos no enum,
--     tabela lancamento_observacao, trigger trg_lancamento_travar_pos_categoria).
--   - Pelo menos 1 usuario com papel='admin' na tabela usuario_papel
--     (sera o autor das observacoes migradas).
--
-- Idempotente: rodar de novo nao duplica observacoes nem regride estados.
--
-- Decisao de design: NAO removemos as chaves placeholder de dados_categoria
-- (observacoes, observacao_adicional, estado_final). A trigger anti-mudanca
-- bloqueia editar dados_categoria em estados travados, e mexer ANTES de
-- transitar requer disable-trigger (privilegio nao disponivel em Supabase
-- Cloud). As chaves viram ruido inerte que o frontend novo ignora — le
-- lancamento_observacao para historico e estado do enum para desfecho.

\set ON_ERROR_STOP on
BEGIN;

-- 1) Determina o autor padrao para as observacoes migradas: primeiro
--    admin ativo (ordenacao por usuario_id desc → fica determinístico).
DO $$
DECLARE
  v_admin uuid;
BEGIN
  SELECT usuario_id INTO v_admin
    FROM public.usuario_papel
   WHERE papel = 'admin'
   ORDER BY usuario_id
   LIMIT 1;

  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'Nenhum usuario com papel admin encontrado. Crie um antes de rodar este script.';
  END IF;

  -- Disponibiliza no escopo da transacao via GUC.
  PERFORM set_config('app.migrar_admin', v_admin::text, true);

  RAISE NOTICE 'Admin escolhido para autoria das observacoes migradas: %', v_admin;
END$$;

-- 2) Migrar observacoes do array dados_categoria.observacoes.
--    Cada item do array vira uma linha em lancamento_observacao.
--    Idempotencia: anti-join por (lancamento_id, texto, criado_em) —
--    se ja foi migrado, nao duplica.
INSERT INTO public.lancamento_observacao (
  lancamento_id, texto, autor_id, autor_email, criado_em, fonte
)
SELECT
  l.id,
  TRIM((obs->>'texto')::text),
  COALESCE((obs->>'autor_id')::uuid, current_setting('app.migrar_admin')::uuid),
  COALESCE(NULLIF(obs->>'autor', ''), 'sistema-migracao'),
  COALESCE((obs->>'criado_em')::timestamptz, l.criado_em),
  'manual'
FROM public.lancamento l,
     jsonb_array_elements(l.dados_categoria->'observacoes') AS obs
WHERE l.dados_categoria ? 'observacoes'
  AND (obs->>'texto') IS NOT NULL
  AND length(trim((obs->>'texto')::text)) > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.lancamento_observacao o
     WHERE o.lancamento_id = l.id
       AND o.texto = TRIM((obs->>'texto')::text)
       AND o.criado_em = COALESCE((obs->>'criado_em')::timestamptz, l.criado_em)
  );

-- 3) Migrar observacoes do array dados_categoria.observacao_adicional
--    (variacao de nome em algumas iteracoes anteriores do CP3).
INSERT INTO public.lancamento_observacao (
  lancamento_id, texto, autor_id, autor_email, criado_em, fonte
)
SELECT
  l.id,
  TRIM((obs->>'texto')::text),
  COALESCE((obs->>'autor_id')::uuid, current_setting('app.migrar_admin')::uuid),
  COALESCE(NULLIF(obs->>'autor', ''), 'sistema-migracao'),
  COALESCE((obs->>'criado_em')::timestamptz, l.criado_em),
  'manual'
FROM public.lancamento l,
     jsonb_array_elements(l.dados_categoria->'observacao_adicional') AS obs
WHERE l.dados_categoria ? 'observacao_adicional'
  AND (obs->>'texto') IS NOT NULL
  AND length(trim((obs->>'texto')::text)) > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.lancamento_observacao o
     WHERE o.lancamento_id = l.id
       AND o.texto = TRIM((obs->>'texto')::text)
       AND o.criado_em = COALESCE((obs->>'criado_em')::timestamptz, l.criado_em)
  );

-- 4) Transitar estado para 'finalizado' onde dados_categoria.estado_final='finalizado'.
--    Importante: NAO mexer em dados_categoria — a trigger anti-mudanca bloqueia.
--    Apenas estado muda. Filtro WHERE estado='completo' garante idempotencia.
WITH alvos AS (
  SELECT id FROM public.lancamento
   WHERE estado = 'completo'
     AND dados_categoria->>'estado_final' = 'finalizado'
), upd AS (
  UPDATE public.lancamento
     SET estado         = 'finalizado',
         resolvido_em   = COALESCE(resolvido_em, now()),
         resolvido_por  = COALESCE(resolvido_por,
                                    current_setting('app.migrar_admin')::uuid),
         atualizado_por = current_setting('app.migrar_admin')::uuid
   WHERE id IN (SELECT id FROM alvos)
  RETURNING id
)
INSERT INTO public.lancamento_observacao (lancamento_id, texto, autor_id, autor_email, fonte)
SELECT
  upd.id,
  'Estado migrado de placeholder JSON (estado_final=finalizado) para enum estado=finalizado.',
  current_setting('app.migrar_admin')::uuid,
  'sistema-migracao',
  'sistema'
FROM upd
WHERE NOT EXISTS (
  SELECT 1 FROM public.lancamento_observacao o
   WHERE o.lancamento_id = upd.id
     AND o.fonte = 'sistema'
     AND o.texto LIKE 'Estado migrado de placeholder JSON%finalizado%'
);

-- 5) Transitar para 'cancelado_pos' onde estado_final='cancelado'.
--    O motivo original (se houver em dados_categoria.estado_final_motivo)
--    entra na observacao para preservar contexto.
WITH alvos AS (
  SELECT
    id,
    COALESCE(NULLIF(dados_categoria->>'estado_final_motivo', ''),
             'Sem motivo registrado (placeholder antigo)') AS motivo
  FROM public.lancamento
   WHERE estado = 'completo'
     AND dados_categoria->>'estado_final' = 'cancelado'
), upd AS (
  UPDATE public.lancamento
     SET estado         = 'cancelado_pos',
         atualizado_por = current_setting('app.migrar_admin')::uuid
   WHERE id IN (SELECT id FROM alvos)
  RETURNING id
)
INSERT INTO public.lancamento_observacao (lancamento_id, texto, autor_id, autor_email, fonte)
SELECT
  upd.id,
  'Estado migrado de placeholder JSON (estado_final=cancelado) para enum estado=cancelado_pos. Motivo original: ' ||
    (SELECT motivo FROM alvos a WHERE a.id = upd.id),
  current_setting('app.migrar_admin')::uuid,
  'sistema-migracao',
  'sistema'
FROM upd
WHERE NOT EXISTS (
  SELECT 1 FROM public.lancamento_observacao o
   WHERE o.lancamento_id = upd.id
     AND o.fonte = 'sistema'
     AND o.texto LIKE 'Estado migrado de placeholder JSON%cancelado%'
);

-- 6) Relatorio final
SELECT
  'observacoes_migradas'  AS metrica,
  COUNT(*) FILTER (WHERE fonte = 'manual'
                   AND autor_email = 'sistema-migracao')  AS valor
FROM public.lancamento_observacao
UNION ALL
SELECT 'lancamentos_migrados_para_finalizado',
       COUNT(*) FROM public.lancamento WHERE estado = 'finalizado'
UNION ALL
SELECT 'lancamentos_migrados_para_cancelado_pos',
       COUNT(*) FROM public.lancamento WHERE estado = 'cancelado_pos'
UNION ALL
SELECT 'lancamentos_com_lixo_estado_final_no_json',
       COUNT(*) FROM public.lancamento WHERE dados_categoria ? 'estado_final';

COMMIT;

-- Sobre o ruido em dados_categoria:
-- Items que foram transicionados ainda tem dados_categoria.estado_final
-- (e talvez .observacoes/.observacao_adicional). Esses sao inertes —
-- frontend CP4 le lancamento_observacao para historico e estado do enum
-- para desfecho. A unica forma de remover o ruido seria desabilitar a
-- trigger anti-mudanca, o que nao e feito por design.
