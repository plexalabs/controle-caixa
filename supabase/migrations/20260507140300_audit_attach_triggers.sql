-- ATL-2: anexa fn_audit_row() em todas as tabelas relevantes.
--
-- Estratégia: anexa em tudo que tem mutação relevante pra negócio,
-- exceto tabelas de altíssima escrita (ex: tabelas de cache/staging
-- — não temos no momento) e a própria `auditoria` (loop infinito).
--
-- Uso DROP TRIGGER IF EXISTS antes de cada CREATE — migration roda
-- sem erro mesmo se executada parcialmente antes.

-- Helper macro-style: segue o mesmo padrão pra cada tabela
-- (poderia ser DO $$ BEGIN ... END $$ com FOREACH, mas explícito é
-- mais legível pra revisão).

-- LANCAMENTO — coração do sistema
DROP TRIGGER IF EXISTS trg_audit_lancamento ON public.lancamento;
CREATE TRIGGER trg_audit_lancamento
  AFTER INSERT OR UPDATE OR DELETE ON public.lancamento
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();

-- LANCAMENTO_OBSERVACAO — observações são imutáveis mas captura insert
DROP TRIGGER IF EXISTS trg_audit_lancamento_observacao ON public.lancamento_observacao;
CREATE TRIGGER trg_audit_lancamento_observacao
  AFTER INSERT OR UPDATE OR DELETE ON public.lancamento_observacao
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();

-- CAIXA — abrir/fechar/reabrir
DROP TRIGGER IF EXISTS trg_audit_caixa ON public.caixa;
CREATE TRIGGER trg_audit_caixa
  AFTER INSERT OR UPDATE OR DELETE ON public.caixa
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();

-- NOTIFICACAO — incluindo descarte (manual ou via excluir_lancamento)
DROP TRIGGER IF EXISTS trg_audit_notificacao ON public.notificacao;
CREATE TRIGGER trg_audit_notificacao
  AFTER INSERT OR UPDATE OR DELETE ON public.notificacao
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();

-- PUSH_SUBSCRIPTION — registrar/remover device
DROP TRIGGER IF EXISTS trg_audit_push_subscription ON public.push_subscription;
CREATE TRIGGER trg_audit_push_subscription
  AFTER INSERT OR UPDATE OR DELETE ON public.push_subscription
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();

-- CONFIG — toda alteração de config é sensível
DROP TRIGGER IF EXISTS trg_audit_config ON public.config;
CREATE TRIGGER trg_audit_config
  AFTER INSERT OR UPDATE OR DELETE ON public.config
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();

-- VENDEDORA
DROP TRIGGER IF EXISTS trg_audit_vendedora ON public.vendedora;
CREATE TRIGGER trg_audit_vendedora
  AFTER INSERT OR UPDATE OR DELETE ON public.vendedora
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();

-- FERIADO
DROP TRIGGER IF EXISTS trg_audit_feriado ON public.feriado;
CREATE TRIGGER trg_audit_feriado
  AFTER INSERT OR UPDATE OR DELETE ON public.feriado
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();

-- RBAC: perfil, perfil_permissao, usuario_perfil, usuario_permissao_extra
DROP TRIGGER IF EXISTS trg_audit_perfil ON public.perfil;
CREATE TRIGGER trg_audit_perfil
  AFTER INSERT OR UPDATE OR DELETE ON public.perfil
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();

DROP TRIGGER IF EXISTS trg_audit_perfil_permissao ON public.perfil_permissao;
CREATE TRIGGER trg_audit_perfil_permissao
  AFTER INSERT OR UPDATE OR DELETE ON public.perfil_permissao
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();

DROP TRIGGER IF EXISTS trg_audit_usuario_perfil ON public.usuario_perfil;
CREATE TRIGGER trg_audit_usuario_perfil
  AFTER INSERT OR UPDATE OR DELETE ON public.usuario_perfil
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();

DROP TRIGGER IF EXISTS trg_audit_usuario_permissao_extra ON public.usuario_permissao_extra;
CREATE TRIGGER trg_audit_usuario_permissao_extra
  AFTER INSERT OR UPDATE OR DELETE ON public.usuario_permissao_extra
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();
