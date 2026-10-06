import { entregaFaseConceitual, type EntregaStage } from "@/lib/campanha-status";
import { deriveEntregaNextStep, type EntregaEngineActionKind } from "@/lib/entrega-engine";
import { anexoAtualizadoDesde, entregaAjusteView, historyActionText } from "@/lib/entrega-ajustes";
import { formatCompactNumber } from "@/lib/format";
import {
  legacyAnexoCategoria,
  type Entrega,
  type EntregaAnexo,
  type EntregaAnexoCategoria,
  type InfluActivity,
  type PostMetrics,
} from "@/lib/influencer-model";
import { entregaTone, type EntregaTone } from "@/lib/influencer-next-action";
import type { EditorialChannel } from "@/lib/marketing-editorial";
import { formatDateToIso } from "@/lib/utils";

/**
 * Regras PURAS de apresentação do detalhe da entrega (V2). Nada aqui escreve estado nem decide
 * transição: a máquina de estados continua em `entrega-engine.ts` / `campanha-status.ts` / ciclo de
 * ajustes em `entrega-ajustes.ts`. Estas funções só LEEM a entrega e dizem o que mostrar.
 */

/* ---------------- Fases (stepper e "Mover para") ---------------- */

// Agrupamento em 4 fases (não os 8 estágios internos do motor) só pra dar um "Mover para" rápido e um
// stepper visual — puramente de apresentação: nunca substitui `ENTREGA_STAGE_ORDER`/transições
// reais, só decide o estágio de ENTRADA de cada fase quando movido na mão.
export const ENTREGA_FASE_COLUNAS = ["ROTEIRO", "CONTEUDO", "PUBLICACAO", "CONCLUIDO"] as const;
export type EntregaFaseColuna = (typeof ENTREGA_FASE_COLUNAS)[number];
export const ENTREGA_FASE_COLUNA_LABEL: Record<EntregaFaseColuna, string> = {
  ROTEIRO: "Roteiro",
  CONTEUDO: "Conteúdo",
  PUBLICACAO: "Publicação",
  CONCLUIDO: "Concluído",
};
export const ENTREGA_FASE_COLUNA_ENTRY_STAGE: Record<EntregaFaseColuna, EntregaStage> = {
  ROTEIRO: "ROTEIRO_PRODUCAO",
  CONTEUDO: "PRODUCAO",
  PUBLICACAO: "PUBLICACAO",
  CONCLUIDO: "PUBLICADA",
};
export function entregaFaseColuna(stage: EntregaStage): EntregaFaseColuna {
  if (stage === "PUBLICADA") return "CONCLUIDO";
  const { fase } = entregaFaseConceitual(stage);
  if (fase === "Roteiro") return "ROTEIRO";
  if (fase === "Conteúdo") return "CONTEUDO";
  return "PUBLICACAO";
}

/* ---------------- Título ---------------- */

/** "1 unidade" / "3 unidades"; `null` para uma unidade independente de um grupo (ela já é uma só). */
export function entregaUnidadesLabel(e: Pick<Entrega, "quantidade" | "grupoId">): string | null {
  if (e.grupoId) return null;
  return `${e.quantidade} ${e.quantidade === 1 ? "unidade" : "unidades"}`;
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
/** "2026-10-05" → "05 out" (sem passar por Date, para não deslocar o dia por fuso). */
export function formatDiaMes(iso?: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  if (!m) return iso ?? "";
  return `${m[3]} ${MESES[Number(m[2]) - 1] ?? m[2]}`;
}

/* ---------------- Próxima ação (a superfície única) ---------------- */

export type EntregaFocusPrimary =
  /** Abre o seletor de arquivo e só então chama o motor (adicionar roteiro / conteúdo final). */
  | {
      kind: "upload";
      label: string;
      action: "anexar_roteiro" | "anexar_conteudo";
      categoria: EntregaAnexoCategoria;
    }
  /** Ação do motor direta (enviar para aprovação, marcar como publicado…). */
  | { kind: "engine"; label: string; action: EntregaEngineActionKind }
  /** Ciclo de ajustes: "reconhecer" abre o feedback e marca os ajustes como vistos (é a ação que o
   * motor já chama de "Ver feedback do …"); "reenviar" manda a nova versão de volta ao cliente. */
  | {
      kind: "ajuste";
      label: string;
      action: EntregaEngineActionKind;
      step: "reconhecer" | "reenviar";
    }
  /** Abre o seletor de arquivo para acrescentar uma NOVA versão (não passa pelo motor). */
  | { kind: "nova_versao"; label: string; categoria: EntregaAnexoCategoria }
  /** Publicada com link: abre o post. */
  | { kind: "post"; label: string; url: string }
  /** Publicada sem link: abre o editor de link e métricas. */
  | { kind: "publicacao"; label: string };

export type EntregaFocus = {
  /** Rótulo da superfície: "Próxima ação", ou "Publicação" quando a entrega já foi ao ar. */
  rotulo: string;
  tone: EntregaTone;
  /** Uma frase curta: o que está acontecendo / o que precisa acontecer. */
  title: string;
  hint?: string;
  /** A única ação principal — ausente quando só resta esperar o cliente. */
  primary?: EntregaFocusPrimary;
  /** Alternativa discreta (ex.: "Reenviar sem arquivo novo"); o board pede confirmação. */
  secondary?: { label: string; action: EntregaEngineActionKind };
  /** Em espera do cliente: categoria do arquivo em análise, para um link "Abrir …". */
  openCategoria?: EntregaAnexoCategoria;
  /** Ciclo de ajustes: a etapa ainda não recebeu arquivo novo depois do feedback. */
  semArquivoNovo?: boolean;
};

const ROTULO_ACAO = "Próxima ação";

/**
 * O que a pessoa precisa saber/fazer AGORA numa entrega, derivado do estado real (motor +
 * ciclo de ajustes). Entrega publicada não tem próxima ação: a mesma superfície mostra a publicação.
 */
export function entregaFocus(e: Entrega): EntregaFocus {
  const stage: EntregaStage = e.stage ?? "ROTEIRO_PRODUCAO";
  const tone = entregaTone(e);

  if (stage === "PUBLICADA") {
    const link = linkDoPost(e.url);
    const metricas = metricasResumo(e.metrics);
    return {
      rotulo: "Publicação",
      tone,
      title: e.publicadoEm ? `Publicada em ${formatDiaMes(e.publicadoEm)}` : "Publicada",
      hint: metricas.length > 0 ? metricas.slice(0, 3).join(" · ") : "Sem métricas ainda.",
      primary: link
        ? { kind: "post", label: "Abrir post →", url: link }
        : { kind: "publicacao", label: "Adicionar link do post" },
    };
  }

  const step = deriveEntregaNextStep(e);
  const ajuste = entregaAjusteView(e);

  if (ajuste) {
    const nome = ajuste.etapa === "roteiro" ? "roteiro" : "conteúdo final";
    const Nome = ajuste.etapa === "roteiro" ? "Roteiro" : "Conteúdo final";
    const reconhecer: EntregaEngineActionKind =
      ajuste.etapa === "roteiro" ? "reconhecer_ajustes_roteiro" : "reconhecer_ajustes_conteudo";
    const enviar: EntregaEngineActionKind =
      ajuste.etapa === "roteiro" ? "enviar_roteiro" : "enviar_conteudo";

    if (ajuste.phase === "reenviado") {
      return {
        rotulo: ROTULO_ACAO,
        tone,
        title: `${Nome} reenviado — aguardando aprovação do cliente`,
        openCategoria: ajuste.categoria,
      };
    }
    if (ajuste.phase === "solicitados" && step.action === reconhecer) {
      return {
        rotulo: ROTULO_ACAO,
        tone,
        title: "Ajustes solicitados pelo cliente",
        primary: {
          kind: "ajuste",
          label: "Ver feedback →",
          action: reconhecer,
          step: "reconhecer",
        },
      };
    }
    if (ajuste.phase === "em_ajustes" && step.action === enviar) {
      const semArquivoNovo = !anexoAtualizadoDesde(
        e,
        ajuste.categoria,
        ajuste.veredito.respondedAt,
      );
      return semArquivoNovo
        ? {
            rotulo: ROTULO_ACAO,
            tone,
            title: `${Nome} em ajustes`,
            hint: `Falta anexar a nova versão do ${nome}.`,
            semArquivoNovo: true,
            primary: {
              kind: "nova_versao",
              label: "Adicionar nova versão",
              categoria: ajuste.categoria,
            },
            secondary: { label: "Reenviar sem arquivo novo", action: enviar },
          }
        : {
            rotulo: ROTULO_ACAO,
            tone,
            title: `${Nome} em ajustes`,
            hint: "Nova versão anexada — pronta para reenviar.",
            semArquivoNovo: false,
            primary: {
              kind: "ajuste",
              label: "Enviar para aprovação",
              action: enviar,
              step: "reenviar",
            },
          };
    }
    // Sem passo de ajuste válido (ex.: arquivo removido): cai no fluxo normal do motor abaixo.
  }

  const label = step.actionLabel ?? "";
  switch (step.action) {
    case "anexar_roteiro":
      return {
        rotulo: ROTULO_ACAO,
        tone,
        title: "Roteiro pendente",
        primary: { kind: "upload", label, action: "anexar_roteiro", categoria: "Roteiro" },
      };
    case "enviar_roteiro":
      return {
        rotulo: ROTULO_ACAO,
        tone,
        title: "Roteiro pronto para envio",
        primary: { kind: "engine", label: "Enviar para aprovação", action: "enviar_roteiro" },
      };
    case "anexar_conteudo":
      return {
        rotulo: ROTULO_ACAO,
        tone,
        title: "Conteúdo final pendente",
        primary: {
          kind: "upload",
          label,
          action: "anexar_conteudo",
          categoria: "Conteúdo final",
        },
      };
    case "enviar_conteudo":
      return {
        rotulo: ROTULO_ACAO,
        tone,
        title: "Conteúdo final pronto para envio",
        primary: { kind: "engine", label: "Enviar para aprovação", action: "enviar_conteudo" },
      };
    case "reconhecer_ajustes_roteiro":
      return {
        rotulo: ROTULO_ACAO,
        tone,
        title: "Ajustes solicitados no roteiro",
        primary: { kind: "engine", label, action: "reconhecer_ajustes_roteiro" },
      };
    case "reconhecer_ajustes_conteudo":
      return {
        rotulo: ROTULO_ACAO,
        tone,
        title: "Ajustes solicitados no conteúdo final",
        primary: { kind: "engine", label, action: "reconhecer_ajustes_conteudo" },
      };
    case "marcar_publicado":
      return {
        rotulo: ROTULO_ACAO,
        tone,
        title: "Pronto para publicação",
        hint: "Aprovado pelo cliente.",
        primary: { kind: "engine", label, action: "marcar_publicado" },
      };
    default:
      return stage === "CONTEUDO_APROVACAO"
        ? {
            rotulo: ROTULO_ACAO,
            tone,
            title: "Conteúdo final aguardando aprovação do cliente",
            openCategoria: "Conteúdo final",
          }
        : {
            rotulo: ROTULO_ACAO,
            tone,
            title: "Roteiro aguardando aprovação do cliente",
            openCategoria: "Roteiro",
          };
  }
}

/* ---------------- Progresso + prazos ---------------- */

export type StepperStep = {
  key: EntregaFaseColuna;
  label: string;
  state: "done" | "current" | "upcoming";
  /** Data (YYYY-MM-DD) ligada à etapa: recebimento do roteiro, do conteúdo, postagem, publicação. */
  date?: string;
};

/** As 4 fases com o estado REAL (a partir do estágio) e a data de cada uma. Publicada = tudo feito. */
export function entregaStepper(e: Entrega): { steps: StepperStep[]; tone: EntregaTone } {
  const stage: EntregaStage = e.stage ?? "ROTEIRO_PRODUCAO";
  const current = ENTREGA_FASE_COLUNAS.indexOf(entregaFaseColuna(stage));
  const concluida = stage === "PUBLICADA";
  const dates: Record<EntregaFaseColuna, string | undefined> = {
    ROTEIRO: e.dataRecebimentoRoteiro,
    CONTEUDO: e.dataRecebimentoConteudo,
    PUBLICACAO: e.dataPostagem,
    CONCLUIDO: e.publicadoEm,
  };
  return {
    tone: entregaTone(e),
    steps: ENTREGA_FASE_COLUNAS.map((key, i) => ({
      key,
      label: ENTREGA_FASE_COLUNA_LABEL[key],
      state: concluida || i < current ? "done" : i === current ? "current" : "upcoming",
      date: dates[key],
    })),
  };
}

/** Datas editáveis do progresso. Só `dataPostagem` é prazo de verdade; as outras duas são carimbos de
 * recebimento que a pessoa pode ajustar à mão. */
export const PRAZO_CAMPOS = [
  ["dataRecebimentoRoteiro", "Roteiro"],
  ["dataRecebimentoConteudo", "Conteúdo"],
  ["dataPostagem", "Publicação"],
] as const;
export type PrazoCampo = (typeof PRAZO_CAMPOS)[number][0];
export const PRAZO_LABEL: Record<PrazoCampo, string> = {
  dataRecebimentoRoteiro: "Roteiro",
  dataRecebimentoConteudo: "Conteúdo",
  dataPostagem: "Publicação",
};

/** Dias de atraso da PUBLICAÇÃO (data planejada já passou e a entrega não foi publicada), ou `null`.
 * Só a data de publicação é prazo de verdade: as de roteiro/conteúdo são carimbos de recebimento. */
export function publicacaoAtrasoDias(e: Entrega, todayIso: string): number | null {
  const stage: EntregaStage = e.stage ?? "ROTEIRO_PRODUCAO";
  if (stage === "PUBLICADA" || !e.dataPostagem || e.dataPostagem >= todayIso) return null;
  const day = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return Date.UTC(y, (m || 1) - 1, d || 1);
  };
  const diff = Math.round((day(todayIso) - day(e.dataPostagem)) / 86_400_000);
  return diff >= 1 ? diff : null;
}

/* ---------------- Arquivos ---------------- */

export const ARQUIVO_CATEGORIAS_ORDEM: EntregaAnexoCategoria[] = [
  "Roteiro",
  "Conteúdo final",
  "Gravação",
  "Outro",
];
export const ARQUIVO_CATEGORIA_LABEL: Record<EntregaAnexoCategoria, string> = {
  Roteiro: "Roteiro",
  "Conteúdo final": "Conteúdo final",
  Gravação: "Gravação",
  Outro: "Outros arquivos",
};

export type ArquivoVersao = { versao: number; anexos: EntregaAnexo[] };
export type ArquivoGrupo = {
  categoria: EntregaAnexoCategoria;
  /** Versão mais recente: os arquivos IRMÃOS enviados juntos (ex.: as 3 unidades de um Story). */
  atual: ArquivoVersao;
  /** Versões anteriores, da mais nova para a mais antiga. */
  anteriores: ArquivoVersao[];
};

/** Anexos por categoria (na ordem de exibição) com a versão atual separada das anteriores. Só traz
 * categorias que têm arquivo. Categoria antiga ("Conteúdo publicado") é normalizada, e anexo sem
 * `versao` conta como v1. */
export function agruparAnexos(anexos: EntregaAnexo[] | undefined): ArquivoGrupo[] {
  const out: ArquivoGrupo[] = [];
  for (const categoria of ARQUIVO_CATEGORIAS_ORDEM) {
    const daCategoria = (anexos ?? []).filter(
      (a) => legacyAnexoCategoria(a.categoria) === categoria,
    );
    if (daCategoria.length === 0) continue;
    const porVersao = new Map<number, EntregaAnexo[]>();
    for (const a of daCategoria) {
      const v = a.versao ?? 1;
      porVersao.set(v, [...(porVersao.get(v) ?? []), a]);
    }
    const versoes = [...porVersao.entries()]
      .map(([versao, lista]) => ({ versao, anexos: lista }))
      .sort((a, b) => b.versao - a.versao);
    out.push({ categoria, atual: versoes[0], anteriores: versoes.slice(1) });
  }
  return out;
}

/* ---- Quadrados de material ("tiles") ---- */

export type ArquivoTileKey = "Roteiro" | "Gravação" | "Conteúdo final" | "Legenda" | "Outro";
export type ArquivoTile = {
  key: ArquivoTileKey;
  label: string;
  /** "arquivo" tem versões; "legenda" é um texto próprio da entrega. */
  tipo: "arquivo" | "legenda";
  vazio: boolean;
  /** Linha pequena sob o nome: "V2 · atual", "3 arquivos · V1", "Adicionar". */
  estado: string;
  /** Mesma linha para quadrados estreitos (celular): "3 arq. · V1". */
  estadoCurto: string;
  /** Versão atual (maior) — `null` quando vazio ou legenda. */
  versaoAtual: number | null;
  totalVersoes: number;
  /** Arquivos da versão atual (irmãos enviados juntos). */
  atual: EntregaAnexo[];
  /** Há pedido de ajuste do cliente aberto sobre este material. */
  atencao: boolean;
};

const TILE_ARQUIVO: { key: Exclude<ArquivoTileKey, "Legenda">; label: string }[] = [
  { key: "Roteiro", label: "Roteiro" },
  { key: "Gravação", label: "Gravação" },
  { key: "Conteúdo final", label: "Conteúdo final" },
];

/**
 * Os materiais da entrega como quadrados, sempre na mesma ordem: Roteiro, Gravação, Conteúdo final e
 * Legenda; "Outros arquivos" só aparece quando existe algum arquivo dessa categoria. Um material sem
 * nada vira o quadrado vazio ("Adicionar").
 */
export function tilesDaEntrega(
  e: Pick<Entrega, "anexos" | "legenda">,
  ajusteCategoria?: EntregaAnexoCategoria,
): ArquivoTile[] {
  const grupos = agruparAnexos(e.anexos);
  const doArquivo = (key: Exclude<ArquivoTileKey, "Legenda">, label: string): ArquivoTile => {
    const g = grupos.find((x) => x.categoria === key);
    if (!g) {
      return {
        key,
        label,
        tipo: "arquivo",
        vazio: true,
        estado: "Adicionar",
        estadoCurto: "Adicionar",
        versaoAtual: null,
        totalVersoes: 0,
        atual: [],
        atencao: key === ajusteCategoria,
      };
    }
    const n = g.atual.anexos.length;
    return {
      key,
      label,
      tipo: "arquivo",
      vazio: false,
      estado: n > 1 ? `${n} arquivos · V${g.atual.versao}` : `V${g.atual.versao} · atual`,
      estadoCurto: n > 1 ? `${n} arq. · V${g.atual.versao}` : `V${g.atual.versao} · atual`,
      versaoAtual: g.atual.versao,
      totalVersoes: 1 + g.anteriores.length,
      atual: g.atual.anexos,
      atencao: key === ajusteCategoria,
    };
  };
  const tiles: ArquivoTile[] = TILE_ARQUIVO.map((t) => doArquivo(t.key, t.label));
  const temLegenda = !!e.legenda?.trim();
  tiles.push({
    key: "Legenda",
    label: "Legenda",
    tipo: "legenda",
    vazio: !temLegenda,
    estado: temLegenda ? "Adicionada" : "Adicionar",
    estadoCurto: temLegenda ? "Adicionada" : "Adicionar",
    versaoAtual: null,
    totalVersoes: 0,
    atual: [],
    atencao: false,
  });
  if (grupos.some((g) => g.categoria === "Outro"))
    tiles.push(doArquivo("Outro", "Outros arquivos"));
  return tiles;
}

export const versaoDoAnexo = (a: Pick<EntregaAnexo, "versao">): number => a.versao ?? 1;

/** Troca, NO LUGAR, o arquivo de um anexo (mesma categoria, mesma versão, mesma posição): é a
 * correção de um arquivo errado, não uma nova versão. Para guardar o histórico, use
 * `addAnexosComVersao`. */
export function substituirArquivo(
  anexos: EntregaAnexo[],
  anexoId: string,
  novo: { nome: string; url: string },
  now: Date = new Date(),
): EntregaAnexo[] {
  return anexos.map((a) =>
    a.id !== anexoId
      ? a
      : {
          ...a,
          id: crypto.randomUUID(),
          nome: novo.nome,
          url: novo.url,
          criadoEm: formatDateToIso(now),
          criadoEmTs: now.toISOString(),
        },
  );
}

/** Remove todos os arquivos de UMA versão de uma categoria (a anterior passa a ser a atual). */
export function removerVersao(
  anexos: EntregaAnexo[],
  categoria: EntregaAnexoCategoria,
  versao: number,
): EntregaAnexo[] {
  return anexos.filter(
    (a) => !(legacyAnexoCategoria(a.categoria) === categoria && versaoDoAnexo(a) === versao),
  );
}

export type ArquivoTipo = "imagem" | "video" | "pdf" | "texto" | "outro";
export function arquivoTipo(nome: string): ArquivoTipo {
  if (/\.(png|jpe?g|gif|webp|svg|heic)$/i.test(nome)) return "imagem";
  if (/\.(mp4|mov|webm|m4v|avi|mkv)$/i.test(nome)) return "video";
  if (/\.pdf$/i.test(nome)) return "pdf";
  if (/\.(txt|md|doc|docx|rtf)$/i.test(nome)) return "texto";
  return "outro";
}
export const ARQUIVO_TIPO_LABEL: Record<ArquivoTipo, string> = {
  imagem: "Imagem",
  video: "Vídeo",
  pdf: "PDF",
  texto: "Texto",
  outro: "Arquivo",
};

/* ---------------- Legenda ---------------- */

/** Canal editorial (limite de caracteres da legenda) a partir do nome da rede do influenciador. */
export function legendaCanal(plataforma?: string): EditorialChannel {
  switch ((plataforma ?? "").trim().toLowerCase()) {
    case "instagram":
      return "instagram";
    case "tiktok":
      return "tiktok";
    case "youtube":
      return "youtube";
    case "linkedin":
      return "linkedin";
    case "x":
    case "twitter":
      return "x";
    case "facebook":
      return "facebook";
    default:
      return "outro";
  }
}

/* ---------------- Publicação ---------------- */

/** Métricas preenchidas, em texto curto ("5,2 milhões views", "98 mil curtidas"). */
export function metricasResumo(m: PostMetrics | undefined): string[] {
  if (!m) return [];
  const items: [number | undefined, string][] = [
    [m.views, "views"],
    [m.likes, "curtidas"],
    [m.comments, "comentários"],
    [m.shares, "compartilhamentos"],
    [m.saves, "salvos"],
    [m.reach, "alcance"],
  ];
  return items
    .filter(([n]) => n != null && !Number.isNaN(n))
    .map(([n, label]) => `${formatCompactNumber(n)} ${label}`);
}

/* ---------------- Histórico ---------------- */

/** Eventos da Atividade que pertencem a esta entrega, do mais recente ao mais antigo. Casa por
 * `entregaId`; só eventos antigos (sem o id) caem no casamento por trecho do tipo. */
export function historicoDaEntrega(
  activity: InfluActivity[] | undefined,
  e: Pick<Entrega, "id" | "tipo">,
): InfluActivity[] {
  return (activity ?? [])
    .filter((a) =>
      a.entregaId
        ? a.entregaId === e.id
        : a.action.toLowerCase().includes((e.tipo ?? "").toLowerCase()),
    )
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/** Texto do evento para a visão da PRÓPRIA entrega: sem o motivo do feedback (ele já está no bloco de
 * feedback) e sem o sufixo ` — "Reels"` que o log acrescenta (aqui o contexto já é a entrega). */
export function historicoTexto(action: string): string {
  return historyActionText(action).replace(/\s+—\s+"[^"]*"\s*$/, "");
}

/** Link do post pronto para `href`: aceita http(s) ou um domínio sem esquema ("instagram.com/reel/x");
 * qualquer outra coisa (texto solto, `javascript:`…) não vira link. */
export function linkDoPost(raw: string | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v || /\s/.test(v)) return null;
  if (/^https?:\/\//i.test(v)) return v;
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return null;
  return /^[^./]+(\.[^./]+)+(\/.*)?$/i.test(v) ? `https://${v}` : null;
}
