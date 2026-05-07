-- ATL-2: RPCs de leitura + restauração.
--
-- 3 funções:
--   listar_auditoria(filtros jsonb, limit, offset) → linha do tempo
--   listar_lixeira(filtros jsonb, limit, offset)   → união soft-deletes
--   restaurar_lancamento(id, motivo)               → desfaz exclusão

-- ============================================================
-- listar_auditoria
-- Filtros suportados (todos opcionais):
--   data_ini  text 'YYYY-MM-DD'
--   data_fim  text 'YYYY-MM-DD' (inclusivo até 23:59:59)
--   usuario_id uuid
--   entidade  text
--   acao      text (uma das do CHECK)
--   busca     text (ilike em motivo / email)
-- ============================================================
CREATE OR REPLACE FUNCTION public.listar_auditoria(
  p_filtros jsonb DEFAULT '{}'::jsonb,
  p_limit   integer DEFAULT 50,
  p_offset  integer DEFAULT 0
)
RETURNS TABLE (
  id          bigint,
  ts          timestamptz,
  usuario_id  uuid,
  usuario_email_snapshot text,
  acao        text,
  entidade    text,
  entidade_id text,
  dados_antes jsonb,
  dados_depois jsonb,
  motivo      text,
  ip          inet,
  user_agent  text,
  total       bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
STABLE
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_data_ini  timestamptz;
  v_data_fim  timestamptz;
  v_user      uuid;
  v_entidade  text;
  v_acao      text;
  v_busca     text;
  v_total     bigint;
BEGIN
  IF NOT public.tem_permissao(v_uid, 'auditoria.visualizar') THEN
    RAISE EXCEPTION 'Permissão negada (auditoria.visualizar).' USING ERRCODE = '42501';
  END IF;

  v_data_ini := nullif(p_filtros->>'data_ini', '')::timestamptz;
  v_data_fim := nullif(p_filtros->>'data_fim', '')::timestamptz;
  IF v_data_fim IS NOT NULL THEN
    v_data_fim := v_data_fim + interval '1 day' - interval '1 second';
  END IF;
  v_user      := nullif(p_filtros->>'usuario_id', '')::uuid;
  v_entidade  := nullif(p_filtros->>'entidade', '');
  v_acao      := nullif(p_filtros->>'acao', '');
  v_busca     := nullif(trim(p_filtros->>'busca'), '');

  -- Total (count) — necessário pra paginação na UI
  SELECT count(*) INTO v_total
    FROM public.auditoria a
   WHERE (v_data_ini IS NULL OR a.ts >= v_data_ini)
     AND (v_data_fim IS NULL OR a.ts <= v_data_fim)
     AND (v_user     IS NULL OR a.usuario_id = v_user)
     AND (v_entidade IS NULL OR a.entidade = v_entidade)
     AND (v_acao     IS NULL OR a.acao = v_acao)
     AND (v_busca    IS NULL OR a.motivo ILIKE '%'||v_busca||'%'
                              OR a.usuario_email_snapshot ILIKE '%'||v_busca||'%');

  RETURN QUERY
    SELECT a.id, a.ts, a.usuario_id, a.usuario_email_snapshot, a.acao,
           a.entidade, a.entidade_id, a.dados_antes, a.dados_depois,
           a.motivo, a.ip, a.user_agent, v_total
      FROM public.auditoria a
     WHERE (v_data_ini IS NULL OR a.ts >= v_data_ini)
       AND (v_data_fim IS NULL OR a.ts <= v_data_fim)
       AND (v_user     IS NULL OR a.usuario_id = v_user)
       AND (v_entidade IS NULL OR a.entidade = v_entidade)
       AND (v_acao     IS NULL OR a.acao = v_acao)
       AND (v_busca    IS NULL OR a.motivo ILIKE '%'||v_busca||'%'
                                OR a.usuario_email_snapshot ILIKE '%'||v_busca||'%')
     ORDER BY a.ts DESC, a.id DESC
     LIMIT p_limit OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.listar_auditoria(jsonb, integer, integer) TO authenticated;

-- ============================================================
-- listar_lixeira
-- União dos soft-deletes:
--   * lancamento (estado='excluido')
--   * notificacao (descartada_em IS NOT NULL)
--   * push_subscription (removida_em IS NOT NULL)
-- Filtros: tipo (lancamento/notificacao/push), data_ini/fim, busca
-- ============================================================
CREATE OR REPLACE FUNCTION public.listar_lixeira(
  p_filtros jsonb DEFAULT '{}'::jsonb,
  p_limit   integer DEFAULT 50,
  p_offset  integer DEFAULT 0
)
RETURNS TABLE (
  tipo        text,
  id          uuid,
  rotulo      text,
  detalhe     text,
  excluido_em timestamptz,
  excluido_por_email text,
  motivo      text,
  restauravel boolean,
  payload     jsonb,
  total       bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
STABLE
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_tipo     text;
  v_data_ini timestamptz;
  v_data_fim timestamptz;
  v_busca    text;
  v_total    bigint;
BEGIN
  IF NOT public.tem_permissao(v_uid, 'lixeira.visualizar') THEN
    RAISE EXCEPTION 'Permissão negada (lixeira.visualizar).' USING ERRCODE = '42501';
  END IF;

  v_tipo     := nullif(p_filtros->>'tipo', '');
  v_data_ini := nullif(p_filtros->>'data_ini', '')::timestamptz;
  v_data_fim := nullif(p_filtros->>'data_fim', '')::timestamptz;
  IF v_data_fim IS NOT NULL THEN
    v_data_fim := v_data_fim + interval '1 day' - interval '1 second';
  END IF;
  v_busca := nullif(trim(p_filtros->>'busca'), '');

  -- CTE com tudo unido + último audit pra cada item (motivo + autor)
  RETURN QUERY
  WITH base AS (
    -- Lancamentos
    SELECT
      'lancamento'::text                                      AS tipo,
      l.id::uuid                                              AS id,
      ('Nota '||COALESCE(l.numero_nf, l.id::text))::text      AS rotulo,
      ('R$ '||to_char(COALESCE(l.valor, 0), 'FM999G990D00')
        ||' • '||COALESCE(l.fornecedor, '—'))::text           AS detalhe,
      l.atualizado_em                                         AS excluido_em,
      to_jsonb(l)                                             AS payload
      FROM public.lancamento l
     WHERE l.estado = 'excluido'
       AND (v_tipo IS NULL OR v_tipo = 'lancamento')

    UNION ALL

    -- Notificacoes descartadas
    SELECT
      'notificacao'::text                                     AS tipo,
      n.id::uuid                                              AS id,
      n.titulo                                                AS rotulo,
      COALESCE(left(n.mensagem, 80), '')                      AS detalhe,
      n.descartada_em                                         AS excluido_em,
      to_jsonb(n)                                             AS payload
      FROM public.notificacao n
     WHERE n.descartada_em IS NOT NULL
       AND (v_tipo IS NULL OR v_tipo = 'notificacao')

    UNION ALL

    -- Push subs removidas
    SELECT
      'push_subscription'::text                               AS tipo,
      ps.id::uuid                                             AS id,
      COALESCE(left(ps.user_agent, 60), 'Device')             AS rotulo,
      ('endpoint: '||left(ps.endpoint, 60)||'…')              AS detalhe,
      ps.removida_em                                          AS excluido_em,
      to_jsonb(ps)                                            AS payload
      FROM public.push_subscription ps
     WHERE ps.removida_em IS NOT NULL
       AND (v_tipo IS NULL OR v_tipo = 'push_subscription')
  ),
  filtrada AS (
    SELECT b.*
      FROM base b
     WHERE (v_data_ini IS NULL OR b.excluido_em >= v_data_ini)
       AND (v_data_fim IS NULL OR b.excluido_em <= v_data_fim)
       AND (v_busca IS NULL OR b.rotulo ILIKE '%'||v_busca||'%' OR b.detalhe ILIKE '%'||v_busca||'%')
  ),
  enriquecida AS (
    SELECT
      f.*,
      -- Pega o último audit row de SOFT_DELETE/UPDATE pra esse registro
      (SELECT a.usuario_email_snapshot
         FROM public.auditoria a
        WHERE a.entidade = f.tipo AND a.entidade_id = f.id::text
          AND a.acao IN ('SOFT_DELETE','UPDATE','DELETE')
        ORDER BY a.ts DESC LIMIT 1)            AS excluido_por_email,
      (SELECT a.motivo
         FROM public.auditoria a
        WHERE a.entidade = f.tipo AND a.entidade_id = f.id::text
          AND a.acao IN ('SOFT_DELETE','UPDATE','DELETE')
        ORDER BY a.ts DESC LIMIT 1)            AS motivo
      FROM filtrada f
  )
  SELECT
    e.tipo, e.id, e.rotulo, e.detalhe, e.excluido_em,
    e.excluido_por_email, e.motivo,
    (e.tipo = 'lancamento')                    AS restauravel,
    e.payload,
    (SELECT count(*) FROM filtrada)            AS total
    FROM enriquecida e
   ORDER BY e.excluido_em DESC NULLS LAST
   LIMIT p_limit OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.listar_lixeira(jsonb, integer, integer) TO authenticated;

-- ============================================================
-- restaurar_lancamento
-- Volta estado pra 'pendente' (decisão consciente: estado anterior
-- pode estar inválido — ex: era 'finalizado' mas o caixa já foi
-- arquivado; 'pendente' permite re-categorização limpa).
-- Trigger trg_audit_lancamento captura como acao='RESTAURACAO'.
-- ============================================================
CREATE OR REPLACE FUNCTION public.restaurar_lancamento(
  p_lancamento_id uuid,
  p_motivo        text
)
RETURNS public.lancamento
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_lanc   public.lancamento;
  v_motivo text := nullif(trim(coalesce(p_motivo, '')), '');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão não autenticada.' USING ERRCODE = '28000';
  END IF;
  IF NOT public.tem_permissao(v_uid, 'lixeira.restaurar') THEN
    RAISE EXCEPTION 'Permissão negada (lixeira.restaurar).' USING ERRCODE = '42501';
  END IF;
  IF v_motivo IS NULL OR length(v_motivo) < 10 THEN
    RAISE EXCEPTION 'Motivo da restauração é obrigatório (mínimo 10 caracteres).' USING ERRCODE = '22023';
  END IF;

  -- Set local pra trigger pegar
  PERFORM set_config('app.motivo', v_motivo, true);

  SELECT * INTO v_lanc FROM public.lancamento WHERE id = p_lancamento_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lançamento % não encontrado.', p_lancamento_id USING ERRCODE = 'P0002';
  END IF;
  IF v_lanc.estado <> 'excluido' THEN
    RAISE EXCEPTION 'Lançamento não está excluído.' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.lancamento_observacao (lancamento_id, texto, autor_id, fonte)
  VALUES (
    p_lancamento_id,
    'Restauração via lixeira. Motivo: ' || v_motivo,
    v_uid,
    'manual'
  );

  -- Bypass trigger fn_lancamento_travar_pos_categoria pra ir de
  -- 'excluido' direto pra 'pendente' (transicao nao prevista no trigger)
  SET LOCAL session_replication_role = replica;

  UPDATE public.lancamento
     SET estado         = 'pendente',
         atualizado_por = v_uid
   WHERE id = p_lancamento_id
   RETURNING * INTO v_lanc;

  SET LOCAL session_replication_role = origin;

  RETURN v_lanc;
END;
$$;

GRANT EXECUTE ON FUNCTION public.restaurar_lancamento(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.restaurar_lancamento(uuid, text) IS
  'Restaura lançamento excluído pra estado=pendente. Exige permissao lixeira.restaurar e motivo >=10 chars. Auditado via trigger.';
