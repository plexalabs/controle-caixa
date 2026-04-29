-- Migration 015: ao criar pendência, gera notificação info.
-- Pendência atrasada (>3 dias úteis) é tratada por edge function/cron.

CREATE OR REPLACE FUNCTION public.fn_notificar_pendencia_criada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.estado = 'pendente' THEN
        INSERT INTO public.notificacao (
            tipo, severidade, titulo, mensagem,
            lancamento_id, caixa_id
        )
        VALUES (
            'pendencia_aberta',
            'info',
            'Nova pendência aberta',
            format(
                'NF %s — cliente %s — valor R$ %s. Investigar e classificar.',
                NEW.numero_nf, NEW.cliente_nome, NEW.valor_nf::text
            ),
            NEW.id,
            NEW.caixa_id
        );
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lancamento_notif_pendencia ON public.lancamento;
CREATE TRIGGER trg_lancamento_notif_pendencia
    AFTER INSERT ON public.lancamento
    FOR EACH ROW EXECUTE FUNCTION public.fn_notificar_pendencia_criada();
