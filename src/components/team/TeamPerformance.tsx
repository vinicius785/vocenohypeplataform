import { useMemo } from "react";
import { Info, Trophy, UsersIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SCORE_RULES, type MemberScore } from "@/lib/score";
import type { Member } from "@/components/TimeSection";
import { MemberPerformanceRow } from "./MemberPerformanceRow";

/** "Performance do time" — o ranking de pessoas, ordenado por pontuação,
 * que agora É a lista de membros da página (decisão confirmada com o
 * usuário: não existe mais uma lista de gestão separada do ranking). A
 * legenda de pontuação vira um popover atrás de um ícone de informação,
 * em vez de ocupar uma faixa fixa da tela o tempo todo. */
export function TeamPerformance({
  members,
  scoreByMemberId,
  meId,
  isAdmin,
  loading,
  hasAnyMembers,
  onOpenProfile,
  onEdit,
  onDelete,
  onReset,
}: {
  members: Member[];
  scoreByMemberId: Map<string, MemberScore>;
  meId: string | null;
  isAdmin: boolean;
  loading: boolean;
  hasAnyMembers: boolean;
  onOpenProfile: (m: Member) => void;
  onEdit: (m: Member) => void;
  onDelete: (id: string) => void;
  onReset: (id: string) => void;
}) {
  const ranked = useMemo(
    () =>
      [...members].sort(
        (a, b) => (scoreByMemberId.get(b.id)?.score ?? 0) - (scoreByMemberId.get(a.id)?.score ?? 0),
      ),
    [members, scoreByMemberId],
  );

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2 px-1">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          <Trophy className="h-3.5 w-3.5 text-amber-500" /> Performance do time
        </h3>
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Como a pontuação é calculada"
            >
              <Info className="h-3.5 w-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-72" align="end">
            <p className="mb-2 text-xs font-semibold text-foreground">Como a pontuação funciona</p>
            <ul className="space-y-1.5">
              {SCORE_RULES.map((r) => (
                <li key={r.key} className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-muted-foreground">{r.label}</span>
                  <span
                    className={`shrink-0 font-semibold ${
                      r.points > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
                    }`}
                  >
                    {r.points > 0 ? "+" : ""}
                    {r.points}
                  </span>
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      </div>

      <div className="mt-3">
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-[52px] animate-pulse rounded-xl border border-border bg-muted/30"
              />
            ))}
          </div>
        ) : ranked.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-background p-10 text-center">
            <UsersIcon className="mx-auto h-8 w-8 text-muted-foreground/50" />
            <p className="mt-3 text-sm text-muted-foreground">
              {hasAnyMembers ? "Nenhum resultado para essa busca." : "Nenhum membro ainda."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border rounded-lg border border-border">
            {ranked.map((m, i) => (
              <div key={m.id} className="flex items-center">
                <span className="w-7 shrink-0 pl-3 text-center text-xs font-semibold tabular-nums text-muted-foreground">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <MemberPerformanceRow
                    member={m}
                    score={scoreByMemberId.get(m.id)}
                    isSelf={m.id === meId}
                    isAdmin={isAdmin}
                    onOpenProfile={() => onOpenProfile(m)}
                    onEdit={() => onEdit(m)}
                    onDelete={() => onDelete(m.id)}
                    onReset={() => onReset(m.id)}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
