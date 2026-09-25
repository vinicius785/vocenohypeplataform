import { AlertCircle, ArrowRight, CheckCircle2 } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { Card, CardHeader } from "@/components/InicioDashboard";
import { EmptyState } from "@/components/shared/EmptyState";
import type { AttentionItem } from "../types/attention";

// Nunca ligamos "Ver tudo"/"Ver aprovações" pra uma página própria —
// Aprovações deixou de existir como destino de menu. Cada item já leva
// direto pro contexto certo; não existe uma lista completa pra "ver".

// Vermelho é reservado pra erro real de interface — uma ação pendente do
// cliente, por mais urgente que seja, nunca é um "erro"/"risco", então o
// nível mais urgente também usa âmbar (mesma regra de cor do resto do
// portal: âmbar só quando existe ação concreta do cliente, nunca vermelho
// pra classificar campanha/prazo).
const PRIORITY_DOT: Record<AttentionItem["priority"], string> = {
  high: "bg-warning",
  medium: "bg-warning",
  low: "bg-brand",
};

/**
 * "Precisa da sua atenção" — mesma linguagem visual do card "Meu
 * trabalho" da Início do time: `Card`/`CardHeader` compartilhados,
 * linhas divididas por `divide-y`, hover sutil, sem um card gigante por
 * item.
 */
export function ClientAttentionList({ items }: { items: AttentionItem[] }) {
  const navigate = useNavigate();

  return (
    <Card>
      <CardHeader icon={<AlertCircle className="h-4 w-4" />} title="Precisa da sua atenção" />
      {items.length === 0 ? (
        <EmptyState
          compact
          icon={<CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
          title="Nenhuma pendência agora. Tudo em dia."
        />
      ) : (
        <div className="divide-y divide-border/70">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => navigate({ to: item.href })}
              className="group flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset md:px-5"
            >
              <span
                className={`mt-1 h-2 w-2 shrink-0 rounded-full ${PRIORITY_DOT[item.priority]}`}
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-foreground group-hover:underline">
                  {item.description}
                </p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {item.campanhaNome}
                  {item.dueLabel ? ` · ${item.dueLabel}` : ""}
                </p>
              </div>
              <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-xs font-medium text-brand">
                {item.ctaLabel}
                <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}
