-- ============================================================
-- CP-RBAC Sessao 6 / Etapa 0: nova permissao auditoria.visualizar
--
-- Necessaria pra migrar audit_log_select_admin e sync_log_select para
-- tem_permissao(). O catalogo nao tinha permissao especifica de
-- auditoria.
--
-- Atribuicao: APENAS perfil 'admin'. Razao: contador hoje tem
-- usuario.visualizar, mas nao deve enxergar audit_log (que registra
-- acoes de outros usuarios). super_admin via bypass.
--
-- 9 modulos viram 10: caixa, lancamento, vendedora, usuario, perfil,
-- config, relatorio, notificacao, arquivamento, auditoria.
-- 39 permissoes -> 40.
-- ============================================================

INSERT INTO public.permissao (codigo, modulo, descricao, destrutiva) VALUES
  ('auditoria.visualizar', 'auditoria', 'Visualizar audit_log e sync_log do sistema', false)
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO public.perfil_permissao (perfil_id, permissao_codigo)
SELECT id, 'auditoria.visualizar'
FROM public.perfil
WHERE codigo = 'admin'
ON CONFLICT DO NOTHING;

DO $$
DECLARE v_total integer; v_admin integer;
BEGIN
  SELECT count(*) INTO v_total FROM public.permissao;
  SELECT count(*) INTO v_admin
    FROM public.perfil_permissao pp
    JOIN public.perfil p ON p.id = pp.perfil_id
   WHERE pp.permissao_codigo = 'auditoria.visualizar' AND p.codigo = 'admin';

  IF v_total < 40 THEN
    RAISE EXCEPTION 'Esperado >=40 permissoes. Atual: %', v_total;
  END IF;
  IF v_admin <> 1 THEN
    RAISE EXCEPTION 'Esperado 1 atribuicao a admin. Atual: %', v_admin;
  END IF;
  RAISE NOTICE '[OK] auditoria.visualizar criada e atribuida ao admin (% perms total).', v_total;
END$$;
