import {
  PageSummaryPanel,
  SummaryMetric,
  SummaryPrimaryMetric,
} from "@/components/shared/PageSummaryPanel";

/** Superfície de resumo do Time (migração visual — mesma linguagem já
 * aplicada a Reuniões/Clientes/Campanhas/Projetos/Comercial):
 * `PageSummaryPanel` neutro (`bg-card`, acento azul só na borda esquerda)
 * substitui o antigo hero `bg-brand` grande. "Tarefas em aberto" segue
 * dominante via `SummaryPrimaryMetric`; Vencem hoje/Membros/Online são
 * apoio; Atrasadas em vermelho (`text-destructive`) e Concluídas na
 * semana em verde (`text-success`, mesmo tom usado em Reuniões pro status
 * "Confirmada") — nenhum indicador novo, os mesmos 6 valores já existiam
 * em `TeamDashboard.tsx`, cliques preservados (scroll até "Tarefas que
 * precisam de atenção" na aba certa). */
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
    <PageSummaryPanel title="Operação do time">
      <SummaryPrimaryMetric value={String(openTasksCount)} label="tarefas em aberto" />
      <SummaryMetric label="Vencem hoje" value={dueTodayCount} onClick={onOpenAberto} />
      <SummaryMetric label="Membros" value={membersCount} />
      <SummaryMetric label="Online" value={onlineCount} />
      <SummaryMetric
        label="Atrasadas"
        value={<span className="text-destructive">{overdueCount}</span>}
        onClick={onOpenAtrasadas}
      />
      <SummaryMetric
        label="Concluídas na semana"
        value={
          <span className="text-success">
            {completedThisWeek}
            {weeklyVariation && (
              <span className="ml-1 text-xs font-medium text-text-secondary">
                ({weeklyVariation})
              </span>
            )}
          </span>
        }
      />
    </PageSummaryPanel>
  );
}
