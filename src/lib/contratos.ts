/**
 * Contrato — entidade própria (tabela `contratos`, ver migration
 * `20260930100000_create_contratos_table.sql`), parte da reconstrução do
 * domínio Comercial/Clientes/Campanhas/Contratos/Financeiro. Item 14 do
 * pedido: "formalização do relacionamento" — nunca exigido pra criar
 * cliente ou campanha em planejamento (item 14: "Não exigir contrato para
 * criar cliente ou campanha em Planejamento").
 */

export type ContratoStatus = "rascunho" | "em_assinatura" | "vigente" | "encerrado" | "cancelado";

export const CONTRATO_STATUS_LABEL: Record<ContratoStatus, string> = {
  rascunho: "Rascunho",
  em_assinatura: "Em assinatura",
  vigente: "Vigente",
  encerrado: "Encerrado",
  cancelado: "Cancelado",
};

export const CONTRATO_STATUS_LIST: ContratoStatus[] = [
  "rascunho",
  "em_assinatura",
  "vigente",
  "encerrado",
  "cancelado",
];

export type Contrato = {
  id: string;
  clienteId: string;
  nome: string;
  tipo: string | null;
  status: ContratoStatus;
  vigenciaInicio: string | null;
  vigenciaFim: string | null;
  dataAssinatura: string | null;
  /** `null` = valor não informado — nunca `0` como sinônimo de "sem
   * valor" (item 12/15 do pedido: "campos desconhecidos devem ser null,
   * nunca zero"). */
  valor: number | null;
  arquivoUrl: string | null;
  campanhaIds: string[];
  responsavelInterno: string | null;
  observacoes: string | null;
  renovacao: string | null;
  criadoPor: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ContratoRow = {
  id: string;
  cliente_id: string;
  nome: string;
  tipo: string | null;
  status: string;
  vigencia_inicio: string | null;
  vigencia_fim: string | null;
  data_assinatura: string | null;
  valor: number | null;
  arquivo_url: string | null;
  campanha_ids: string[] | null;
  responsavel_interno: string | null;
  observacoes: string | null;
  renovacao: string | null;
  criado_por: string | null;
  created_at: string;
  updated_at: string;
};

export function mapContratoRow(r: ContratoRow): Contrato {
  return {
    id: r.id,
    clienteId: r.cliente_id,
    nome: r.nome,
    tipo: r.tipo,
    status: (CONTRATO_STATUS_LIST as string[]).includes(r.status)
      ? (r.status as ContratoStatus)
      : "rascunho",
    vigenciaInicio: r.vigencia_inicio,
    vigenciaFim: r.vigencia_fim,
    dataAssinatura: r.data_assinatura,
    valor: r.valor,
    arquivoUrl: r.arquivo_url,
    campanhaIds: r.campanha_ids ?? [],
    responsavelInterno: r.responsavel_interno,
    observacoes: r.observacoes,
    renovacao: r.renovacao,
    criadoPor: r.criado_por,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** Um contrato "próximo do vencimento" (item 19: indicador da página
 * global de Clientes) — vigência final dentro da janela informada, e
 * ainda vigente (contrato encerrado/cancelado não conta, mesmo com
 * `vigenciaFim` no passado/futuro). `null`/ausente nunca conta como
 * "vencendo": um contrato sem data de fim não tem vencimento a alertar. */
export function isContratoProximoDoVencimento(
  c: Contrato,
  withinDays: number,
  now: Date = new Date(),
): boolean {
  if (c.status !== "vigente" || !c.vigenciaFim) return false;
  const fim = new Date(c.vigenciaFim + "T00:00:00");
  if (Number.isNaN(fim.getTime())) return false;
  const diffDays = (fim.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays >= 0 && diffDays <= withinDays;
}

/** Um contrato "cobre" uma campanha quando ela está listada em
 * `campanhaIds` — usado pra decidir se uma campanha já tem contrato
 * vinculado (item 8 do pedido: "Configuração da campanha" mostra
 * "Contrato" como pendente até isso ser verdade pra alguma campanha). */
export function contratoCobreCampanha(c: Contrato, campanhaId: string): boolean {
  return c.campanhaIds.includes(campanhaId);
}

export function clienteTemContratoVigente(contratos: Contrato[]): boolean {
  return contratos.some((c) => c.status === "vigente");
}
