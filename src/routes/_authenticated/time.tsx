import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
import { AppShell, type SectionKey } from "@/components/AppShell";
import { LockedSection } from "@/components/LockedSection";
import { useMyAccess, hasPermission, SECTION_PERMISSION } from "@/lib/permissions";

// Cada seção vira o próprio chunk JS, baixado só quando o usuário navega até
// ela — antes todas as 12 seções (algumas com milhares de linhas, ex.
// ConfiguracoesSection/ChatSection) eram importadas estaticamente aqui e
// entravam no bundle inicial mesmo que só "Início" fosse aberto.
const InicioDashboard = lazy(() =>
  import("@/components/InicioDashboard").then((m) => ({ default: m.InicioDashboard })),
);
const ClientesSection = lazy(() =>
  import("@/components/ClientesSection").then((m) => ({ default: m.ClientesSection })),
);
const CampanhasSection = lazy(() =>
  import("@/components/CampanhasSection").then((m) => ({ default: m.CampanhasSection })),
);
const TimeSection = lazy(() =>
  import("@/components/TimeSection").then((m) => ({ default: m.TimeSection })),
);
const InfluenciadoresSection = lazy(() =>
  import("@/components/InfluenciadoresSection").then((m) => ({
    default: m.InfluenciadoresSection,
  })),
);
const MetasSection = lazy(() =>
  import("@/components/metas/MetasSection").then((m) => ({ default: m.MetasSection })),
);
const ReunioesSection = lazy(() =>
  import("@/components/ReunioesSection").then((m) => ({ default: m.ReunioesSection })),
);
const ProjetosSection = lazy(() =>
  import("@/components/ProjetosSection").then((m) => ({ default: m.ProjetosSection })),
);
const ComercialSection = lazy(() =>
  import("@/components/ComercialSection").then((m) => ({ default: m.ComercialSection })),
);
const ConfiguracoesSection = lazy(() =>
  import("@/components/ConfiguracoesSection").then((m) => ({ default: m.ConfiguracoesSection })),
);
const FinanceiroSection = lazy(() =>
  import("@/components/FinanceiroSection").then((m) => ({ default: m.FinanceiroSection })),
);
const ChatSection = lazy(() =>
  import("@/components/ChatSection").then((m) => ({ default: m.ChatSection })),
);

function SectionFallback() {
  return (
    <div className="flex h-[50vh] items-center justify-center">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}

const VALID: SectionKey[] = [
  "inicio",
  "clientes",
  "campanhas",
  "projetos",
  "reunioes",
  "comercial",
  "financeiro",
  "time",
  "influenciadores",
  "metas",
  "chat",
  "configuracoes",
];

export const Route = createFileRoute("/_authenticated/time")({
  component: TimePage,
  head: () => ({ meta: [{ title: "Plataforma VNH" }] }),
  validateSearch: (s: Record<string, unknown>): { section?: SectionKey } => {
    const v = s.section;
    return typeof v === "string" && (VALID as string[]).includes(v)
      ? { section: v as SectionKey }
      : {};
  },
});

const SECTIONS: Record<SectionKey, { title: string; description: string }> = {
  inicio: { title: "Início", description: "Visão geral do seu workspace." },
  clientes: { title: "Clientes", description: "Gerencie seus clientes." },
  campanhas: { title: "Campanhas", description: "Suas campanhas ativas." },
  projetos: { title: "Projetos", description: "Acompanhe seus projetos." },
  reunioes: { title: "Reuniões", description: "Agenda unificada com clientes e time." },
  comercial: { title: "Comercial", description: "Pipeline e vendas." },
  financeiro: { title: "Financeiro", description: "Receitas, despesas e fluxo." },

  time: { title: "Time", description: "Membros, métricas e pontuação do time." },
  influenciadores: { title: "Banco de influenciadores", description: "Catálogo de criadores." },
  metas: { title: "Metas", description: "Metas do time, com progresso e prazos." },
  chat: { title: "Chat", description: "Conversas do time." },
  configuracoes: { title: "Configurações", description: "Preferências do workspace." },
};

function TimePage() {
  const search = useSearch({ from: "/_authenticated/time" });
  const navigate = useNavigate();
  // Fonte única de verdade é a URL — antes o clique no menu só mudava um
  // useState local, nunca a URL, então um refresh sempre voltava pro
  // "início" mesmo tendo acabado de entrar em Comercial.
  const active = search.section ?? "inicio";
  const setActive = (key: SectionKey) => {
    void navigate({ to: "/time", search: { section: key }, replace: true });
  };
  useEffect(() => {
    const onNav = (e: Event) => {
      const detail = (e as CustomEvent<SectionKey>).detail;
      if (detail) setActive(detail);
    };
    window.addEventListener("nav:section", onNav);
    return () => window.removeEventListener("nav:section", onNav);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const section = SECTIONS[active];
  const access = useMyAccess();
  // "configuracoes" fica de fora aqui: a própria tela filtra suas abas
  // (perfil/preferências continuam sempre acessíveis, só as abas
  // administrativas exigem a permissão).
  const allowed = active === "configuracoes" || hasPermission(access, SECTION_PERMISSION[active]);

  return (
    <AppShell active={active} onSelect={setActive}>
      {!allowed ? (
        <LockedSection title={section.title} />
      ) : (
        <Suspense fallback={<SectionFallback />}>
          {active === "inicio" ? (
            <InicioDashboard />
          ) : active === "clientes" ? (
            <ClientesSection />
          ) : active === "campanhas" ? (
            <CampanhasSection />
          ) : active === "time" ? (
            <TimeSection />
          ) : active === "influenciadores" ? (
            <InfluenciadoresSection />
          ) : active === "metas" ? (
            <MetasSection />
          ) : active === "reunioes" ? (
            <ReunioesSection />
          ) : active === "projetos" ? (
            <ProjetosSection />
          ) : active === "comercial" ? (
            <ComercialSection />
          ) : active === "configuracoes" ? (
            <ConfiguracoesSection />
          ) : active === "financeiro" ? (
            <FinanceiroSection />
          ) : active === "chat" ? (
            <ChatSection />
          ) : (
            <>
              <h1 className="text-3xl font-semibold tracking-tight">{section.title}</h1>
              <p className="mt-2 text-sm text-muted-foreground">{section.description}</p>
            </>
          )}
        </Suspense>
      )}
    </AppShell>
  );
}
