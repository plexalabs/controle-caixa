-- Migration 208: upsert_lancamento aceita criacao minimal e rejeita
-- atualizacao de itens em estado travado.
--
-- Mudancas em relacao a versao anterior:
--
-- 1. Aceita criacao minimal (categoria=null, dados_categoria='{}', estado=null).
--    Se p_estado=null -> default 'pendente'.
-- 2. Antes do INSERT/UPDATE, verifica se ja existe linha em conflito
--    (caixa_id, numero_nf) com estado travado (completo/finalizado/cancelado_pos).
--    Se sim, rejeita com mensagem clara apontando para a RPC adequada.
-- 3. Mantem semantica de 'resolvido' legado para nao quebrar codigo antigo
--    (resolvido_em + resolvido_por) e tambem 'finalizado' (mesma logica).
--
-- O FE ja foi instruido a:
--   - Criar via upsert_lancamento (categoria=null, estado='pendente')
--   - Categorizar via RPC categorizar_lancamento (NAO mais via upsert)
--   - Finalizar via marcar_finalizado
--   - Cancelar pos via marcar_cancelado_pos
--
-- A trigger trg_lancamento_travar_pos_categoria ja garante isso a nivel de
-- DB; aqui apenas damos uma mensagem mais util ANTES da trigger disparar.

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
BEGIN
  -- Default de estado: minimal pendente quando categoria e estado vazios
  v_estado_efetivo := COALESCE(
    p_estado,
    CASE WHEN p_categoria IS NULL THEN 'pendente'::estado_lancamento
         ELSE 'completo'::estado_lancamento
    END
  );

  -- Garante caixa do dia
  SELECT id INTO v_caixa_id FROM public.caixa WHERE data = p_data_caixa;
  IF v_caixa_id IS NULL THEN
    INSERT INTO public.caixa (data, criado_por)
    VALUES (p_data_caixa, auth.uid())
    RETURNING id INTO v_caixa_id;
  END IF;

  PERFORM set_config('app.fonte_origem', p_fonte_origem, true);

  -- Verifica linha pre-existente em estado travado — mensagem util ANTES
  -- da trigger trg_lancamento_travar_pos_categoria disparar.
  SELECT * INTO v_existente
    FROM public.lancamento
   WHERE caixa_id = v_caixa_id
     AND numero_nf = p_numero_nf
     AND estado <> 'excluido';

  IF FOUND AND v_existente.estado IN ('completo','finalizado','cancelado_pos','resolvido','cancelado') THEN
    RAISE EXCEPTION 'NF % já existe neste caixa em estado %. Use a RPC adequada (categorizar_lancamento / marcar_finalizado / marcar_cancelado_pos) em vez de upsert direto.',
      p_numero_nf, v_existente.estado
      USING ERRCODE = 'check_violation';
  END IF;

  -- Upsert: ON CONFLICT contra unique partial (caixa_id, numero_nf) WHERE estado <> 'excluido'.
  -- Em UPDATE so cai aqui se OLD.estado in (pendente, em_preenchimento) — caso contrario ja
  -- tinha levantado excecao acima.
  INSERT INTO public.lancamento (
      caixa_id, numero_nf, codigo_pedido, cliente_nome, valor_nf,
      categoria, estado, dados_categoria, fonte_origem,
      criado_por, atualizado_por,
      resolvido_em, resolvido_por
  )
  VALUES (
      v_caixa_id, p_numero_nf, p_codigo_pedido, p_cliente_nome, p_valor_nf,
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

  RETURN v_lancamento_id;
END;
$$;

COMMENT ON FUNCTION public.upsert_lancamento(date, varchar, varchar, varchar, numeric, categoria_lancamento, estado_lancamento, jsonb, varchar) IS
  'Upsert de lancamento. Aceita criacao minimal (categoria=null -> estado pendente). Rejeita atualizacao de NF existente em estado travado com mensagem apontando para a RPC adequada.';
