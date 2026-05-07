-- ATL-2: função genérica `fn_audit_row()` — anexada via trigger
-- AFTER INSERT/UPDATE/DELETE em todas as tabelas que importam.
--
-- Detecta automaticamente:
--   * INSERT comum                        → acao = 'INSERT'
--   * DELETE físico                       → acao = 'DELETE'
--   * UPDATE comum                        → acao = 'UPDATE'
--   * UPDATE que muda estado→'excluido'   → acao = 'SOFT_DELETE'
--   * UPDATE que muda estado≠'excluido' a partir de 'excluido' → 'RESTAURACAO'
--   * UPDATE com descartada_em/removida_em a partir de NULL    → 'SOFT_DELETE'
--   * UPDATE com descartada_em/removida_em a partir de NOT NULL → 'RESTAURACAO'
--
-- Lê duas variáveis de sessão (best-effort, defaultam vazias):
--   app.motivo  → motivo gravado na auditoria (RPCs setam via SET LOCAL)
--   app.ip      → ip do cliente (gateway pode setar via header)
--
-- O insert em public.auditoria roda com privilégio elevado (definer)
-- — bypassa a RLS deny-all que impede insert direto.

CREATE OR REPLACE FUNCTION public.fn_audit_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_email      text;
  v_acao       text;
  v_eid        text;
  v_antes      jsonb;
  v_depois     jsonb;
  v_motivo     text;
  v_ip_txt     text;
  v_ip         inet;
  v_ua         text;
BEGIN
  -- email snapshot (resiste a delete do user no futuro)
  IF v_uid IS NOT NULL THEN
    SELECT email INTO v_email FROM auth.users WHERE id = v_uid;
  END IF;

  -- session vars best-effort
  BEGIN v_motivo := nullif(current_setting('app.motivo', true), ''); EXCEPTION WHEN OTHERS THEN v_motivo := NULL; END;
  BEGIN v_ip_txt := nullif(current_setting('app.ip', true), '');     EXCEPTION WHEN OTHERS THEN v_ip_txt := NULL; END;
  BEGIN v_ua     := nullif(current_setting('app.ua', true), '');     EXCEPTION WHEN OTHERS THEN v_ua := NULL; END;
  IF v_ip_txt IS NOT NULL THEN
    BEGIN v_ip := v_ip_txt::inet; EXCEPTION WHEN OTHERS THEN v_ip := NULL; END;
  END IF;

  -- Snapshot dos dados
  IF (TG_OP = 'INSERT') THEN
    v_antes  := NULL;
    v_depois := to_jsonb(NEW);
    v_eid    := COALESCE((v_depois->>'id'), '');
    v_acao   := 'INSERT';

  ELSIF (TG_OP = 'DELETE') THEN
    v_antes  := to_jsonb(OLD);
    v_depois := NULL;
    v_eid    := COALESCE((v_antes->>'id'), '');
    v_acao   := 'DELETE';

  ELSE  -- UPDATE
    v_antes  := to_jsonb(OLD);
    v_depois := to_jsonb(NEW);
    v_eid    := COALESCE((v_depois->>'id'), '');
    v_acao   := 'UPDATE';

    -- Heurísticas de soft-delete / restauração
    IF (v_antes ? 'estado') AND (v_depois ? 'estado') THEN
      IF v_antes->>'estado' <> 'excluido' AND v_depois->>'estado' = 'excluido' THEN
        v_acao := 'SOFT_DELETE';
      ELSIF v_antes->>'estado' = 'excluido' AND v_depois->>'estado' <> 'excluido' THEN
        v_acao := 'RESTAURACAO';
      END IF;
    END IF;
    IF (v_antes ? 'descartada_em') AND (v_depois ? 'descartada_em') THEN
      IF v_antes->>'descartada_em' IS NULL AND v_depois->>'descartada_em' IS NOT NULL THEN
        v_acao := 'SOFT_DELETE';
      ELSIF v_antes->>'descartada_em' IS NOT NULL AND v_depois->>'descartada_em' IS NULL THEN
        v_acao := 'RESTAURACAO';
      END IF;
    END IF;
    IF (v_antes ? 'removida_em') AND (v_depois ? 'removida_em') THEN
      IF v_antes->>'removida_em' IS NULL AND v_depois->>'removida_em' IS NOT NULL THEN
        v_acao := 'SOFT_DELETE';
      ELSIF v_antes->>'removida_em' IS NOT NULL AND v_depois->>'removida_em' IS NULL THEN
        v_acao := 'RESTAURACAO';
      END IF;
    END IF;
  END IF;

  -- Não loga UPDATE no-op (mesmo conteúdo) — evita ruído
  IF TG_OP = 'UPDATE' AND v_antes = v_depois THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.auditoria
    (usuario_id, usuario_email_snapshot, acao, entidade, entidade_id,
     dados_antes, dados_depois, motivo, ip, user_agent)
  VALUES
    (v_uid, v_email, v_acao, TG_TABLE_NAME, nullif(v_eid, ''),
     v_antes, v_depois, v_motivo, v_ip, v_ua);

  RETURN NULL;  -- AFTER trigger: retorno ignorado
EXCEPTION WHEN OTHERS THEN
  -- Auditoria nunca deve quebrar a transação principal
  RAISE WARNING 'fn_audit_row falhou para %.%: % (%)',
                TG_TABLE_NAME, TG_OP, SQLERRM, SQLSTATE;
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.fn_audit_row() IS
  'Trigger genérico AFTER INSERT/UPDATE/DELETE — registra em public.auditoria. Detecta soft-delete/restauração via heurística (estado/descartada_em/removida_em). Lê app.motivo/app.ip/app.ua de session vars (best-effort).';
