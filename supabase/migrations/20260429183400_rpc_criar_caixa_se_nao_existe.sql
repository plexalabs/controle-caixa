-- Migration 034: RPC criar_caixa_se_nao_existe.
-- Idempotente: retorna o id existente se o caixa daquela data ja existe;
-- senao cria um novo. Chamada por edge function cria_caixa_diario.

CREATE OR REPLACE FUNCTION public.criar_caixa_se_nao_existe(p_data date)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_id uuid;
BEGIN
    SELECT id INTO v_id FROM public.caixa WHERE data = p_data;
    IF v_id IS NULL THEN
        INSERT INTO public.caixa (data, criado_por)
        VALUES (p_data, COALESCE(auth.uid(),
            (SELECT usuario_id FROM public.usuario_papel WHERE papel = 'admin' LIMIT 1)
        ))
        RETURNING id INTO v_id;
    END IF;
    RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.criar_caixa_se_nao_existe IS
'Idempotente. Cria caixa do dia se ainda nao existe. Fallback para criado_por usa 1o admin.';
