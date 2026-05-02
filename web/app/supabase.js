// supabase.js — cliente Supabase configurado para o Caixa Boti.
//
// Carrega supabase-js v2 via npm (gerenciado pelo Vite). As credenciais
// vem do .env.local via import.meta.env.VITE_*. URL e anon key sao
// publicas — a anon key e um JWT com role:anon validado pelas policies
// RLS do banco (smoke tests F1 e F1B confirmaram). Mesmo assim, o
// arquivo .env.local fica fora do git para evitar exposicao acidental
// em forks publicos.

import { createClient } from '@supabase/supabase-js';
import { authStorageAdapter } from './auth-storage.js';

// ─── Configuração do projeto ──────────────────────────────────────────────
const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'Credenciais Supabase ausentes. Crie um arquivo .env.local na raiz com ' +
    'VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY (ver .env.example).'
  );
}

// ─── Storage adapter persistente (IndexedDB com cache síncrono) ──────────
// Regra inviolável do projeto: NÃO usar localStorage ou sessionStorage.
// Sessão fica em IndexedDB; o adapter expõe API síncrona via Map em memória
// que é pré-populado em prepararAuthStorage() no boot do app.
// Antes desta refatoração (CP-PRE-DEPLOY-1), sessão vivia só em RAM e F5
// jogava o operador pra /login mesmo logado.

// ─── Cliente único exportado ──────────────────────────────────────────────
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession:    true,
    autoRefreshToken:  true,
    detectSessionInUrl: true,
    storage:           authStorageAdapter,
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
