import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { DashTask } from "@/lib/task-aggregation";
import type { Member } from "@/components/TimeSection";

// `member-ui`/`chat-store` puxam o client do Supabase no import; aqui só
// interessa a marcação renderizada, então a presença é stubada.
vi.mock("@/components/team/member-ui", () => ({
  avatarAccent: () => "",
  initialsOf: (n: string, f: string) => (n || f || "?").slice(0, 1).toUpperCase(),
  getStatus: () => "online",
  PresenceDot: () => null,
  MiniStat: ({ label, value }: { label: string; value: string | number }) => (
    <div>
      {label}:{value}
    </div>
  ),
}));
vi.mock("@/lib/chat-store", () => ({
  STATUS_LABEL: { online: "Disponível", away: "Ausente", offline: "Offline" },
}));
vi.mock("@/components/tasks/TaskBoard", () => ({
  PRIORITY_TONE: { Urgente: "", Alta: "", Normal: "", Baixa: "" },
  TASK_STATUS_TONE: { Aberto: "", Concluído: "", "Em andamento": "" },
}));

const { TimeMembersTable } = await import("./TimeMembersTable");
const { TimeSummaryStrip } = await import("./TimeSummaryStrip");
const { OverviewView, PerformanceView, TasksView, DependenciesView, HistoryView } =
  await import("./MemberViews");
const { CommunicationView } = await import("./MemberCommunication");
const { buildMemberRows, sortMemberRows, matchesFilters } = await import("./member-rows");
const { assessLoad } = await import("./member-metrics");
const { memberTaskStats } = await import("./time-v2-utils");
const { communicationReading, scoreView, blockedRows } = await import("./member-v2");

const LONG_NAME = "Gustavo Rogério de Souza de Freitas da Silva Albuquerque Vasconcelos Neto";
const LONG_ROLE = "Head de Estratégia, Operações e Relacionamento com Influenciadores e Parceiros";

const member = (over: Partial<Member>): Member => ({
  id: "u1",
  name: "Ana",
  role: "Designer",
  birthday: "",
  salary: "",
  email: "ana@x.com",
  permissions: [],
  timeView: ["name", "role"],
  ...over,
});

const task = (over: Partial<DashTask>): DashTask =>
  ({
    id: "t",
    projectId: "p",
    projectName: "Projeto",
    title: "Tarefa",
    bucket: "outro",
    due: "",
    status: "Aberto",
    ...over,
  }) as DashTask;

const viewer = { isAdmin: false, meId: null };

function rowsFor(members: Member[], tasks = new Map<string, DashTask[]>()) {
  return buildMemberRows(members, {
    viewer,
    tasksByMember: tasks,
    scoreByMemberId: new Map(),
    periodByMemberId: new Map(),
    responseByMemberId: null,
  });
}

function renderTable(
  members: Member[],
  tasks = new Map<string, DashTask[]>(),
  opts: { totalMembers?: number; filtered?: boolean } = {},
) {
  return renderToStaticMarkup(
    <TooltipProvider>
      <TimeMembersTable
        rows={rowsFor(members, tasks)}
        sort={{ key: "nome", dir: "asc" }}
        onSort={() => {}}
        loading={false}
        totalMembers={opts.totalMembers ?? members.length}
        filtered={opts.filtered ?? false}
        onOpenMember={() => {}}
      />
    </TooltipProvider>,
  );
}

describe("TimeMembersTable (dados extremos)", () => {
  it("nome e cargo muito longos truncam (min-w-0 + truncate), sem quebrar a linha", () => {
    const html = renderTable([member({ id: "a", name: LONG_NAME, role: LONG_ROLE })]);
    expect(html).toContain(LONG_NAME);
    expect(html).toMatch(/min-w-0 truncate[^"]*"[^>]*>Gustavo/);
    expect(html).toContain("Abrir perfil de");
  });

  it("estado vazio: base vazia vs. busca sem resultado têm mensagens diferentes", () => {
    expect(renderTable([], undefined, { totalMembers: 0 })).toContain("Nenhum membro cadastrado");
    expect(renderTable([], undefined, { totalMembers: 3, filtered: true })).toContain(
      "Nenhum membro encontrado com esses filtros",
    );
  });

  it("nome oculto (timeView sem 'name') aparece como 'Membro', nunca vaza o nome real", () => {
    const html = renderTable([member({ id: "b", name: "Segredo Silva", timeView: [] })]);
    expect(html).not.toContain("Segredo Silva");
    expect(html).toContain("Membro");
  });

  it("conta abertas/atrasadas só de tarefas abertas", () => {
    const m = member({ id: "c", name: "Carla" });
    const html = renderTable(
      [m],
      new Map([
        [
          "Carla",
          [
            task({ bucket: "atrasada" }),
            task({ bucket: "hoje" }),
            task({ bucket: "atrasada", status: "Concluído" }),
          ],
        ],
      ]),
    );
    expect(html).toContain("2 abertas");
    expect(html).toContain("1 atrasadas");
    expect(html).toContain("Atenção"); // carga: 1 atrasada
  });

  it("ordenação: sem dado vai pro fim nas duas direções; padrão por nome", () => {
    const rows = rowsFor([
      member({ id: "a", name: "Bia" }),
      member({ id: "b", name: "Ana" }),
      member({ id: "c", name: "Caio" }),
    ]).map((r) => ({
      ...r,
      onTimePct: r.member.id === "a" ? null : r.member.id === "b" ? 50 : 90,
    }));
    expect(sortMemberRows(rows, { key: "nome", dir: "asc" }).map((r) => r.name)).toEqual([
      "Ana",
      "Bia",
      "Caio",
    ]);
    expect(sortMemberRows(rows, { key: "noPrazo", dir: "desc" }).map((r) => r.name)).toEqual([
      "Caio",
      "Ana",
      "Bia",
    ]);
    expect(sortMemberRows(rows, { key: "noPrazo", dir: "asc" }).map((r) => r.name)).toEqual([
      "Ana",
      "Caio",
      "Bia",
    ]);
  });
});

describe("TimeSummaryStrip", () => {
  it("responde agora (abertas/hoje/atrasadas/bloqueadas) e no período (concluídas/prazo) — resposta NÃO é KPI de tarefas", () => {
    const html = renderToStaticMarkup(
      <TimeSummaryStrip
        openCount={12}
        dueTodayCount={3}
        overdueCount={5}
        blockedCount={2}
        blockedHint="2 aguardando cliente"
        completedCount={9}
        onTimePct={87.4}
        onTimeSample={15}
        periodLabel="Neste mês"
        onOpenHoje={() => {}}
        onOpenAtrasadas={() => {}}
        onOpenBloqueadas={() => {}}
      />,
    );
    for (const s of [
      "Abertas",
      "Vencem hoje",
      "Atrasadas",
      "Bloqueadas",
      "2 aguardando cliente",
      "Neste mês",
      "Concluídas",
      "87%",
      "15 conclusões avaliadas",
    ]) {
      expect(html).toContain(s);
    }
    expect(html).not.toMatch(/Resposta/);
  });
  it("sem conclusões no período mostra travessão, nunca 0%", () => {
    const html = renderToStaticMarkup(
      <TimeSummaryStrip
        openCount={0}
        dueTodayCount={0}
        overdueCount={0}
        blockedCount={0}
        blockedHint={null}
        completedCount={0}
        onTimePct={null}
        onTimeSample={0}
        periodLabel="Nesta semana"
        onOpenHoje={() => {}}
        onOpenAtrasadas={() => {}}
        onOpenBloqueadas={() => {}}
      />,
    );
    expect(html).toContain("Sem conclusões avaliadas");
    expect(html).not.toContain("0%");
  });
});

const agg = {
  pctNoPrazo: null,
  pctComAtraso: null,
  atualmenteAtrasadas: 0,
  tempoMedioAtrasoDias: null,
  qtdReplanejamentos: 0,
  qtdReplanejamentosNoDia: 0,
  pctComPrazoAlterado: null,
  motivosMaisComuns: [],
  pctDependenciaExterna: null,
};
const noCycle = {
  completedInRange: 0,
  cycleDays: null,
  cycleSample: 0,
  leadDays: null,
  leadSample: 0,
};
const baseScore = {
  score: null,
  dataState: "sem_dados",
  amostra: 0,
  confidence: "sem_dados",
  classificacao: null,
} as never;
const perfProps = {
  score: baseScore,
  trendLabel: null,
  panel: null,
  agg,
  aggPrevious: agg,
  aggPrevious2: agg,
  completed: 0,
  lateCount: 0,
  previousCompleted: 0,
  previous2Completed: 0,
  overdueNow: 0,
  replan: { tasksReplanned: 0, taskBase: 0, before: 0, after: 0 },
  cycle: noCycle,
  periodInProgress: true,
  meetings: { attended: 0, expected: 0 },
};
const ctx = (isSelf: boolean) => ({
  isSelf,
  context: (t: DashTask) => t.projectName,
  timerStartedAt: () => null,
  onOpen: () => {},
  onStatus: () => {},
  onTimerStart: () => {},
  onTimerStop: () => {},
});
const seg = (avg: number | null) => ({
  answered: avg == null ? 0 : 4,
  unanswered: 0,
  averageSeconds: avg,
  medianSeconds: avg,
});
const rt = (all: number | null, direct: number | null, mention: number | null) => ({
  all: { answered: 8, unanswered: 0, averageSeconds: all, medianSeconds: all },
  direct: seg(direct),
  mention: seg(mention),
});

describe("detalhe do membro V2 — visões", () => {
  it("Tarefas: pessoa sem tarefas mostra estado vazio; título longo trunca", () => {
    const stats = memberTaskStats([]);
    const load = assessLoad(stats, null);
    expect(
      renderToStaticMarkup(<TasksView tasks={[]} stats={stats} load={load} ctx={ctx(true)} />),
    ).toContain("Nenhuma tarefa vinculada");
    const t = [task({ title: LONG_NAME, bucket: "atrasada", due: "Atrasada · 2d" })];
    const html = renderToStaticMarkup(
      <TooltipProvider>
        <TasksView
          tasks={t}
          stats={memberTaskStats(t)}
          load={assessLoad(memberTaskStats(t), null)}
          ctx={ctx(true)}
        />
      </TooltipProvider>,
    );
    expect(html).toContain("Próximas do vencimento");
    expect(html).toContain("1 aberta · 0 vencem hoje · 1 atrasada · 0 em andamento");
    expect(html).toMatch(/truncate[^>]*>Gustavo/);
  });

  it("Tarefas: status só é editável no próprio perfil", () => {
    const t = [task({ title: "X", status: "Aberto", bucket: "hoje" })];
    const mk = (self: boolean) =>
      renderToStaticMarkup(
        <TooltipProvider>
          <TasksView
            tasks={t}
            stats={memberTaskStats(t)}
            load={assessLoad(memberTaskStats(t), null)}
            ctx={ctx(self)}
          />
        </TooltipProvider>,
      );
    expect(mk(true)).toMatch(/aria-haspopup|Alterar status|combobox/i);
    expect(mk(false)).not.toMatch(/aria-haspopup|combobox/i);
  });

  it("Desempenho: sem dados nunca inventa número (—, nunca 0/0 nem 0%)", () => {
    const html = renderToStaticMarkup(<PerformanceView {...perfProps} />);
    expect(html).toContain("Sem dados suficientes no período");
    expect(html).toContain("nenhuma esperada");
    expect(html).toContain("Nenhuma conclusão no período");
    expect(html).toContain("Sem base de tarefas no período");
    expect(html).not.toContain("0/0");
    expect(html).not.toContain(">0%<");
  });

  it("Desempenho: amostra pequena → 'Dados insuficientes para score' (sem 100/100 enganoso)", () => {
    const html = renderToStaticMarkup(
      <PerformanceView
        {...perfProps}
        score={
          {
            ...(baseScore as object),
            score: 100,
            dataState: "definitivo",
            amostra: 12,
            confidence: "baixa",
            classificacao: "Excelente",
          } as never
        }
      />,
    );
    expect(html).toContain("Dados insuficientes para score");
    expect(html).toContain("12 tarefas na base");
    expect(html).not.toContain("Excelente");
    expect(html).not.toContain("/100");
  });

  it("Desempenho: com amostra suficiente mostra score, confiança e indicadores com tendência", () => {
    const html = renderToStaticMarkup(
      <PerformanceView
        {...perfProps}
        score={
          {
            ...(baseScore as object),
            score: 87,
            dataState: "definitivo",
            amostra: 25,
            confidence: "media",
            classificacao: "Muito bom",
          } as never
        }
        agg={{ ...agg, pctNoPrazo: 90, qtdReplanejamentos: 2 }}
        aggPrevious={{ ...agg, pctNoPrazo: 84 }}
        aggPrevious2={{ ...agg, pctNoPrazo: 78 }}
        completed={10}
        lateCount={1}
        previousCompleted={6}
        previous2Completed={5}
        overdueNow={1}
        replan={{ tasksReplanned: 2, taskBase: 18, before: 1, after: 1 }}
        cycle={{ completedInRange: 5, cycleDays: 2.4, cycleSample: 3, leadDays: 4, leadSample: 5 }}
      />,
    );
    expect(html).toContain("87");
    expect(html).toContain("Confiança média · 25 tarefas na base");
    expect(html).toContain("9 no prazo · 1 com atraso");
    expect(html).toContain("78% → 84% → 90%");
    expect(html).toContain("2 de 18 tarefas");
    expect(html).toContain("2,4 dias");
  });

  it("Visão geral: sem pontos de atenção → 'Tudo sob controle'; com atenção, no máximo 3", () => {
    const base = {
      tasks: [] as DashTask[],
      ctx: ctx(false),
      journey: { statusLabel: "Disponível", hours: "12,5h", days: 4 },
      communication: { state: "ready" as const, reading: communicationReading(null, null) },
      goTo: () => {},
    };
    const calm = renderToStaticMarkup(<OverviewView {...base} insights={[]} />);
    expect(calm).toContain("Tudo sob controle");
    expect(calm).toContain("Ainda não há dados suficientes.");
    expect(calm).toContain("Nenhuma tarefa aberta.");
    const many = renderToStaticMarkup(
      <OverviewView
        {...base}
        insights={[1, 2, 3, 4].map((n) => ({ kind: "atencao" as const, text: `Item ${n}.` }))}
      />,
    );
    expect(many).toContain("Item 3.");
    expect(many).not.toContain("Item 4.");
  });

  it("Dependências: lista, bloqueador só com dependência formal, e vazio compacto", () => {
    expect(
      renderToStaticMarkup(
        <DependenciesView rows={[]} categoryLabel={() => ""} onOpenTask={() => {}} />,
      ),
    ).toContain("Nenhuma tarefa bloqueada agora.");
    const t = task({ id: "x", title: "Aguardando briefing", status: "Bloqueada" });
    const rows = blockedRows([t], [{ blockedTaskId: "x", blockingTaskId: "b" }], () => ({
      label: "Criar briefing",
      status: "Em andamento",
      assignees: ["Toni"],
      dueDate: "2026-10-09",
    }));
    const html = renderToStaticMarkup(
      <TooltipProvider>
        <DependenciesView
          rows={rows}
          categoryLabel={() => "Aguardando cliente"}
          onOpenTask={() => {}}
        />
      </TooltipProvider>,
    );
    expect(html).toContain("Bloqueada por");
    expect(html).toContain("Criar briefing");
    expect(html).toContain("Toni");
    expect(html).toContain("09/10");
  });

  it("Histórico: vazio mostra mensagem; com eventos usa a linha do tempo compartilhada", () => {
    expect(renderToStaticMarkup(<HistoryView events={[]} projects={[]} />)).toContain(
      "Sem atividade registrada",
    );
    const html = renderToStaticMarkup(
      <HistoryView
        projects={["Você no Hype", "Outro"]}
        events={[
          {
            id: "1",
            at: new Date().toISOString(),
            autor: "Toni",
            kind: "outro",
            texto: "concluiu “Distribuir”",
            entrega: "Você no Hype",
            menor: false,
          },
        ]}
      />,
    );
    expect(html).toContain("Todos os projetos");
    expect(html).toContain("concluiu “Distribuir”");
    expect(html).toContain("Você no Hype");
    expect(html).toContain("Hoje");
  });
});

describe("Comunicação V2", () => {
  it("erro e sem dados nunca inventam número", () => {
    const err = renderToStaticMarkup(
      <CommunicationView
        state="error"
        reading={communicationReading(null, null)}
        data={null}
        previous={null}
      />,
    );
    expect(err).toContain("Ainda não disponível");
    expect(err).toContain("o conteúdo das conversas não é exibido");
    const empty = renderToStaticMarkup(
      <CommunicationView
        state="ready"
        reading={communicationReading(rt(null, null, null), null)}
        data={rt(null, null, null)}
        previous={null}
      />,
    );
    expect(empty).toContain("Ainda não há dados suficientes.");
  });

  it("com dados: média, 'demora mais em', comparação com o time e recomendação — sem mediana, contagens ou conversas", () => {
    const data = rt(7200, 8040, 300);
    const html = renderToStaticMarkup(
      <CommunicationView
        state="ready"
        reading={communicationReading(data, 3600)}
        data={data}
        previous={rt(9000, null, null)}
      />,
    );
    expect(html).toContain("2h");
    expect(html).toContain("Demora mais em");
    expect(html).toContain("Mensagens diretas");
    expect(html).toContain("Acima da média do time");
    expect(html).toContain("Recomendação");
    expect(html).toContain("↓ 20% vs período anterior");
    expect(html).toContain("o conteúdo das conversas não é exibido");
    expect(html).not.toMatch(/mediana|analisadas|sem resposta/i);
  });

  it("sem referência do time não inventa comparação", () => {
    const data = rt(420, null, null);
    const html = renderToStaticMarkup(
      <CommunicationView
        state="ready"
        reading={communicationReading(data, null)}
        data={data}
        previous={null}
      />,
    );
    expect(html).toContain("7 min");
    expect(html).not.toMatch(/média do time/);
  });

  it("scoreView exportado coerente", () => {
    expect(scoreView({ score: 50, amostra: 3, dataState: "provisorio" }).mode).toBe("insuficiente");
  });
});

describe("Time V2 — tabela: score com corte e colunas enxutas", () => {
  const withScore = (score: unknown) => {
    const m = member({ id: "s", name: "Sara" });
    const rows = buildMemberRows([m], {
      viewer,
      tasksByMember: new Map(),
      scoreByMemberId: new Map([["s", score as never]]),
      periodByMemberId: new Map(),
      responseByMemberId: null,
    });
    return renderToStaticMarkup(
      <TooltipProvider>
        <TimeMembersTable
          rows={rows}
          sort={{ key: "nome", dir: "asc" }}
          onSort={() => {}}
          loading={false}
          totalMembers={1}
          filtered={false}
          onOpenMember={() => {}}
        />
      </TooltipProvider>,
    );
  };
  it("abaixo de 20 tarefas: prévia discreta (sem cor de classificação) e nunca 'prov.'", () => {
    const html = withScore({
      score: 100,
      dataState: "definitivo",
      amostra: 12,
      classificacao: "Excelente",
    });
    expect(html).toContain("100");
    expect(html).toContain("text-text-secondary/70");
    expect(html).not.toContain("prov.");
  });
  it("20+ tarefas: score normal; sem dados: travessão", () => {
    expect(
      withScore({ score: 87, dataState: "definitivo", amostra: 25, classificacao: "Muito bom" }),
    ).toContain("font-semibold tabular-nums");
    expect(withScore({ score: null, dataState: "sem_dados", amostra: 0 })).toContain("—");
  });
  it("sem Replan./Horas e sem filtro online na tabela", () => {
    const html = renderTable([member({ id: "x", name: "Xis" })]);
    expect(html).not.toContain("Replan.");
    expect(html).not.toContain("Horas");
  });
  it("filtros: atenção e bloqueio", () => {
    const m = member({ id: "f", name: "Fe" });
    const t = new Map([
      [
        "Fe",
        [task({ bucket: "atrasada" }), task({ bucket: "atrasada" }), task({ bucket: "atrasada" })],
      ],
    ]);
    const [row] = rowsFor([m], t);
    expect(matchesFilters(row, new Set(["atencao"]))).toBe(row.load.level !== "normal");
    expect(matchesFilters(row, new Set(["bloqueio"]))).toBe(false);
    expect(matchesFilters(row, new Set())).toBe(true);
  });
});

const { AttentionTasks, attentionCounts } = await import("@/components/team/AttentionTasks");
const { TeamInsights } = await import("@/components/team/TeamInsights");
const { TeamPerformance } = await import("./TeamPerformance");

describe("Time V2 — precisa de atenção", () => {
  const flat = (over: Partial<DashTask> & { assignees?: string[] }) =>
    ({ ...task(over), assignees: over.assignees ?? ["Ana"] }) as never;
  const tasks = [
    flat({
      id: "1",
      title: "Editar Vídeo",
      bucket: "atrasada",
      due: "Atrasada · 25d",
      status: "Em andamento",
    }),
    flat({ id: "2", title: "Hoje A", bucket: "hoje", due: "Hoje" }),
    flat({
      id: "3",
      title: "Travada",
      status: "Bloqueada",
      blockCategory: "aguardando_cliente",
      bucket: "semana",
    }),
    flat({ id: "4", title: "Feita", bucket: "atrasada", status: "Concluído" }),
  ];
  const render = (tab: "atrasadas" | "hoje" | "bloqueadas", list = tasks) =>
    renderToStaticMarkup(
      <TooltipProvider>
        <AttentionTasks
          tasks={list}
          members={[]}
          activeTab={tab}
          onTabChange={() => {}}
          onOpenTask={() => {}}
          context={(t) => `Cliente · ${t.projectName}`}
        />
      </TooltipProvider>,
    );
  it("conta só abertas, por aba; sem aba 'Esta semana'", () => {
    expect(attentionCounts(tasks)).toEqual({ atrasadas: 1, hoje: 1, bloqueadas: 1 });
    const html = render("atrasadas");
    expect(html).toContain("Atrasadas · 1");
    expect(html).toContain("Vencem hoje · 1");
    expect(html).toContain("Bloqueadas · 1");
    expect(html).not.toContain("Esta semana");
  });
  it("linha: título, responsável · cliente · projeto e status em texto; tarefa concluída fora", () => {
    const html = render("atrasadas");
    expect(html).toContain("Editar Vídeo");
    expect(html).toContain("Ana · Cliente · Projeto");
    expect(html).toContain("Em andamento");
    expect(html).not.toContain("Feita");
  });
  it("bloqueadas mostram a categoria; vazio é uma linha, sem emoji", () => {
    expect(render("bloqueadas")).toContain("Aguardando cliente");
    const vazio = render("hoje", []);
    expect(vazio).toContain("Nada vencendo hoje.");
    expect(vazio).not.toContain("🎉");
  });
  it("mais de 8: 'Ver todas (N)'", () => {
    const many = Array.from({ length: 11 }, (_, i) =>
      flat({ id: `m${i}`, title: `T${i}`, bucket: "atrasada" }),
    );
    const html = render("atrasadas", many);
    expect(html).toContain("Ver todas (11)");
    expect(html).not.toContain(">T10<");
  });
});

describe("Time V2 — insights e desempenho", () => {
  it("insights: lista curta, vazio em uma linha", () => {
    expect(
      renderToStaticMarkup(
        <TeamInsights insights={[]} membersById={new Map()} onOpenMember={() => {}} />,
      ),
    ).toContain("Nenhum insight relevante");
    const html = renderToStaticMarkup(
      <TeamInsights
        insights={[
          {
            ruleId: "pontualidade_queda",
            memberId: "a",
            memberName: "Lucas Ragoni",
            nature: "atencao",
            category: "prazos",
            priority: 85,
            text: "A conclusão no prazo caiu de 41% para 13%.",
          },
        ]}
        membersById={new Map()}
        onOpenMember={() => {}}
      />,
    );
    expect(html).toContain("Lucas Ragoni");
    expect(html).toContain("caiu de 41% para 13%");
  });
  it("desempenho do time: valores com tendência e travessão sem base", () => {
    const html = renderToStaticMarkup(
      <TeamPerformance
        data={{
          onTime: { value: 50, previous: 42, sample: 20 },
          replans: { value: 5, previous: 3 },
          cycle: { days: 2, previousDays: 3, sample: 4 },
        }}
      />,
    );
    expect(html).toContain("50%");
    expect(html).toContain("↑ 8 pp");
    expect(html).toContain("↑ 2 vs 3");
    expect(html).toContain("Antes:");
    const vazio = renderToStaticMarkup(
      <TeamPerformance
        data={{
          onTime: { value: null, previous: null, sample: 0 },
          replans: { value: 0, previous: 0 },
          cycle: { days: null, previousDays: null, sample: 0 },
        }}
      />,
    );
    expect(vazio).toContain("—");
    expect(vazio).toContain("Sem conclusões avaliadas");
  });
});
