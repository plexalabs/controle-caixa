// arquivar-mensal — Edge function que dispara a RPC arquivar_antigos.
// Agendada via cron `0 3 1 * *` (todo dia 1 do mês às 3h) configurado
// manualmente no Dashboard Supabase → Edge Functions → Schedules.
//
// Uso direto (debug):
//   curl -X POST -H "Authorization: Bearer <SERVICE_ROLE>" \
//     "https://<project>.supabase.co/functions/v1/arquivar-mensal"

import { createClient } from 'jsr:@supabase/supabase-js@2';

Deno.serve(async (_req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const { data, error } = await supabase.rpc('arquivar_antigos');

  if (error) {
    console.error('[arquivar-mensal] erro RPC:', error);
    return new Response(
      JSON.stringify({ ok: false, erro: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const linha = data?.[0] ?? { arquivados: 0, ignorados_com_observacoes: 0 };
  console.log(
    `[arquivar-mensal] arquivados=${linha.arquivados}` +
    ` ignorados_com_observacoes=${linha.ignorados_com_observacoes}`
  );

  return new Response(
    JSON.stringify({
      ok: true,
      arquivados: linha.arquivados,
      ignorados_com_observacoes: linha.ignorados_com_observacoes,
      executado_em: new Date().toISOString(),
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});
