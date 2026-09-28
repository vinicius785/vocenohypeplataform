import { Sparkles } from "lucide-react";
import { CampaignSection } from "./CampaignSection";
import type { ActivityEntry } from "../../types/attention";

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

/** Atividade recente — só renderiza a seção quando há histórico real
 * (nunca um card vazio grande "sem atividade" no fim de uma página já
 * longa). Nenhuma consulta nova: mesmos `activityEvents`/relatórios já
 * usados na Início. */
export function ClientCampaignActivity({ entries }: { entries: ActivityEntry[] }) {
  if (entries.length === 0) return null;

  return (
    <CampaignSection icon={<Sparkles className="h-4 w-4" />} title="Atividade recente">
      <div className="space-y-1.5 rounded-2xl bg-card p-2 dark:shadow-none">
        {entries.map((entry) => (
          <div key={entry.id} className="flex items-center gap-3 rounded-xl px-3 py-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            <p className="min-w-0 flex-1 truncate text-sm text-foreground">{entry.label}</p>
            <span className="shrink-0 text-xs text-text-secondary">{relativeLabel(entry.at)}</span>
          </div>
        ))}
      </div>
    </CampaignSection>
  );
}
