// push.js — gerencia Web Push (Fase 3) + fallback Notification API (Fase 2).
//
// Fluxo:
//  1. Detecta suporte (Notification + ServiceWorker + PushManager).
//  2. registrarSW(): registra /sw.js (idempotente).
//  3. estadoPush(): { suportado, permission, inscrito } — alimenta UI.
//  4. ativarPush(): pede permission, registra SW, chama subscribe(),
//     persiste em push_subscription via RPC. Se browser não suporta
//     Push, cai pra modo "só Notification API" (Fase 2 — bell.js cuida).
//  5. desativarPush(): unsubscribe + RPC remover.

import { supabase } from './supabase.js';

const SW_PATH = '/sw.js';

let cacheVapidPub = null;

function suporteCompleto() {
  return (
    typeof Notification !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  );
}

function suporteNotifBasica() {
  return typeof Notification !== 'undefined';
}

export function estadoPush() {
  return {
    suporte_push: suporteCompleto(),
    suporte_notif: suporteNotifBasica(),
    permission: typeof Notification !== 'undefined' ? Notification.permission : 'unsupported',
  };
}

async function buscarVapidPublic() {
  if (cacheVapidPub) return cacheVapidPub;
  const { data, error } = await supabase
    .from('config')
    .select('valor')
    .eq('chave', 'push_vapid_public_key')
    .maybeSingle();
  if (error) throw new Error(`config push_vapid_public_key: ${error.message}`);
  if (!data?.valor) throw new Error('VAPID public key ausente em config');
  cacheVapidPub = data.valor;
  return cacheVapidPub;
}

// base64url → Uint8Array (necessário pro applicationServerKey)
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

// ArrayBuffer → base64url
function arrayBufferToBase64Url(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function registrarSW() {
  if (!('serviceWorker' in navigator)) return null;
  // getRegistration evita re-registrar a cada navegação SPA
  const existente = await navigator.serviceWorker.getRegistration(SW_PATH);
  if (existente) return existente;
  return await navigator.serviceWorker.register(SW_PATH, { scope: '/' });
}

export async function inscritoAtualmente() {
  if (!suporteCompleto()) return false;
  const reg = await navigator.serviceWorker.getRegistration(SW_PATH);
  if (!reg) return false;
  const sub = await reg.pushManager.getSubscription();
  return !!sub;
}

/**
 * Pede permission, registra SW, faz subscribe e persiste no Supabase.
 * Retorna { ok: bool, motivo?: string, modo?: 'push'|'notif' }
 */
export async function ativarPush() {
  if (!suporteNotifBasica()) {
    return { ok: false, motivo: 'browser sem suporte a Notification API' };
  }

  // 1. Permission
  let perm = Notification.permission;
  if (perm === 'default') {
    perm = await Notification.requestPermission();
  }
  if (perm !== 'granted') {
    return { ok: false, motivo: perm === 'denied' ? 'permissão negada' : 'permissão pendente' };
  }

  // 2. Se browser não suporta Push (ex: iOS Safari < 16.4), só usa Notification API básica
  if (!suporteCompleto()) {
    return { ok: true, modo: 'notif', motivo: 'browser sem PushManager — só notifica com aba aberta' };
  }

  // 3. Registra SW + subscribe
  let reg;
  try {
    reg = await registrarSW();
  } catch (e) {
    return { ok: false, motivo: `falha ao registrar service worker: ${e.message}` };
  }
  if (!reg) return { ok: false, motivo: 'service worker não registrou' };

  const vapidPub = await buscarVapidPublic();

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPub),
      });
    } catch (e) {
      return { ok: false, motivo: `subscribe falhou: ${e.message}` };
    }
  }

  // 4. Extrai chaves e persiste no Supabase
  const p256dhBuf = sub.getKey('p256dh');
  const authBuf   = sub.getKey('auth');
  if (!p256dhBuf || !authBuf) {
    return { ok: false, motivo: 'chaves p256dh/auth ausentes na subscription' };
  }

  const { error } = await supabase.rpc('salvar_push_subscription', {
    p_endpoint: sub.endpoint,
    p_p256dh:   arrayBufferToBase64Url(p256dhBuf),
    p_auth:     arrayBufferToBase64Url(authBuf),
    p_user_agent: navigator.userAgent || null,
  });
  if (error) {
    return { ok: false, motivo: `salvar_push_subscription: ${error.message}` };
  }

  return { ok: true, modo: 'push' };
}

export async function desativarPush() {
  if (!suporteCompleto()) return { ok: true };
  const reg = await navigator.serviceWorker.getRegistration(SW_PATH);
  if (!reg) return { ok: true };
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return { ok: true };

  const endpoint = sub.endpoint;
  try { await sub.unsubscribe(); } catch (_) { /* ignore */ }
  await supabase.rpc('remover_push_subscription', { p_endpoint: endpoint });
  return { ok: true };
}
