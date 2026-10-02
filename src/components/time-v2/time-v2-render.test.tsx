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
const { ProfileTasks, ProfilePerformance, ProfileHistory } = await import("./profile-sections");

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

function renderTable(members: Member[], tasks = new Map<string, DashTask[]>()) {
  return renderToStaticMarkup(
    <TooltipProvider>
      <TimeMembersTable
        members={members}
        viewer={viewer}
        tasksByMember={tasks}
        scoreByMemberId={new Map()}
        secondsByUser={new Map()}
        loading={false}
        totalMembers={members.length}
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
    expect(
      renderToStaticMarkup(
        <TooltipProvider>
          <TimeMembersTable
            members={[]}
            viewer={viewer}
            tasksByMember={new Map()}
            scoreByMemberId={new Map()}
            secondsByUser={new Map()}
            loading={false}
            totalMembers={0}
            onOpenMember={() => {}}
          />
        </TooltipProvider>,
      ),
    ).toContain("Nenhum membro cadastrado");
    expect(
      renderToStaticMarkup(
        <TooltipProvider>
          <TimeMembersTable
            members={[]}
            viewer={viewer}
            tasksByMember={new Map()}
            scoreByMemberId={new Map()}
            secondsByUser={new Map()}
            loading={false}
            totalMembers={3}
            onOpenMember={() => {}}
          />
        </TooltipProvider>,
      ),
    ).toContain("Nenhum membro encontrado");
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
  });
});

describe("TimeSummaryStrip", () => {
  it("mostra os 5 números objetivos", () => {
    const html = renderToStaticMarkup(
      <TimeSummaryStrip
        openCount={12}
        dueTodayCount={3}
        overdueCount={5}
        membersCount={7}
        onlineCount={4}
        completedThisWeek={9}
        onOpenAberto={() => {}}
        onOpenHoje={() => {}}
        onOpenAtrasadas={() => {}}
      />,
    );
    for (const s of [
      "Tarefas abertas",
      "Vencem hoje",
      "Atrasadas",
      "Membros",
      "Concluídas na semana",
      "4 online",
    ]) {
      expect(html).toContain(s);
    }
  });
});

describe("seções do perfil central", () => {
  it("ProfileTasks: pessoa sem tarefas mostra estado vazio; título longo trunca", () => {
    expect(renderToStaticMarkup(<ProfileTasks tasks={[]} onOpenTask={() => {}} />)).toContain(
      "Nenhuma tarefa vinculada",
    );
    const html = renderToStaticMarkup(
      <ProfileTasks
        tasks={[task({ title: LONG_NAME, bucket: "atrasada", due: "Atrasada 2d" })]}
        onOpenTask={() => {}}
      />,
    );
    expect(html).toContain("Atrasadas");
    expect(html).toMatch(/truncate[^>]*>Gustavo/);
  });

  it("ProfilePerformance: sem reuniões esperadas mostra travessão, nunca 0/0", () => {
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
    const html = renderToStaticMarkup(
      <ProfilePerformance
        completed={0}
        previousCompleted={0}
        agg={agg}
        previousAgg={agg}
        overdueNow={0}
        meetingsAttended={0}
        meetingsExpected={0}
        totalSeconds={0}
      />,
    );
    expect(html).toContain("Nenhuma esperada no período");
    expect(html).not.toContain("0/0");
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
