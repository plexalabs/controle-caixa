-- ============================================================
-- CP-RBAC Sessao 1 / 2: tabelas do sistema RBAC
--
-- 5 tabelas:
--   permissao              catalogo de permissoes (fixo via migration)
--   perfil                 conjuntos nomeados de permissoes
--   perfil_permissao       N:N perfil <-> permissao
--   usuario_perfil         1:1 usuario -> perfil principal
--   usuario_permissao_extra  N:N usuario <-> permissoes pontuais
--
-- Modelo hibrido: cada usuario tem 1 perfil principal + N permissoes
-- extras pontuais (override do perfil). super_admin bypassa tudo.
-- ============================================================

-- ============================================================
-- TABELA: permissao
-- Catalogo fixo. Modificavel apenas via migration de schema.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.permissao (
  codigo      text PRIMARY KEY,
  modulo      text NOT NULL,
  descricao   text NOT NULL,
  destrutiva  boolean NOT NULL DEFAULT false,
  criado_em   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_permissao_modulo ON public.permissao(modulo);

COMMENT ON TABLE public.permissao IS
'Catalogo de permissoes disponiveis. Codigo no formato modulo.acao.
Modificavel apenas via migration de schema, nunca via UI.';

-- ============================================================
-- TABELA: perfil
-- 5 perfis pre-definidos (e_sistema=true) + custom criados pela UI.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.perfil (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo          text UNIQUE NOT NULL,
  nome            text NOT NULL,
  descricao       text,
  e_sistema       boolean NOT NULL DEFAULT false,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  criado_por      uuid REFERENCES auth.users(id),
  atualizado_em   timestamptz NOT NULL DEFAULT now(),
  atualizado_por  uuid REFERENCES auth.users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_perfil_codigo ON public.perfil(codigo);

COMMENT ON TABLE public.perfil IS
'Perfis de usuario. e_sistema=true para os 5 pre-definidos
(admin/gerente/operador/vendedor/contador) que nao podem ser deletados,
mas suas permissoes sao editaveis via UI (Sessao 4 do RBAC).';

-- ============================================================
-- TABELA: perfil_permissao
-- ============================================================
CREATE TABLE IF NOT EXISTS public.perfil_permissao (
  perfil_id          uuid NOT NULL REFERENCES public.perfil(id)        ON DELETE CASCADE,
  permissao_codigo   text NOT NULL REFERENCES public.permissao(codigo) ON DELETE CASCADE,
  concedido_em       timestamptz NOT NULL DEFAULT now(),
  concedido_por      uuid REFERENCES auth.users(id),
  PRIMARY KEY (perfil_id, permissao_codigo)
);

CREATE INDEX IF NOT EXISTS idx_perfil_permissao_perfil ON public.perfil_permissao(perfil_id);

-- ============================================================
-- TABELA: usuario_perfil (1:1)
-- ON DELETE RESTRICT no perfil_id: nao deixa deletar perfil em uso.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.usuario_perfil (
  usuario_id      uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  perfil_id       uuid NOT NULL    REFERENCES public.perfil(id) ON DELETE RESTRICT,
  atribuido_em    timestamptz NOT NULL DEFAULT now(),
  atribuido_por   uuid REFERENCES auth.users(id)
);

-- ============================================================
-- TABELA: usuario_permissao_extra (N:N)
-- Override pontual ao perfil. Motivo recomendado para auditoria.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.usuario_permissao_extra (
  usuario_id          uuid NOT NULL REFERENCES auth.users(id)          ON DELETE CASCADE,
  permissao_codigo    text NOT NULL REFERENCES public.permissao(codigo) ON DELETE CASCADE,
  concedido_em        timestamptz NOT NULL DEFAULT now(),
  concedido_por       uuid REFERENCES auth.users(id),
  motivo              text,
  PRIMARY KEY (usuario_id, permissao_codigo)
);

CREATE INDEX IF NOT EXISTS idx_usuario_permissao_extra_user
  ON public.usuario_permissao_extra(usuario_id);

COMMENT ON TABLE public.usuario_permissao_extra IS
'Permissoes pontuais ALEM do perfil principal. Modelo hibrido:
usuario tem perfil (que da N permissoes) + extras pontuais.';
