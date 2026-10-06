import { entregaAjusteView } from "@/lib/entrega-ajustes";
import {
  ARQUIVO_CATEGORIA_LABEL,
  formatDiaMes,
  historicoDaEntrega,
  historicoTexto,
} from "@/lib/entrega-detail";
import type { Entrega, EntregaAnexoCategoria, InfluActivity } from "@/lib/influencer-model";

/**
 * Histórico da ENTREGA (V2), derivado — nada novo é gravado. A fonte é a Atividade do influenciador
 * (`influ.activity`), onde já ficam: as ações da equipe (motor, arquivos, prazos, legenda) e as
 * decisões do cliente, inclusive o TEXTO COMPLETO de cada pedido de ajuste ("solicitou ajustes em o
 * roteiro de uma entrega — {motivo}"). O carimbo `roteiroReprovacao`/`conteudoReprovacao` só guarda o
 * último feedback; por isso cada feedback é reconstruído daqui, e numerado por ordem (V1, V2…).
 */

export type HistoricoEtapa = "roteiro" | "conteudo";
export const HISTORICO_ETAPA_LABEL: Record<HistoricoEtapa, string> = {
  roteiro: "Roteiro",
  conteudo: "Conteúdo final",
};

export type HistoricoKind =
  /** O cliente pediu ajustes (com texto). */
  | "feedback"
  /** O cliente aprovou a etapa. */
  | "aprovado"
  /** A equipe reconheceu os ajustes. */
  | "reconhecido"
  | "enviado"
  /** Envio que acontece depois de um pedido de ajuste. */
  | "reenviado"
  | "anexo"
  | "publicado"
  | "prazo"
  | "legenda"
  | "movido"
  | "outro";

export type HistoricoEvento = {
  id: string;
  /** ISO. */
  at: string;
  autor: string;
  kind: HistoricoKind;
  etapa?: HistoricoEtapa;
  /** Frase SEM o autor ("reenviou o roteiro para aprovação"). */
  texto: string;
  /** Nº da interação do cliente naquela etapa (feedback ou aprovação): V1, V2, V3… */
  versao?: number;
  /** Texto do feedback do cliente (só `feedback`). */
  motivo?: string;
  /** Material do evento ("Roteiro", "Conteúdo final"…): do registro novo ou da etapa. */
  material?: string;
  /** Versão do ARQUIVO no momento (só eventos gravados com `meta`; nunca inferida). */
  arquivoVersao?: number;
  /** Evento de rotina (prazo, legenda, arquivo avulso…): só aparece em "Ver tudo". */
  menor?: boolean;
  /** Feedback que ainda pede trabalho da equipe (ajuste aberto, não reenviado). */
  pendente?: boolean;
};

type Classe = { kind: HistoricoKind; etapa?: HistoricoEtapa; texto: string; motivo?: string };

const etapaDe = (raw: string): HistoricoEtapa => (/roteiro/i.test(raw) ? "roteiro" : "conteudo");
const objeto = (e: HistoricoEtapa) => (e === "roteiro" ? "o roteiro" : "o conteúdo final");

/** Reconhece o texto de uma linha da Atividade (os mesmos textos gravados pelo board e pelo portal). */
export function classificarAcao(action: string): Classe {
  const txt = action.trim();
  let m =
    /^solicitou ajustes em (o roteiro|o conteúdo)\b(?: de uma entrega)?(?:\s+—\s+([\s\S]*))?$/.exec(
      txt,
    );
  if (m) {
    const etapa = etapaDe(m[1]);
    return {
      kind: "feedback",
      etapa,
      texto: `solicitou ajustes ${etapa === "roteiro" ? "no roteiro" : "no conteúdo final"}`,
      motivo: (m[2] ?? "").trim(),
    };
  }
  m = /^aprovou (o roteiro|o conteúdo)\b/.exec(txt);
  if (m) {
    const etapa = etapaDe(m[1]);
    return { kind: "aprovado", etapa, texto: `aprovou ${objeto(etapa)}` };
  }
  m = /^reconheceu os ajustes pedidos no (roteiro|conteúdo)/.exec(txt);
  if (m)
    return {
      kind: "reconhecido",
      etapa: etapaDe(m[1]),
      texto: "reconheceu os ajustes solicitados",
    };
  m = /^enviou (o roteiro|o conteúdo final) pra aprovação/.exec(txt);
  if (m) {
    const etapa = etapaDe(m[1]);
    return { kind: "enviado", etapa, texto: `enviou ${objeto(etapa)} para aprovação` };
  }
  m = /^anexou (o roteiro|o conteúdo final)/.exec(txt);
  if (m) return { kind: "anexo", etapa: etapaDe(m[1]), texto: historicoTexto(txt) };
  if (/^marcou como publicada/.test(txt))
    return { kind: "publicado", texto: "marcou como publicada" };
  if (/^(alterou|removeu) o prazo/.test(txt)) return { kind: "prazo", texto: historicoTexto(txt) };
  if (/legenda/i.test(txt)) return { kind: "legenda", texto: historicoTexto(txt) };
  if (/^(adicionou|substituiu|removeu)\b/.test(txt))
    return { kind: "anexo", texto: historicoTexto(txt) };
  if (/^moveu /.test(txt)) return { kind: "movido", texto: historicoTexto(txt) };
  return { kind: "outro", texto: historicoTexto(txt) };
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Eventos da entrega, do MAIS RECENTE ao mais antigo. */
export function historicoEventos(
  activity: InfluActivity[] | undefined,
  e: Entrega,
): HistoricoEvento[] {
  const itens: HistoricoEvento[] = historicoDaEntrega(activity, e)
    .slice()
    .reverse()
    .map((a) => ({
      id: a.id,
      at: a.createdAt,
      autor: a.author,
      ...(a.meta ? { material: a.meta.material, arquivoVersao: a.meta.versao } : {}),
      ...classificarAcao(a.action),
    }));

  // Garantia de "feedback antigo continua aparecendo": se o carimbo vivo do cliente não tem a linha
  // correspondente na Atividade, o evento é montado a partir do próprio carimbo.
  for (const [etapa, v] of [
    ["roteiro", e.roteiroReprovacao],
    ["conteudo", e.conteudoReprovacao],
  ] as const) {
    const motivo = v?.motivo?.trim();
    if (!v || !motivo) continue;
    const ja = itens.some((i) => i.kind === "feedback" && i.etapa === etapa && i.motivo === motivo);
    if (ja) continue;
    itens.push({
      id: `carimbo-${etapa}-${v.respondedAt}`,
      at: v.respondedAt,
      autor: v.autorNome?.trim() || "Cliente",
      kind: "feedback",
      etapa,
      texto: `solicitou ajustes ${etapa === "roteiro" ? "no roteiro" : "no conteúdo final"}`,
      motivo,
    });
  }
  itens.sort((a, b) => cmp(a.at, b.at));
  for (const it of itens) {
    if (!it.material && it.etapa) it.material = HISTORICO_ETAPA_LABEL[it.etapa];
    it.menor = !(
      ["feedback", "aprovado", "reconhecido", "enviado", "reenviado", "publicado"].includes(
        it.kind,
      ) ||
      (it.kind === "anexo" && /^anexou/.test(it.texto))
    );
  }

  // V1, V2, V3… por etapa (cada decisão do cliente conta) e "reenviou" = envio depois de um ajuste.
  const contador: Record<HistoricoEtapa, number> = { roteiro: 0, conteudo: 0 };
  const ajusteAberto: Record<HistoricoEtapa, boolean> = { roteiro: false, conteudo: false };
  for (const it of itens) {
    if (!it.etapa) continue;
    if (it.kind === "feedback") {
      it.versao = ++contador[it.etapa];
      ajusteAberto[it.etapa] = true;
    } else if (it.kind === "aprovado") {
      it.versao = ++contador[it.etapa];
      ajusteAberto[it.etapa] = false;
    } else if (it.kind === "enviado" && ajusteAberto[it.etapa]) {
      it.kind = "reenviado";
      it.texto = it.texto.replace(/^enviou/, "reenviou");
      ajusteAberto[it.etapa] = false;
    }
  }

  // O último feedback de uma etapa ainda "pendente" enquanto o ajuste está aberto (não reenviado).
  const ajuste = entregaAjusteView(e);
  if (ajuste && ajuste.phase !== "reenviado") {
    const ultimo = [...itens]
      .reverse()
      .find((i) => i.kind === "feedback" && i.etapa === ajuste.etapa);
    if (ultimo) ultimo.pendente = true;
  }

  return itens.reverse();
}

/* ---------------- Textos que o detalhe grava na Atividade ---------------- */

/** Frases gravadas pelo detalhe da entrega. Ficam aqui, ao lado de `classificarAcao`, para quem escreve
 * e quem lê o histórico concordarem — o teste confere cada uma com o classificador. */
const alvo = (entregaLabel: string) => ` — "${entregaLabel}"`;

export const entregaLog = {
  /** Primeira versão ("adicionou o arquivo …") ou uma nova ("adicionou a V2 em Roteiro"). */
  arquivosAdicionados(
    categoria: EntregaAnexoCategoria,
    nomes: string[],
    versao: number,
    entregaLabel: string,
  ): string {
    const onde = ARQUIVO_CATEGORIA_LABEL[categoria];
    if (versao > 1) return `adicionou a V${versao} em ${onde}${alvo(entregaLabel)}`;
    const o = nomes.length === 1 ? `o arquivo "${nomes[0]}"` : `${nomes.length} arquivos`;
    return `adicionou ${o} em ${onde}${alvo(entregaLabel)}`;
  },
  arquivoSubstituido(
    categoria: EntregaAnexoCategoria,
    versao: number,
    de: string,
    para: string,
    entregaLabel: string,
  ): string {
    return `substituiu "${de}" por "${para}" em ${ARQUIVO_CATEGORIA_LABEL[categoria]} (V${versao})${alvo(entregaLabel)}`;
  },
  versaoRemovida(categoria: EntregaAnexoCategoria, versao: number, entregaLabel: string): string {
    return `removeu a V${versao} de ${ARQUIVO_CATEGORIA_LABEL[categoria]}${alvo(entregaLabel)}`;
  },
  arquivoRemovido(nome: string, entregaLabel: string): string {
    return `removeu o arquivo "${nome}"${alvo(entregaLabel)}`;
  },
  prazo(campoLabel: string, valor: string | undefined, entregaLabel: string): string {
    return valor
      ? `alterou o prazo de ${campoLabel} para ${formatDiaMes(valor)}${alvo(entregaLabel)}`
      : `removeu o prazo de ${campoLabel}${alvo(entregaLabel)}`;
  },
  publicacao(entregaLabel: string): string {
    return `atualizou o link e as métricas da publicação${alvo(entregaLabel)}`;
  },
  legenda(tem: boolean, entregaLabel: string): string {
    return `${tem ? "atualizou a legenda" : "removeu a legenda"}${alvo(entregaLabel)}`;
  },
};
