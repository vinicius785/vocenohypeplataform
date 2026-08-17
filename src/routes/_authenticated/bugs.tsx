import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Bug } from "lucide-react";
import { AppShell, type SectionKey } from "@/components/AppShell";
import { BackButton } from "@/components/BackButton";
import { ProjectBugsPanel } from "@/components/projetos/ProjectBugsPanel";

/**
 * Link direto/externo pra ver e resolver bugs & sugestões — mesmo painel
 * embutido na aba "Bugs & Sugestões" do Projeto HypeApp
 * (src/routes/_authenticated/projeto.$id.tsx), só que numa URL própria
 * (`/bugs`), pra poder ser aberta/compartilhada sem precisar navegar até
 * lá dentro do projeto.
 */
export const Route = createFileRoute("/_authenticated/bugs")({
  component: BugsPage,
  head: () => ({
    meta: [{ title: "Bugs & Sugestões · Plataforma VNH" }],
  }),
});

function BugsPage() {
  const navigate = useNavigate();
  const goToSection = (key: SectionKey) => navigate({ to: "/time", search: { section: key } });

  return (
    <AppShell active="projetos" onSelect={goToSection}>
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <BackButton onClick={() => goToSection("projetos")} label="Projetos" />

        <header className="flex items-center gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-foreground text-background">
            <Bug className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Bugs & Sugestões
            </h1>
            <p className="text-sm text-muted-foreground">
              HypeApp — relatos do time, com status de resolução.
            </p>
          </div>
        </header>

        <ProjectBugsPanel />
      </div>
    </AppShell>
  );
}
