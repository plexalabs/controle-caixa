-- ============================================================
-- numero_nf + valor_nf viram opcionais no INSERT.
-- Janela de 1h (configuravel via public.config) para edicao desses
-- DOIS campos especificos. Outras edicoes seguem regra existente
-- (caixa em estado 'aberto' ou 'em_conferencia').
--
-- Motivo de negocio: operador lanca um pedido antes da NF ser
-- emitida (nao tem numero) e antes do valor final estar fechado.
-- Tem 1h apos criar pra preencher/corrigir esses dois.
-- ============================================================

-- 1) Permite NULL nas duas colunas
ALTER TABLE public.lancamento ALTER COLUMN numero_nf DROP NOT NULL;
ALTER TABLE public.lancamento ALTER COLUMN valor_nf  DROP NOT NULL;

-- O CHECK valor_nf >= 0 sai porque tem que aceitar NULL agora.
-- Recria como tolerante a NULL.
ALTER TABLE public.lancamento DROP CONSTRAINT IF EXISTS lancamento_valor_nf_check;
ALTER TABLE public.lancamento ADD CONSTRAINT lancamento_valor_nf_check
  CHECK (valor_nf IS NULL OR valor_nf >= 0);

-- 2) Config nova: janela editavel pelo admin
INSERT INTO public.config (chave, valor, tipo, descricao, editavel)
VALUES (
  'lancamento.editar_nf_valor_minutos',
  '60'::jsonb,
  'number',
  'Janela em minutos após a criação do lançamento na qual o operador ainda pode preencher/editar numero_nf e valor_nf. Outros campos seguem a regra de caixa aberto/em_conferencia.',
  true
)
ON CONFLICT (chave) DO NOTHING;

-- 3) upsert_lancamento aceita NULL em numero_nf e valor_nf
CREATE OR REPLACE FUNCTION public.upsert_lancamento(
  p_data_caixa     date,
  p_numero_nf      varchar,
  p_codigo_pedido  varchar,
  p_cliente_nome   varchar,
  p_valor_nf       numeric,
  p_categoria      categoria_lancamento,
  p_estado         estado_lancamento,
  p_dados_categoria jsonb DEFAULT '{}'::jsonb,
  p_fonte_origem   varchar DEFAULT 'web'::varchar
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caixa_id        uuid;
  v_lancamento_id   uuid;
  v_estado_efetivo  estado_lancamento;
  v_existente       public.lancamento;
  v_numero_nf_norm  varchar;
  v_valor_nf_norm   numeric;
BEGIN
  v_numero_nf_norm := nullif(nullif(btrim(p_numero_nf), ''), '—');
  v_valor_nf_norm  := p_valor_nf;

  v_estado_efetivo := COALESCE(
    p_estado,
    CASE WHEN p_categoria IS NULL THEN 'pendente'::estado_lancamento
         ELSE 'completo'::estado_lancamento
    END
  );

  SELECT id INTO v_caixa_id FROM public.caixa WHERE data = p_data_caixa;
  IF v_caixa_id IS NULL THEN
    INSERT INTO public.caixa (data, criado_por)
    VALUES (p_data_caixa, auth.uid())
    RETURNING id INTO v_caixa_id;
  END IF;

  PERFORM set_config('app.fonte_origem', p_fonte_origem, true);

  IF v_numero_nf_norm IS NOT NULL THEN
    SELECT * INTO v_existente
      FROM public.lancamento
     WHERE caixa_id = v_caixa_id
       AND numero_nf = v_numero_nf_norm
       AND estado <> 'excluido';

    IF FOUND AND v_existente.estado IN ('completo','finalizado','cancelado_pos','resolvido','cancelado') THEN
      RAISE EXCEPTION 'NF % já existe neste caixa em estado %. Use a RPC adequada (categorizar_lancamento / marcar_finalizado / marcar_cancelado_pos) em vez de upsert direto.',
        v_numero_nf_norm, v_existente.estado
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF v_numero_nf_norm IS NULL THEN
    INSERT INTO public.lancamento (
        caixa_id, numero_nf, codigo_pedido, cliente_nome, valor_nf,
        categoria, estado, dados_categoria, fonte_origem,
        criado_por, atualizado_por,
        resolvido_em, resolvido_por
    )
    VALUES (
        v_caixa_id, NULL, p_codigo_pedido, p_cliente_nome, v_valor_nf_norm,
        p_categoria, v_estado_efetivo, COALESCE(p_dados_categoria, '{}'::jsonb), p_fonte_origem,
        auth.uid(), auth.uid(),
        CASE WHEN v_estado_efetivo IN ('resolvido','finalizado') THEN now() ELSE NULL END,
        CASE WHEN v_estado_efetivo IN ('resolvido','finalizado') THEN auth.uid() ELSE NULL END
    )
    RETURNING id INTO v_lancamento_id;
  ELSE
    INSERT INTO public.lancamento (
        caixa_id, numero_nf, codigo_pedido, cliente_nome, valor_nf,
        categoria, estado, dados_categoria, fonte_origem,
        criado_por, atualizado_por,
        resolvido_em, resolvido_por
    )
    VALUES (
        v_caixa_id, v_numero_nf_norm, p_codigo_pedido, p_cliente_nome, v_valor_nf_norm,
        p_categoria, v_estado_efetivo, COALESCE(p_dados_categoria, '{}'::jsonb), p_fonte_origem,
        auth.uid(), auth.uid(),
        CASE WHEN v_estado_efetivo IN ('resolvido','finalizado') THEN now() ELSE NULL END,
        CASE WHEN v_estado_efetivo IN ('resolvido','finalizado') THEN auth.uid() ELSE NULL END
    )
    ON CONFLICT (caixa_id, numero_nf)
    WHERE estado <> 'excluido'
    DO UPDATE SET
        codigo_pedido    = EXCLUDED.codigo_pedido,
        cliente_nome     = EXCLUDED.cliente_nome,
        valor_nf         = EXCLUDED.valor_nf,
        categoria        = EXCLUDED.categoria,
        estado           = EXCLUDED.estado,
        dados_categoria  = EXCLUDED.dados_categoria,
        fonte_origem     = EXCLUDED.fonte_origem,
        resolvido_em     = CASE WHEN EXCLUDED.estado IN ('resolvido','finalizado')
                                  AND public.lancamento.resolvido_em IS NULL
                                THEN now() ELSE public.lancamento.resolvido_em END,
        resolvido_por    = CASE WHEN EXCLUDED.estado IN ('resolvido','finalizado')
                                  AND public.lancamento.resolvido_por IS NULL
                                THEN auth.uid() ELSE public.lancamento.resolvido_por END
    RETURNING id INTO v_lancamento_id;
  END IF;

  RETURN v_lancamento_id;
END;
$$;

COMMENT ON FUNCTION public.upsert_lancamento(date, varchar, varchar, varchar, numeric, categoria_lancamento, estado_lancamento, jsonb, varchar) IS
  'Upsert de lancamento. numero_nf e valor_nf agora opcionais — operador tem janela de lancamento.editar_nf_valor_minutos minutos pra preencher.';

-- 4) editar_lancamento impoe janela de 1h em numero_nf/valor_nf
CREATE OR REPLACE FUNCTION public.editar_lancamento(
  p_lancamento_id uuid,
  p_dados         jsonb,
  p_motivo        text
) RETURNS public.lancamento
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_uid            uuid := auth.uid();
  v_lanc           public.lancamento;
  v_caixa_estado   text;
  v_motivo         text := nullif(trim(coalesce(p_motivo, '')), '');
  v_pode_basico    boolean;
  v_pode_categoria boolean;
  v_quer_basico    boolean;
  v_quer_categoria boolean;
  v_quer_nf_valor  boolean;
  v_obs_texto      text := '';
  v_janela_min     integer;
  v_minutos_passados numeric;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessao nao autenticada.' USING ERRCODE = '28000';
  END IF;
  IF v_motivo IS NULL OR length(v_motivo) < 10 THEN
    RAISE EXCEPTION 'Motivo da edicao e obrigatorio (minimo 10 caracteres).' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.motivo', v_motivo, true);

  SELECT * INTO v_lanc FROM public.lancamento WHERE id = p_lancamento_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lancamento % nao encontrado.', p_lancamento_id USING ERRCODE = 'P0002';
  END IF;
  IF v_lanc.estado IN ('finalizado', 'cancelado_pos', 'excluido') THEN
    RAISE EXCEPTION 'Lancamento em estado % nao pode ser editado.', v_lanc.estado USING ERRCODE = 'check_violation';
  END IF;

  v_quer_basico    := (p_dados ? 'numero_nf') OR (p_dados ? 'codigo_pedido')
                   OR (p_dados ? 'cliente_nome') OR (p_dados ? 'valor_nf');
  v_quer_categoria := (p_dados ? 'categoria') OR (p_dados ? 'dados_categoria');
  v_quer_nf_valor  := (p_dados ? 'numero_nf') OR (p_dados ? 'valor_nf');

  IF NOT v_quer_basico AND NOT v_quer_categoria THEN
    RAISE EXCEPTION 'Nada para editar (p_dados vazio).' USING ERRCODE = '22023';
  END IF;

  v_pode_basico    := public.tem_permissao(v_uid, 'lancamento.editar');
  v_pode_categoria := public.tem_permissao(v_uid, 'lancamento.editar_categoria');

  IF v_quer_basico AND NOT v_pode_basico THEN
    RAISE EXCEPTION 'Permissao negada (lancamento.editar).' USING ERRCODE = '42501';
  END IF;
  IF v_quer_categoria AND NOT v_pode_categoria THEN
    RAISE EXCEPTION 'Permissao negada (lancamento.editar_categoria).' USING ERRCODE = '42501';
  END IF;

  -- JANELA 1h para numero_nf e valor_nf especificamente
  IF v_quer_nf_valor THEN
    SELECT (valor #>> '{}')::integer INTO v_janela_min
      FROM public.config WHERE chave = 'lancamento.editar_nf_valor_minutos';
    IF v_janela_min IS NULL THEN v_janela_min := 60; END IF;

    v_minutos_passados := EXTRACT(EPOCH FROM (now() - v_lanc.criado_em)) / 60.0;
    IF v_minutos_passados > v_janela_min THEN
      RAISE EXCEPTION
        'Janela para editar NF/valor expirou. Limite: % minutos apos criacao. Ja se passaram % minutos.',
        v_janela_min, round(v_minutos_passados)::int
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF v_quer_categoria THEN
    SELECT estado INTO v_caixa_estado FROM public.caixa WHERE id = v_lanc.caixa_id;
    IF v_caixa_estado NOT IN ('aberto', 'em_conferencia') THEN
      RAISE EXCEPTION
        'Categoria so pode ser editada enquanto o caixa estiver aberto ou em conferencia. Caixa atual: %.',
        v_caixa_estado USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  SET LOCAL session_replication_role = replica;

  UPDATE public.lancamento
     SET numero_nf       = CASE WHEN p_dados ? 'numero_nf'
                                THEN nullif(btrim(p_dados->>'numero_nf'), '')
                                ELSE numero_nf END,
         codigo_pedido   = COALESCE(nullif(p_dados->>'codigo_pedido', ''), codigo_pedido),
         cliente_nome    = COALESCE(nullif(p_dados->>'cliente_nome', ''), cliente_nome),
         valor_nf        = CASE WHEN p_dados ? 'valor_nf'
                                THEN nullif(p_dados->>'valor_nf', '')::numeric
                                ELSE valor_nf END,
         categoria       = COALESCE((p_dados->>'categoria')::categoria_lancamento, categoria),
         dados_categoria = COALESCE(p_dados->'dados_categoria', dados_categoria),
         atualizado_por  = v_uid
   WHERE id = p_lancamento_id
   RETURNING * INTO v_lanc;

  SET LOCAL session_replication_role = origin;

  v_obs_texto := 'Edicao. Motivo: ' || v_motivo || E'\nCampos: ' || (p_dados::text);
  INSERT INTO public.lancamento_observacao (lancamento_id, texto, autor_id, fonte)
  VALUES (p_lancamento_id, v_obs_texto, v_uid, 'edicao');

  RETURN v_lanc;
END;
$$;

GRANT EXECUTE ON FUNCTION public.editar_lancamento(uuid, jsonb, text) TO authenticated;

COMMENT ON FUNCTION public.editar_lancamento IS
  'Edita campos basicos e/ou categoria de lancamento. numero_nf e valor_nf so podem ser editados dentro da janela de lancamento.editar_nf_valor_minutos (default 60) minutos apos criacao.';
