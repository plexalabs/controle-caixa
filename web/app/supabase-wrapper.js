// supabase-wrapper.js — comRetry: tolerância a instabilidade transitória
// (CP-PRE-DEPLOY-1, entrega 3A).
//
// Envolva chamadas Supabase críticas (login, criar lançamento, carregar
// caixa do dia) com `comRetry(() => supabase.rpc(...), 'contexto')`.
// Retry só em erros de rede/timeout/5xx — erros de validação (RLS, unique,
// CHECK, FK) falham na primeira tentativa, sem mascarar bugs reais.
//
// Backoff exponencial: 1s, 2s entre tentativas (3 tentativas no total).
// Após a 3a falha, marca Supabase como fora do ar (banner global).

import { marcarSupabaseFora, marcarSupabaseOk } from './saude-supabase.js';

const TENTATIVAS_MAXIMAS = 3;
const ATRASO_BASE_MS = 1000;

// Códigos PostgREST/Postgres que JAMAIS devem ser retentados — são
// validação esperada, não falha de infraestrutura.
const NAO_RECUPERAVEIS = new Set([
  '42501',   // insufficient_privilege (RLS bloqueou)
  '23505',   // unique_violation
  '23503',   // foreign_key_violation
  '23514',   // check_violation
  '22P02',   // invalid_text_representation
  '22023',   // invalid_parameter_value
  'P0002',   // no_data_found (RAISE EXCEPTION nas RPCs)
  'PGRST116', // PostgREST: row not found (single + 0 rows)
  'PGRST301', // PostgREST: query timeout (NÃO retentar — é deadlock provável)
]);

function ehRecuperavel(err) {
  if (!err) return false;
  const msg = (err.message || '').toLowerCase();
  if (msg.includes('failed to fetch')) return true;
  if (msg.includes('networkerror'))    return true;
  if (msg.includes('network request failed')) return true;
  if (msg.includes('timeout'))         return true;
  if (msg.includes('econnrefused'))    return true;
  // HTTP 5xx → server side, vale tentar de novo
  if (typeof err.status === 'number' && err.status >= 500) return true;
  return false;
}

/**
 * Executa `operacao()` até 3 vezes com backoff exponencial (1s, 2s).
 * `contexto` aparece nos logs pra identificar a operação.
 *
 * Retorna o resultado da operação (incluindo {data, error} no formato
 * supabase-js) — não muda a forma do retorno. Se todas falharem, lança
 * o último erro e dispara `marcarSupabaseFora()`.
 */
export async function comRetry(operacao, contexto = 'operação') {
  let ultimoErro;

  for (let tentativa = 1; tentativa <= TENTATIVAS_MAXIMAS; tentativa++) {
    try {
      const resultado = await operacao();

      // Padrão supabase-js: retorna { data, error } sem throw.
      // Erros não-recuperáveis: devolve direto (validação esperada, sem retry).
      if (resultado?.error) {
        ultimoErro = resultado.error;
        const codigo = resultado.error.code || '';
        if (NAO_RECUPERAVEIS.has(codigo) || !ehRecuperavel(resultado.error)) {
          marcarSupabaseOk();  // ainda online, foi só validação
          return resultado;
        }
        // Erro recuperável → cai pra próxima tentativa
      } else {
        // Sucesso — marca online (caso estivéssemos com banner aberto)
        marcarSupabaseOk();
        return resultado;
      }
    } catch (err) {
      ultimoErro = err;
      if (!ehRecuperavel(err)) {
        // Não recuperável: relança imediatamente sem retry nem banner
        marcarSupabaseOk();
        throw err;
      }
    }

    // Última tentativa? Sai do loop pra cair no fail-handler.
    if (tentativa === TENTATIVAS_MAXIMAS) break;

    // Backoff: 1s, 2s
    const atraso = ATRASO_BASE_MS * tentativa;
    await new Promise(r => setTimeout(r, atraso));
  }

  // 3 tentativas falharam → Supabase está fora pra essa op
  console.error(`[supabase-wrapper] ${contexto} falhou após ${TENTATIVAS_MAXIMAS} tentativas:`, ultimoErro);
  marcarSupabaseFora();

  // Devolve no mesmo formato {error} pra quem chama tratar normalmente
  if (typeof ultimoErro === 'object' && !(ultimoErro instanceof Error)) {
    return { data: null, error: ultimoErro };
  }
  throw ultimoErro;
}
