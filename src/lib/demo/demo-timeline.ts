import type { Influ, InfluActivityEvent } from "@/lib/influencer-model";
import type { DemoEventRow } from "./demo-types";

/**
 * Narrativa da Demo — MODELO DE LEITURA (puro). Não grava nada e não cria log novo: junta o
 * que o produto já registra (`Influ.activityEvents`, tipados, e `Influ.activity`, texto do
 * time) com o ciclo de vida da demo (`demo_events`) e o escreve em frases ("Cliente reprovou
 * Beatriz Costa"), da mais recente para a mais antiga.
 */

export type DemoTimelineActor = "cliente" | "equipe" | "sistema";

export type DemoTimelineEntry = {
  id: string;
  at: string;
  actor: DemoTimelineActor;
  text: string;
  /** Complemento (motivo, comentário). */
  detail?: string;
};

/** Duas anotações do mesmo ator dentro desta janela contam como a MESMA ação (o produto grava
 * `activity` e `activityEvents` juntos, com milissegundos de diferença). */
const SAME_ACTION_WINDOW_MS = 5_000;

const LIFECYCLE_TEXT: Record<DemoEventRow["kind"], string> = {
  criada: "Demonstração criada",
  reiniciada: "Demonstração reiniciada",
  encerrada: "Demonstração encerrada",
  acesso_revogado: "Acesso do cliente revogado",
  acesso_renovado: "Validade do link renovada",
  link_gerado: "Novo link gerado",
  cliente_abriu_link: "Cliente abriu o link",
};

function actorOf(e: InfluActivityEvent): DemoTimelineActor {
  return e.actor.type === "cliente" ? "cliente" : "equipe";
}

function describeEvent(e: InfluActivityEvent, influ: Influ): { text: string; detail?: string } {
  const nome = influ.nome;
  const entrega = e.entregaId ? influ.entregas.find((x) => x.id === e.entregaId) : undefined;
  const alvo = entrega ? `${nome} — ${entrega.titulo || entrega.tipo}` : nome;
  const versao = e.versao && e.versao > 1 ? ` #${String(e.versao).padStart(2, "0")}` : "";
  const reenvio = e.versao && e.versao > 1 ? "reenviou" : "enviou";

  switch (e.kind) {
    case "perfil_enviado":
      return { text: `Time enviou ${nome} ao cliente` };
    case "perfil_aprovado":
      return { text: `Cliente aprovou ${nome}` };
    case "perfil_recusado":
      return {
        text: `Cliente reprovou ${nome}`,
        detail: e.motivoLabel ?? e.motivo ?? e.comentario,
      };
    case "perfil_reaberto":
      return { text: `Cliente reabriu a decisão sobre ${nome}` };
    case "roteiro_enviado":
      return { text: `Time ${reenvio} o roteiro${versao} de ${alvo}` };
    case "roteiro_aprovado":
      return { text: `Cliente aprovou o roteiro de ${alvo}` };
    case "roteiro_ajustes_solicitados":
      return { text: `Cliente pediu ajuste no roteiro de ${alvo}`, detail: e.comentario };
    case "conteudo_enviado":
      return { text: `Time ${reenvio} o conteúdo${versao} de ${alvo}` };
    case "conteudo_aprovado":
      return { text: `Cliente aprovou o conteúdo de ${alvo}` };
    case "conteudo_ajustes_solicitados":
      return { text: `Cliente pediu ajuste no conteúdo de ${alvo}`, detail: e.comentario };
    case "publicado":
      return { text: `Time marcou como publicado: ${alvo}` };
    case "observacao_cliente":
      return { text: `Cliente deixou uma observação sobre ${nome}`, detail: e.comentario };
    case "comentario_cliente":
      return { text: `Cliente comentou em ${nome}`, detail: e.comentario };
    case "comentario_equipe":
      return { text: `Time comentou em ${nome}`, detail: e.comentario };
    default:
      return { text: `Atividade em ${nome}` };
  }
}

export function buildDemoTimeline(
  influs: ReadonlyArray<Influ>,
  lifecycle: ReadonlyArray<DemoEventRow> = [],
  limit = 60,
): DemoTimelineEntry[] {
  const out: DemoTimelineEntry[] = [];

  for (const influ of influs) {
    const events = influ.activityEvents ?? [];
    for (const e of events) {
      const { text, detail } = describeEvent(e, influ);
      out.push({ id: `evt:${e.id}`, at: e.createdAt, actor: actorOf(e), text, detail });
    }

    // Anotações de texto do time que NÃO têm um evento tipado correspondente (ex.: ações do
    // time que só gravam `activity`) entram como estão — nada é inventado.
    for (const a of influ.activity ?? []) {
      const at = Date.parse(a.createdAt);
      const covered = events.some(
        (e) => Math.abs(Date.parse(e.createdAt) - at) <= SAME_ACTION_WINDOW_MS,
      );
      if (covered) continue;
      out.push({
        id: `act:${a.id}`,
        at: a.createdAt,
        actor: "equipe",
        text: `${a.author} ${a.action} (${influ.nome})`,
      });
    }
  }

  for (const l of lifecycle) {
    out.push({
      id: `life:${l.id}`,
      at: l.created_at,
      actor: l.kind === "cliente_abriu_link" ? "cliente" : "sistema",
      text: LIFECYCLE_TEXT[l.kind] ?? "Evento da demonstração",
    });
  }

  return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

/** `dd/mm HH:mm` no fuso de Brasília. */
export function formatActivityWhen(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  return new Date(t).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}
