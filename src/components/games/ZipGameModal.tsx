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
import { isWallBetween, isValidStep, type ZipCell, type ZipPuzzle } from "@/lib/games/zip-game";
import {
  getZipSession,
  saveZipProgress,
  submitZipCompletion,
  resetZipProgress,
  useZipHint,
  type ZipSessionPublic,
} from "@/lib/games/zip.functions";

const DEV = import.meta.env.DEV;
function devLog(...args: unknown[]) {
  if (DEV) console.info("[zip:ui]", ...args);
}

const CELL = 52; // px — célula grande o bastante pro toque, tabuleiro maior (pedido explícito).
const GAP = 4;
const STEP = CELL + GAP;
const cellKey = (c: ZipCell) => `${c.r},${c.c}`;
const cellEq = (a: ZipCell, b: ZipCell) => a.r === b.r && a.c === b.c;

function fmtTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function center(cell: ZipCell): { x: number; y: number } {
  return { x: cell.c * STEP + CELL / 2, y: cell.r * STEP + CELL / 2 };
}

/**
 * ZIP — modal do jogo. Correções desta rodada (auditoria de bugs, não só
 * visual):
 * - `startedAt`/`status` vêm sempre do servidor (nunca inferidos só pela
 *   linha existir) — o cronômetro usa esse timestamp persistido como
 *   fonte de verdade, nunca só um contador local que zera ao reabrir.
 * - Sessão só é criada na primeira jogada real (`saveZipProgress`) —
 *   abrir e fechar o modal nunca marca "em andamento".
 * - Nenhum destaque de foco aparece antes de qualquer interação (bug
 *   anterior: o anel de foco padrão em (0,0) coincidia visualmente com o
 *   checkpoint numerado que caísse ali).
 * - Caminho e paredes desenhados via SVG (linha real conectando centros
 *   de célula), não só células coloridas soltas.
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
  const resetFn = useServerFn(resetZipProgress);
  const hintFn = useServerFn(useZipHint);
  const { confirm, confirmDialog } = useConfirm();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["zip-session"],
    queryFn: () => getSessionFn(),
  });
  const puzzle: ZipPuzzle | undefined = data?.puzzle;

  const [path, setPath] = useState<ZipCell[]>([]);
  const [syncedFromServer, setSyncedFromServer] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [invalidMessage, setInvalidMessage] = useState<string | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);
  const [hintCell, setHintCell] = useState<ZipCell | null>(null);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);
  const activePointerId = useRef<number | null>(null);
  const flashTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sincroniza com o servidor uma única vez por sessão de abertura — nunca
  // sobrescreve um path que o usuário já está desenhando localmente.
  useEffect(() => {
    if (!data || syncedFromServer) return;
    setPath(data.path);
    setSyncedFromServer(true);
    devLog("sessão carregada", { status: data.status, pathLength: data.path.length });
  }, [data, syncedFromServer]);

  // Cronômetro: `startedAt` persistido é a fonte de verdade. Enquanto em
  // progresso e o modal aberto, só re-renderiza a cada segundo pra
  // recalcular `elapsed` a partir do timestamp real — nunca acumula
  // localmente (sobrevive a fechar/reabrir/atualizar a página sem perder
  // nem reiniciar o tempo).
  useEffect(() => {
    if (!open || !data?.startedAt || data.status !== "in_progress") return;
    const iv = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(iv);
  }, [open, data?.startedAt, data?.status]);

  const elapsed = useMemo(() => {
    if (data?.status === "won") return data.elapsedSeconds ?? 0;
    if (!data?.startedAt) return 0;
    return Math.floor((now - new Date(data.startedAt).getTime()) / 1000);
  }, [data?.startedAt, data?.status, data?.elapsedSeconds, now]);

  const saveMutation = useMutation({
    mutationFn: (p: ZipCell[]) => saveProgressFn({ data: { path: p } }),
    onError: () => setSaveError(true),
    onSuccess: () => setSaveError(false),
  });
  const submitMutation = useMutation({
    mutationFn: (input: { path: ZipCell[]; elapsedSeconds: number }) => submitFn({ data: input }),
  });
  const resetMutation = useMutation({ mutationFn: () => resetFn() });
  const hintMutation = useMutation({ mutationFn: (p: ZipCell[]) => hintFn({ data: { path: p } }) });

  const visited = useMemo(() => new Set(path.map(cellKey)), [path]);

  const flashInvalid = (message: string) => {
    setInvalidMessage(message);
    if (flashTimeout.current) clearTimeout(flashTimeout.current);
    flashTimeout.current = setTimeout(() => setInvalidMessage(null), 1600);
  };

  const persistPath = (next: ZipCell[]) => {
    setPath(next);
    // Otimista: reflete localmente já; se o servidor invalidar mais
    // adiante, a próxima leitura de `data` corrige (nunca finge sucesso
    // silenciosamente — `saveError` mostra aviso).
    void saveMutation.mutateAsync(next).then(() => {
      queryClient.setQueryData(["zip-session"], (prev: ZipSessionPublic | undefined) =>
        prev
          ? {
              ...prev,
              path: next,
              status: next.length > 0 ? "in_progress" : "not_started",
              startedAt: prev.startedAt ?? (next.length > 0 ? new Date().toISOString() : null),
            }
          : prev,
      );
    });
  };

  const tryExtend = (cell: ZipCell) => {
    if (!puzzle || data?.status === "won") return;
    setHasInteracted(true);
    if (path.length === 0) {
      if (!cellEq(cell, puzzle.checkpoints[0])) {
        flashInvalid("Comece pelo número 1.");
        devLog("tentativa de início inválida", cell);
        return;
      }
      devLog("iniciado no número 1", cell);
      persistPath([cell]);
      return;
    }
    const last = path[path.length - 1];
    if (!isValidStep(puzzle, last, cell, visited)) {
      if (isWallBetween(puzzle, last, cell)) flashInvalid("Há uma parede nesse caminho.");
      devLog("movimento rejeitado (geometria/parede/repetição)", { from: last, to: cell });
      return;
    }
    const cpIdx = puzzle.checkpoints.findIndex((cp) => cellEq(cp, cell));
    if (cpIdx !== -1) {
      const nextCpIdx = puzzle.checkpoints.findIndex((cp) => !visited.has(cellKey(cp)));
      if (cpIdx !== nextCpIdx) {
        flashInvalid(`Esse é o número ${cpIdx + 1} — o próximo precisa ser o ${nextCpIdx + 1}.`);
        devLog("número fora de ordem", { tentativa: cpIdx + 1, esperado: nextCpIdx + 1 });
        return;
      }
    }
    devLog("movimento aceito", cell);
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
    try {
      await resetMutation.mutateAsync();
      setPath([]);
      setHintCell(null);
      queryClient.invalidateQueries({ queryKey: ["zip-session"] });
      devLog("reiniciado");
    } catch {
      toast.error("Não foi possível reiniciar. Tente novamente.");
    }
  };

  const handleHint = async () => {
    try {
      const { hint } = await hintMutation.mutateAsync(path);
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

  const cellFromPoint = (x: number, y: number): ZipCell | null => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const attr = el?.closest("[data-zip-cell]")?.getAttribute("data-zip-cell");
    if (!attr) return null;
    const [r, c] = attr.split(",").map(Number);
    return { r, c };
  };

  // Conclusão — checagem local só decide QUANDO chamar o servidor; a
  // validação de verdade (`submitZipCompletion`) sempre roda no servidor.
  useEffect(() => {
    if (!puzzle || data?.status === "won") return;
    const total = puzzle.size * puzzle.size;
    if (path.length !== total) return;
    void submitMutation
      .mutateAsync({ path, elapsedSeconds: elapsed })
      .then((result) => {
        queryClient.invalidateQueries({ queryKey: ["zip-session"] });
        if (!result.alreadyCompleted) toast.success("ZIP concluído!");
      })
      .catch(() => {
        toast.error("Não foi possível salvar sua conclusão. Tente novamente.");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, puzzle, data?.status]);

  const [focusCell, setFocusCell] = useState<ZipCell | null>(null);
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
    const current = focusCell ?? puzzle.checkpoints[0];
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setFocusCell(current);
      tryExtend(current);
      return;
    }
    const d = deltas[e.key];
    if (!d) return;
    e.preventDefault();
    const next = { r: current.r + d.r, c: current.c + d.c };
    if (next.r < 0 || next.r >= puzzle.size || next.c < 0 || next.c >= puzzle.size) return;
    setFocusCell(next);
  };

  if (!open) return null;

  const boardPixelSize = puzzle ? puzzle.size * STEP - GAP : 0;

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

        {isLoading || !puzzle ? (
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
                  activePointerId.current = e.pointerId;
                  boardRef.current?.setPointerCapture(e.pointerId);
                  tryExtend(cell);
                }}
                onPointerMove={(e) => {
                  if (activePointerId.current !== e.pointerId) return;
                  const cell = cellFromPoint(e.clientX, e.clientY);
                  if (cell) tryExtend(cell);
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
                  {Array.from({ length: puzzle.size * puzzle.size }, (_, i) => {
                    const r = Math.floor(i / puzzle.size);
                    const c = i % puzzle.size;
                    const cell = { r, c };
                    const cpIdx = puzzle.checkpoints.findIndex((cp) => cp.r === r && cp.c === c);
                    const isVisited = visited.has(cellKey(cell));
                    const isHint = hintCell ? cellEq(hintCell, cell) : false;
                    const isNextStart = path.length === 0 && cpIdx === 0;
                    return (
                      <div
                        key={cellKey(cell)}
                        data-zip-cell={`${r},${c}`}
                        role="gridcell"
                        aria-label={
                          cpIdx !== -1
                            ? `Célula ${r},${c}, número ${cpIdx + 1}`
                            : `Célula ${r},${c}`
                        }
                        className={`absolute flex items-center justify-center rounded-md text-base font-bold transition-colors ${
                          isVisited
                            ? "bg-brand text-brand-foreground"
                            : isNextStart
                              ? "bg-card text-foreground ring-2 ring-brand/50"
                              : "bg-card text-muted-foreground"
                        } ${isHint ? "ring-2 ring-warning" : ""} ${
                          hasInteracted && focusCell && cellEq(focusCell, cell)
                            ? "outline outline-2 outline-offset-1 outline-ring"
                            : ""
                        }`}
                        style={{ width: CELL, height: CELL, left: c * STEP, top: r * STEP }}
                      >
                        {cpIdx !== -1 ? cpIdx + 1 : ""}
                      </div>
                    );
                  })}

                  {/* Paredes e caminho — desenhados em SVG sobre a grade,
                   * nunca só células coloridas soltas (o traçado precisa
                   * conectar visualmente centro a centro). */}
                  <svg
                    className="pointer-events-none absolute inset-0"
                    width={boardPixelSize}
                    height={boardPixelSize}
                  >
                    {path.length > 1 && (
                      <polyline
                        points={path.map((c) => `${center(c).x},${center(c).y}`).join(" ")}
                        fill="none"
                        stroke="#6f95ff"
                        strokeWidth={10}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    )}
                    {puzzle.walls.map((w) => {
                      const [ka, kb] = w.split("|");
                      const [ar, ac] = ka.split(",").map(Number);
                      const [br, bc] = kb.split(",").map(Number);
                      const horizontal = ar === br; // parede entre células lado a lado -> segmento vertical
                      const x1 = horizontal ? Math.max(ac, bc) * STEP - GAP / 2 : ac * STEP;
                      const x2 = horizontal ? x1 : x1 + CELL;
                      const y1 = horizontal ? ar * STEP : Math.max(ar, br) * STEP - GAP / 2;
                      const y2 = horizontal ? y1 + CELL : y1;
                      return (
                        <line
                          key={w}
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
                  </svg>
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

            {data?.status === "won" && (
              <div
                role="status"
                aria-live="polite"
                className="mt-1 rounded-xl bg-success-soft p-3 text-center text-sm font-medium text-success"
              >
                ZIP concluído em {fmtTime(data.elapsedSeconds ?? elapsed)}!
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
                  disabled={data?.status === "won"}
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
                vizinhas (nunca na diagonal, nunca atravessando uma parede). O caminho precisa
                preencher todas as células da grade e terminar no último número.
              </p>
            )}
          </>
        )}
      </DialogContent>
      {confirmDialog}
    </Dialog>
  );
}
