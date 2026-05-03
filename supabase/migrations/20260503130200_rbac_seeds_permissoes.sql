-- ============================================================
-- CP-RBAC Sessao 1 / 3: catalogo de 38 permissoes
--
-- Mapeia toda a operacao do sistema atual em codigos modulo.acao.
-- Idempotente: ON CONFLICT (codigo) DO NOTHING.
-- ============================================================

INSERT INTO public.permissao (codigo, modulo, descricao, destrutiva) VALUES
  -- ===== Modulo CAIXA =====
  ('caixa.abrir',                       'caixa',        'Abrir caixa do dia',                        false),
  ('caixa.fechar',                      'caixa',        'Fechar caixa do dia',                       false),
  ('caixa.criar_retroativo',            'caixa',        'Criar caixa em data passada',               true),
  ('caixa.reabrir_fechado',             'caixa',        'Reabrir caixa ja fechado',                  true),
  ('caixa.visualizar',                  'caixa',        'Visualizar caixas (proprios e de outros)',  false),
  ('caixa.exportar',                    'caixa',        'Exportar dados de caixa',                   false),

  -- ===== Modulo LANCAMENTO =====
  ('lancamento.criar',                  'lancamento',   'Criar lancamento',                          false),
  ('lancamento.editar_pre_categoria',   'lancamento',   'Editar lancamento antes de categorizar',    false),
  ('lancamento.categorizar',            'lancamento',   'Definir categoria de um lancamento',        false),
  ('lancamento.adicionar_observacao',   'lancamento',   'Adicionar observacao em lancamento',        false),
  ('lancamento.visualizar_todos',       'lancamento',   'Ver lancamentos de outros usuarios',        false),
  ('lancamento.exportar',               'lancamento',   'Exportar lancamentos',                      false),

  -- ===== Modulo VENDEDORA =====
  ('vendedora.criar',                   'vendedora',    'Cadastrar nova vendedora',                  false),
  ('vendedora.editar',                  'vendedora',    'Editar dados de vendedora',                 false),
  ('vendedora.desativar',               'vendedora',    'Desativar vendedora',                       false),
  ('vendedora.visualizar',              'vendedora',    'Listar vendedoras',                         false),

  -- ===== Modulo USUARIO =====
  ('usuario.criar',                     'usuario',      'Criar novo usuario',                        false),
  ('usuario.atribuir_perfil',           'usuario',      'Atribuir perfil a usuario',                 false),
  ('usuario.conceder_extra',            'usuario',      'Conceder permissao extra a usuario',        false),
  ('usuario.desativar',                 'usuario',      'Desativar usuario',                         true),
  ('usuario.visualizar',                'usuario',      'Listar usuarios',                           false),

  -- ===== Modulo PERFIL (RBAC) =====
  ('perfil.criar',                      'perfil',       'Criar novo perfil',                         false),
  ('perfil.editar_permissoes',          'perfil',       'Editar permissoes de perfil existente',     true),
  ('perfil.deletar',                    'perfil',       'Deletar perfil (nao-sistema)',              true),
  ('perfil.visualizar',                 'perfil',       'Listar perfis e suas permissoes',           false),

  -- ===== Modulo CONFIG =====
  ('config.editar_sistema',             'config',       'Editar configuracoes do sistema',           true),
  ('config.gerenciar_feriados',         'config',       'Adicionar/remover feriados',                false),
  ('config.gerenciar_categorias',       'config',       'Editar categorias e suas cores',            false),
  ('config.visualizar',                 'config',       'Visualizar configuracoes',                  false),

  -- ===== Modulo RELATORIO =====
  ('relatorio.diario',                  'relatorio',    'Acessar relatorio diario',                  false),
  ('relatorio.mensal',                  'relatorio',    'Acessar relatorio mensal',                  false),
  ('relatorio.anual',                   'relatorio',    'Acessar relatorio anual',                   false),
  ('relatorio.exportar_pdf',            'relatorio',    'Exportar relatorio em PDF',                 false),
  ('relatorio.exportar_excel',          'relatorio',    'Exportar relatorio em Excel',               false),

  -- ===== Modulo NOTIFICACAO =====
  ('notificacao.visualizar',            'notificacao',  'Ver proprias notificacoes',                 false),
  ('notificacao.marcar_lida',           'notificacao',  'Marcar notificacao como lida',              false),

  -- ===== Modulo ARQUIVAMENTO =====
  ('arquivamento.executar_manual',      'arquivamento', 'Disparar arquivamento manual',              true),
  ('arquivamento.visualizar_arquivados','arquivamento', 'Consultar lancamentos arquivados',          false)
ON CONFLICT (codigo) DO NOTHING;

DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.permissao;
  RAISE NOTICE '[OK] Total de permissoes catalogadas: %', v_count;
  IF v_count < 38 THEN
    RAISE EXCEPTION 'Esperado >= 38 permissoes. Insercao parcial.';
  END IF;
END$$;
