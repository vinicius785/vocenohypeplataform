import { AlertTriangle, TrendingUp, Users } from "lucide-react";

/** Superfície protagonista do Time (migração visual — mesma direção do
 * Resumo Financeiro/Comercial): "Tarefas em aberto" é o indicador
 * dominante (maior volume operacional corrente), com Membros/Atrasadas
 * como apoio dentro do próprio hero — texto sempre em
 * `brand-foreground`/`brand-foreground-secondary` (contraste AA já
 * validado), nunca vermelho/verde direto sobre o azul (medido ~1-1.5:1
 * nas rodadas anteriores). "Concluídas na semana" fica como card
 * secundário fora do hero, com tom de sucesso real (verde = saudável/
 * concluído). Nenhum indicador novo — os 4 já existiam em
 * `TeamDashboard.tsx`; os cliques preservam o comportamento anterior
 * (scroll até "Tarefas que precisam de atenção" na aba certa). */
const SECONDARY_SURFACE = "bg-card border border-border/60 dark:border-0 dark:bg-[oklch(0.17_0_0)]";

export function TeamHero({
  openTasksCount,
  dueTodayCount,
  membersCount,
  onlineCount,
  overdueCount,
  completedThisWeek,
  weeklyVariation,
  onOpenAberto,
  onOpenAtrasadas,
}: {
  openTasksCount: number;
  dueTodayCount: number;
  membersCount: number;
  onlineCount: number;
  overdueCount: number;
  completedThisWeek: number;
  weeklyVariation: string | null;
  onOpenAberto: () => void;
  onOpenAtrasadas: () => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
      <div className="rounded-[28px] bg-brand p-7 dark:shadow-none md:p-8 lg:col-span-7">
        <button type="button" onClick={onOpenAberto} className="block w-full text-left">
          <span className="inline-flex items-center rounded-full bg-black/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-foreground">
            Tarefas em aberto
          </span>
          <p className="mt-5 whitespace-nowrap text-[48px] font-bold leading-none tracking-tight text-brand-foreground sm:text-[56px] md:text-[64px]">
            {openTasksCount}
          </p>
          <p className="mt-3 text-sm text-brand-foreground-secondary">
            {dueTodayCount} vencem hoje
          </p>
        </button>

        <div className="mt-7 flex flex-wrap items-end gap-8">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/10 text-brand-foreground">
              <Users className="h-4 w-4" />
            </span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-foreground-secondary">
                Membros
              </p>
              <p className="whitespace-nowrap text-lg font-bold leading-none text-brand-foreground">
                {membersCount}{" "}
                <span className="text-sm font-medium text-brand-foreground-secondary">
                  · {onlineCount} online
                </span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenAtrasadas}
            className="flex items-center gap-2.5 text-left"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/10 text-brand-foreground">
              <AlertTriangle className="h-4 w-4" />
            </span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-foreground-secondary">
                Atrasadas
              </p>
              <p className="whitespace-nowrap text-lg font-bold leading-none text-brand-foreground underline decoration-brand-foreground-secondary decoration-dotted underline-offset-4">
                {overdueCount}
              </p>
            </div>
          </button>
        </div>
      </div>

      <div
        className={`flex flex-col justify-center rounded-[22px] ${SECONDARY_SURFACE} p-6 lg:col-span-5`}
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-success-soft text-success">
          <TrendingUp className="h-4 w-4" />
        </span>
        <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-text-secondary">
          Concluídas na semana
        </p>
        <p className="mt-1 whitespace-nowrap text-[36px] font-bold tabular-nums leading-none text-foreground">
          {completedThisWeek}
        </p>
        {weeklyVariation && (
          <p
            className={`mt-2 text-sm font-medium ${weeklyVariation.startsWith("-") ? "text-text-secondary" : "text-success"}`}
          >
            {weeklyVariation}
          </p>
        )}
      </div>
    </div>
  );
}
