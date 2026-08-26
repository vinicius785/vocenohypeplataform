import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { EmailDashboard } from "./email-campaigns/EmailDashboard";
import { CampanhaPage } from "./email-campaigns/CampanhaPage";
import { NovaCampanhaDialog } from "./email-campaigns/NovaCampanhaDialog";
import { TemplatesTab } from "./email-campaigns/TemplatesTab";
import { ConfigTab } from "./email-campaigns/ConfigTab";

/**
 * Aba "E-mails" do projeto Marketing (feature `fluxos_email` em
 * projetos.ts, mesmo padrão de "AEO Monitor": feature global, sem dados
 * presos a este projeto específico — email_campaigns/email_templates
 * são compartilhados entre quem tiver a feature habilitada). Gestão em
 * si é admin-only (RLS já exige is_admin() — o aviso abaixo só evita
 * mostrar a tela pra quem vai só tomar erro ao salvar).
 *
 * Modelo: CAMPANHA → PÚBLICO → FLUXO/SEQUÊNCIA → MENSAGENS →
 * DISPARO/AGENDAMENTO → RESULTADOS. Navegação por pilha de views local
 * (mesmo padrão de MetasSection), não rotas novas.
 */

type Tab = "campanhas" | "templates" | "config";
type View = { kind: "dashboard" } | { kind: "campanha"; id: string };

export function FluxosEmailPanel() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>("campanhas");
  const [view, setView] = useState<View>({ kind: "dashboard" });
  const [novaOpen, setNovaOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user || cancelled) return;
      const { data: ok } = await supabase.rpc("is_admin", { _user_id: u.user.id });
      if (!cancelled) setIsAdmin(Boolean(ok));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (isAdmin === null) {
    return <div className="h-40 animate-pulse rounded-lg border border-border bg-muted/30" />;
  }
  if (isAdmin === false) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-background p-6 text-center">
        <p className="text-xs text-muted-foreground">
          Apenas administradores podem ver e gerenciar as campanhas de e-mail.
        </p>
      </div>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "campanhas", label: "Campanhas" },
    { key: "templates", label: "Templates" },
    { key: "config", label: "Configuração" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border">
        <div className="flex flex-wrap gap-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                setTab(t.key);
                setView({ kind: "dashboard" });
              }}
              className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
                tab === t.key
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab === "campanhas" && view.kind === "dashboard" && (
          <button
            type="button"
            onClick={() => setNovaOpen(true)}
            className="mb-1 inline-flex items-center gap-1.5 rounded-md bg-foreground px-2.5 py-1.5 text-xs font-medium text-background hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" /> Nova campanha
          </button>
        )}
      </div>

      {tab === "campanhas" &&
        (view.kind === "dashboard" ? (
          <EmailDashboard
            refreshKey={refreshKey}
            onOpenCampaign={(id) => setView({ kind: "campanha", id })}
            onNewCampaign={() => setNovaOpen(true)}
          />
        ) : (
          <CampanhaPage
            campaignId={view.id}
            onBack={() => {
              setView({ kind: "dashboard" });
              setRefreshKey((k) => k + 1);
            }}
            onDeleted={() => {
              setView({ kind: "dashboard" });
              setRefreshKey((k) => k + 1);
            }}
          />
        ))}
      {tab === "templates" && <TemplatesTab />}
      {tab === "config" && <ConfigTab />}

      <NovaCampanhaDialog
        open={novaOpen}
        onOpenChange={setNovaOpen}
        onSaved={(id) => {
          setNovaOpen(false);
          setTab("campanhas");
          setView({ kind: "campanha", id });
        }}
      />
    </div>
  );
}
