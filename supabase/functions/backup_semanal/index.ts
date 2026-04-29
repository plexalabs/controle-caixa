// Edge function: backup_semanal
// Trigger: pg_cron domingo 04:00 BRT (07:00 UTC).
// Exporta dados de caixa, lancamento e audit_log para o bucket 'backups'
// como JSON estruturado, organizado por ano-semana.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false }
});

function numeroSemana(d: Date): number {
  const ini = new Date(d.getFullYear(), 0, 1);
  const diff = (d.getTime() - ini.getTime()) / 86400000;
  return Math.ceil((diff + ini.getDay() + 1) / 7);
}

async function dump(tabela: string, ano: number): Promise<unknown[]> {
  const { data, error } = await supabase
    .from(tabela)
    .select("*");
  if (error) {
    console.error(`Erro ao ler ${tabela}:`, error);
    return [];
  }
  return data ?? [];
}

Deno.serve(async (_req) => {
  const inicio = new Date().toISOString();
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const semana = numeroSemana(hoje).toString().padStart(2, "0");
  const prefix = `${ano}-S${semana}`;

  const tabelas = ["caixa", "lancamento", "vendedora", "feriado", "config", "usuario_papel", "audit_log"];
  const resultados: Record<string, number | string> = {};

  for (const t of tabelas) {
    const dados = await dump(t, ano);
    const conteudo = JSON.stringify({ tabela: t, exportado_em: inicio, registros: dados }, null, 2);
    const path = `${prefix}/${t}.json`;

    const { error } = await supabase.storage.from("backups").upload(path, conteudo, {
      contentType: "application/json",
      upsert: true
    });

    resultados[t] = error ? `erro: ${error.message}` : dados.length;
  }

  return new Response(JSON.stringify({
    inicio,
    fim: new Date().toISOString(),
    prefix,
    resultados
  }, null, 2), {
    headers: { "Content-Type": "application/json" }
  });
});
