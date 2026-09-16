import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { getClienteLinkData } from "@/lib/cliente-link.functions";
import { fetchWorkspace, type Workspace } from "@/lib/workspace-store";
import { t, usePortalLang } from "@/lib/portal-i18n";
import { PortalDataProvider, usePortalData } from "@/components/portal/portal-context";
import { PortalAppShell } from "@/components/portal/PortalAppShell";
import { PortalTopBar } from "@/components/portal/PortalTopBar";
import { PortalBugReportButton } from "@/components/PortalBugReportButton";
import { VersionWatcher } from "@/components/VersionWatcher";
import { EmptyState } from "@/components/shared/EmptyState";
import { SkeletonCard } from "@/components/shared/SkeletonPatterns";
import type { ClienteLinkData } from "@/lib/portal-types";

/**
 * Layout do Portal do Cliente — Etapa 2 (shell/navegação/responsividade) do
 * redesenho completo do portal. Substitui a antiga rota única
 * `routes/portal.$token.tsx` (2610 linhas) por esta rota-pai (dona do
 * loader e do shell) + rotas-filha em URLs limpas (`/inicio`, `/campanhas/
 * :id`, `/relatorios`, `/solicitacoes`). Conteúdo de cada página ainda é o
 * mesmo de hoje (movido, não redesenhado) — isso é trabalho de etapas
 * futuras (3 a 7 do pedido do usuário).
 */
export const Route = createFileRoute("/portal/$token")({
  // Carrega os dados da campanha (e o workspace, pro cabeçalho) no servidor
  // antes de mandar qualquer HTML — evita tela em branco em navegadores
  // embutidos mais fracos (ex: navegador interno do Telegram) ou conexões
  // ruins, que dependeriam 100% do JS carregar no cliente pra mostrar algo.
  loader: async ({ params }) => {
    const [clienteData, ws] = await Promise.all([
      getClienteLinkData({ data: { token: params.token } }).catch(() => null),
      fetchWorkspace().catch(() => ({ nome: "Você no Hype", logo: "" })),
    ]);
    return { clienteData: clienteData as ClienteLinkData | null, ws };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.clienteData?.clienteNome || "Portal"} · Hype` },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  pendingComponent: PortalPending,
  component: PortalLayout,
});

function PortalPending() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="flex h-14 shrink-0 items-center border-b border-border px-5" />
      <div className="grid flex-1 grid-cols-1 gap-4 p-6 sm:grid-cols-2 lg:grid-cols-3">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  );
}

function PortalLayout() {
  const { token } = Route.useParams();
  const loaderData = Route.useLoaderData();
  const [data] = useState<ClienteLinkData | null>(loaderData.clienteData);
  const [ws] = useState<Workspace>(loaderData.ws);
  const [lang, setLang] = usePortalLang();

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  if (!data) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <PortalTopBar ws={ws} lang={lang} onLangChange={setLang} />
        <div className="flex flex-1 items-center justify-center p-6">
          <EmptyState
            icon={<AlertTriangle className="h-5 w-5" />}
            title={t(lang, "notFoundTitle")}
            description={t(lang, "notFoundBody")}
          />
        </div>
      </div>
    );
  }

  return (
    <PortalDataProvider token={token} initialData={data} ws={ws}>
      <PortalShellWithContext />
    </PortalDataProvider>
  );
}

// Precisa ficar num componente separado pra poder chamar `usePortalData()`
// (o `PortalDataProvider` acima é quem cria o contexto).
function PortalShellWithContext() {
  const ctx = usePortalData();
  return (
    <PortalAppShell ctx={ctx}>
      <PortalBugReportButton token={ctx.token} lang={ctx.lang} />
      <VersionWatcher scope="vc" />
      <Outlet />
    </PortalAppShell>
  );
}
