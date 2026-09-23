import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Delete, HelpCircle, Loader2, Share2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { getTermoSession, submitTermoGuess } from "@/lib/games/termo.functions";
import {
  TERMO_WORD_LENGTH,
  TERMO_MAX_ATTEMPTS,
  keyboardLetterStates,
  buildShareText,
  type LetterState,
} from "@/lib/games/termo/engine";
import { normalizePortugueseWord } from "@/lib/games/shared/normalize";

const DEV = import.meta.env.DEV;
function devLog(...args: unknown[]) {
  if (DEV) console.info("[termo:ui]", ...args);
}

const KEYBOARD_ROWS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];

const STATE_CLASS: Record<LetterState, string> = {
  correct: "bg-success text-success-foreground border-success",
  present: "bg-warning text-warning-foreground border-warning",
  absent: "bg-muted text-muted-foreground border-transparent",
};

/**
 * Termo — modal do jogo. Reconstrução desta rodada: dicionário real
 * (`termo/dictionary.ts`, 1000+ palavras — antes ~116 hand-picked nem
 * sequer incluíam "TERMO"/"PEITO"), `submitTermoGuess` devolve
 * `{accepted:false, reason:"not_in_dictionary"}` explícito em vez de
 * lançar erro genérico, sessão com `engine_version` comparado antes de
 * restaurar. Ajuda e um resumo mínimo de estatísticas do dia.
 */
export function TermoGameModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const getSessionFn = useServerFn(getTermoSession);
  const submitFn = useServerFn(submitTermoGuess);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["termo-session"],
    queryFn: () => getSessionFn(),
  });
  const [current, setCurrent] = useState("");
  const [error, setError] = useState("");
  const [shared, setShared] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const guesses = data?.guesses ?? [];
  const status = data?.status ?? "not_started";
  const finished = status === "won" || status === "lost";

  const submitMutation = useMutation({
    mutationFn: (word: string) => submitFn({ data: { word } }),
    onSuccess: (result) => {
      if (!result.accepted) {
        setError("Palavra não encontrada.");
        devLog("tentativa rejeitada", result.reason);
        return;
      }
      queryClient.setQueryData(["termo-session"], {
        guesses: result.guesses,
        attempts: result.attempts,
        status: result.status,
        answer: result.answer,
      });
      setCurrent("");
      setError("");
      devLog("tentativa aceita", result);
    },
    onError: (e) => {
      setError(
        e instanceof Error ? e.message : "Não foi possível salvar seu progresso. Tente novamente.",
      );
    },
  });

  const keyboardStates = useMemo(() => keyboardLetterStates(guesses), [guesses]);

  const handleSubmit = () => {
    if (finished || submitMutation.isPending) return;
    if (normalizePortugueseWord(current).length !== TERMO_WORD_LENGTH) {
      setError("Digite uma palavra de 5 letras.");
      return;
    }
    submitMutation.mutate(current);
  };

  const handleKey = (k: string) => {
    if (finished || submitMutation.isPending) return;
    setError("");
    if (k === "ENTER") {
      handleSubmit();
      return;
    }
    if (k === "BACK") {
      setCurrent((c) => c.slice(0, -1));
      return;
    }
    if (current.length < TERMO_WORD_LENGTH) setCurrent((c) => (c + k).toUpperCase());
  };

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter") handleKey("ENTER");
      else if (e.key === "Backspace") handleKey("BACK");
      else if (/^[a-zA-ZçÇ]$/.test(e.key)) handleKey(normalizePortugueseWord(e.key));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, current, finished, submitMutation.isPending]);

  const handleShare = async () => {
    const results = guesses.map((g) => g.result);
    const dayNumber = Math.floor(Date.now() / 86_400_000) % 100000;
    const text = buildShareText(results, status === "won", dayNumber);
    try {
      await navigator.clipboard.writeText(text);
      setShared(true);
      toast.success("Resultado copiado!");
      setTimeout(() => setShared(false), 2000);
    } catch {
      toast.error("Não foi possível copiar.");
    }
  };

  if (!open) return null;

  const rows = Array.from({ length: TERMO_MAX_ATTEMPTS }, (_, i) => {
    if (i < guesses.length) return { word: guesses[i].word, result: guesses[i].result };
    if (i === guesses.length) return { word: current.padEnd(TERMO_WORD_LENGTH, " "), result: null };
    return { word: "     ", result: null };
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        mobileFullScreen
        className="flex max-h-[92vh] w-[92vw] max-w-[520px] flex-col items-center overflow-y-auto"
      >
        <DialogHeader className="w-full flex-row items-center justify-between space-y-0 text-center">
          <div className="text-left">
            <DialogTitle>Termo</DialogTitle>
            <DialogDescription>
              Descubra a palavra de 5 letras em até 6 tentativas.
            </DialogDescription>
          </div>
          <IconButton label="Ajuda" tone="neutral" onClick={() => setShowHelp((v) => !v)}>
            <HelpCircle className="h-4 w-4" />
          </IconButton>
        </DialogHeader>

        {showHelp && (
          <div className="relative mb-2 w-full rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
            <button
              type="button"
              onClick={() => setShowHelp(false)}
              aria-label="Fechar ajuda"
              className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            <p className="mb-1 font-medium text-foreground">Como jogar</p>
            <ul className="list-disc space-y-1 pl-4">
              <li>Adivinhe a palavra em até 6 tentativas.</li>
              <li>Verde: letra certa, posição certa.</li>
              <li>Amarelo: letra existe, posição errada.</li>
              <li>Cinza: letra não está na palavra.</li>
              <li>Uma palavra nova por dia, igual pra todo mundo.</li>
            </ul>
          </div>
        )}

        {isLoading ? (
          <div className="flex flex-1 items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <p className="py-10 text-center text-sm text-danger">
            Não foi possível carregar o jogo agora.
          </p>
        ) : (
          <>
            <div className="my-4 grid grid-rows-6 gap-2">
              {rows.map((row, ri) => (
                <div key={ri} className="grid grid-cols-5 gap-2">
                  {Array.from({ length: TERMO_WORD_LENGTH }, (_, ci) => {
                    const letter = row.word[ci]?.trim() ?? "";
                    const state = row.result?.[ci];
                    return (
                      <div
                        key={ci}
                        className={`flex h-12 w-12 items-center justify-center rounded-md border-2 text-xl font-bold uppercase sm:h-14 sm:w-14 ${
                          state
                            ? STATE_CLASS[state]
                            : letter
                              ? "border-foreground/40 text-foreground"
                              : "border-border text-foreground"
                        }`}
                      >
                        {letter}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="mb-2 min-h-[1.25rem] text-center text-xs font-medium text-danger">
              {error}
            </div>

            {finished && (
              <div className="mb-4 w-full rounded-xl bg-muted/60 p-3 text-center text-sm">
                {status === "won" ? (
                  <p className="font-semibold text-foreground">
                    Você acertou em {guesses.length}/{TERMO_MAX_ATTEMPTS}!
                  </p>
                ) : (
                  <p className="font-semibold text-foreground">
                    Não foi dessa vez. A palavra era{" "}
                    <span className="uppercase">{data?.answer}</span>.
                  </p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  {guesses.length} tentativa{guesses.length === 1 ? "" : "s"} · volte amanhã para um
                  novo desafio.
                </p>
                <Button
                  size="sm"
                  variant="secondary"
                  className="mt-2 gap-1.5"
                  onClick={() => void handleShare()}
                >
                  <Share2 className="h-3.5 w-3.5" /> {shared ? "Copiado!" : "Compartilhar"}
                </Button>
              </div>
            )}

            {!finished && (
              <div className="w-full space-y-1.5 pb-2">
                {KEYBOARD_ROWS.map((row, ri) => (
                  <div key={ri} className="flex justify-center gap-1.5">
                    {ri === 2 && (
                      <button
                        type="button"
                        onClick={() => handleKey("ENTER")}
                        className="flex h-12 items-center justify-center rounded-md bg-muted px-2.5 text-xs font-semibold text-foreground hover:bg-muted/70"
                      >
                        Enviar
                      </button>
                    )}
                    {row.split("").map((letter) => (
                      <button
                        key={letter}
                        type="button"
                        onClick={() => handleKey(letter)}
                        className={`flex h-12 w-9 items-center justify-center rounded-md text-sm font-semibold uppercase transition-colors sm:w-10 ${
                          keyboardStates[letter]
                            ? STATE_CLASS[keyboardStates[letter]]
                            : "bg-muted text-foreground hover:bg-muted/70"
                        }`}
                      >
                        {letter}
                      </button>
                    ))}
                    {ri === 2 && (
                      <button
                        type="button"
                        aria-label="Apagar"
                        onClick={() => handleKey("BACK")}
                        className="flex h-12 items-center justify-center rounded-md bg-muted px-2.5 text-foreground hover:bg-muted/70"
                      >
                        <Delete className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
