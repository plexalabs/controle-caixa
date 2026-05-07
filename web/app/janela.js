// janela.js — Janela operacional (6h-20h seg-sex America/Sao_Paulo).
//
// Espelha exatamente a logica da fn dentro_da_janela_operacional()
// no Postgres. Cliente e fonte rapida, servidor e fonte da verdade
// (trigger fn_check_janela_operacional bloqueia DML como defesa em
// profundidade — relogio do cliente nao engana o banco).
//
// Configs sao lidas do supabase 1x por sessao + cache + recarga
// quando admin altera (evento custom 'config-mudou').

import { supabase } from './supabase.js';

const PADROES = {
  janela_op_ativa:        true,
  janela_op_hora_ini:     6,
  janela_op_hora_fim:     20,                // exclusiva
  janela_op_dias_semana:  [1, 2, 3, 4, 5],   // ISO seg=1..dom=7
};

let cache = null;

async function lerConfig() {
  if (cache) return cache;
  try {
    const { data } = await supabase
      .from('config')
      .select('chave, valor')
      .in('chave', [
        'janela_op_ativa', 'janela_op_hora_ini',
        'janela_op_hora_fim', 'janela_op_dias_semana',
      ]);
    const map = Object.fromEntries((data || []).map(r => [r.chave, r.valor]));
    cache = {
      ativa:    parseBool(map.janela_op_ativa,        PADROES.janela_op_ativa),
      hora_ini: parseInt(map.janela_op_hora_ini,      10) || PADROES.janela_op_hora_ini,
      hora_fim: parseInt(map.janela_op_hora_fim,      10) || PADROES.janela_op_hora_fim,
      dias:     (map.janela_op_dias_semana || PADROES.janela_op_dias_semana.join(','))
                   .split(',').map(s => parseInt(s.trim(), 10)).filter(Number.isFinite),
    };
  } catch {
    cache = {
      ativa: PADROES.janela_op_ativa, hora_ini: PADROES.janela_op_hora_ini,
      hora_fim: PADROES.janela_op_hora_fim, dias: PADROES.janela_op_dias_semana,
    };
  }
  return cache;
}

function parseBool(v, padrao) {
  if (v === null || v === undefined) return padrao;
  return v === true || v === 'true' || v === 't' || v === '1';
}

/**
 * Calcula hora atual e ISO weekday em America/Sao_Paulo,
 * independente do timezone do cliente.
 */
function agoraSP() {
  const fmt = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'short', hour: '2-digit', hour12: false,
  });
  const partes = fmt.formatToParts(new Date());
  const hora = parseInt(partes.find(p => p.type === 'hour')?.value ?? '0', 10);
  const wd   = partes.find(p => p.type === 'weekday')?.value?.toLowerCase() ?? '';
  // pt-BR Intl: "seg.", "ter.", "qua.", "qui.", "sex.", "sáb.", "dom."
  const map = { 'seg': 1, 'ter': 2, 'qua': 3, 'qui': 4, 'sex': 5, 'sáb': 6, 'dom': 7 };
  const iso = map[wd.slice(0, 3)] ?? 1;
  return { hora, iso };
}

export async function dentroDaJanela() {
  const cfg = await lerConfig();
  if (!cfg.ativa) return true;
  const { hora, iso } = agoraSP();
  if (!cfg.dias.includes(iso)) return false;
  if (hora < cfg.hora_ini || hora >= cfg.hora_fim) return false;
  return true;
}

export async function descricaoJanela() {
  const cfg = await lerConfig();
  const dias = cfg.dias.slice().sort();
  const NOMES = { 1: 'seg', 2: 'ter', 3: 'qua', 4: 'qui', 5: 'sex', 6: 'sáb', 7: 'dom' };
  let janelaDias;
  // Tenta resumir intervalo continuo
  if (dias.length && dias.every((d, i) => i === 0 || d === dias[i - 1] + 1)) {
    janelaDias = `${NOMES[dias[0]]}-${NOMES[dias[dias.length - 1]]}`;
  } else {
    janelaDias = dias.map(d => NOMES[d]).join(', ');
  }
  const fmt = (h) => String(h).padStart(2, '0') + 'h';
  return `${fmt(cfg.hora_ini)} às ${fmt(cfg.hora_fim)} · ${janelaDias}`;
}

export function invalidarCacheJanela() {
  cache = null;
}

// Recarrega config se admin alterar
window.addEventListener?.('config-mudou', invalidarCacheJanela);
