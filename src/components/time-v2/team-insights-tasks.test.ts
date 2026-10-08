import { describe, expect, it } from "vitest";
import {
  buildTaskInsightSignals,
  generateTaskInsights,
  ruleBloqueiosSistemicos,
  ruleConcentracaoCriticas,
  ruleReincidenciaAtraso,
  ruleRiscoAcumulo,
  type InsightTask,
  type MemberTaskStats,
  type TaskInsightSignals,
} from "./team-insights-tasks";
import { generateTeamInsights, selectTeamInsights } from "./team-insights-v2";

const TODAY = "2026-10-08";
const local = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).toISOString();
const MEMBERS = [
  { id: "a", name: "Ana Souza" },
  { id: "b", name: "Bruno Lima" },
  { id: "c", name: "Carla Dias" },
];

let n = 0;
const task = (o: Partial<InsightTask> = {}): InsightTask => ({
  id: `t${++n}`,
  title: "Tarefa",
  status: "Aberto",
  assigneeIds: ["a"],
  ...o,
});
/** Conclusão em `dia` de setembro/outubro contra um prazo vigente. */
const done = (dueISO: string, completedAt: string, o: Partial<InsightTask> = {}) =>
  task({ status: "Concluído", dueISO, completedAt, ...o });
const onTime = (day: number) =>
  done(`2026-09-${String(day).padStart(2, "0")}`, local(2026, 9, day - 1));
const late = (day: number) =>
  done(`2026-09-${String(day).padStart(2, "0")}`, local(2026, 9, day + 2));
const stats = (ts: InsightTask[]) => buildTaskInsightSignals(ts, MEMBERS, TODAY);
const ana = (ts: InsightTask[]) => stats(ts).members.find((m) => m.id === "a")!;

describe("A. reincidência de atraso", () => {
  it("4 de 5 conclusões fora do prazo geram insight com os números", () => {
    const m = ana([onTime(10), late(11), late(12), late(13), late(14)]);
    const i = ruleReincidenciaAtraso(m)!;
    expect(i.evidence).toContain("4 das últimas 5");
    expect(i.evidence).toContain("Ana Souza");
    expect(i.evidence).not.toContain("anteriores");
    expect(i.caveat).toContain("sem conclusões anteriores para comparar");
    expect(i.caveat).toBeTruthy();
    expect(i.view).toBe("tarefas");
  });

  it("atraso isolado ou amostra pequena NÃO gera insight", () => {
    expect(
      ruleReincidenciaAtraso(ana([late(10), onTime(11), onTime(12), onTime(13), onTime(14)])),
    ).toBeNull();
    expect(ruleReincidenciaAtraso(ana([late(10), late(11), late(12), late(13)]))).toBeNull();
  });

  it("compara com as 5 anteriores: piora aparece, padrão que já existia não repete", () => {
    const antes = [onTime(1), onTime(2), onTime(3), onTime(4), onTime(5)];
    const piora = ana([...antes, late(10), late(11), late(12), late(13), late(14)]);
    expect(ruleReincidenciaAtraso(piora)!.evidence).toContain("Nas 5 anteriores, foram 0.");
    const jaEra = ana([
      late(1),
      late(2),
      late(3),
      late(4),
      late(5),
      late(10),
      late(11),
      late(12),
      late(13),
      late(14),
    ]);
    expect(ruleReincidenciaAtraso(jaEra)).toBeNull();
  });

  it("usa o prazo VIGENTE: replanejado antes de vencer conta como no prazo", () => {
    // prazo original 05/09 foi movido para 20/09 antes de vencer → dueISO vigente é 20/09
    const replanejadas = [1, 2, 3, 4, 5].map((i) => done("2026-09-20", local(2026, 9, 10 + i)));
    expect(ruleReincidenciaAtraso(ana(replanejadas))).toBeNull();
    expect(ana(replanejadas).recent.every((x) => !x.late)).toBe(true);
  });

  it("conclusão antes do prazo e no próprio dia (até 19h) não é atraso", () => {
    const m = ana([
      done("2026-09-10", local(2026, 9, 10, 18)),
      done("2026-09-11", local(2026, 9, 9)),
      done("2026-09-12", local(2026, 9, 12, 10)),
    ]);
    expect(m.recent.every((x) => !x.late)).toBe(true);
  });

  it("conclusões muito antigas, sem prazo ou com data inválida não entram", () => {
    const m = ana([
      done("2026-05-01", local(2026, 5, 10)), // fora dos 60 dias
      done("", local(2026, 9, 10)),
      task({ status: "Concluído", dueISO: "2026-09-10", completedAt: "data-ruim" }),
    ]);
    expect(m.recent).toHaveLength(0);
  });

  it("tarefa duplicada conta uma vez", () => {
    const t = late(10);
    expect(ana([t, { ...t }, { ...t }]).recent).toHaveLength(1);
  });
});

describe("B. risco de novos atrasos", () => {
  const open = (dueISO: string, o: Partial<InsightTask> = {}) => task({ dueISO, ...o });

  it("vencidas sem bloqueio + vários prazos próximos geram o risco", () => {
    const ts = [
      ...[1, 2, 3].map(() => open("2026-10-05")),
      ...[8, 9, 10, 11].map((d) => open(`2026-10-${String(d).padStart(2, "0")}`)),
    ];
    const i = ruleRiscoAcumulo(ana(ts))!;
    expect(i.evidence).toContain("3 tarefas vencidas sem bloqueio");
    expect(i.evidence).toContain("4 entregas com prazo nos próximos 3 dias");
    expect(i.caveat).toContain("Quantidade de tarefas não prova");
  });

  it("muitas tarefas em dia NÃO são tratadas como sobrecarga", () => {
    const ts = Array.from({ length: 25 }, () => open("2026-10-30"));
    expect(ruleRiscoAcumulo(ana(ts))).toBeNull();
    const proximas = Array.from({ length: 8 }, () => open("2026-10-10"));
    expect(ruleRiscoAcumulo(ana(proximas))).toBeNull();
  });

  it("vencidas BLOQUEADAS são separadas e não contam como falha de execução", () => {
    const ts = [
      ...[1, 2, 3].map(() => open("2026-10-05", { blockCategory: "aguardando_cliente" })),
      ...[1, 2, 3, 4].map(() => open("2026-10-09")),
    ];
    const m = ana(ts);
    expect(m.overdueExec).toBe(0);
    expect(m.overdueBlocked).toBe(3);
    expect(ruleRiscoAcumulo(m)).toBeNull();
  });

  it("críticas concorrentes só alertam com sinal de dificuldade", () => {
    const criticas = [1, 2, 3].map(() => open("2026-10-09", { priority: "Alta" }));
    expect(ruleRiscoAcumulo(ana(criticas))).toBeNull();
    const comVencida = [...criticas, open("2026-10-02")];
    expect(ruleRiscoAcumulo(ana(comVencida))).not.toBeNull();
  });
});

describe("E. concentração de entregas críticas", () => {
  const crit = (id: string) => task({ assigneeIds: [id], priority: "Alta" });
  it("7 de 9 em uma pessoa (com 3 pessoas) gera insight com ressalva", () => {
    const ts = [...Array(7)].map(() => crit("a")).concat([crit("b"), crit("c")]);
    const i = ruleConcentracaoCriticas(stats(ts))!;
    expect(i.evidence).toContain("7 das 9");
    expect(i.caveat).toContain("função da pessoa");
  });
  it("sem amostra, com poucas pessoas ou bem distribuído não gera", () => {
    expect(ruleConcentracaoCriticas(stats([...Array(4)].map(() => crit("a"))))).toBeNull();
    const duas = [...Array(7)].map(() => crit("a")).concat([crit("b")]);
    expect(ruleConcentracaoCriticas(stats(duas))).toBeNull();
    const dist = [crit("a"), crit("a"), crit("b"), crit("b"), crit("c"), crit("c")];
    expect(ruleConcentracaoCriticas(stats(dist))).toBeNull();
  });
  it("conclusões críticas antigas não entram na janela", () => {
    const velhas = [...Array(8)].map(() =>
      done("2026-07-01", local(2026, 7, 2), { priority: "Alta" }),
    );
    expect(stats(velhas).criticalTotal).toBe(0);
  });
});

describe("G. bloqueios externos e aprovações", () => {
  it("bloqueios por causa externa viram problema de processo, não de pessoa", () => {
    const ts = [
      task({ blockCategory: "aguardando_cliente" }),
      task({ blockCategory: "aguardando_cliente" }),
      task({ blockCategory: "aguardando_aprovacao" }),
    ];
    const [i] = ruleBloqueiosSistemicos(stats(ts));
    expect(i.memberId).toBeUndefined();
    expect(i.evidence).toContain("2 aguardando cliente");
    expect(i.reading).toContain("não é de execução");
  });
  it("bloqueio técnico/interno não conta como externo; abaixo do mínimo não gera", () => {
    const ts = [
      task({ blockCategory: "problema_tecnico" }),
      task({ blockCategory: "dependencia_tarefa" }),
      task({ blockCategory: "aguardando_cliente" }),
    ];
    expect(ruleBloqueiosSistemicos(stats(ts))).toHaveLength(0);
  });
  it("aprovações acumuladas exigem volume e parcela das abertas", () => {
    const muitas = [...Array(6)].map(() => task({ status: "Em aprovação" }));
    const poucas = [...muitas, ...Array(30)].map((t, i) => t ?? task({ id: `x${i}` }));
    expect(ruleBloqueiosSistemicos(stats(muitas)).map((i) => i.ruleId)).toContain(
      "aprovacoes_acumuladas",
    );
    expect(ruleBloqueiosSistemicos(stats(poucas))).toHaveLength(0);
  });
});

describe("integração com o ranking existente", () => {
  const base = () => {
    const ts = [
      ...[1, 2, 3].map(() => task({ dueISO: "2026-10-05" })),
      ...[1, 2, 3].map(() => task({ dueISO: "2026-10-09" })),
    ];
    return generateTaskInsights(stats(ts));
  };

  it("é determinístico e sem repetir o mesmo insight", () => {
    const a = selectTeamInsights([...base(), ...base()]);
    const b = selectTeamInsights([...base(), ...base()]);
    expect(a.map((i) => i.id)).toEqual(b.map((i) => i.id));
    expect(new Set(a.map((i) => `${i.memberId}:${i.topic}`)).size).toBe(a.length);
  });

  it("problema resolvido deixa de aparecer", () => {
    expect(base().length).toBeGreaterThan(0);
    const resolvido = generateTaskInsights(stats([task({ dueISO: "2026-10-30" })]));
    expect(resolvido).toEqual([]);
  });

  it("não altera os insights existentes (mesmo conjunto sem sinais de tarefa)", () => {
    const vazio = generateTeamInsights({ members: [], edges: [], tasks: new Map() }, null);
    expect(selectTeamInsights(vazio)).toEqual([]);
  });

  it("todo insight de pessoa leva a uma aba válida do perfil", () => {
    const ts = [
      ...[1, 2, 3].map(() => task({ dueISO: "2026-10-05" })),
      ...[1, 2, 3].map(() => task({ dueISO: "2026-10-09" })),
    ];
    for (const i of generateTaskInsights(stats(ts))) {
      if (i.memberId) expect(i.view).toBe("tarefas");
    }
  });
});

describe("dados inconsistentes", () => {
  it("responsável desconhecido, tarefa sem prazo e sinais vazios não quebram", () => {
    const s: TaskInsightSignals = stats([
      task({ assigneeIds: ["ninguem"], dueISO: "2026-10-01" }),
      task({ assigneeIds: [], dueISO: undefined }),
    ]);
    expect(generateTaskInsights(s)).toEqual([]);
    const vazio: MemberTaskStats[] = [];
    expect(generateTaskInsights({ ...s, members: vazio })).toEqual([]);
  });
});

describe("revisão: regras de prazo, privacidade e redundância", () => {
  const open = (o: Partial<InsightTask>) => task({ dueISO: "2026-10-08", ...o });

  it("vencida segue o `bucket` do Score (corte das 19h), não só a data", () => {
    const m = ana([open({ bucket: "atrasada" }), open({ bucket: "hoje" })]);
    expect(m.overdueExec).toBe(1);
    expect(m.dueSoon).toBe(1);
  });

  it("prazo pausado por bloqueio não é atraso de execução, mesmo sem categoria externa", () => {
    const m = ana([open({ bucket: "atrasada", deadlinePaused: true })]);
    expect(m.overdueExec).toBe(0);
    expect(m.overdueBlocked).toBe(1);
  });

  it("conclusão perto da virada do dia é contada no dia de Brasília, não em UTC", () => {
    // 22:30 em Brasília (01:30Z do dia seguinte) de 9 de out. pertence a 9 de out.
    const noite = new Date("2026-10-10T01:30:00Z").toISOString();
    const m = ana([done("2026-10-09", noite, { priority: "Alta" })]);
    expect(m.recent).toHaveLength(1);
    expect(stats([done("2026-10-09", noite, { priority: "Alta" })]).criticalTotal).toBe(1);
  });

  it("um insight de prazo por pessoa: reincidência + risco não aparecem juntos", () => {
    const ts = [
      onTime(10),
      late(11),
      late(12),
      late(13),
      late(14),
      ...[1, 2, 3].map(() => task({ dueISO: "2026-10-05", bucket: "atrasada" as const })),
      ...[1, 2, 3].map(() => task({ dueISO: "2026-10-09", bucket: "amanha" as const })),
    ];
    const all = generateTaskInsights(stats(ts));
    expect(all.filter((i) => i.memberId === "a").length).toBe(2);
    const sel = selectTeamInsights(all).filter((i) => i.memberId === "a");
    expect(sel).toHaveLength(1);
  });

  it("não expõe títulos de tarefa, projeto ou campanha no texto", () => {
    const ts = [
      ...[1, 2, 3].map(() =>
        task({ title: "SEGREDO-CLIENTE-X", dueISO: "2026-10-05", bucket: "atrasada" as const }),
      ),
      ...[1, 2, 3].map(() => task({ title: "SEGREDO-CLIENTE-X", dueISO: "2026-10-09" })),
    ];
    const texto = JSON.stringify(generateTaskInsights(stats(ts)));
    expect(texto).not.toContain("SEGREDO");
  });

  it("não afirma 'piora/queda' sem período de comparação", () => {
    const i = ruleReincidenciaAtraso(ana([late(10), late(11), late(12), late(13), late(14)]))!;
    expect(i.reading).not.toMatch(/piorou|caiu/);
    expect(i.reading).toContain("passou do prazo vigente");
  });

  it("pessoas fora da equipe visível (ids desconhecidos) nunca entram nos sinais", () => {
    const s = stats([task({ assigneeIds: ["externo"], priority: "Alta", dueISO: "2026-10-05" })]);
    expect(s.criticalTotal).toBe(0);
    expect(s.members.every((m) => m.overdueExec === 0)).toBe(true);
  });

  it("os limiares documentados são os do código", async () => {
    const { readFileSync } = await import("node:fs");
    const { TASK_INSIGHT_THRESHOLDS: T } = await import("./team-insights-tasks");
    const doc = readFileSync(
      new URL("../../../docs/development/metricas-time.md", import.meta.url),
      "utf8",
    );
    expect(doc).toContain(`≥ ${T.reincidenciaMinAtrasos} das últimas ${T.janelaConclusoes}`);
    expect(doc).toContain(`(${T.conclusoesDias} dias)`);
    expect(doc).toContain(`≥ ${T.acumuloMinVencidas} vencidas`);
    expect(doc).toContain(`${T.proximosDias} dias`);
    expect(doc).toContain(`${Math.round(T.concentracaoCriticasPct * 100)}%`);
    expect(doc).toContain(`≥ ${T.aprovacoesMin}`);
    expect(doc).toContain(`${Math.round(T.aprovacoesPctAbertas * 100)}%`);
  });
});

describe("limite de 12 insights", () => {
  it("o alerta operacional (risco) sobrevive a uma lista cheia de reconhecimentos e tendências", () => {
    const risco = ruleRiscoAcumulo(
      buildTaskInsightSignals(
        [
          ...[1, 2, 3].map(() => task({ dueISO: "2026-10-05", bucket: "atrasada" as const })),
          ...[1, 2, 3].map(() => task({ dueISO: "2026-10-09", bucket: "amanha" as const })),
        ],
        MEMBERS,
        TODAY,
      ).members[0],
    )!;
    const filler = Array.from({ length: 20 }, (_, i) => ({
      ...risco,
      id: `fill${i}`,
      ruleId: `fill${i}`,
      topic: `fill${i}`,
      memberId: `p${i}`,
      memberName: `Pessoa ${i}`,
      priority: 2 as const,
      category: "tendencia" as const,
      rank: 8,
      weight: 1,
    }));
    const sel = selectTeamInsights([...filler, risco]);
    expect(sel).toHaveLength(12);
    expect(sel[0].ruleId).toBe("risco_acumulo");
  });
});
