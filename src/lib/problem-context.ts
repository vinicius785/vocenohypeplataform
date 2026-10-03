/**
 * Contexto automático do "Reportar problema" — o usuário nunca precisa
 * explicar onde estava. Guarda (em memória da aba) a última tela visitada
 * FORA de Problemas e a tarefa aberta no momento, e monta os metadados de
 * diagnóstico (rota, módulo, navegador, dispositivo, versão).
 */
import { APP_VERSION } from "@/lib/app-version";
import type { ProblemArea, ProblemDiagnostics } from "@/lib/problems";
import type { SectionKey } from "@/lib/section-nav";

type NavContext = { route: string; section: SectionKey | null };

let lastContext: NavContext | null = null;
let taskContext: { id: string; title: string } | null = null;

const SECTION_AREA: Partial<Record<SectionKey, ProblemArea>> = {
  inicio: "Início",
  clientes: "Clientes",
  campanhas: "Campanhas",
  projetos: "Projetos",
  reunioes: "Reuniões",
  comercial: "Comercial",
  financeiro: "Financeiro",
  time: "Time",
  influenciadores: "Influenciadores",
  metas: "Metas",
  chat: "Chat",
  configuracoes: "Configurações",
};

export function areaForContext(ctx: NavContext | null): ProblemArea {
  if (!ctx) return "Outro";
  if (ctx.section && SECTION_AREA[ctx.section]) return SECTION_AREA[ctx.section]!;
  if (ctx.route.startsWith("/projeto/")) return "Projetos";
  if (ctx.route.startsWith("/chat")) return "Chat";
  return "Outro";
}

/** Chamado pelo AppShell a cada troca de tela (exceto a própria Problemas). */
export function rememberNavigationContext(route: string, section: SectionKey | null) {
  if (section === "problemas") return;
  lastContext = { route, section };
}

/** Chamado pelo detalhe da tarefa ao abrir/fechar. */
export function setProblemTaskContext(task: { id: string; title: string } | null) {
  taskContext = task;
}

export type ReportContext = {
  defaultArea: ProblemArea;
  diagnostics: ProblemDiagnostics;
};

export function captureReportContext(): ReportContext {
  const nav: NavContext =
    lastContext ??
    (typeof window !== "undefined"
      ? { route: window.location.pathname + window.location.search, section: null }
      : { route: "", section: null });
  const nav2 = typeof navigator !== "undefined" ? navigator : null;
  return {
    defaultArea: areaForContext(nav),
    diagnostics: {
      route: nav.route,
      module: nav.section ?? undefined,
      userAgent: nav2?.userAgent,
      platform:
        (nav2 as Navigator & { userAgentData?: { platform?: string } })?.userAgentData?.platform ??
        nav2?.platform,
      viewport:
        typeof window !== "undefined" ? `${window.innerWidth}x${window.innerHeight}` : undefined,
      touch: typeof window !== "undefined" ? "ontouchstart" in window : undefined,
      language: nav2?.language,
      appVersion: APP_VERSION,
      task: taskContext,
    },
  };
}

const OPEN_EVENT = "problems:report";

/** Abre o painel "Reportar problema" (montado no AppShell) de qualquer lugar. */
export function openReportProblem() {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: captureReportContext() }));
}

export function onOpenReportProblem(cb: (ctx: ReportContext) => void): () => void {
  const handler = (e: Event) => cb((e as CustomEvent<ReportContext>).detail);
  window.addEventListener(OPEN_EVENT, handler);
  return () => window.removeEventListener(OPEN_EVENT, handler);
}
