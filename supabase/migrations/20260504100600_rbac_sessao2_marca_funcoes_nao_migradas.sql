-- ============================================================
-- CP-RBAC Sessao 2: marca as 5 funcoes que NAO foram migradas
-- para tem_permissao(), com a razao registrada via COMMENT.
-- Auditoria futura facilita pra entender por que essas continuam
-- referenciando 'papel' literal no codigo.
-- ============================================================

COMMENT ON FUNCTION public.criar_caixa_se_nao_existe(date) IS
'[RBAC Sessao 2] NAO migrada para tem_permissao(): a referencia a papel=''admin'' eh fallback de auditoria (atribuir criado_por quando auth.uid() eh NULL em chamadas via edge function), nao checagem de autorizacao.';

COMMENT ON FUNCTION public.fn_auto_papel_inicial() IS
'[RBAC Sessao 2] NAO migrada para tem_permissao(): trigger seed sobre auth.users que atribui papel inicial ao novo usuario. Nao executa autorizacao -- apenas determina papel. Substituida em escopo pelo trigger trg_primeiro_admin (CP-RESET 2026-05-03), mas mantida pra compat.';

COMMENT ON FUNCTION public.fn_promove_primeiro_admin() IS
'[RBAC Sessao 2] NAO migrada para tem_permissao(): trigger seed sobre auth.users que promove o primeiro cadastro a super_admin se sistema vazio. Nao eh autorizacao.';

COMMENT ON FUNCTION public.fn_tem_papel(character varying) IS
'[RBAC Sessao 2] NAO migrada para tem_permissao(): helper SQL legacy ainda usado por codigo da Sessao 2 (revelar_pii consumia mas ja foi migrado). Sera depreciado/removido na Sessao 3 do RBAC quando o cliente terminar de migrar para temPermissao() e nenhuma RPC restante o referenciar.';

COMMENT ON FUNCTION public.tem_permissao(uuid, text) IS
'[RBAC Sessao 1] Funcao base do RBAC: bypass super_admin + perfil + permissao_extra. NAO eh para ser migrada -- eh O alvo das migracoes.';
