// supabase.js — cliente Supabase configurado para o Caixa Boti.
//
// Carrega o supabase-js v2 via ESM CDN (esm.sh). Nada de bundler ou npm install.
// As credenciais são públicas: a URL é endpoint, a anon key é JWT pré-assinado
// que carrega `role: anon` e que o backend valida via RLS — quem não tem papel
// não vê nem altera nada (validado nos smoke tests F1 e F1B).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

// ─── Configuração do projeto ──────────────────────────────────────────────
// project ref: shjtwrojdgotmxdbpbta (controle-caixa-prod, sa-east-1).
const SUPABASE_URL = 'https://shjtwrojdgotmxdbpbta.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNoanR3cm9qZGdvdG14ZGJwYnRhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0ODY2NTUsImV4cCI6MjA5MzA2MjY1NX0.iNYDow4v5-F4D3dBk7uVkbibaT8ZVAY60pnmhUOmXw8';

// ─── Storage adapter em memória ───────────────────────────────────────────
// Regra inviolável do projeto: NÃO usar localStorage ou sessionStorage.
// Para o CP1, sessão vive em memória (perde no F5). No CP5 (PWA), troca
// para IndexedDB via Dexie e ganha persistência de verdade.
const memoria = new Map();
const memoriaStorage = {
  getItem:    (chave)        => memoria.get(chave) ?? null,
  setItem:    (chave, valor) => { memoria.set(chave, valor); },
  removeItem: (chave)        => { memoria.delete(chave); },
};

// ─── Cliente único exportado ──────────────────────────────────────────────
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession:    true,
    autoRefreshToken:  true,
    detectSessionInUrl: true,
    storage:           memoriaStorage,
    storageKey:        'caixa-boti-auth',
    flowType:          'pkce',
  },
  // Configura o realtime para CP3 — ainda não subscreve nada aqui.
  realtime: {
    params: { eventsPerSecond: 10 },
  },
});

// Disponibiliza globalmente para inspeção via DevTools (apenas em dev).
// Não removível em produção sem perder a chance de debug; aceita risco
// porque a anon key é pública mesmo.
if (typeof window !== 'undefined') {
  window.supabase = supabase;
}

// ─── Helper: pega sessão atual sem lançar quando vazia ────────────────────
export async function pegarSessao() {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.warn('[supabase] erro ao ler sessão:', error.message);
    return null;
  }
  return data.session ?? null;
}
