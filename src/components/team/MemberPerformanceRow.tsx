import { ShieldCheck, KeyRound, Pencil, X, CheckCircle2, AlertTriangle } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { MemberScore } from "@/lib/score";
import type { Member } from "@/components/TimeSection";
import { avatarAccent, initialsOf, getStatus, PresenceDot, IconAction } from "./member-ui";

/** Uma linha do ranking "Performance do time" — substitui o antigo
 * `PersonRow` (que expandia inline com score/tarefas/início de dia).
 * Agora a lista de pessoas E o ranking são a mesma coisa (decisão
 * confirmada com o usuário): clicar na linha abre a visão individual do
 * membro (dialog), em vez de expandir inline; as ações de admin
 * (editar/redefinir senha/remover) continuam aqui, idênticas a antes. */
export function MemberPerformanceRow({
  member: m,
  score,
  isSelf,
  isAdmin,
  onOpenProfile,
  onEdit,
  onDelete,
  onReset,
}: {
  member: Member;
  score?: MemberScore;
  isSelf: boolean;
  isAdmin: boolean;
  onOpenProfile: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onReset: () => void;
}) {
  const canManage = isAdmin;
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  const showName = canManage || isSelf || m.timeView.includes("name");
  const showRole = canManage || isSelf || m.timeView.includes("role");
  const status = getStatus(m.id);
  const concluidas = (score?.tasksOnTime ?? 0) + (score?.tasksLate ?? 0);
  const atrasadas = score?.tasksOverdue ?? 0;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpenProfile}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpenProfile();
        }
      }}
      className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-inset"
    >
      <div className="relative shrink-0">
        <Avatar className="h-10 w-10">
          {m.photo && <AvatarImage src={m.photo} alt={m.name} />}
          <AvatarFallback className={`text-sm font-semibold ${avatarAccent(m.id)}`}>
            {initialsOf(showName ? m.name : "", m.email)}
          </AvatarFallback>
        </Avatar>
        <PresenceDot status={status} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-semibold text-foreground">
            {showName ? m.name || "(sem nome)" : "Membro"}
          </p>
          {isSelf && (
            <Badge variant="secondary" className="shrink-0 px-1.5 py-0 text-[10px]">
              Você
            </Badge>
          )}
          {m.isAdmin && (
            <Badge
              variant="outline"
              className="shrink-0 gap-1 border-foreground/20 px-1.5 py-0 text-[10px] font-medium text-foreground"
            >
              <ShieldCheck className="h-2.5 w-2.5" /> Admin
            </Badge>
          )}
        </div>
        {showRole && m.role && <p className="truncate text-xs text-muted-foreground">{m.role}</p>}
      </div>

      {score && (
        <div className="hidden shrink-0 items-center gap-3 sm:flex">
          <span
            className="flex items-center gap-1 text-xs text-muted-foreground"
            title="Concluídas"
          >
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            {concluidas}
          </span>
          <span
            className={`flex items-center gap-1 text-xs ${atrasadas > 0 ? "text-destructive" : "text-muted-foreground"}`}
            title="Atrasadas"
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            {atrasadas}
          </span>
        </div>
      )}

      {score && (
        <span
          className={`shrink-0 text-base font-semibold tabular-nums ${
            score.score > 0
              ? "text-emerald-600 dark:text-emerald-400"
              : score.score < 0
                ? "text-destructive"
                : "text-foreground"
          }`}
        >
          {score.score > 0 ? "+" : ""}
          {score.score}
        </span>
      )}

      {canManage && (
        <div className="flex shrink-0 items-center gap-0.5">
          <IconAction
            label="Redefinir senha"
            onClick={(e) => {
              stop(e);
              onReset();
            }}
          >
            <KeyRound className="h-3.5 w-3.5" />
          </IconAction>
          <IconAction
            label="Editar"
            onClick={(e) => {
              stop(e);
              onEdit();
            }}
          >
            <Pencil className="h-3.5 w-3.5" />
          </IconAction>
          {!isSelf && (
            <IconAction
              label="Remover"
              destructive
              onClick={(e) => {
                stop(e);
                onDelete();
              }}
            >
              <X className="h-3.5 w-3.5" />
            </IconAction>
          )}
        </div>
      )}
    </div>
  );
}
