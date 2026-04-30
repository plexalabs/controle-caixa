-- Migration 191: garante que fn_auto_papel_inicial nao tem mais nenhuma
-- referencia ou suposicao de dominio. Logica de "primeiro vira admin+operador,
-- demais viram operador" preservada — agora aplicada a qualquer email.
--
-- Importante: como o cadastro agora e aberto, a defesa de acesso passa a
-- depender exclusivamente do papel. Usuario novo so vira "operador" — nao
-- pode promover-se a "admin". Promocao manual via SQL pelo admin existente:
--
--   INSERT INTO public.usuario_papel (usuario_id, papel, concedido_por)
--   VALUES ('<uid>', 'admin', auth.uid());

CREATE OR REPLACE FUNCTION public.fn_auto_papel_inicial()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Primeiro usuario do sistema vira admin + operador automaticamente.
    -- Esse e o "anchor admin" e tem responsabilidade de gerenciar papeis dos demais.
    IF NOT EXISTS (SELECT 1 FROM public.usuario_papel) THEN
        INSERT INTO public.usuario_papel (usuario_id, papel, concedido_por)
        VALUES (NEW.id, 'operador', NEW.id),
               (NEW.id, 'admin',    NEW.id)
        ON CONFLICT DO NOTHING;
    ELSE
        -- Demais: apenas operador. Admin promove manualmente via tabela usuario_papel.
        INSERT INTO public.usuario_papel (usuario_id, papel)
        VALUES (NEW.id, 'operador')
        ON CONFLICT DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_auto_papel_inicial() FROM anon, authenticated, public;

COMMENT ON FUNCTION public.fn_auto_papel_inicial IS
'Atribui papel automatico apos cadastro confirmado. 1o usuario = admin+operador, demais = operador. Sem restricao de dominio.';
