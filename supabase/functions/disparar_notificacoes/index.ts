// Edge function: disparar_notificacoes
// Trigger: pg_cron a cada 4h em horario comercial seg-sab.
// Gera notificacoes complexas que dependem de contexto (bom_dia_resumo, etc.).
// As notificacoes simples (atrasada, caixa_nao_fechado) ja sao geradas por
// funcoes SQL puras app.gerar_notificacoes_*.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false }
});

function agoraEmSP(): Date {
  return new Date(Date.now() - 3 * 60 * 60 * 1000);
}

Deno.serve(async (_req) => {
  const agora = agoraEmSP();
  const hora = agora.getHours();
  const dow = agora.getDay();

  // Fora do horario comercial: skip silencioso.
  if (dow === 0 || hora < 8 || hora >= 18) {
    return new Response(JSON.stringify({
      skipped: true,
      reason: "fora_janela_comercial",
      dow_brt: dow,
      hora_brt: hora
    }), { headers: { "Content-Type": "application/json" } });
  }

  const resultado: any = { hora_brt: hora, geradas: {} };

  // Bom dia (apenas primeira execucao do dia, hora 08).
  if (hora === 8) {
    const hoje = agora.toISOString().slice(0, 10);
    // Verifica se ja gerou bom_dia_resumo hoje.
    const { data: existente } = await supabase
      .from("notificacao")
      .select("id")
      .eq("tipo", "bom_dia_resumo")
      .gte("criada_em", hoje + "T00:00:00Z")
      .limit(1);

    if (!existente || existente.length === 0) {
      // Conta pendencias abertas para o resumo.
      const { count: pendCount } = await supabase
        .from("lancamento")
        .select("id", { count: "exact", head: true })
        .in("estado", ["pendente", "em_preenchimento"]);

      const { count: caixasAbertos } = await supabase
        .from("caixa")
        .select("id", { count: "exact", head: true })
        .neq("estado", "fechado")
        .lt("data", hoje);

      const { error } = await supabase.from("notificacao").insert({
        tipo: "bom_dia_resumo",
        severidade: "info",
        titulo: "Bom dia!",
        mensagem: `Voce tem ${pendCount ?? 0} pendencia(s) em aberto e ${caixasAbertos ?? 0} caixa(s) anteriores nao fechados. Bom trabalho!`
      });
      resultado.geradas.bom_dia_resumo = error ? `erro: ${error.message}` : "ok";
    } else {
      resultado.geradas.bom_dia_resumo = "ja_existia";
    }
  }

  return new Response(JSON.stringify(resultado, null, 2), {
    headers: { "Content-Type": "application/json" }
  });
});
