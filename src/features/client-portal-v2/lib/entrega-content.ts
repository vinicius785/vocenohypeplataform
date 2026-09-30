import type { PublicEntrega } from "@/lib/portal-types";

type EntregaAnexoPublic = NonNullable<PublicEntrega["anexos"]>[number];

/** Anexos por categoria, do mais recente pro mais antigo (`versao`
 * desc — ausente trata como v1, mesma regra da criação em
 * `addAnexoComVersao`, InfluencerBoard.tsx). Nunca mistura categorias
 * diferentes na mesma lista — "Roteiro" e "Conteúdo final" têm seu
 * próprio histórico. */
export function anexosPorCategoria(
  entrega: Pick<PublicEntrega, "anexos">,
  categoria: string,
): EntregaAnexoPublic[] {
  return (entrega.anexos ?? [])
    .filter((a) => a.categoria === categoria)
    .sort((a, b) => (b.versao ?? 1) - (a.versao ?? 1));
}

export function conteudoAtual(entrega: Pick<PublicEntrega, "anexos">): EntregaAnexoPublic | null {
  return anexosPorCategoria(entrega, "Conteúdo final")[0] ?? null;
}

export function roteiroAtual(entrega: Pick<PublicEntrega, "anexos">): EntregaAnexoPublic | null {
  return anexosPorCategoria(entrega, "Roteiro")[0] ?? null;
}

/** Um "grupo de versão" = todos os anexos enviados NA MESMA versão —
 * arquivos irmãos de um mesmo envio (ex: as 3 unidades de um Story), não
 * revisões umas das outras (ver `addAnexosComVersao`, InfluencerBoard.tsx:
 * arquivos de uma mesma seleção de upload sempre recebem a mesma
 * `versao`). Corrige o bug de "só aparece 1 arquivo" — antes, cada anexo
 * do array era tratado como uma versão própria (`versions[0]` virava
 * "atual" e o resto virava "histórico", espalhando os irmãos entre os
 * dois em vez de mantê-los juntos). */
export type VersionGroup = { versao: number; anexos: EntregaAnexoPublic[] };

export function versionGroupsPorCategoria(
  entrega: Pick<PublicEntrega, "anexos">,
  categoria: string,
): VersionGroup[] {
  const anexos = anexosPorCategoria(entrega, categoria);
  const byVersao = new Map<number, EntregaAnexoPublic[]>();
  for (const a of anexos) {
    const v = a.versao ?? 1;
    const list = byVersao.get(v);
    if (list) list.push(a);
    else byVersao.set(v, [a]);
  }
  return [...byVersao.entries()]
    .map(([versao, anexos]) => ({ versao, anexos }))
    .sort((a, b) => b.versao - a.versao);
}

/** Arquivos da entrega que NÃO são o roteiro nem o conteúdo principal
 * (referências, gravações, outros anexos de apoio) — ficam dentro da
 * entrega, nunca duplicados na seção geral "Arquivos" do drawer (essa
 * agora só mostra o que é do influenciador como um todo, não de uma
 * entrega específica). */
export function arquivosDaEntrega(entrega: Pick<PublicEntrega, "anexos">): EntregaAnexoPublic[] {
  return (entrega.anexos ?? []).filter(
    (a) => a.categoria !== "Conteúdo final" && a.categoria !== "Roteiro",
  );
}

/** Uma entrega tem detalhes reais pra expandir quando existe qualquer
 * coisa além do resumo já visível na linha recolhida — nunca uma
 * affordance falsa. */
export function entregaTemDetalhes(
  entrega: Pick<
    PublicEntrega,
    "dataPostagem" | "publicadoEm" | "url" | "anexos" | "roteiroReprovacao" | "conteudoReprovacao"
  >,
  canDecide: boolean,
): boolean {
  return Boolean(
    entrega.dataPostagem ||
    entrega.publicadoEm ||
    entrega.url ||
    canDecide ||
    (entrega.anexos?.length ?? 0) > 0 ||
    entrega.roteiroReprovacao ||
    entrega.conteudoReprovacao,
  );
}
