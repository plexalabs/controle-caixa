-- Migration 020: habilita RLS em todas as tabelas e cria helper fn_tem_papel.
-- Estratégia MVP: um único usuário com escrita; arquitetura preparada para multi.

ALTER TABLE public.caixa         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lancamento    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendedora     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cliente_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feriado       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.config        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificacao   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_log      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuario_papel ENABLE ROW LEVEL SECURITY;

-- Helper STABLE para policies — sem este wrapper as queries refletem
-- na avaliação de cada linha (custoso). SECURITY DEFINER para ler
-- usuario_papel mesmo se a policy estiver bloqueando.
CREATE OR REPLACE FUNCTION public.fn_tem_papel(p varchar)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.usuario_papel
        WHERE usuario_id = auth.uid() AND papel = p
    );
$$;

COMMENT ON FUNCTION public.fn_tem_papel IS
'Helper para policies de RLS. SECURITY DEFINER lê usuario_papel direto. STABLE permite cache por query.';
