// Edge function: arquivar_ano
// Trigger: pg_cron 1/1 00:30 BRT (03:30 UTC).
// Marca todos os caixas/lancamentos do ano anterior como 'arquivado'.
// Nao move dados para schemas separados (decisao MVP); apenas muda estado.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false }
});

Deno.serve(async (_req) => {
  const inicio = new Date().toISOString();
  const anoAnterior = new Date().getFullYear() - 1;
  const dataIni = `${anoAnterior}-01-01`;
  const dataFim = `${anoAnterior}-12-31`;

  // Atualiza caixas para arquivado (apenas os que ja estavam fechados;
  // caixas em aberto do ano anterior viram um problema operacional que
  // o admin precisa resolver manualmente).
  const { data: caixasArquivados, error } = await supabase
    .from("caixa")
    .update({ estado: "arquivado" })
    .gte("data", dataIni)
    .lte("data", dataFim)
    .eq("estado", "fechado")
    .select("id, data");

  return new Response(JSON.stringify({
    inicio,
    fim: new Date().toISOString(),
    ano_arquivado: anoAnterior,
    caixas_arquivados: caixasArquivados?.length ?? 0,
    erro: error?.message ?? null
  }, null, 2), {
    headers: { "Content-Type": "application/json" }
  });
});
