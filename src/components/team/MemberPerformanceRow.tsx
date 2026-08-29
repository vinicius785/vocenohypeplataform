import { ShieldCheck, KeyRound, Pencil, X, AlertTriangle } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { ScoreOperacionalResult } from "@/lib/performance-engine";
import type { Member } from "@/components/TimeSection";
import { avatarAccent, initialsOf, getStatus, PresenceDot, IconAction } from "./member-ui";

/** Uma linha da "Performance do Time" — clicar abre a ficha individual
 * do membro (dialog de diagnóstico), onde vive o detalhamento completo
 * do Score. Aqui só o essencial: avatar, nome, cargo, quantidade de
 * atrasos, Score grande — "a página Time identifica, a ficha individual
 * explica". Ações de admin (editar/redefinir senha/remover) continuam
 * aqui, idênticas a antes. */
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
  score?: ScoreOperacionalResult;
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
  const atrasadas = score?.pendencias.overdueCount ?? 0;

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
            className={`flex items-center gap-1 text-xs ${atrasadas > 0 ? "text-destructive" : "text-muted-foreground"}`}
            title="Atrasadas agora"
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            {atrasadas} atrasada{atrasadas === 1 ? "" : "s"}
          </span>
        </div>
      )}

      {score && (
        <span
          className={`shrink-0 text-base font-semibold tabular-nums ${
            score.score == null
              ? "text-muted-foreground"
              : score.score >= 80
                ? "text-emerald-600 dark:text-emerald-400"
                : score.score < 50
                  ? "text-destructive"
                  : "text-foreground"
          }`}
          title="Score Operacional"
        >
          {score.score == null ? "—" : score.score}
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
