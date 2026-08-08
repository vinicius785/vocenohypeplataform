import { useEffect, useMemo, useState } from "react";
import { Trophy, RotateCcw, Info } from "lucide-react";
import { SectionHeader } from "@/components/SectionHeader";
import { Button } from "@/components/ui/button";
import { getMe } from "@/lib/chat-store";
import { loadTeamMembers } from "@/lib/projetos";
import { getDailySudoku, todaySudokuKey, validateSudoku, boxOf } from "@/lib/sudoku-game";
import {
  getMySudokuResult,
  listSudokuLeaderboard,
  submitSudokuResult,
  subscribeSudokuLeaderboard,
  type SudokuResult,
} from "@/lib/sudoku-results";

function formatDuration(ms: number): string {
  const totalSeconds = ms / 1000;
  const m = Math.floor(totalSeconds / 60);
  const s = (totalSeconds % 60).toFixed(1);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function SudokuGameSection() {
  const dateKey = useMemo(() => todaySudokuKey(), []);
  const puzzle = useMemo(() => getDailySudoku(dateKey), [dateKey]);
  const [grid, setGrid] = useState<(number | null)[][]>(() => puzzle.clues.map((row) => [...row]));
  const [selected, setSelected] = useState<{ r: number; c: number } | null>(null);
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [myResult, setMyResult] = useState<SudokuResult | null | undefined>(undefined);
  const [leaderboard, setLeaderboard] = useState<SudokuResult[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const me = getMe();
  const members = loadTeamMembers();
  const nameFor = (userId: string) =>
    userId === me.id ? "Você" : (members.find((m) => m.id === userId)?.name ?? "Alguém");
  const photoFor = (userId: string) => members.find((m) => m.id === userId)?.photo;

  const refreshLeaderboard = () => {
    void listSudokuLeaderboard(dateKey).then(setLeaderboard);
  };

  useEffect(() => {
    void getMySudokuResult(dateKey).then(setMyResult);
    refreshLeaderboard();
    return subscribeSudokuLeaderboard(dateKey, refreshLeaderboard);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateKey]);

  useEffect(() => {
    if (myResult) return;
    const id = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(id);
  }, [myResult]);

  const isComplete = grid.every((row) => row.every((v) => v !== null));

  const setDigit = (val: number | null) => {
    if (!selected || myResult) return;
    const { r, c } = selected;
    if (puzzle.clues[r][c] !== null) return;
    setGrid((g) => g.map((row, ri) => (ri === r ? row.map((v, ci) => (ci === c ? val : v)) : row)));
  };

  const submit = () => {
    if (!isComplete || myResult || submitting) return;
    if (!validateSudoku(puzzle, grid)) {
      setError("Ainda tem algo errado — confira os números repetidos.");
      return;
    }
    setError("");
    setSubmitting(true);
    const timeMs = Date.now() - startedAt;
    void submitSudokuResult({ dateKey, timeMs })
      .then(() => getMySudokuResult(dateKey))
      .then((r) => {
        setMyResult(r);
        refreshLeaderboard();
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Erro ao salvar resultado."))
      .finally(() => setSubmitting(false));
  };

  const elapsed = myResult ? myResult.timeMs : now - startedAt;
  const dateLabel = new Date(`${dateKey}T00:00:00`).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <SectionHeader title="Mini sudoku do dia" subtitle={`Puzzle de hoje — ${dateLabel}.`} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Info className="h-4 w-4" />
              Grid 6x6, sem repetir número na linha, coluna ou bloco.
            </div>
            <div className="text-lg font-semibold tabular-nums text-foreground">
              {formatDuration(elapsed)}
            </div>
          </div>

          <div className="mx-auto grid w-full max-w-xs grid-cols-6 gap-[3px] rounded-md bg-border p-[3px]">
            {grid.map((row, r) =>
              row.map((val, c) => {
                const isClue = puzzle.clues[r][c] !== null;
                const isSelected = selected?.r === r && selected?.c === c;
                const boxShade = boxOf(r, c) % 2 === 0 ? "brightness-100" : "brightness-95";
                return (
                  <button
                    key={`${r}-${c}`}
                    type="button"
                    onClick={() => !myResult && setSelected({ r, c })}
                    disabled={Boolean(myResult)}
                    className={`flex aspect-square items-center justify-center text-base font-semibold transition-colors ${
                      isClue
                        ? "bg-muted text-foreground"
                        : isSelected
                          ? "bg-primary/20 text-foreground"
                          : `bg-background text-foreground hover:bg-muted/60 ${boxShade}`
                    }`}
                    style={{
                      borderRight: c % 3 === 2 && c !== 5 ? "2px solid var(--border)" : undefined,
                      borderBottom: r % 2 === 1 && r !== 5 ? "2px solid var(--border)" : undefined,
                    }}
                  >
                    {val ?? ""}
                  </button>
                );
              }),
            )}
          </div>

          <div className="flex flex-wrap justify-center gap-1.5">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setDigit(n)}
                disabled={!selected || Boolean(myResult)}
                className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-sm font-semibold text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
              >
                {n}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setDigit(null)}
              disabled={!selected || Boolean(myResult)}
              className="flex h-9 items-center justify-center rounded-md border border-dashed border-border px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
            >
              Apagar
            </button>
          </div>

          {error && <p className="text-center text-xs text-destructive">{error}</p>}

          <div className="flex justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setGrid(puzzle.clues.map((row) => [...row]));
                setSelected(null);
                setError("");
              }}
              disabled={Boolean(myResult)}
              className="gap-1.5"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Recomeçar
            </Button>
            <Button
              size="sm"
              onClick={submit}
              disabled={!isComplete || Boolean(myResult) || submitting}
            >
              {submitting ? "Enviando..." : "Conferir"}
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
