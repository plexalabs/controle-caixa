// saude-supabase.js — Detector global de queda do Supabase (CP-PRE-DEPLOY-1).
//
// Funciona em par com supabase-wrapper.js:
//   - comRetry chama marcarSupabaseFora() após 3 tentativas falhas
//   - chamadas com sucesso disparam marcarSupabaseOk() e fecham o banner
//
// Quando "fora": adiciona body.supabase-down (CSS desabilita CTAs críticos
// + mostra banner persistente) e inicia ping a cada 5s pra detectar volta.

import { supabase } from './supabase.js';

let supabaseDown = false;
let pingAtivo = false;
const listeners = [];

export function estaFora() {
  return supabaseDown;
}

export function marcarSupabaseFora() {
  if (supabaseDown) return;
  supabaseDown = true;
  document.body.classList.add('supabase-down');
  mostrarBanner();
  listeners.forEach(fn => { try { fn(true); } catch (e) { /* listener com erro não derruba os outros */ } });
  iniciarPing();
}

export function marcarSupabaseOk() {
  if (!supabaseDown) return;
  supabaseDown = false;
  document.body.classList.remove('supabase-down');
  esconderBanner();
  listeners.forEach(fn => { try { fn(false); } catch (e) { /* idem */ } });
}

export function aoMudarSaude(callback) {
  listeners.push(callback);
}

// ─── Banner: mostra/esconde ─────────────────────────────────────────
function mostrarBanner() {
  let el = document.querySelector('#supabase-down-banner');
  if (!el) {
    // Cria sob demanda — evita ter que mexer em index.html
    el = document.createElement('div');
    el.id = 'supabase-down-banner';
    el.className = 'banner-instabilidade';
    el.setAttribute('role', 'alert');
    el.innerHTML = `
      <span class="banner-icone" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 8v4M12 16h.01"/>
        </svg>
      </span>
      <div class="banner-texto">
        <p class="banner-titulo">Estamos com instabilidade</p>
        <p class="banner-sub">Tentando reconectar… seus dados estão seguros.</p>
      </div>`;
    document.body.appendChild(el);
  }
  el.classList.remove('hidden');
}

function esconderBanner() {
  const el = document.querySelector('#supabase-down-banner');
  if (el) el.classList.add('hidden');
}

// ─── Auto-cura: ping a cada 5s enquanto fora ─────────────────────────
async function iniciarPing() {
  if (pingAtivo) return;
  pingAtivo = true;
  while (supabaseDown) {
    await new Promise(r => setTimeout(r, 5000));
    if (!supabaseDown) break;
    try {
      const { error } = await supabase.auth.getSession();
      if (!error) {
        marcarSupabaseOk();
        break;
      }
    } catch (e) {
      // ainda fora — segue tentando
    }
  }
  pingAtivo = false;
}
