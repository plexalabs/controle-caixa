-- Migration 205: RPC adicionar_observacao(lancamento_id, texto)
--
-- Append-only de observacao. Valida sessao + existencia + texto nao-vazio.
-- SECURITY DEFINER para bypassar RLS (a regra equivalente esta dentro:
-- usuario tem que estar autenticado + lancamento precisa existir + texto
-- valido). Autor sempre = auth.uid() do chamador.

CREATE OR REPLACE FUNCTION public.adicionar_observacao(
  p_lancamento_id uuid,
  p_texto         text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_obs_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão não autenticada.' USING ERRCODE = '28000';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.lancamento WHERE id = p_lancamento_id) THEN
    RAISE EXCEPTION 'Lançamento % não encontrado.', p_lancamento_id USING ERRCODE = 'no_data_found';
  END IF;
  IF p_texto IS NULL OR length(trim(p_texto)) = 0 THEN
    RAISE EXCEPTION 'Texto da observação não pode ser vazio.' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.lancamento_observacao (lancamento_id, texto, autor_id, fonte)
  VALUES (p_lancamento_id, trim(p_texto), v_uid, 'manual')
  RETURNING id INTO v_obs_id;

  RETURN v_obs_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.adicionar_observacao(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.adicionar_observacao(uuid, text) IS
  'Adiciona observacao manual a um lancamento. Autor = auth.uid(). Append-only.';
