-- ============================================================
-- CP-RBAC Sessao 1 / 6: RLS nas 5 tabelas RBAC
--
-- Padrao: leitura pra qualquer authenticated, escrita so super_admin.
-- Catalogo de permissoes nao tem policy de escrita -- so muda via
-- migration de schema (postgres user).
-- ============================================================

ALTER TABLE public.permissao              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perfil                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perfil_permissao       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuario_perfil         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuario_permissao_extra ENABLE ROW LEVEL SECURITY;

-- ---- permissao: so leitura (catalogo eh fixo via migration) ----
DROP POLICY IF EXISTS permissao_leitura ON public.permissao;
CREATE POLICY permissao_leitura ON public.permissao
  FOR SELECT TO authenticated USING (true);

-- ---- perfil ----
DROP POLICY IF EXISTS perfil_leitura ON public.perfil;
CREATE POLICY perfil_leitura ON public.perfil
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS perfil_escrita ON public.perfil;
CREATE POLICY perfil_escrita ON public.perfil
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.usuario_papel
    WHERE usuario_id = auth.uid() AND papel = 'super_admin' AND ativo = true
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.usuario_papel
    WHERE usuario_id = auth.uid() AND papel = 'super_admin' AND ativo = true
  ));

-- ---- perfil_permissao ----
DROP POLICY IF EXISTS perfil_permissao_leitura ON public.perfil_permissao;
CREATE POLICY perfil_permissao_leitura ON public.perfil_permissao
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS perfil_permissao_escrita ON public.perfil_permissao;
CREATE POLICY perfil_permissao_escrita ON public.perfil_permissao
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.usuario_papel
    WHERE usuario_id = auth.uid() AND papel = 'super_admin' AND ativo = true
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.usuario_papel
    WHERE usuario_id = auth.uid() AND papel = 'super_admin' AND ativo = true
  ));

-- ---- usuario_perfil ----
DROP POLICY IF EXISTS usuario_perfil_leitura ON public.usuario_perfil;
CREATE POLICY usuario_perfil_leitura ON public.usuario_perfil
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS usuario_perfil_escrita ON public.usuario_perfil;
CREATE POLICY usuario_perfil_escrita ON public.usuario_perfil
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.usuario_papel
    WHERE usuario_id = auth.uid() AND papel = 'super_admin' AND ativo = true
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.usuario_papel
    WHERE usuario_id = auth.uid() AND papel = 'super_admin' AND ativo = true
  ));

-- ---- usuario_permissao_extra ----
DROP POLICY IF EXISTS usuario_permissao_extra_leitura ON public.usuario_permissao_extra;
CREATE POLICY usuario_permissao_extra_leitura ON public.usuario_permissao_extra
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS usuario_permissao_extra_escrita ON public.usuario_permissao_extra;
CREATE POLICY usuario_permissao_extra_escrita ON public.usuario_permissao_extra
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.usuario_papel
    WHERE usuario_id = auth.uid() AND papel = 'super_admin' AND ativo = true
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.usuario_papel
    WHERE usuario_id = auth.uid() AND papel = 'super_admin' AND ativo = true
  ));
