import {
  MoreVertical,
  Pencil,
  Copy,
  Pause,
  Play,
  Archive,
  Trash2,
  FolderKanban,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { initialsOf } from "@/components/metas/metas-ui-utils";
import { PROJECT_STATUS_LABEL, type Project } from "@/lib/projetos";
import {
  PROJECT_HEALTH_BADGE_VARIANT,
  PROJECT_HEALTH_LABEL,
  PROJECT_STATUS_BADGE_VARIANT,
  statusMenuActions,
  type ProjectMetrics,
} from "./projeto-ui";

/**
 * Card de projeto — mesma estrutura, tamanho e linguagem visual do
 * `CampanhaCard.tsx` (a referência oficial da rodada): container
 * `rounded-[20px]`/`p-4`, "stretched button" pro card inteiro abrir o
 * projeto sem HTML de interativo-aninhado inválido, miniatura quadrada
 * (nunca uma capa grande), no máximo 2 badges, divisor discreto e rodapé
 * textual compacto em duas linhas — nada de barra de progresso grande,
 * fileira de avatares ou botões de funcionalidade.
 */
export function ProjectCard({
  project,
  metrics,
  canEdit,
  neutral = false,
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
  /** Aparência mais neutra pra projetos encerrados (concluídos/arquivados) — mesmo card, sem cor de destaque. */
  neutral?: boolean;
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
  const initials = initialsOf(project.name);
  const extraCount = metrics.participantes.length;

  const linha1 = [
    metrics.currentPhaseLabel ?? "Sem fase atual",
    metrics.nextDeliveryIso ? `Entrega ${fmtDiaMes(metrics.nextDeliveryIso)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const progressoLabel =
    metrics.total === 0 ? null : `${metrics.completed} de ${metrics.total} concluídas`;
  const atrasadasLabel =
    metrics.overdueCount > 0
      ? `${metrics.overdueCount} ${metrics.overdueCount === 1 ? "atrasada" : "atrasadas"}`
      : null;

  return (
    <div
      className={`group relative cursor-pointer rounded-[20px] border border-transparent p-4 text-left transition-colors duration-150 hover:border-border hover:bg-accent/40 dark:shadow-none ${
        neutral ? "bg-muted/40" : "bg-card"
      }`}
    >
      <button
        type="button"
        onClick={onOpen}
        className="absolute inset-0 cursor-pointer rounded-[20px] transition-transform duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand active:scale-[0.99]"
        aria-label={`Abrir projeto ${project.name} — ${PROJECT_STATUS_LABEL[status]}${
          metrics.principal ? `, responsável ${metrics.principal.name}` : ""
        }`}
      />

      <div className="relative flex items-start justify-between gap-2 pointer-events-none">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted">
            {project.cover ? (
              <img src={project.cover} alt="" className="h-full w-full object-cover" />
            ) : initials ? (
              <span className="text-sm font-semibold text-muted-foreground/70">{initials}</span>
            ) : (
              <FolderKanban className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
            )}
          </div>
          <div className="min-w-0">
            <p title={project.name} className="truncate text-[15px] font-semibold text-foreground">
              {project.name}
            </p>
            <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
              {metrics.principal ? (
                <>
                  <Avatar className="h-4 w-4 shrink-0">
                    {metrics.principal.photo && (
                      <AvatarImage src={metrics.principal.photo} alt="" />
                    )}
                    <AvatarFallback className="text-[8px] font-medium">
                      {metrics.principal.name.trim()[0]?.toUpperCase() ?? "?"}
                    </AvatarFallback>
                  </Avatar>
                  <span className="truncate text-xs text-text-secondary">
                    {metrics.principal.name}
                  </span>
                  {extraCount > 0 && (
                    <span
                      title={metrics.participantes.map((p) => p.name).join(", ")}
                      className="shrink-0 text-[10px] font-medium text-muted-foreground"
                    >
                      +{extraCount}
                    </span>
                  )}
                </>
              ) : (
                <span className="truncate text-xs text-text-secondary">Sem responsável</span>
              )}
            </div>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`Mais ações para ${project.name}`}
              className="relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-text-secondary opacity-60 pointer-events-auto transition-opacity hover:bg-muted hover:text-foreground hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand group-hover:opacity-100 sm:h-8 sm:w-8"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onOpen}>Abrir</DropdownMenuItem>
            {canEdit && (
              <>
                <DropdownMenuItem onSelect={onEdit}>
                  <Pencil className="h-3.5 w-3.5" /> Editar
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

      <div className="relative mt-3 flex flex-wrap items-center gap-1.5 pointer-events-none">
        <Badge variant={PROJECT_STATUS_BADGE_VARIANT[status]}>{PROJECT_STATUS_LABEL[status]}</Badge>
        {metrics.health && metrics.health !== "saudavel" && (
          <Badge variant={PROJECT_HEALTH_BADGE_VARIANT[metrics.health]}>
            {PROJECT_HEALTH_LABEL[metrics.health]}
          </Badge>
        )}
      </div>

      <div className="relative mt-3 flex flex-col gap-1 border-t border-border/60 pt-3 text-xs text-text-secondary pointer-events-none">
        <p className="truncate">{linha1}</p>
        <p className="truncate">
          {progressoLabel ?? "Nenhuma tarefa cadastrada"}
          {atrasadasLabel && (
            <>
              {" · "}
              <span className="font-medium text-destructive">{atrasadasLabel}</span>
            </>
          )}
        </p>
      </div>
    </div>
  );
}

function fmtDiaMes(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}
