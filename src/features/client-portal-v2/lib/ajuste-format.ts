import type { PublicEntrega, Veredito } from "@/lib/portal-types";

/** Rótulo "Solicitado por X · Hoje, 16:42" — nunca inventa um nome quando
 * `autorNome` está ausente (registros antigos, ou o link público V1 sem
 * identidade individual): cai num rótulo genérico honesto. */
export function formatAjusteAutor(v: Pick<Veredito, "autorNome">): string {
  return v.autorNome?.trim() || "Cliente";
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (isToday) return `Hoje, ${time}`;
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `Ontem, ${time}`;
  return `${d.toLocaleDateString("pt-BR")}, ${time}`;
}

export function formatAjusteSummary(v: Veredito): string {
  return `Solicitado por ${formatAjusteAutor(v)} · ${formatDateTime(v.respondedAt)}`;
}

/** Qual `Veredito` (se algum) representa o ajuste ATUALMENTE pendente
 * desta entrega — nunca os dois ao mesmo tempo, já que o estágio só pode
 * estar aguardando ajuste de roteiro OU de conteúdo por vez. */
export function activeAjuste(
  entrega: Pick<PublicEntrega, "stage" | "roteiroReprovacao" | "conteudoReprovacao">,
): {
  kind: "roteiro" | "conteudo";
  veredito: Veredito;
} | null {
  if (entrega.stage === "ROTEIRO_AJUSTES" && entrega.roteiroReprovacao) {
    return { kind: "roteiro", veredito: entrega.roteiroReprovacao };
  }
  if (entrega.stage === "CONTEUDO_AJUSTES" && entrega.conteudoReprovacao) {
    return { kind: "conteudo", veredito: entrega.conteudoReprovacao };
  }
  return null;
}

/** `true` quando a entrega está travada num estágio de ajuste mas não
 * existe nenhum `Veredito` gravado (dado histórico anterior a este
 * registro existir, ou criado por um caminho que não passou por
 * `applyEntregaApproval`). Nunca inventamos um texto pra esses casos —
 * mostramos honestamente que o detalhe não está disponível. */
export function ajusteSemDetalheDisponivel(
  entrega: Pick<PublicEntrega, "stage" | "roteiroReprovacao" | "conteudoReprovacao">,
): boolean {
  if (entrega.stage === "ROTEIRO_AJUSTES") return !entrega.roteiroReprovacao;
  if (entrega.stage === "CONTEUDO_AJUSTES") return !entrega.conteudoReprovacao;
  return false;
}

/** Entrega em produção sem NADA enviado ainda (nem link, nem anexo) — não
 * existe conteúdo real pra abrir, então o card não deve parecer clicável
 * nem ter chevron; só o estado informativo "Ainda não enviado". */
export function conteudoAindaNaoEnviado(
  entrega: Pick<PublicEntrega, "stage" | "url" | "anexos">,
): boolean {
  return entrega.stage === "PRODUCAO" && !entrega.url && (entrega.anexos?.length ?? 0) === 0;
}

/** Uma entrega só ganha chevron/expansão quando expandir revela algo real
 * — nunca uma affordance falsa. */
export function entregaHasExpandableDetails(
  entrega: Pick<
    PublicEntrega,
    "dataPostagem" | "publicadoEm" | "url" | "stage" | "roteiroReprovacao" | "conteudoReprovacao"
  >,
  canDecide: boolean,
): boolean {
  return Boolean(
    entrega.dataPostagem ||
    entrega.publicadoEm ||
    entrega.url ||
    canDecide ||
    activeAjuste(entrega) ||
    ajusteSemDetalheDisponivel(entrega),
  );
}
