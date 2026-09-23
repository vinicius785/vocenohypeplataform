import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Undo2, Lightbulb, RotateCcw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { useConfirm } from "@/hooks/use-confirm";
import { cellsEqual, hasWallBetween, type Cell } from "@/lib/games/zip/types";
import {
  getZipSession,
  applyZipMoveAction,
  undoZipMoveAction,
  resetZipProgress,
  pauseZipTimer,
  useZipHint,
  type ZipSessionPublic,
} from "@/lib/games/zip.functions";

const DEV = import.meta.env.DEV;
function devLog(...args: unknown[]) {
  if (DEV) console.info("[zip:ui]", ...args);
}

const CELL = 52; // px — célula grande o bastante pro toque.
const GAP = 4;
const STEP = CELL + GAP;
const cellEq = cellsEqual;

function fmtTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function center(cell: Cell): { x: number; y: number } {
  return { x: cell.column * STEP + CELL / 2, y: cell.row * STEP + CELL / 2 };
}

const MOVE_ERROR_MESSAGE: Record<string, string> = {
  must_start_at_one: "Comece pelo número 1.",
  not_adjacent: "Mova-se só entre células vizinhas.",
  wall_blocked: "Há uma parede nesse caminho.",
  already_visited: "Essa célula já foi visitada.",
  wrong_number: "Esse número está fora de ordem.",
  outside_grid: "Fora do tabuleiro.",
  invalid_state: "Não foi possível processar o movimento.",
};

/**
 * ZIP — modal do jogo. Reconstrução completa: nenhum evento de
 * ponteiro/teclado decide sozinho se um movimento é válido — todo
 * movimento é enviado ao servidor (`applyZipMoveAction`, que usa o
 * mesmo motor puro `applyZipMove`) e o componente só renderiza o
 * resultado. O caminho é desenhado como trilha (SVG) com os NÚMEROS
 * numa camada acima dela (nunca mais escondidos pelo preenchimento), e
 * o cronômetro vem sempre de `elapsedSeconds` calculado no servidor a
 * partir de tempo acumulado + retomada (nunca `now - started_at` corrido
 * desde uma sessão antiga).
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
  const moveFn = useServerFn(applyZipMoveAction);
  const undoFn = useServerFn(undoZipMoveAction);
  const resetFn = useServerFn(resetZipProgress);
  const pauseFn = useServerFn(pauseZipTimer);
  const hintFn = useServerFn(useZipHint);
  const { confirm, confirmDialog } = useConfirm();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["zip-session"],
    queryFn: () => getSessionFn(),
  });

  const [now, setNow] = useState(() => Date.now());
  const [invalidMessage, setInvalidMessage] = useState<string | null>(null);
  const [hintCell, setHintCell] = useState<Cell | null>(null);
  const [pendingMove, setPendingMove] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);
  const activePointerId = useRef<number | null>(null);
  const flashTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionLoadedAt = useRef<number>(Date.now());

  const challenge = data?.challenge;
  const status = data?.state.status ?? "not_started";
  const path = useMemo(() => data?.state.path ?? [], [data?.state.path]);
  const expectedNumber = data?.state.expectedNumber ?? 1;

  // Cronômetro: enquanto `in_progress`, o valor exibido é a base vinda do
  // servidor (`data.elapsedSeconds`, calculada no momento do GET a partir
  // do acumulado + retomada) + os segundos reais que se passaram DESDE
  // que essa resposta chegou — nunca um recálculo contra `startedAt` de
  // uma sessão antiga.
  useEffect(() => {
    if (!open || status !== "in_progress") return;
    const iv = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(iv);
  }, [open, status]);

  const elapsed = useMemo(() => {
    if (!data) return 0;
    if (status !== "in_progress") return data.elapsedSeconds;
    const sinceLoad = Math.floor((now - sessionLoadedAt.current) / 1000);
    return data.elapsedSeconds + Math.max(0, sinceLoad);
  }, [data, status, now]);

  useEffect(() => {
    sessionLoadedAt.current = Date.now();
    setNow(Date.now());
  }, [data?.elapsedSeconds]);

  // Pausa o cronômetro no servidor ao fechar o modal (soma o trecho
  // corrente ao acumulado); retomado automaticamente no próximo
  // movimento válido (o servidor seta `resumed_at` de novo).
  useEffect(() => {
    if (open) return;
    void pauseFn().catch(() => {
      /* best-effort — não bloqueia o fechamento por causa disso */
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => {
    return () => {
      void pauseFn().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const moveMutation = useMutation({
    mutationFn: (target: Cell) => moveFn({ data: { target } }),
    onError: () => setSaveError(true),
  });
  const undoMutation = useMutation({ mutationFn: () => undoFn() });
  const resetMutation = useMutation({ mutationFn: () => resetFn() });
  const hintMutation = useMutation({ mutationFn: () => hintFn() });

  const flashInvalid = (message: string) => {
    setInvalidMessage(message);
    if (flashTimeout.current) clearTimeout(flashTimeout.current);
    flashTimeout.current = setTimeout(() => setInvalidMessage(null), 1600);
  };

  const tryMove = async (target: Cell) => {
    if (!challenge || status === "won" || pendingMove) return;
    setPendingMove(true);
    setSaveError(false);
    try {
      const result = await moveMutation.mutateAsync(target);
      if (!result.ok) {
        flashInvalid(MOVE_ERROR_MESSAGE[result.error] ?? "Movimento inválido.");
        devLog("movimento rejeitado", result.error);
        return;
      }
      devLog("movimento aceito", target, result.state);
      queryClient.setQueryData(["zip-session"], (prev: ZipSessionPublic | undefined) =>
        prev
          ? {
              ...prev,
              state: result.state,
              startedAt: prev.startedAt ?? new Date().toISOString(),
              completedAt:
                result.state.status === "won" ? new Date().toISOString() : prev.completedAt,
            }
          : prev,
      );
      if (result.state.status === "won") {
        toast.success("ZIP concluído!");
        queryClient.invalidateQueries({ queryKey: ["zip-session"] });
      }
    } catch {
      setSaveError(true);
      toast.error("Não foi possível salvar seu progresso. Tente novamente.");
    } finally {
      setPendingMove(false);
    }
  };

  const handleUndo = async () => {
    if (path.length === 0 || pendingMove) return;
    setPendingMove(true);
    try {
      const result = await undoMutation.mutateAsync();
      queryClient.setQueryData(["zip-session"], (prev: ZipSessionPublic | undefined) =>
        prev ? { ...prev, state: result.state } : prev,
      );
      setHintCell(null);
    } catch {
      toast.error("Não foi possível desfazer. Tente novamente.");
    } finally {
      setPendingMove(false);
    }
  };

  const handleRestart = async () => {
    if (
      path.length > 0 &&
      !(await confirm("Reiniciar o ZIP de hoje? Seu caminho atual será apagado."))
    ) {
      return;
    }
    try {
      await resetMutation.mutateAsync();
      setHintCell(null);
      queryClient.invalidateQueries({ queryKey: ["zip-session"] });
      devLog("reiniciado");
    } catch {
      toast.error("Não foi possível reiniciar. Tente novamente.");
    }
  };

  const handleHint = async () => {
    try {
      const { hint } = await hintMutation.mutateAsync();
      if (!hint) {
        toast.info("Esse caminho criou uma região sem saída — desfaça um trecho.");
        return;
      }
      setHintCell(hint);
      setTimeout(() => setHintCell(null), 2500);
    } catch {
      toast.error("Não foi possível buscar a dica. Tente novamente.");
    }
  };

  const cellFromPoint = (x: number, y: number): Cell | null => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const attr = el?.closest("[data-zip-cell]")?.getAttribute("data-zip-cell");
    if (!attr) return null;
    const [row, column] = attr.split(",").map(Number);
    return { row, column };
  };

  const [focusCell, setFocusCell] = useState<Cell | null>(null);
  const [hasInteracted, setHasInteracted] = useState(false);
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!challenge) return;
    if (e.key === "Backspace") {
      e.preventDefault();
      void handleUndo();
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
    const deltas: Record<string, Cell> = {
      ArrowUp: { row: -1, column: 0 },
      ArrowDown: { row: 1, column: 0 },
      ArrowLeft: { row: 0, column: -1 },
      ArrowRight: { row: 0, column: 1 },
    };
    const current = focusCell ?? challenge.numberedCells[0].cell;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setHasInteracted(true);
      setFocusCell(current);
      void tryMove(current);
      return;
    }
    const d = deltas[e.key];
    if (!d) return;
    e.preventDefault();
    setHasInteracted(true);
    const next = { row: current.row + d.row, column: current.column + d.column };
    if (
      next.row < 0 ||
      next.row >= challenge.rows ||
      next.column < 0 ||
      next.column >= challenge.columns
    ) {
      return;
    }
    setFocusCell(next);
  };

  if (!open) return null;

  const boardPixelSize = challenge ? challenge.rows * STEP - GAP : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent mobileFullScreen className="flex max-h-[92vh] max-w-2xl flex-col">
        <DialogHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <DialogTitle>ZIP</DialogTitle>
            <DialogDescription>
              Conecte os números em ordem, preenchendo toda a grade.
            </DialogDescription>
          </div>
          <span
            className="rounded-full bg-muted px-3 py-1 text-sm font-semibold tabular-nums text-foreground"
            aria-live="polite"
            aria-label={`Tempo decorrido: ${fmtTime(elapsed)}`}
          >
            {fmtTime(elapsed)}
          </span>
        </DialogHeader>

        {isLoading || !challenge ? (
          <div className="flex flex-1 items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <p className="py-10 text-center text-sm text-danger">
            Não foi possível carregar o desafio de hoje. Tente novamente.
          </p>
        ) : (
          <>
            <div className="mx-auto">
              <div
                ref={boardRef}
                role="grid"
                aria-label="Tabuleiro do ZIP"
                tabIndex={0}
                onKeyDown={handleKeyDown}
                onPointerDown={(e) => {
                  const cell = cellFromPoint(e.clientX, e.clientY);
                  if (!cell) return;
                  setHasInteracted(true);
                  activePointerId.current = e.pointerId;
                  boardRef.current?.setPointerCapture(e.pointerId);
                  void tryMove(cell);
                }}
                onPointerMove={(e) => {
                  if (activePointerId.current !== e.pointerId || pendingMove) return;
                  const cell = cellFromPoint(e.clientX, e.clientY);
                  if (cell) void tryMove(cell);
                }}
                onPointerUp={(e) => {
                  if (activePointerId.current === e.pointerId) {
                    boardRef.current?.releasePointerCapture(e.pointerId);
                  }
                  activePointerId.current = null;
                }}
                onPointerCancel={() => {
                  activePointerId.current = null;
                }}
                className="relative touch-none select-none rounded-xl bg-muted/30 p-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                style={{ width: boardPixelSize + 16, height: boardPixelSize + 16 }}
              >
                <div className="relative" style={{ width: boardPixelSize, height: boardPixelSize }}>
                  {/* Camada 1: fundo/grade das células (neutro — nunca
                   * preenchido sólido de cor de marca, só a trilha (SVG,
                   * camada 4) indica visita). */}
                  {Array.from({ length: challenge.rows * challenge.columns }, (_, i) => {
                    const row = Math.floor(i / challenge.columns);
                    const column = i % challenge.columns;
                    return (
                      <div
                        key={`bg-${row}-${column}`}
                        className="absolute rounded-md bg-card"
                        style={{ width: CELL, height: CELL, left: column * STEP, top: row * STEP }}
                      />
                    );
                  })}

                  {/* Camada 2 (paredes) + Camada 4 (trilha do caminho) —
                   * SVG entre o fundo e os números, nunca por cima deles. */}
                  <svg
                    className="pointer-events-none absolute inset-0"
                    width={boardPixelSize}
                    height={boardPixelSize}
                  >
                    {challenge.walls.map((w, i) => {
                      const horizontal = w.side === "right" || w.side === "left";
                      const baseCol = w.side === "left" ? w.column - 1 : w.column;
                      const baseRow = w.side === "top" ? w.row - 1 : w.row;
                      const x1 = horizontal ? (baseCol + 1) * STEP - GAP / 2 : w.column * STEP;
                      const x2 = horizontal ? x1 : x1 + CELL;
                      const y1 = horizontal ? w.row * STEP : (baseRow + 1) * STEP - GAP / 2;
                      const y2 = horizontal ? y1 + CELL : y1;
                      return (
                        <line
                          key={i}
                          x1={x1}
                          y1={y1}
                          x2={x2}
                          y2={y2}
                          stroke="currentColor"
                          className="text-foreground/70"
                          strokeWidth={4}
                          strokeLinecap="round"
                        />
                      );
                    })}
                    {path.length > 1 && (
                      <polyline
                        points={path.map((c) => `${center(c).x},${center(c).y}`).join(" ")}
                        fill="none"
                        stroke="#6f95ff"
                        strokeWidth={14}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        opacity={0.85}
                      />
                    )}
                  </svg>

                  {/* Camada 5: números — SEMPRE acima da trilha, nunca
                   * encobertos. Camada 6: indicador da posição atual
                   * (anel na última célula do caminho). */}
                  {challenge.numberedCells.map(({ value, cell }) => {
                    const isVisited = path.some((c) => cellEq(c, cell));
                    const isHint = hintCell ? cellEq(hintCell, cell) : false;
                    const isStartHint = path.length === 0 && value === 1;
                    return (
                      <div
                        key={`num-${cell.row}-${cell.column}`}
                        data-zip-cell={`${cell.row},${cell.column}`}
                        role="gridcell"
                        aria-label={`Célula ${cell.row},${cell.column}, número ${value}`}
                        className={`absolute flex items-center justify-center rounded-md text-lg font-bold transition-colors ${
                          isVisited ? "text-brand-foreground" : "text-foreground"
                        } ${isStartHint ? "ring-2 ring-brand/60" : ""} ${
                          isHint ? "ring-2 ring-warning" : ""
                        } ${
                          hasInteracted && focusCell && cellEq(focusCell, cell)
                            ? "outline outline-2 outline-offset-1 outline-ring"
                            : ""
                        }`}
                        style={{
                          width: CELL,
                          height: CELL,
                          left: cell.column * STEP,
                          top: cell.row * STEP,
                        }}
                      >
                        {value}
                      </div>
                    );
                  })}

                  {/* Células não-numeradas ainda precisam ser alvo de
                   * clique/toque (data-zip-cell) e mostrar o anel de
                   * foco do teclado quando aplicável. */}
                  {Array.from({ length: challenge.rows * challenge.columns }, (_, i) => {
                    const row = Math.floor(i / challenge.columns);
                    const column = i % challenge.columns;
                    const cell = { row, column };
                    const isNumbered = challenge.numberedCells.some((n) => cellEq(n.cell, cell));
                    if (isNumbered) return null;
                    return (
                      <div
                        key={`hit-${row}-${column}`}
                        data-zip-cell={`${row},${column}`}
                        role="gridcell"
                        aria-label={`Célula ${row},${column}`}
                        className={`absolute rounded-md ${
                          hasInteracted && focusCell && cellEq(focusCell, cell)
                            ? "outline outline-2 outline-offset-1 outline-ring"
                            : ""
                        }`}
                        style={{ width: CELL, height: CELL, left: column * STEP, top: row * STEP }}
                      />
                    );
                  })}
                </div>
              </div>
            </div>

            <div
              className="mt-2 min-h-[1.25rem] text-center text-xs font-medium text-danger"
              aria-live="polite"
              role="status"
            >
              {invalidMessage}
            </div>

            {saveError && (
              <p className="text-center text-xs text-danger">
                Não foi possível salvar seu progresso. Tente novamente.
              </p>
            )}

            {status === "won" && (
              <div
                role="status"
                aria-live="polite"
                className="mt-1 rounded-xl bg-success-soft p-3 text-center text-sm font-medium text-success"
              >
                ZIP concluído em {fmtTime(data.elapsedSeconds)}!
              </div>
            )}

            <div className="mt-3 flex items-center justify-between gap-2">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleUndo()}
                  disabled={path.length === 0 || pendingMove}
                >
                  <Undo2 className="h-3.5 w-3.5" /> Desfazer
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleHint()}
                  disabled={status === "won"}
                >
                  <Lightbulb className="h-3.5 w-3.5" /> Dica
                </Button>
              </div>
              <Button variant="ghost" size="sm" onClick={() => void handleRestart()}>
                <RotateCcw className="h-3.5 w-3.5" /> Reiniciar
              </Button>
            </div>

            <Accordion type="single" collapsible className="mt-2">
              <AccordionItem value="como-jogar" className="border-none">
                <AccordionTrigger className="rounded-md px-1 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:no-underline">
                  Como jogar
                </AccordionTrigger>
                <AccordionContent className="px-1 text-xs text-muted-foreground">
                  <ul className="list-disc space-y-1 pl-4">
                    <li>Comece pelo número 1.</li>
                    <li>Conecte os números em ordem crescente.</li>
                    <li>Preencha todas as células.</li>
                    <li>Não atravesse paredes.</li>
                    <li>Termine no último número.</li>
                  </ul>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
            <p className="sr-only" aria-live="polite">
              {`Próximo número esperado: ${expectedNumber <= challenge.numberedCells.length ? expectedNumber : "concluído"}`}
            </p>
          </>
        )}
      </DialogContent>
      {confirmDialog}
    </Dialog>
  );
}
