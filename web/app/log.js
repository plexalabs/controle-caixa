// log.js — Logging estruturado (CP-PRE-DEPLOY-1).
//
// Em DEV: console.log/warn/error normais — Sentry é inicializado mas só
// envia se VITE_SENTRY_DSN estiver setado e PROD=true (controlado em main.js).
//
// Em PROD: errors e warns vão pro Sentry com contexto extra. Infos ficam
// só no console (não polui Sentry com volume desnecessário).
//
// Uso:
//   import { log } from './log.js';
//   log.info('caixa carregado', { caixaId, totalLanc });
//   log.warn('OTP expirado', { email });
//   log.erro('falha ao salvar', erro, { contexto });

import * as Sentry from '@sentry/browser';

const PROD = import.meta.env.PROD;

export const log = {
  info(msg, contexto = {}) {
    console.log(`[info] ${msg}`, contexto);
  },

  warn(msg, contexto = {}) {
    console.warn(`[warn] ${msg}`, contexto);
    if (PROD) {
      try { Sentry.captureMessage(msg, { level: 'warning', extra: contexto }); }
      catch (e) { /* logging nunca pode quebrar o app */ }
    }
  },

  /**
   * Erro de verdade — algo que o operador não fez nem espera.
   * @param {string} msg  — mensagem amigável pra debug
   * @param {Error|any} erro — exceção capturada (instanceof Error preferido)
   * @param {object} contexto — dados extra (ids, payloads sanitizados)
   */
  erro(msg, erro, contexto = {}) {
    console.error(`[erro] ${msg}`, erro, contexto);
    if (!PROD) return;
    try {
      if (erro instanceof Error) {
        Sentry.captureException(erro, { extra: { ...contexto, mensagem: msg } });
      } else {
        Sentry.captureMessage(msg, { level: 'error', extra: { ...contexto, erro } });
      }
    } catch (e) { /* idem */ }
  },
};
