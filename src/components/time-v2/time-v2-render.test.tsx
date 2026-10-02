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
const {
  ProfileActivity,
  ProfilePerformance,
  ProfileHistory,
  ProfileSummary,
  ProfileScoreSummary,
  ProfileDependencies,
  ProfileInsights,
  ProfileWorkload,
} = await import("./profile-sections");
const { buildMemberRows, sortMemberRows } = await import("./member-rows");
const { assessLoad, dependencySummary } = await import("./member-metrics");
const { memberTaskStats } = await import("./time-v2-utils");
const { ProfileCommunication } = await import("./ProfileCommunication");

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
    secondsByUser: new Map(),
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
  it("responde agora (abertas/hoje/atrasadas/bloqueadas) e no período (concluídas/prazo/resposta)", () => {
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
        responseLabel="18 min"
        responseHint="Chat · métrica agregada"
        periodLabel="Neste mês"
        onOpenAberto={() => {}}
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
      "18 min",
    ]) {
      expect(html).toContain(s);
    }
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
        responseLabel="—"
        responseHint="Sem dados suficientes"
        periodLabel="Nesta semana"
        onOpenAberto={() => {}}
        onOpenHoje={() => {}}
        onOpenAtrasadas={() => {}}
        onOpenBloqueadas={() => {}}
      />,
    );
    expect(html).toContain("Sem conclusões avaliadas");
    expect(html).not.toContain("0%");
  });
});

describe("seções do perfil central", () => {
  it("ProfileActivity: pessoa sem tarefas mostra estado vazio; título longo trunca", () => {
    expect(renderToStaticMarkup(<ProfileActivity tasks={[]} onOpenTask={() => {}} />)).toContain(
      "Nenhuma tarefa vinculada",
    );
    const html = renderToStaticMarkup(
      <ProfileActivity
        tasks={[task({ title: LONG_NAME, bucket: "atrasada", due: "Atrasada 2d" })]}
        onOpenTask={() => {}}
      />,
    );
    expect(html).toContain("Atrasadas");
    expect(html).toMatch(/truncate[^>]*>Gustavo/);
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
  const perfProps = {
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
    meetingsAttended: 0,
    meetingsExpected: 0,
    totalSeconds: 0,
  };

  it("ProfilePerformance: sem dados nunca inventa número (—, nunca 0/0 nem 0%)", () => {
    const html = renderToStaticMarkup(<ProfilePerformance {...perfProps} />);
    expect(html).toContain("nenhuma esperada");
    expect(html).toContain("Nenhuma conclusão no período");
    expect(html).toContain("Sem base de tarefas no período");
    expect(html).toContain("Nenhuma tarefa concluída no período");
    expect(html).not.toContain("0/0");
    expect(html).not.toContain(">0%<");
  });

  it("ProfilePerformance: prazo, replanejamento, ciclo e tendência em 3 períodos", () => {
    const html = renderToStaticMarkup(
      <ProfilePerformance
        {...perfProps}
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
    expect(html).toContain("90%");
    expect(html).toContain("9 no prazo · 1 com atraso · 1 atrasada agora");
    expect(html).toContain("78% → 84% → 90%");
    expect(html).toContain("2 de 18 tarefas · 1 antes do vencimento · 1 no dia ou depois");
    expect(html).toContain("11%");
    expect(html).toContain("2,4 dias");
    expect(html).toContain("3 de 5 com início registrado");
  });

  it("Carga, Dependências e Insights mostram motivo/categoria e estados vazios", () => {
    const tasks = [
      task({ id: "1", bucket: "atrasada" }),
      task({ id: "2", status: "Em andamento" }),
      task({ id: "3", title: "Aguardando briefing", blockCategory: "aguardando_cliente" }),
    ];
    const stats = memberTaskStats(tasks);
    const workload = renderToStaticMarkup(
      <TooltipProvider>
        <ProfileWorkload stats={stats} load={assessLoad(stats, null)} />
      </TooltipProvider>,
    );
    expect(workload).toContain("3 abertas · 0 vencem hoje · 1 atrasada · 1 em andamento");
    expect(workload).toContain("1 tarefa atrasada");

    const deps = renderToStaticMarkup(
      <ProfileDependencies summary={dependencySummary(tasks)} onOpenTask={() => {}} />,
    );
    expect(deps).toContain("1 tarefa bloqueada");
    expect(deps).toContain("Aguardando cliente");
    expect(
      renderToStaticMarkup(
        <ProfileDependencies summary={dependencySummary([])} onOpenTask={() => {}} />,
      ),
    ).toContain("Nenhuma tarefa bloqueada");

    expect(renderToStaticMarkup(<ProfileInsights insights={[]} />)).toContain(
      "Nenhum insight relevante",
    );
    expect(
      renderToStaticMarkup(
        <ProfileInsights insights={[{ kind: "atencao", text: "3 tarefas estão atrasadas." }]} />,
      ),
    ).toContain("3 tarefas estão atrasadas.");
  });

  it("ProfileHistory: sem atividade mostra estado vazio", () => {
    const html = renderToStaticMarkup(
      <ProfileHistory
        completions={[]}
        deadlineChanges={[]}
        attendance={[]}
        meetingsById={new Map()}
        projectNames={[]}
      />,
    );
    expect(html).toContain("Sem atividade registrada");
    expect(html).toContain("Nenhum projeto ou campanha");
  });
});

describe("perfil contínuo", () => {
  it("resumo: cada indicador é um atalho acessível pra sua seção", () => {
    const html = renderToStaticMarkup(
      <ProfileSummary
        items={[
          { key: "a", icon: null, label: "Atrasadas", value: 3, tone: "danger", onClick: () => {} },
          {
            key: "b",
            icon: null,
            label: "Resposta média",
            value: "—",
            hint: "Sem dados suficientes",
            onClick: () => {},
          },
        ]}
      />,
    );
    expect(html).toContain("Atrasadas: 3. Ir para a seção");
    expect(html).toContain("Sem dados suficientes");
  });

  it("Score sem dados mostra 'Sem dados suficientes' e a ação 'Ver composição do Score'", () => {
    const html = renderToStaticMarkup(
      <ProfileScoreSummary
        score={{ score: null, dataState: "sem_dados" } as never}
        trendLabel={null}
        expanded={false}
        onToggle={() => {}}
      />,
    );
    expect(html).toContain("Sem dados suficientes");
    expect(html).toContain("Ver composição do Score");
  });

  it("Comunicação: estado de erro e sem dados nunca inventam número; aviso de privacidade sempre presente", () => {
    const err = renderToStaticMarkup(
      <ProfileCommunication data={null} previous={null} state="error" />,
    );
    expect(err).toContain("Ainda não disponível");
    expect(err).toContain(
      "O conteúdo, participantes e conversas utilizados no cálculo não são exibidos",
    );
    expect(err).toContain("O tempo é calculado com base nos eventos registrados pela plataforma");
    const empty = renderToStaticMarkup(
      <ProfileCommunication
        data={{
          direct: { answered: 0, unanswered: 0, averageSeconds: null, medianSeconds: null },
          mention: { answered: 0, unanswered: 0, averageSeconds: null, medianSeconds: null },
          all: { answered: 0, unanswered: 0, averageSeconds: null, medianSeconds: null },
        }}
        previous={null}
        state="ready"
      />,
    );
    expect(empty).toContain("Sem dados suficientes");
  });

  it("Comunicação com dados: média, mediana, diretas/menções e variação — sem contagens nem conversas", () => {
    const seg = { answered: 4, unanswered: 1, averageSeconds: 1080, medianSeconds: 600 };
    const html = renderToStaticMarkup(
      <ProfileCommunication
        data={{
          direct: { ...seg, averageSeconds: 900 },
          mention: { ...seg, averageSeconds: 1440 },
          all: { answered: 8, unanswered: 2, averageSeconds: 1080, medianSeconds: 600 },
        }}
        previous={{
          direct: seg,
          mention: seg,
          all: { answered: 8, unanswered: 2, averageSeconds: 1200, medianSeconds: 600 },
        }}
        state="ready"
      />,
    );
    expect(html).toContain("18 min");
    expect(html).toContain("10 min");
    expect(html).toContain("15 min");
    expect(html).toContain("24 min");
    expect(html).toContain("↓ 10% vs período anterior");
    expect(html).not.toMatch(/analisadas|sem resposta/i);
  });
});
