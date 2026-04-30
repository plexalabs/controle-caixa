// dominio.js — vocabulário de domínio centralizado: rótulos pt-BR das
// categorias, listas para selects, helpers de formato comuns.

export const CATEGORIAS = [
  { valor: 'cartao',      rotulo: 'Cartão' },
  { valor: 'pix',         rotulo: 'Pix' },
  { valor: 'dinheiro',    rotulo: 'Dinheiro' },
  { valor: 'cancelado',   rotulo: 'Cancelado' },
  { valor: 'cartao_link', rotulo: 'Cartão Link' },
  { valor: 'obs',         rotulo: 'Observação' },
];

export const LABEL_CATEGORIA = Object.fromEntries(
  CATEGORIAS.map(c => [c.valor, c.rotulo])
);

// Versão curta para etiquetas verticais (espaço limitado): "CARTÃO LINK"
// vira "LINK", "OBSERVAÇÃO" vira "OBS". Em uppercase já que vai pra
// .lanc-row::after via CSS letter-spacing maiúsculo.
export const LABEL_CATEGORIA_CURTA = {
  cartao:      'CARTÃO',
  pix:         'PIX',
  dinheiro:    'DINHEIRO',
  cancelado:   'CANCELADO',
  cartao_link: 'LINK',
  obs:         'OBS',
};

export const ESTADOS = {
  pendente:         'Pendente',
  em_preenchimento: 'Em preenchimento',
  completo:         'Completo',
  resolvido:        'Resolvido',
  cancelado:        'Cancelado',
  excluido:         'Excluído',
};

export const ESTADO_CAIXA = {
  aberto:         'Aberto',
  em_conferencia: 'Em conferência',
  fechado:        'Fechado',
  arquivado:      'Arquivado',
};

// Versão curta (uppercase) para etiqueta vertical da caixa-row.
export const LABEL_ESTADO_CAIXA_CURTO = {
  aberto:         'ABERTO',
  em_conferencia: 'CONFERIR',
  fechado:        'FECHADO',
  arquivado:      'ARQUIVADO',
};

export const BANDEIRAS = ['Visa','Mastercard','Elo','Hipercard','Amex','Outros'];
export const MODALIDADES = ['Crédito','Débito'];
export const STATUS_LINK = ['Enviado','Pago','Expirado','Cancelado'];
export const TIPOS_OBS   = ['Troca','Cortesia','Erro','Devolução','NF Perdida','Outro'];

// Saudação baseada na hora — Bom dia 05–12, Boa tarde 12–18, Boa noite 18–05.
export function saudacaoPorHora(d = new Date()) {
  const h = d.getHours();
  if (h >= 5  && h < 12) return 'Bom dia';
  if (h >= 12 && h < 18) return 'Boa tarde';
  return 'Boa noite';
}

// "Quinta-feira, 30 de abril de 2026"
const fmtLonga = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
});
export function dataLonga(d) {
  const x = (d instanceof Date) ? d : new Date(d + 'T00:00:00');
  return fmtLonga.format(x).replace(/^(.)/, (_, c) => c.toUpperCase());
}

// "DD/MM"
export function dataCurta(d) {
  const x = (d instanceof Date) ? d : new Date(d + 'T00:00:00');
  return String(x.getDate()).padStart(2,'0') + '/' + String(x.getMonth()+1).padStart(2,'0');
}

// ISO yyyy-mm-dd
export function isoData(d) {
  return d.toISOString().slice(0, 10);
}

// Resumo inline dos detalhes de um lançamento (para mostrar na linha da lista).
export function resumoDetalhes(categoria, dados) {
  if (!categoria || !dados) return '';
  switch (categoria) {
    case 'cartao':
      return [
        dados.bandeira,
        dados.modalidade,
        dados.parcelas ? `${dados.parcelas}x` : null,
        dados.ultimos_4_digitos ? `**** ${dados.ultimos_4_digitos}` : null,
      ].filter(Boolean).join(' · ');
    case 'pix':
      return [
        dados.comprovante_id_externo ? `Comprovante ${dados.comprovante_id_externo}` : null,
        dados.nome_remetente || null,
      ].filter(Boolean).join(' · ');
    case 'dinheiro':
      return [
        dados.vendedora_nome_cache ? `Recebido por ${dados.vendedora_nome_cache}` : null,
        dados.troco != null && Number(dados.troco) > 0
          ? `Troco ${new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(dados.troco)}`
          : null,
      ].filter(Boolean).join(' · ');
    case 'cancelado':
      return (dados.motivo_cancelamento || '').slice(0, 80) +
             ((dados.motivo_cancelamento || '').length > 80 ? '…' : '');
    case 'cartao_link':
      return [dados.status_link, (dados.link_url || '').slice(0, 40) + '…'].filter(Boolean).join(' · ');
    case 'obs':
      return [dados.tipo_obs, (dados.descricao || '').slice(0, 60) + '…'].filter(Boolean).join(' · ');
    default:
      return '';
  }
}

// Formato hora HH:MM em pt-BR a partir de timestamp.
export function hora(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
