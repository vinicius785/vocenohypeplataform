import { classifyOutcome } from "@/lib/performance-engine";
import { todayIsoInBrasilia } from "@/lib/timezone";
import type { TaskBlockCategory } from "@/lib/projetos";
import { mk, type TeamInsightV2 } from "./team-insights-v2";

/**
 * Insights do Time calculados sobre as TAREFAS (complementam `team-insights-v2.ts`, que trabalha
 * sobre agregados do Score): reincidência de atraso nas últimas conclusões, concentração de prazos
 * próximos, concentração de entregas críticas e bloqueios/aprovações acumulados. Funções puras, sem
 * I/O e sem fonte nova: usam os campos de `DashTaskFlat` que a página já carrega. "No prazo" usa
 * `classifyOutcome` e o prazo VIGENTE (`performanceDueDate ?? dueDate`), a mesma regra do Score.
 *
 * Honestidade: volume NÃO é sobrecarga; bloqueio externo NÃO é falha de execução; sem amostra mínima,
 * sem insight; o fato fica em `evidence` e a hipótese em `caveat`.
 */

export const TASK_INSIGHT_THRESHOLDS = {
  /** Últimas N conclusões avaliadas (e as N anteriores, para comparar). */
  janelaConclusoes: 5,
  /** Só conclusões dos últimos N dias descrevem o momento atual. */
  conclusoesDias: 60,
  reincidenciaMinAtrasos: 4,
  /** Prazos "próximos" = hoje até hoje + N dias. */
  proximosDias: 3,
  acumuloMinVencidas: 3,
  acumuloMinProximas: 3,
  criticasProximasMin: 3,
  criticasConcorrentesMinAtrasosRecentes: 3,
  concentracaoCriticasMin: 6,
  concentracaoCriticasMinPessoas: 3,
  concentracaoCriticasPct: 0.7,
  concentracaoCriticasDias: 30,
  bloqueiosExternosMin: 3,
  aprovacoesMin: 6,
  aprovacoesPctAbertas: 0.25,
} as const;
export type TaskInsightThresholds = {
  -readonly [K in keyof typeof TASK_INSIGHT_THRESHOLDS]: number;
};
const th = (o?: Partial<TaskInsightThresholds>): TaskInsightThresholds => ({
  ...TASK_INSIGHT_THRESHOLDS,
  ...o,
});

/** Tarefa já resolvida para ids de membro (a ponte nome→id é `memberIdResolver`). */
export type InsightTask = {
  id: string;
  title: string;
  status: string;
  priority?: string;
  /** Prazo VIGENTE ("YYYY-MM-DD"): `performanceDueDate ?? dueDate`, a mesma referência do Score. */
  dueISO?: string;
  completedAt?: string;
  /** Mesma classificação do Score/Início (`bucketFor`, corte das 19h). Ausente = compara só a data. */
  bucket?: "hoje" | "amanha" | "semana" | "atrasada" | "outro";
  blockCategory?: TaskBlockCategory;
  /** Bloqueio ativo que pausa o prazo: o atraso deixa de ser de execução. */
  deadlinePaused?: boolean;
  assigneeIds: string[];
};

export type MemberTaskStats = {
  id: string;
  name: string;
  /** Conclusões recentes (mais novas primeiro) e as anteriores a elas; `late` = depois do corte. */
  recent: { late: boolean }[];
  previous: { late: boolean }[];
  /** Abertas vencidas e NÃO bloqueadas (bloqueio é tratado à parte, nunca como falha de execução). */
  overdueExec: number;
  overdueBlocked: number;
  dueSoon: number;
  dueSoonCritical: number;
};

export type TaskInsightSignals = {
  members: MemberTaskStats[];
  /** Tarefas críticas (Urgente/Alta) abertas ou concluídas na janela, por membro. */
  criticalByMember: { id: string; name: string; count: number }[];
  criticalTotal: number;
  /** Abertas bloqueadas por motivo. */
  blockedByCategory: Map<TaskBlockCategory, number>;
  openTotal: number;
  inApproval: number;
};

const CRITICAL = new Set(["Urgente", "Alta"]);
const OPEN = new Set([
  "Aberto",
  "Em andamento",
  "Em aprovação",
  "Em ajustes",
  "Aprovado",
  "Bloqueada",
]);
/** Bloqueios cuja causa está fora do executor (cliente, fornecedor, aprovação, informação). */
export const EXTERNAL_BLOCKS: ReadonlySet<TaskBlockCategory> = new Set<TaskBlockCategory>([
  "aguardando_cliente",
  "aguardando_fornecedor",
  "aguardando_aprovacao",
  "falta_informacao",
]);
const BLOCK_LABEL: Partial<Record<TaskBlockCategory, string>> = {
  aguardando_cliente: "cliente",
  aguardando_fornecedor: "fornecedor",
  aguardando_aprovacao: "aprovação",
  falta_informacao: "informação",
};

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const first = (name: string) => name.split(" ")[0];
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const validTs = (iso?: string) => (iso && !Number.isNaN(new Date(iso).getTime()) ? iso : null);
/** Dia da conclusão em Brasília (não em UTC): as janelas de 30/60 dias são contadas em dias locais. */
const dayInBrasilia = (iso: string) => todayIsoInBrasilia(new Date(iso));

/** Monta os sinais por tarefa. `todayIso` é o dia em Brasília (`todayIsoInBrasilia`). */
export function buildTaskInsightSignals(
  tasks: InsightTask[],
  members: { id: string; name: string }[],
  todayIso: string,
  o?: Partial<TaskInsightThresholds>,
): TaskInsightSignals {
  const T = th(o);
  // Mesmo id duplicado conta uma vez; conclusão sem data válida não entra (não dá para ordenar/avaliar).
  const seen = new Set<string>();
  const uniq = tasks.filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)));
  const soonEnd = addDays(todayIso, T.proximosDias);
  const doneSince = addDays(todayIso, -T.conclusoesDias);
  const critSince = addDays(todayIso, -T.concentracaoCriticasDias);
  const names = new Map(members.map((m) => [m.id, m.name]));

  const stats = new Map<string, MemberTaskStats>(
    members.map((m) => [
      m.id,
      {
        id: m.id,
        name: m.name,
        recent: [],
        previous: [],
        overdueExec: 0,
        overdueBlocked: 0,
        dueSoon: 0,
        dueSoonCritical: 0,
      },
    ]),
  );
  const done = new Map<string, { at: string; late: boolean }[]>();
  const crit = new Map<string, number>();
  const blockedByCategory = new Map<TaskBlockCategory, number>();
  let openTotal = 0;
  let inApproval = 0;
  let criticalTotal = 0;

  for (const t of uniq) {
    const owners = t.assigneeIds.filter((id) => stats.has(id));
    const isOpen = OPEN.has(t.status);
    const critical = !!t.priority && CRITICAL.has(t.priority);
    if (isOpen) {
      openTotal += 1;
      if (t.status === "Em aprovação") inApproval += 1;
      if (t.blockCategory) {
        blockedByCategory.set(t.blockCategory, (blockedByCategory.get(t.blockCategory) ?? 0) + 1);
      }
    }
    const completedAt = t.status === "Concluído" ? validTs(t.completedAt) : null;
    if (critical && owners.length) {
      const inWindow = isOpen || (completedAt && dayInBrasilia(completedAt) >= critSince);
      if (inWindow) {
        criticalTotal += 1;
        for (const id of owners) crit.set(id, (crit.get(id) ?? 0) + 1);
      }
    }
    for (const id of owners) {
      const s = stats.get(id)!;
      if (completedAt && t.dueISO && dayInBrasilia(completedAt) >= doneSince) {
        const late = classifyOutcome(t.dueISO, completedAt).outcome === "late";
        const arr = done.get(id) ?? [];
        arr.push({ at: completedAt, late });
        done.set(id, arr);
      }
      if (isOpen && t.dueISO) {
        // "Vencida" segue o Score (`bucket`, corte das 19h); sem bucket, compara só a data.
        const overdue = t.bucket ? t.bucket === "atrasada" : t.dueISO < todayIso;
        const aside = !!t.blockCategory || !!t.deadlinePaused;
        if (overdue) {
          // com bloqueio ativo o atraso não é de execução: fica fora da conta
          if (aside) s.overdueBlocked += 1;
          else s.overdueExec += 1;
        } else if (t.dueISO <= soonEnd && !aside) {
          s.dueSoon += 1;
          if (critical) s.dueSoonCritical += 1;
        }
      }
    }
  }
  for (const [id, arr] of done) {
    const s = stats.get(id)!;
    arr.sort((a, b) => b.at.localeCompare(a.at));
    s.recent = arr.slice(0, T.janelaConclusoes).map((x) => ({ late: x.late }));
    s.previous = arr
      .slice(T.janelaConclusoes, T.janelaConclusoes * 2)
      .map((x) => ({ late: x.late }));
  }
  return {
    members: [...stats.values()],
    criticalByMember: [...crit.entries()]
      .map(([id, count]) => ({ id, name: names.get(id) ?? "", count }))
      .sort((a, b) => b.count - a.count),
    criticalTotal,
    blockedByCategory,
    openTotal,
    inApproval,
  };
}

const lateOf = (xs: { late: boolean }[]) => xs.filter((x) => x.late).length;

/** A. Reincidência: a maioria das últimas conclusões estourou o prazo vigente (e não é igual ao que
 * já vinha acontecendo). Um atraso isolado nunca gera insight. */
export function ruleReincidenciaAtraso(
  m: MemberTaskStats,
  o?: Partial<TaskInsightThresholds>,
): TeamInsightV2 | null {
  const T = th(o);
  if (m.recent.length < T.janelaConclusoes) return null;
  const late = lateOf(m.recent);
  if (late < T.reincidenciaMinAtrasos) return null;
  const hasPrev = m.previous.length >= T.janelaConclusoes;
  const prevLate = hasPrev ? lateOf(m.previous) : null;
  // já era assim antes: não repete o alerta sem mudança relevante
  if (prevLate != null && prevLate >= late) return null;
  const n = m.recent.length;
  const comparacao = prevLate != null ? ` Nas ${n} anteriores, foram ${prevLate}.` : "";
  return mk({
    ruleId: "reincidencia_atraso",
    rank: 3,
    topic: "prazo",
    category: "tendencia",
    priority: late === n && m.overdueExec > 0 ? 0 : 1,
    memberId: m.id,
    memberName: m.name,
    evidence: `${late} das últimas ${n} tarefas concluídas por ${m.name} ultrapassaram o prazo vigente.${comparacao}`,
    reading:
      prevLate != null
        ? "Previsibilidade pior que nas entregas anteriores; confirme prazos realistas antes de atribuir entrega crítica."
        : "A maioria das entregas recentes passou do prazo vigente; confirme prazos realistas antes de atribuir entrega crítica.",
    caveat: `Amostra de ${n} conclusões${prevLate == null ? ", sem conclusões anteriores para comparar" : ""}; não separa atraso por bloqueio externo.`,
    view: "tarefas",
    actionLabel: `Ver tarefas de ${first(m.name)}`,
    weight: late - (prevLate ?? 0),
    window: "últimas 5 conclusões · até 60 dias",
  });
}

/** B. Risco de novos atrasos: vencidas (sem bloqueio) somadas a muitos prazos próximos, ou entregas
 * críticas concorrentes COM sinal de dificuldade recente. Quantidade sozinha não gera alerta. */
export function ruleRiscoAcumulo(
  m: MemberTaskStats,
  o?: Partial<TaskInsightThresholds>,
): TeamInsightV2 | null {
  const T = th(o);
  const acumulo = m.overdueExec >= T.acumuloMinVencidas && m.dueSoon >= T.acumuloMinProximas;
  const lateRecent = m.recent.length >= T.janelaConclusoes ? lateOf(m.recent) : 0;
  const concorrentes =
    m.dueSoonCritical >= T.criticasProximasMin &&
    (m.overdueExec >= 1 || lateRecent >= T.criticasConcorrentesMinAtrasosRecentes);
  if (!acumulo && !concorrentes) return null;
  const dias = T.proximosDias;
  const partes = [
    `${m.name} tem ${plural(m.overdueExec, "tarefa vencida", "tarefas vencidas")} sem bloqueio`,
    `${plural(m.dueSoon, "entrega", "entregas")} com prazo nos próximos ${dias} dias` +
      (m.dueSoonCritical > 0 ? ` (${m.dueSoonCritical} de prioridade alta/urgente)` : ""),
  ];
  const bloq =
    m.overdueBlocked > 0
      ? ` ${plural(m.overdueBlocked, "outra vencida está", "outras vencidas estão")} bloqueada${m.overdueBlocked === 1 ? "" : "s"} e não entra${m.overdueBlocked === 1 ? "" : "m"} nesta conta.`
      : "";
  return mk({
    ruleId: "risco_acumulo",
    rank: 2,
    topic: "prazo",
    category: "atencao",
    priority: acumulo && m.dueSoonCritical > 0 ? 0 : 1,
    memberId: m.id,
    memberName: m.name,
    evidence: `${partes.join(" e ")}.${bloq}`,
    reading:
      "Risco de novos atrasos pela concentração de prazos; revise prioridades antes que as próximas vençam.",
    caveat: "Quantidade de tarefas não prova falta de capacidade.",
    view: "tarefas",
    actionLabel: `Ver tarefas de ${first(m.name)}`,
    weight: m.overdueExec + m.dueSoon,
    window: "situação atual",
  });
}

/** E. Concentração de entregas críticas em uma pessoa (risco operacional, não acusação). */
export function ruleConcentracaoCriticas(
  s: TaskInsightSignals,
  o?: Partial<TaskInsightThresholds>,
): TeamInsightV2 | null {
  const T = th(o);
  if (s.criticalTotal < T.concentracaoCriticasMin) return null;
  if (s.criticalByMember.length < T.concentracaoCriticasMinPessoas) return null;
  const top = s.criticalByMember[0];
  if (!top || top.count / s.criticalTotal < T.concentracaoCriticasPct) return null;
  return mk({
    ruleId: "concentracao_criticas",
    rank: 5,
    topic: "concentracao_criticas",
    category: "operacao",
    priority: 1,
    memberId: top.id,
    memberName: top.name,
    evidence: `${top.count} das ${s.criticalTotal} tarefas de prioridade alta/urgente (abertas ou concluídas nos últimos ${T.concentracaoCriticasDias} dias) estão com ${top.name}.`,
    reading:
      "Se a disponibilidade dela diminuir, as entregas críticas ficam expostas; avalie quem mais pode assumir.",
    caveat: "Pode refletir a função da pessoa; avalie antes de redistribuir.",
    view: "tarefas",
    actionLabel: `Ver tarefas de ${first(top.name)}`,
    weight: top.count,
    window: `abertas + concluídas em ${T.concentracaoCriticasDias} dias`,
  });
}

/** G. Problemas de processo: bloqueios por causas externas e fila de aprovação acumulada. */
export function ruleBloqueiosSistemicos(
  s: TaskInsightSignals,
  o?: Partial<TaskInsightThresholds>,
): TeamInsightV2[] {
  const T = th(o);
  const out: TeamInsightV2[] = [];
  const ext = [...s.blockedByCategory.entries()].filter(([c]) => EXTERNAL_BLOCKS.has(c));
  const extTotal = ext.reduce((n, [, v]) => n + v, 0);
  if (extTotal >= T.bloqueiosExternosMin) {
    const ordenado = ext.sort((a, b) => b[1] - a[1]);
    const detalhe =
      ordenado.length === 1
        ? `todas aguardando ${BLOCK_LABEL[ordenado[0][0]] ?? ordenado[0][0]}`
        : ordenado.map(([c, v]) => `${v} aguardando ${BLOCK_LABEL[c] ?? c}`).join(", ");
    out.push(
      mk({
        ruleId: "bloqueios_externos",
        rank: 6,
        topic: "bloqueios_externos",
        category: "operacao",
        priority: 2,
        evidence: `${plural(extTotal, "tarefa aberta está", "tarefas abertas estão")} bloqueada${extTotal === 1 ? "" : "s"} por causas externas ao time: ${detalhe}.`,
        reading:
          "Atraso que não é de execução: cobre as respostas pendentes e defina prazos com clientes e aprovadores.",
        weight: extTotal,
        window: "situação atual",
      }),
    );
  }
  if (
    s.inApproval >= T.aprovacoesMin &&
    s.openTotal > 0 &&
    s.inApproval / s.openTotal >= T.aprovacoesPctAbertas
  ) {
    out.push(
      mk({
        ruleId: "aprovacoes_acumuladas",
        rank: 6,
        topic: "aprovacoes",
        category: "operacao",
        priority: 2,
        evidence: `${s.inApproval} das ${s.openTotal} tarefas abertas (${Math.round((s.inApproval / s.openTotal) * 100)}%) estão em aprovação.`,
        reading:
          "A aprovação concentra o fluxo; veja se há aprovadores acumulando ou critérios pouco claros.",
        caveat: "Os dados não têm há quanto tempo cada tarefa espera aprovação.",
        weight: s.inApproval,
        window: "situação atual",
      }),
    );
  }
  return out;
}

/** Todas as regras por tarefa, para o hook acrescentar aos candidatos antes do ranking. */
export function generateTaskInsights(
  s: TaskInsightSignals,
  o?: Partial<TaskInsightThresholds>,
): TeamInsightV2[] {
  const out: TeamInsightV2[] = [];
  for (const m of s.members) {
    for (const r of [ruleReincidenciaAtraso(m, o), ruleRiscoAcumulo(m, o)]) if (r) out.push(r);
  }
  const c = ruleConcentracaoCriticas(s, o);
  if (c) out.push(c);
  out.push(...ruleBloqueiosSistemicos(s, o));
  return out;
}
