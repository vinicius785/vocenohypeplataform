import { Sparkles } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { Card, CardHeader } from "@/components/InicioDashboard";
import { EmptyState } from "@/components/shared/EmptyState";
import type { ActivityEntry } from "../types/attention";

function relativeLabel(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `há ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `há ${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return "ontem";
  if (diffD < 7) return `há ${diffD} dias`;
  return new Date(iso).toLocaleDateString("pt-BR");
}

/** Timeline compacta — mesmo padrão de linha do resto da Home (ícone +
 * texto + contexto + horário), estado vazio composto (nunca só uma
 * frase solta). */
export function ClientActivityList({ entries }: { entries: ActivityEntry[] }) {
  const navigate = useNavigate();

  return (
    <Card>
      <CardHeader icon={<Sparkles className="h-4 w-4" />} title="Atividade recente" />
      {entries.length === 0 ? (
        <EmptyState
          compact
          icon={<Sparkles className="h-4 w-4" aria-hidden="true" />}
          title="Nenhuma atividade recente"
          description="Aprovações, conteúdos e relatórios novos aparecem aqui."
        />
      ) : (
        <div className="divide-y divide-border/70">
          {entries.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => navigate({ to: entry.href })}
              className="group flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset md:px-5"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-foreground group-hover:underline">
                  {entry.label}
                </p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {entry.campanhaNome}
                </p>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">
                {relativeLabel(entry.at)}
              </span>
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}
