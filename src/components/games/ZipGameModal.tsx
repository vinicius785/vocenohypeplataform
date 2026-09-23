import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Undo2, Lightbulb, RotateCcw, ChevronDown } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/hooks/use-confirm";
import { validateZipPath, type ZipCell, type ZipPuzzle } from "@/lib/games/zip-game";
import {
  getZipSession,
  saveZipProgress,
  submitZipCompletion,
  useZipHint,
} from "@/lib/games/zip.functions";

const CELL = 44; // px — tamanho fixo de cada célula, grande o bastante pro toque.
const key = (c: ZipCell) => `${c.r},${c.c}`;
const adjacent = (a: ZipCell, b: ZipCell) => Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;

function fmtTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * ZIP — puzzle de caminho numerado. Modal grande no desktop, tela cheia
 * no mobile (`mobileFullScreen`). Mecânica recuperada de
 * `src/lib/games/zip-game.ts` (histórico da plataforma) — SEM
 * leaderboard/ranking (removido de propósito, pedido explícito desta
 * rodada: sem competição pública, sem expor quem jogou).
 */
export function ZipGameModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const getSessionFn = useServerFn(getZipSession);
  const saveProgressFn = useServerFn(saveZipProgress);
  const submitFn = useServerFn(submitZipCompletion);
  const hintFn = useServerFn(useZipHint);
  const { confirm, confirmDialog } = useConfirm();

  const { data, isLoading } = useQuery({
    queryKey: ["zip-session"],
    queryFn: () => getSessionFn(),
  });
  const puzzle: ZipPuzzle | undefined = data?.puzzle;

  const [path, setPath] = useState<ZipCell[]>([]);
  const [loadedFromServer, setLoadedFromServer] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [invalidFlash, setInvalidFlash] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [hintCell, setHintCell] = useState<ZipCell | null>(null);
  const [completed, setCompleted] = useState<{ elapsed: number } | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  // Carrega progresso salvo (retomar após fechar/atualizar) uma única vez
  // quando a sessão chega — nunca sobrescreve um path que o usuário já
  // está desenhando na sessão atual.
  useEffect(() => {
    if (!data || loadedFromServer) return;
    const savedPath = (data.session?.state as { path?: ZipCell[] } | undefined)?.path ?? [];
    setPath(savedPath);
    if (data.session?.completed_at) {
      setCompleted({ elapsed: data.session.elapsed_seconds ?? 0 });
      setElapsed(data.session.elapsed_seconds ?? 0);
    } else if (savedPath.length > 0) {
      setRunning(true);
    }
    setLoadedFromServer(true);
  }, [data, loadedFromServer]);

  // Cronômetro — inicia no primeiro movimento, pausa quando o modal fecha
  // (o `open` controla o efeito), continua ao reabrir a partir do último
  // `elapsed` conhecido.
  useEffect(() => {
    if (!open || !running || completed) return;
    const iv = window.setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => window.clearInterval(iv);
  }, [open, running, completed]);

  const saveMutation = useMutation({
    mutationFn: (p: ZipCell[]) => saveProgressFn({ data: { path: p } }),
  });
  const submitMutation = useMutation({
    mutationFn: (input: { path: ZipCell[]; elapsedSeconds: number }) => submitFn({ data: input }),
  });
  const hintMutation = useMutation({ mutationFn: (p: ZipCell[]) => hintFn({ data: { path: p } }) });

  const visited = useMemo(() => new Set(path.map(key)), [path]);

  const persistPath = (next: ZipCell[]) => {
    setPath(next);
    void saveMutation.mutateAsync(next);
  };

  const tryExtend = (cell: ZipCell) => {
    if (!puzzle || completed) return;
    if (path.length === 0) {
      if (key(cell) !== key(puzzle.checkpoints[0])) {
        setInvalidFlash(true);
        setTimeout(() => setInvalidFlash(false), 250);
        return;
      }
      persistPath([cell]);
      setRunning(true);
      return;
    }
    const last = path[path.length - 1];
    if (visited.has(key(cell)) || !adjacent(last, cell)) return;

    // Se a célula é numerada, só aceita se for exatamente o próximo
    // número esperado — pular número é bloqueado, com feedback (seção
    // 10: "se alcançar um número fora da sequência, bloquear e avisar").
    const cpIdx = puzzle.checkpoints.findIndex((cp) => key(cp) === key(cell));
    if (cpIdx !== -1) {
      const nextCpIdx = puzzle.checkpoints.findIndex((cp) => !visited.has(key(cp)));
      if (cpIdx !== nextCpIdx) {
        setInvalidFlash(true);
        setTimeout(() => setInvalidFlash(false), 250);
        return;
      }
    }
    persistPath([...path, cell]);
  };

  const handleUndo = () => {
    if (path.length === 0) return;
    persistPath(path.slice(0, -1));
    setHintCell(null);
  };

  const handleRestart = async () => {
    if (
      path.length > 0 &&
      !(await confirm("Reiniciar o ZIP de hoje? Seu caminho atual será apagado."))
    ) {
      return;
    }
    persistPath([]);
    setHintCell(null);
    setRunning(false);
    setElapsed(0);
  };

  const handleHint = async () => {
    const { hint } = await hintMutation.mutateAsync(path);
    if (!hint) {
      toast.info("Esse caminho criou uma região sem saída — desfaça um trecho.");
      return;
    }
    setHintCell(hint);
    setTimeout(() => setHintCell(null), 2500);
  };

  const cellAt = (x: number, y: number): ZipCell | null => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const attr = el?.closest("[data-zip-cell]")?.getAttribute("data-zip-cell");
    if (!attr) return null;
    const [r, c] = attr.split(",").map(Number);
    return { r, c };
  };

  useEffect(() => {
    if (!puzzle) return;
    const total = puzzle.size * puzzle.size;
    if (path.length !== total) return;
    if (!validateZipPath(puzzle, path)) return;
    if (completed) return;
    setRunning(false);
    setCompleted({ elapsed });
    void submitMutation.mutateAsync({ path, elapsedSeconds: elapsed }).then(() => {
      queryClient.invalidateQueries({ queryKey: ["zip-session"] });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, puzzle]);

  const [focusCell, setFocusCell] = useState<ZipCell>({ r: 0, c: 0 });
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!puzzle) return;
    if (e.key === "Backspace") {
      e.preventDefault();
      handleUndo();
      return;
    }
    if (e.key.toLowerCase() === "r") {
      e.preventDefault();
      void handleRestart();
      return;
    }
    if (e.key.toLowerCase() === "h") {
      e.preventDefault();
      void handleHint();
      return;
    }
    const deltas: Record<string, ZipCell> = {
      ArrowUp: { r: -1, c: 0 },
      ArrowDown: { r: 1, c: 0 },
      ArrowLeft: { r: 0, c: -1 },
      ArrowRight: { r: 0, c: 1 },
    };
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      tryExtend(focusCell);
      return;
    }
    const d = deltas[e.key];
    if (!d) return;
    e.preventDefault();
    const next = { r: focusCell.r + d.r, c: focusCell.c + d.c };
    if (next.r < 0 || next.r >= puzzle.size || next.c < 0 || next.c >= puzzle.size) return;
    setFocusCell(next);
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent mobileFullScreen className="flex max-h-[92vh] max-w-xl flex-col">
        <DialogHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <DialogTitle>ZIP</DialogTitle>
            <DialogDescription>
              Conecte os números em ordem, preenchendo toda a grade.
            </DialogDescription>
          </div>
          <span className="rounded-full bg-muted px-3 py-1 text-sm font-semibold tabular-nums text-foreground">
            {fmtTime(completed ? completed.elapsed : elapsed)}
          </span>
        </DialogHeader>

        {isLoading || !puzzle ? (
          <div className="flex flex-1 items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div
              ref={boardRef}
              role="grid"
              aria-label="Tabuleiro do ZIP"
              tabIndex={0}
              onKeyDown={handleKeyDown}
              onPointerDown={(e) => {
                draggingRef.current = true;
                const cell = cellAt(e.clientX, e.clientY);
                if (cell) tryExtend(cell);
              }}
              onPointerMove={(e) => {
                if (!draggingRef.current) return;
                const cell = cellAt(e.clientX, e.clientY);
                if (cell) tryExtend(cell);
              }}
              onPointerUp={() => {
                draggingRef.current = false;
              }}
              className={`mx-auto grid touch-none select-none gap-1 rounded-xl bg-muted/30 p-2 outline-none focus-visible:ring-2 focus-visible:ring-ring ${invalidFlash ? "animate-pulse" : ""}`}
              style={{
                gridTemplateColumns: `repeat(${puzzle.size}, ${CELL}px)`,
                gridTemplateRows: `repeat(${puzzle.size}, ${CELL}px)`,
              }}
            >
              {Array.from({ length: puzzle.size * puzzle.size }, (_, i) => {
                const r = Math.floor(i / puzzle.size);
                const c = i % puzzle.size;
                const cell = { r, c };
                const cpIdx = puzzle.checkpoints.findIndex((cp) => cp.r === r && cp.c === c);
                const isVisited = visited.has(key(cell));
                const isHint = hintCell?.r === r && hintCell?.c === c;
                const isFocus = focusCell.r === r && focusCell.c === c;
                return (
                  <div
                    key={key(cell)}
                    data-zip-cell={`${r},${c}`}
                    role="gridcell"
                    aria-label={
                      cpIdx !== -1 ? `Célula ${r},${c}, número ${cpIdx + 1}` : `Célula ${r},${c}`
                    }
                    onClick={() => setFocusCell(cell)}
                    className={`flex items-center justify-center rounded-md text-sm font-semibold transition-colors ${
                      isVisited ? "bg-brand text-brand-foreground" : "bg-card text-muted-foreground"
                    } ${isHint ? "ring-2 ring-warning" : ""} ${isFocus ? "outline outline-2 outline-offset-1 outline-ring" : ""}`}
                    style={{ width: CELL, height: CELL }}
                  >
                    {cpIdx !== -1 ? cpIdx + 1 : ""}
                  </div>
                );
              })}
            </div>

            {completed && (
              <div className="mt-3 rounded-xl bg-success-soft p-3 text-center text-sm font-medium text-success">
                Concluído em {fmtTime(completed.elapsed)}!
              </div>
            )}

            <div className="mt-3 flex items-center justify-between gap-2">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleUndo}
                  disabled={path.length === 0}
                >
                  <Undo2 className="h-3.5 w-3.5" /> Desfazer
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleHint()}
                  disabled={!!completed}
                >
                  <Lightbulb className="h-3.5 w-3.5" /> Dica
                </Button>
              </div>
              <Button variant="ghost" size="sm" onClick={() => void handleRestart()}>
                <RotateCcw className="h-3.5 w-3.5" /> Reiniciar
              </Button>
            </div>

            <button
              type="button"
              onClick={() => setShowInstructions((v) => !v)}
              className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              Como jogar
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${showInstructions ? "rotate-180" : ""}`}
              />
            </button>
            {showInstructions && (
              <p className="mt-1 text-xs text-muted-foreground">
                Comece no número 1 e conecte os números em ordem crescente, andando só entre células
                vizinhas (nunca na diagonal). O caminho precisa preencher todas as células da grade
                e terminar no último número.
              </p>
            )}
          </>
        )}
      </DialogContent>
      {confirmDialog}
    </Dialog>
  );
}
