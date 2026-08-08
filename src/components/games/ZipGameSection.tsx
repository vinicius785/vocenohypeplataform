import { useEffect, useMemo, useState } from "react";
import { Trophy, RotateCcw, Info } from "lucide-react";
import { SectionHeader } from "@/components/SectionHeader";
import { Button } from "@/components/ui/button";
import { getMe } from "@/lib/chat-store";
import { loadTeamMembers } from "@/lib/projetos";
import {
  getDailyPuzzle,
  todayZipKey,
  validateZipPath,
  type ZipCell,
  type ZipPuzzle,
} from "@/lib/zip-game";
import {
  getMyZipResult,
  listZipLeaderboard,
  submitZipResult,
  subscribeZipLeaderboard,
  type ZipResult,
} from "@/lib/zip-results";

function cellKey(c: ZipCell) {
  return `${c.r},${c.c}`;
}

function formatDuration(ms: number): string {
  const totalSeconds = ms / 1000;
  const m = Math.floor(totalSeconds / 60);
  const s = (totalSeconds % 60).toFixed(1);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/** Índice do checkpoint na célula, se houver (0-based) — usado pra desenhar o número. */
function checkpointIndexAt(puzzle: ZipPuzzle, cell: ZipCell): number {
  return puzzle.checkpoints.findIndex((cp) => cp.r === cell.r && cp.c === cell.c);
}

export function ZipGameSection() {
  const dateKey = useMemo(() => todayZipKey(), []);
  const puzzle = useMemo(() => getDailyPuzzle(dateKey), [dateKey]);
  const [path, setPath] = useState<ZipCell[]>([]);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [myResult, setMyResult] = useState<ZipResult | null | undefined>(undefined);
  const [leaderboard, setLeaderboard] = useState<ZipResult[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const me = getMe();
  const members = loadTeamMembers();
  const nameFor = (userId: string) =>
    userId === me.id ? "Você" : (members.find((m) => m.id === userId)?.name ?? "Alguém");
  const photoFor = (userId: string) => members.find((m) => m.id === userId)?.photo;

  const refreshLeaderboard = () => {
    void listZipLeaderboard(dateKey).then(setLeaderboard);
  };

  useEffect(() => {
    void getMyZipResult(dateKey).then(setMyResult);
    refreshLeaderboard();
    return subscribeZipLeaderboard(dateKey, refreshLeaderboard);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateKey]);

  useEffect(() => {
    if (!startedAt || myResult) return;
    const id = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(id);
  }, [startedAt, myResult]);

  const visited = useMemo(() => new Set(path.map(cellKey)), [path]);
  const total = puzzle.size * puzzle.size;
  const won = path.length === total;

  const handleCellClick = (cell: ZipCell) => {
    if (myResult || submitting || won) return;
    setError("");
    if (path.length === 0) {
      if (cellKey(cell) !== cellKey(puzzle.checkpoints[0])) {
        setError("Comece pelo ponto 1.");
        return;
      }
      setPath([cell]);
      setStartedAt(Date.now());
      return;
    }
    const last = path[path.length - 1];
    if (cellKey(cell) === cellKey(last) && path.length > 1) {
      setPath((p) => p.slice(0, -1));
      return;
    }
    const dr = Math.abs(cell.r - last.r);
    const dc = Math.abs(cell.c - last.c);
    const isAdjacent = dr + dc === 1;
    if (!isAdjacent || visited.has(cellKey(cell))) return;
    setPath((p) => [...p, cell]);
  };

  useEffect(() => {
    if (!won || !startedAt || myResult) return;
    if (!validateZipPath(puzzle, path)) {
      setError("Caminho inválido — desfaça o último passo e tente outro caminho.");
      return;
    }
    const timeMs = Date.now() - startedAt;
    setSubmitting(true);
    void submitZipResult({ dateKey, timeMs, moves: path.length - 1 })
      .then(() => getMyZipResult(dateKey))
      .then((r) => {
        setMyResult(r);
        refreshLeaderboard();
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Erro ao salvar resultado."))
      .finally(() => setSubmitting(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [won]);

  const elapsed = myResult ? myResult.timeMs : startedAt ? now - startedAt : 0;
  const dateLabel = new Date(`${dateKey}T00:00:00`).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <SectionHeader title="Zip do dia" subtitle={`Puzzle de hoje — ${dateLabel}.`} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Info className="h-4 w-4" />
              Conecte os pontos em ordem, passando por todas as células.
            </div>
            <div className="text-lg font-semibold tabular-nums text-foreground">
              {formatDuration(elapsed)}
            </div>
          </div>

          <div
            className="mx-auto grid w-full max-w-md gap-1"
            style={{ gridTemplateColumns: `repeat(${puzzle.size}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: puzzle.size }).map((_, r) =>
              Array.from({ length: puzzle.size }).map((_, c) => {
                const cell = { r, c };
                const isVisited = visited.has(cellKey(cell));
                const cpIdx = checkpointIndexAt(puzzle, cell);
                const isHead = path.length > 0 && cellKey(path[path.length - 1]) === cellKey(cell);
                return (
                  <button
                    key={`${r}-${c}`}
                    type="button"
                    onClick={() => handleCellClick(cell)}
                    disabled={Boolean(myResult)}
                    className={`flex aspect-square items-center justify-center rounded-md border text-sm font-semibold transition-colors ${
                      isVisited
                        ? "border-foreground bg-foreground text-background"
                        : "border-border bg-background text-foreground hover:bg-muted"
                    } ${isHead ? "ring-2 ring-offset-2 ring-offset-background ring-primary" : ""}`}
                  >
                    {cpIdx >= 0 ? cpIdx + 1 : ""}
                  </button>
                );
              }),
            )}
          </div>

          {error && <p className="text-center text-xs text-destructive">{error}</p>}

          <div className="flex justify-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setPath([]);
                setStartedAt(null);
                setError("");
              }}
              disabled={Boolean(myResult) || path.length === 0}
              className="gap-1.5"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Recomeçar
            </Button>
          </div>

          {myResult && (
            <div className="rounded-lg bg-emerald-500/10 px-4 py-3 text-center text-sm font-medium text-emerald-700 dark:text-emerald-400">
              Resolvido em {formatDuration(myResult.timeMs)} — volte amanhã pra um puzzle novo!
            </div>
          )}
        </div>

        <div className="space-y-3 rounded-xl border border-border bg-card p-4">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Trophy className="h-4 w-4" /> Ranking de hoje
          </p>
          {leaderboard.length === 0 ? (
            <p className="text-xs text-muted-foreground">Ninguém resolveu ainda hoje.</p>
          ) : (
            <ol className="space-y-1.5">
              {leaderboard.map((r, i) => (
                <li
                  key={r.id}
                  className={`flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm ${
                    r.userId === me.id ? "bg-primary/10" : ""
                  }`}
                >
                  <span className="w-4 shrink-0 text-xs font-semibold text-muted-foreground">
                    {i + 1}
                  </span>
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-[10px] font-semibold">
                    {photoFor(r.userId) ? (
                      <img src={photoFor(r.userId)} alt="" className="h-full w-full object-cover" />
                    ) : (
                      nameFor(r.userId).charAt(0).toUpperCase()
                    )}
                  </div>
                  <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                    {nameFor(r.userId)}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {formatDuration(r.timeMs)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
