// Edge function: cria_caixa_diario
// Trigger: pg_cron diariamente as 06:00 BRT (09:00 UTC).
// Garante caixa do dia + caixa de sabado se for segunda.
// Pula domingos e feriados conforme tabela public.feriado.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false }
});

function agoraEmSP(): Date {
  // Date em UTC; calculamos componentes BRT manualmente.
  const utc = new Date();
  // BRT = UTC - 3h.
  return new Date(utc.getTime() - 3 * 60 * 60 * 1000);
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function ehFeriado(data: string): Promise<boolean> {
  const { data: row } = await supabase
    .from("feriado")
    .select("data")
    .eq("data", data)
    .eq("ativo", true)
    .maybeSingle();
  return !!row;
}

async function tentarCriarCaixa(data: string) {
  if (await ehFeriado(data)) {
    return { data, status: "skipped_feriado" };
  }
  const { data: id, error } = await supabase.rpc("criar_caixa_se_nao_existe", { p_data: data });
  return { data, id, error: error?.message ?? null, status: error ? "erro" : "ok" };
}

Deno.serve(async (_req) => {
  const inicio = new Date().toISOString();
  const agora = agoraEmSP();
  const dow = agora.getDay(); // 0=dom, 1=seg, ..., 6=sab
  const datasParaCriar: string[] = [];

  // Hoje (exceto domingo).
  if (dow !== 0) {
    datasParaCriar.push(isoDate(agora));
  }

  // Se segunda, garantir sabado anterior tambem (gerar_sabado=true por padrao).
  if (dow === 1) {
    const { data: cfg } = await supabase
      .from("config")
      .select("valor")
      .eq("chave", "caixa.gerar_sabado")
      .maybeSingle();
    const gerarSabado = cfg?.valor === true || cfg?.valor === "true";
    if (gerarSabado) {
      const sab = new Date(agora);
      sab.setDate(agora.getDate() - 2);
      datasParaCriar.push(isoDate(sab));
    }
  }

  const resultados: any[] = [];
  for (const dt of datasParaCriar) {
    resultados.push(await tentarCriarCaixa(dt));
  }

  return new Response(
    JSON.stringify({
      inicio,
      fim: new Date().toISOString(),
      timezone: "America/Sao_Paulo",
      dow_brt: dow,
      resultados
    }, null, 2),
    { headers: { "Content-Type": "application/json" } }
  );
});
