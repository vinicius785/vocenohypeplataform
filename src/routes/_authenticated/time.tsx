import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell, type SectionKey } from "@/components/AppShell";
import { InicioDashboard } from "@/components/InicioDashboard";
import { ClientesSection } from "@/components/ClientesSection";
import { CampanhasSection } from "@/components/CampanhasSection";
import { TimeSection } from "@/components/TimeSection";
import { GestaoSection } from "@/components/GestaoSection";
import { InfluenciadoresSection } from "@/components/InfluenciadoresSection";
import { ReunioesSection } from "@/components/ReunioesSection";
import { ProjetosSection } from "@/components/ProjetosSection";
import { ComercialSection } from "@/components/ComercialSection";
import { ConfiguracoesSection } from "@/components/ConfiguracoesSection";
import { FinanceiroSection } from "@/components/FinanceiroSection";

import { ChatSection } from "@/components/ChatSection";

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
  "gestao",
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

  time: { title: "Time", description: "Membros e permissões." },
  gestao: { title: "Gestão", description: "Métricas e pontuação do time." },
  influenciadores: { title: "Banco de influenciadores", description: "Catálogo de criadores." },
  chat: { title: "Chat", description: "Conversas do time." },
  configuracoes: { title: "Configurações", description: "Preferências do workspace." },
};

function TimePage() {
  const search = useSearch({ from: "/_authenticated/time" });
  const [active, setActive] = useState<SectionKey>(search.section ?? "inicio");
  useEffect(() => {
    if (search.section && search.section !== active) setActive(search.section);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.section]);
  useEffect(() => {
    const onNav = (e: Event) => {
      const detail = (e as CustomEvent<SectionKey>).detail;
      if (detail) setActive(detail);
    };
    window.addEventListener("nav:section", onNav);
    return () => window.removeEventListener("nav:section", onNav);
  }, []);

  const section = SECTIONS[active];

  return (
    <AppShell active={active} onSelect={setActive}>
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
      ) : active === "gestao" ? (
        <GestaoSection />
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
    </AppShell>
  );
}
