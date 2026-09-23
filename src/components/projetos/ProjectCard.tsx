import {
  MoreVertical,
  Pencil,
  Copy,
  Pause,
  Play,
  Archive,
  ArchiveRestore,
  Trash2,
  ImageIcon,
  AlertTriangle,
  Clock,
  Ban,
  CheckCircle2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { AvatarStack } from "@/components/meetings/AvatarStack";
import { initialsOf } from "@/components/metas/metas-ui-utils";
import { FEATURES, PROJECT_STATUS_LABEL, type Project } from "@/lib/projetos";
import {
  FEATURE_ICONS,
  PROJECT_HEALTH_BADGE_VARIANT,
  PROJECT_HEALTH_LABEL,
  PROJECT_STATUS_BADGE_VARIANT,
  statusMenuActions,
  type ProjectMetrics,
} from "./projeto-ui";

/**
 * Card compacto da listagem de Projetos — capa reduzida (~150px), status
 * administrativo separado da saúde operacional, progresso e alertas só
 * quando há exceção real (nunca uma parede de indicadores zerados).
 *
 * Card inteiro clicável via "stretched button" (mesma técnica de
 * `ClienteCard.tsx`/`CampanhaCard.tsx`) — nunca um `role="button"`
 * envolvendo outro botão (o menu de três pontos), que é HTML de
 * interativo-aninhado inválido.
 */
export function ProjectCard({
  project,
  metrics,
  canEdit,
  onOpen,
  onEdit,
  onDuplicate,
  onPause,
  onReactivate,
  onArchive,
  onDelete,
}: {
  project: Project;
  metrics: ProjectMetrics;
  canEdit: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onPause: () => void;
  onReactivate: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const status = project.status ?? "ativo";
  const { canPause, canReactivate, canArchive } = statusMenuActions(status);
  const features = project.features ?? [];
  const visibleFeatures = features.slice(0, 2);
  const restFeatures = features.slice(2);

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-foreground/30 dark:shadow-none">
      <button
        type="button"
        onClick={onOpen}
        className="absolute inset-0 z-0 cursor-pointer rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        aria-label={`Abrir projeto ${project.name}`}
      />

      <div className="relative h-[150px] w-full shrink-0 overflow-hidden bg-muted pointer-events-none">
        {project.cover ? (
          <img src={project.cover} alt="" className="h-full w-full object-cover object-center" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <span className="text-2xl font-semibold text-muted-foreground/50">
              {initialsOf(project.name) || <ImageIcon className="h-6 w-6" strokeWidth={1.5} />}
            </span>
          </div>
        )}
        <div className="absolute right-2 top-2 pointer-events-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                aria-label={`Mais opções de ${project.name}`}
                className="relative z-10 flex h-7 w-7 items-center justify-center rounded-full bg-background/90 text-muted-foreground shadow-sm backdrop-blur hover:text-foreground"
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem onSelect={onOpen}>Abrir projeto</DropdownMenuItem>
              {canEdit && (
                <>
                  <DropdownMenuItem onSelect={onEdit}>
                    <Pencil className="h-3.5 w-3.5" /> Editar projeto
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={onDuplicate}>
                    <Copy className="h-3.5 w-3.5" /> Duplicar
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {canPause && (
                    <DropdownMenuItem onSelect={onPause}>
                      <Pause className="h-3.5 w-3.5" /> Pausar
                    </DropdownMenuItem>
                  )}
                  {canReactivate && (
                    <DropdownMenuItem onSelect={onReactivate}>
                      <Play className="h-3.5 w-3.5" /> Reativar
                    </DropdownMenuItem>
                  )}
                  {canArchive && (
                    <DropdownMenuItem onSelect={onArchive}>
                      <Archive className="h-3.5 w-3.5" /> Arquivar
                    </DropdownMenuItem>
                  )}
                  {!canArchive && (
                    <DropdownMenuItem onSelect={onArchive} disabled>
                      <ArchiveRestore className="h-3.5 w-3.5" /> Já arquivado
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={onDelete}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Excluir
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="relative flex flex-1 flex-col gap-2.5 p-4 pointer-events-none">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p title={project.name} className="truncate text-sm font-semibold text-foreground">
              {project.name}
            </p>
            <Badge
              variant={PROJECT_STATUS_BADGE_VARIANT[status]}
              className="shrink-0 px-1.5 py-0 text-[10px] font-medium"
            >
              {PROJECT_STATUS_LABEL[status]}
            </Badge>
            {metrics.health && (
              <Badge
                variant={PROJECT_HEALTH_BADGE_VARIANT[metrics.health]}
                className="shrink-0 px-1.5 py-0 text-[10px] font-medium"
              >
                {PROJECT_HEALTH_LABEL[metrics.health]}
              </Badge>
            )}
          </div>
          {project.description && (
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
              {project.description}
            </p>
          )}
        </div>

        {(metrics.principal || metrics.participantes.length > 0) && (
          <div className="pointer-events-auto flex items-center gap-2">
            <AvatarStack
              people={[metrics.principal, ...metrics.participantes].filter(
                (p): p is NonNullable<typeof p> => !!p,
              )}
              max={3}
              size="sm"
            />
            {metrics.principal && (
              <span className="truncate text-[11px] text-muted-foreground">
                {metrics.principal.name}
              </span>
            )}
          </div>
        )}

        <div>
          {metrics.total === 0 ? (
            <p className="text-[11px] text-muted-foreground">Sem tarefas</p>
          ) : (
            <>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-brand transition-all"
                  style={{ width: `${metrics.progressPct ?? 0}%` }}
                />
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {metrics.completed} de {metrics.total} tarefas concluídas · {metrics.progressPct}%
              </p>
            </>
          )}
        </div>

        {metrics.openCount > 0 && (
          <OperationalAlert
            overdueCount={metrics.overdueCount}
            blockedCount={metrics.blockedCount}
            dueSoonCount={metrics.dueSoonCount}
          />
        )}

        <div className="mt-auto flex items-center justify-between gap-2 border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
          <div className="pointer-events-auto flex min-w-0 items-center gap-1">
            {visibleFeatures.map((f) => {
              const meta = FEATURES.find((x) => x.key === f);
              const Icon = FEATURE_ICONS[f];
              return (
                <Badge key={f} variant="secondary" className="gap-1 font-normal">
                  <Icon className="h-3 w-3" />
                  {meta?.label ?? f}
                </Badge>
              );
            })}
            {restFeatures.length > 0 && (
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    onClick={(e) => e.stopPropagation()}
                    className="rounded-md border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-muted"
                  >
                    +{restFeatures.length}
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  className="w-auto p-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex flex-col gap-1">
                    {restFeatures.map((f) => {
                      const meta = FEATURES.find((x) => x.key === f);
                      const Icon = FEATURE_ICONS[f];
                      return (
                        <span key={f} className="flex items-center gap-1.5 text-xs text-foreground">
                          <Icon className="h-3 w-3" /> {meta?.label ?? f}
                        </span>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>
            )}
          </div>
          <span className="shrink-0">Atualizado {metrics.lastActivityLabel}</span>
        </div>
      </div>
    </article>
  );
}

/** Prioriza exceções — mostra só o alerta mais relevante, nunca uma
 * pilha de indicadores zerados (item 3 do pedido). */
function OperationalAlert({
  overdueCount,
  blockedCount,
  dueSoonCount,
}: {
  overdueCount: number;
  blockedCount: number;
  dueSoonCount: number;
}) {
  if (overdueCount > 0) {
    return (
      <span className="inline-flex w-fit items-center gap-1 rounded-full bg-danger-soft px-1.5 py-0.5 text-[11px] font-medium text-danger-soft-foreground">
        <AlertTriangle className="h-3 w-3" /> {overdueCount}{" "}
        {overdueCount === 1 ? "atrasada" : "atrasadas"}
      </span>
    );
  }
  if (blockedCount > 0) {
    return (
      <span className="inline-flex w-fit items-center gap-1 rounded-full bg-danger-soft px-1.5 py-0.5 text-[11px] font-medium text-danger-soft-foreground">
        <Ban className="h-3 w-3" /> {blockedCount} {blockedCount === 1 ? "bloqueio" : "bloqueios"}
      </span>
    );
  }
  if (dueSoonCount > 0) {
    return (
      <span className="inline-flex w-fit items-center gap-1 rounded-full bg-warning-soft px-1.5 py-0.5 text-[11px] font-medium text-warning-soft-foreground">
        <Clock className="h-3 w-3" /> {dueSoonCount} {dueSoonCount === 1 ? "vence" : "vencem"} esta
        semana
      </span>
    );
  }
  return (
    <span className="inline-flex w-fit items-center gap-1 text-[11px] text-muted-foreground">
      <CheckCircle2 className="h-3 w-3" /> Sem pendências críticas
    </span>
  );
}
