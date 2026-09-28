import { Sparkles } from "lucide-react";
import { InfluencerDrawerSection } from "./InfluencerDrawerSection";
import type { PublicInfluencer } from "@/lib/portal-types";

const KIND_LABEL: Record<string, string> = {
  perfil_enviado: "Perfil enviado para aprovação",
  perfil_aprovado: "Influenciador aprovado",
  perfil_recusado: "Influenciador não aprovado",
  perfil_reaberto: "Decisão reaberta",
  roteiro_enviado: "Roteiro enviado",
  roteiro_aprovado: "Roteiro aprovado",
  roteiro_ajustes_solicitados: "Ajustes solicitados no roteiro",
  conteudo_enviado: "Conteúdo enviado",
  conteudo_aprovado: "Conteúdo aprovado",
  conteudo_ajustes_solicitados: "Ajustes solicitados no conteúdo",
  publicado: "Conteúdo publicado",
  comentario_cliente: "Comentário adicionado",
  comentario_equipe: "Comentário da equipe",
};

/**
 * Atividade — timeline cronológica real, direto de `activityEvents`
 * (nunca reconstruída a partir do estado atual). Cada evento já registra
 * o ator (`cliente`/`equipe`) e a data no momento em que aconteceu — se
 * o histórico anterior a este campo existir era incompleto, não
 * inventamos nada pra preencher; só os eventos reais aparecem.
 */
export function ClientInfluencerActivity({ influencer }: { influencer: PublicInfluencer }) {
  const events = [...(influencer.activityEvents ?? [])].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );

  if (events.length === 0) return null;

  return (
    <InfluencerDrawerSection icon={<Sparkles className="h-4 w-4" />} title="Atividade">
      <div className="space-y-1.5 rounded-2xl bg-card p-2 dark:shadow-none">
        {events.map((event) => (
          <div key={event.id} className="flex items-start gap-2.5 rounded-xl px-3 py-2">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Sparkles className="h-3 w-3" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-foreground">
                <span className="font-medium">{event.actorName}</span>{" "}
                {(KIND_LABEL[event.kind] ?? event.kind).toLowerCase()}
              </p>
              <p className="mt-0.5 text-xs text-text-secondary">
                {new Date(event.createdAt).toLocaleString("pt-BR", {
                  dateStyle: "short",
                  timeStyle: "short",
                })}
              </p>
            </div>
          </div>
        ))}
      </div>
    </InfluencerDrawerSection>
  );
}
