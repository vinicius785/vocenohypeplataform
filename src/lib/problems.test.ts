import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const { fallbackTitle, mapProblem, summarizeProblems } = await import("./problems");
const { areaForContext, captureReportContext, rememberNavigationContext, setProblemTaskContext } =
  await import("./problem-context");

const row = (over: Record<string, unknown> = {}) => ({
  id: "r1",
  kind: "bug",
  title: null,
  description: "Filtro de campanhas não mantém seleção\nao trocar de aba",
  area: null,
  priority: "normal",
  status: "novo",
  reporter_id: "u1",
  reporter_name: "Ana",
  client_label: null,
  assignee_id: null,
  assignee_name: null,
  resolution_note: null,
  resolved_at: null,
  resolved_by_name: null,
  screenshot_path: null,
  page_context: null,
  created_at: "2026-10-01T10:00:00Z",
  updated_at: "2026-10-01T10:00:00Z",
  ...over,
});

describe("mapProblem (compatível com reports antigos)", () => {
  it("report antigo sem título usa a 1ª linha da descrição", () => {
    expect(mapProblem(row()).title).toBe("Filtro de campanhas não mantém seleção");
  });
  it("valores desconhecidos caem em padrões seguros", () => {
    const p = mapProblem(row({ kind: "x", status: "y", priority: "z" }));
    expect(p).toMatchObject({ kind: "bug", status: "novo", priority: "normal" });
  });
  it("report do portal (sem usuário) mostra a origem do cliente", () => {
    const p = mapProblem(
      row({ reporter_id: null, reporter_name: "", client_label: "Portal · ACME" }),
    );
    expect(p.reporterName).toBe("Portal · ACME");
  });
  it("título longo é encurtado", () => {
    expect(fallbackTitle("a".repeat(200)).length).toBeLessThanOrEqual(90);
    expect(fallbackTitle("   ")).toBe("Sem título");
  });
});

describe("summarizeProblems (números reais)", () => {
  it("agrupa os 6 status nos 4 indicadores", () => {
    const list = [
      "novo",
      "aguardando_info",
      "em_analise",
      "em_correcao",
      "resolvido",
      "fechado",
    ].map((status, i) => mapProblem(row({ id: String(i), status })));
    expect(summarizeProblems(list)).toEqual({
      abertos: 2,
      emAnalise: 1,
      emCorrecao: 1,
      resolvidos: 2,
    });
    expect(summarizeProblems([])).toEqual({
      abertos: 0,
      emAnalise: 0,
      emCorrecao: 0,
      resolvidos: 0,
    });
  });
});

describe("contexto automático do report", () => {
  it("área vem da seção / rota onde a pessoa estava", () => {
    expect(areaForContext({ route: "/time?section=campanhas", section: "campanhas" })).toBe(
      "Campanhas",
    );
    expect(areaForContext({ route: "/projeto/123", section: null })).toBe("Projetos");
    expect(areaForContext({ route: "/chat-v2", section: null })).toBe("Chat");
    expect(areaForContext(null)).toBe("Outro");
  });
  it("visitar Problemas não apaga onde a pessoa estava antes", () => {
    rememberNavigationContext("/time?section=financeiro", "financeiro");
    rememberNavigationContext("/time?section=problemas", "problemas");
    setProblemTaskContext({ id: "t1", title: "Atualizar Metas" });
    const ctx = captureReportContext();
    expect(ctx.defaultArea).toBe("Financeiro");
    expect(ctx.diagnostics.route).toBe("/time?section=financeiro");
    expect(ctx.diagnostics.task).toEqual({ id: "t1", title: "Atualizar Metas" });
    expect(ctx.diagnostics.appVersion).toBeTruthy();
    setProblemTaskContext(null);
  });
});
