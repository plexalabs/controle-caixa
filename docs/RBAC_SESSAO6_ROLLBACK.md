# Rollback da Sessão 6 — Migração das RLS Policies

Sessão 6 do RBAC migra **17 RLS policies** que dependiam de `fn_tem_papel(varchar)` para usar `tem_permissao(auth.uid(), 'X.Y')`. RLS opera silenciosamente — erro em policy pode esconder dados ou expô-los indevidamente. Este doc é o plano de fuga.

## Quando aplicar rollback

Sintomas que indicam quebra de policy:

- **Dados que existiam somem da query** (SELECT vazio inesperado em tela que listava itens)
- **Erro `403` ou "permission denied"** em operação que sempre funcionou
- **Realtime para de receber eventos** (Supabase realtime depende de RLS)
- **`/dashboard` mostra zero lançamentos** quando deveria ter
- **Console com erros vermelhos** em chamadas Supabase (`supabase.from(...)` retornando `[]` quando antes retornava data)
- **Edição/criação que sempre funcionou agora dá erro**

## Como aplicar rollback

1. **Identifica qual policy quebrou**: olhe o sintoma e mapeie pra tabela
   - `/dashboard` ou `/caixa/*` vazios → `caixa_*` ou `lancamento_*`
   - `/configuracoes/sistema` vazio → `config_*`
   - `/configuracoes/feriados` vazio → `feriado_modify`
   - `/configuracoes/usuarios` vazio → `usuario_papel_*`
   - `/configuracoes/vendedoras` vazio → `vendedora_*`
   - Upload de comprovante falha → `storage comprovantes_*`

2. **Abre Supabase Dashboard → SQL Editor** (não via CLI/MCP, pra controle total)

3. **Cola o SQL da migration reversa correspondente** em `supabase/migrations-reversas/<arquivo>.sql`

4. **Executa**

5. **Confirma que o sintoma desapareceu** no app

6. **Comunica ao agente** qual policy quebrou + sintoma observado pra investigação

## Lista de migrations reversas

(Atualizada conforme commits são feitos.)

| # | Bloco | Policy | Migration reversa |
|---|---|---|---|
| 1 | A | `audit_log_select_admin` | `20260504400100_REVERSE_audit_log_select_admin.sql` |
| 2 | A | `sync_log_select` | `20260504400200_REVERSE_sync_log_select.sql` |
| 3 | B | `config_update` | `20260504400400_REVERSE_config_update.sql` |
| 4 | B | `feriado_modify` | `20260504400500_REVERSE_feriado_modify.sql` |
| 5 | B | `usuario_papel_select` | `20260504400600_REVERSE_usuario_papel_select.sql` |
| 6 | B | `usuario_papel_admin_modify` | `20260504400700_REVERSE_usuario_papel_admin_modify.sql` |
| 7 | B | `vendedora_insert` | `20260504400800_REVERSE_vendedora_insert.sql` |
| 8 | B | `vendedora_update` | `20260504400900_REVERSE_vendedora_update.sql` |
| 9 | C | `backups_admin_only` (storage.objects) | `20260504401000_REVERSE_storage_backups.sql` |
| 10 | C | `comprovantes_select` (storage.objects) | `20260504401100_REVERSE_storage_comprovantes_select.sql` |
| 11 | C | `comprovantes_upload` (storage.objects) | `20260504401200_REVERSE_storage_comprovantes_upload.sql` |

(Mais entradas conforme próximos blocos.)

## Padrão de cada migration reversa

```sql
DROP POLICY IF EXISTS <nome> ON <schema>.<tabela>;

CREATE POLICY <nome> ON <schema>.<tabela>
  FOR <CMD> TO authenticated
  USING (
    -- expressao ANTIGA com fn_tem_papel restaurada
  )
  WITH CHECK (
    -- idem se aplicavel
  );
```

## Rollback em cascata (se múltiplas policies quebrarem)

Se mais de uma policy quebrou e o sistema está inconsistente:

1. Aplica reversas **em ordem inversa de migração** (última primeiro)
2. Re-valida sintomas a cada reversa aplicada
3. Para no momento em que o sistema voltou ao normal — não precisa reverter todas
4. Reporta ao agente quais policies precisaram reverter

## DROP de fn_tem_papel — ponto de não retorno

Após **todas** as 17 policies migradas + smoke completo do Bloco D passando, o agente vai dropar `fn_tem_papel(varchar)` (commit final).

**Após o DROP, rollback fica complicado**: as migrations reversas referenciam `fn_tem_papel`. Se precisar reverter pós-drop:

1. Recriar `fn_tem_papel` primeiro:
   ```sql
   CREATE OR REPLACE FUNCTION public.fn_tem_papel(p character varying)
   RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
   SET search_path = public, pg_temp
   AS $$
     SELECT EXISTS (
       SELECT 1 FROM public.usuario_papel
       WHERE usuario_id = auth.uid() AND papel = p
     );
   $$;
   ```
2. Aplicar reversa(s) específica(s)
3. Reportar ao agente

Isso é o "ponto de não retorno" controlado: o DROP só acontece após validação completa.
