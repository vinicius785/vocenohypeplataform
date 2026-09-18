import { createFileRoute, Link } from "@tanstack/react-router";
import { Megaphone } from "lucide-react";
import { usePortalSessionData } from "@/components/portal/portal-session-context";

/**
 * `/portal-app/campanhas` — lista de campanhas do cliente autenticado.
 * Mirrors `routes/portal.$token/campanhas.index.tsx`, mas usa
 * `usePortalSessionData()` (sessão) em vez de `usePortalData()` (token) e
 * `/portal-app/campanhas/$campanhaId` em vez de `/portal/$token/campanhas/
 * $campanhaId`. Deliberadamente uma versão mais enxuta que a original (sem
 * o selo de "encerrada"/ordenação por status) — porte 1:1 do visual
 * completo fica pra Fase 3, ver relatório final.
 */
export const Route = createFileRoute("/portal-app/campanhas")({
  ssr: false,
  component: PortalAppCampanhasPage,
  head: () => ({ meta: [{ title: "Campanhas · Portal do Cliente" }] }),
});

function PortalAppCampanhasPage() {
  const { data } = usePortalSessionData();

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-xl font-semibold tracking-tight text-foreground">Campanhas</h1>
      {data.campanhas.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">Nenhuma campanha encontrada.</p>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {data.campanhas.map((c) => (
            <Link
              key={c.id}
              to="/portal-app/campanhas/$campanhaId"
              params={{ campanhaId: c.id }}
              className="rounded-xl border border-border bg-card p-4 transition-colors hover:border-foreground/20"
            >
              <div className="flex items-center gap-2">
                <Megaphone className="h-4 w-4 text-muted-foreground" />
                <p className="truncate text-sm font-semibold text-foreground">{c.nome}</p>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {c.influencers.length} influenciador(es)
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
