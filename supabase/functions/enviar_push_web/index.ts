// Edge function: enviar_push_web
//
// Recebe `{ notificacao_id }` (POST), busca a notificação + as
// push subscriptions ativas do destinatário (ou de todos, se broadcast),
// e envia o payload Web Push pra cada endpoint usando VAPID.
//
// Disparada por trigger pg_net em INSERT em `public.notificacao`.
//
// Secrets requeridos (configurar via `supabase secrets set`):
//   VAPID_PRIVATE_KEY  — base64url da chave privada (gerada par a par
//                        com `push_vapid_public_key` em config)
//   VAPID_SUBJECT      — opcional; default lê de config push_vapid_subject
//   VAPID_PUBLIC_KEY   — opcional; default lê de config push_vapid_public_key
//
// Falha em endpoint individual NÃO derruba o batch — apenas marca
// removida_em quando o push service responde 404/410 (subscription
// expirou ou foi revogada pelo usuário).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Cache leve em memória do processo (vive entre invocações enquanto
// a edge runtime mantém o isolate quente).
let vapidPub: string | null = null;
let vapidSub: string | null = null;

async function carregarConfigVapid() {
  if (vapidPub && vapidSub) return;
  const envPub = Deno.env.get("VAPID_PUBLIC_KEY");
  const envSub = Deno.env.get("VAPID_SUBJECT");
  if (envPub && envSub) {
    vapidPub = envPub;
    vapidSub = envSub;
    return;
  }
  const { data, error } = await supabase
    .from("config")
    .select("chave, valor")
    .in("chave", ["push_vapid_public_key", "push_vapid_subject"]);
  if (error) throw new Error(`config VAPID: ${error.message}`);
  for (const c of data ?? []) {
    if (c.chave === "push_vapid_public_key") vapidPub = c.valor;
    if (c.chave === "push_vapid_subject") vapidSub = c.valor;
  }
  if (!vapidPub || !vapidSub) {
    throw new Error("config push_vapid_public_key / push_vapid_subject ausente");
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Use POST", { status: 405 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ erro: "json invalido" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const notificacao_id: string | undefined = body?.notificacao_id;
  if (!notificacao_id) {
    return new Response(JSON.stringify({ erro: "notificacao_id obrigatorio" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!VAPID_PRIVATE) {
    console.error("VAPID_PRIVATE_KEY ausente nos secrets");
    return new Response(JSON.stringify({ erro: "vapid private key ausente" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  await carregarConfigVapid();
  webpush.setVapidDetails(vapidSub!, vapidPub!, VAPID_PRIVATE);

  // Busca a notificação
  const { data: notif, error: errNotif } = await supabase
    .from("notificacao")
    .select("id, titulo, mensagem, tipo, severidade, usuario_destino, lancamento_id, caixa_id")
    .eq("id", notificacao_id)
    .maybeSingle();

  if (errNotif || !notif) {
    return new Response(JSON.stringify({ erro: "notificacao nao encontrada" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Busca subscriptions: se broadcast, todas ativas; senão, só do destinatário.
  let q = supabase
    .from("push_subscription")
    .select("id, usuario_id, endpoint, p256dh, auth")
    .is("removida_em", null);
  if (notif.usuario_destino) {
    q = q.eq("usuario_id", notif.usuario_destino);
  }
  const { data: subs, error: errSubs } = await q;
  if (errSubs) {
    return new Response(JSON.stringify({ erro: errSubs.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!subs || subs.length === 0) {
    return new Response(JSON.stringify({ enviadas: 0, motivo: "sem subscriptions" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const payload = JSON.stringify({
    titulo:       notif.titulo ?? "Caixa Boti",
    mensagem:     notif.mensagem ?? "",
    tipo:         notif.tipo,
    severidade:   notif.severidade ?? "info",
    notif_id:     notif.id,
    lancamento_id: notif.lancamento_id,
    caixa_id:     notif.caixa_id,
    url:          "/notificacoes",
  });

  const opcoes = {
    TTL: 60 * 60 * 24, // 24h — push service pode reter se device offline
    urgency: notif.severidade === "urgente" ? "high" : "normal",
  };

  let ok = 0;
  let removidas = 0;
  const erros: any[] = [];

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          opcoes,
        );
        ok++;
        // best-effort: atualiza ultima_em (sem await crítico)
        supabase
          .from("push_subscription")
          .update({ ultima_em: new Date().toISOString() })
          .eq("id", s.id)
          .then(() => {});
      } catch (e: any) {
        const status = e?.statusCode;
        if (status === 404 || status === 410) {
          // Endpoint expirou / usuário revogou — soft-delete
          await supabase
            .from("push_subscription")
            .update({ removida_em: new Date().toISOString() })
            .eq("id", s.id);
          removidas++;
        } else {
          erros.push({ sub_id: s.id, status, msg: e?.body || e?.message });
        }
      }
    }),
  );

  return new Response(
    JSON.stringify({ enviadas: ok, removidas, erros }),
    { headers: { "Content-Type": "application/json" } },
  );
});
