import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Delete, Loader2, Share2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getTermoSession, submitTermoGuess } from "@/lib/games/termo.functions";
import {
  TERMO_WORD_LENGTH,
  TERMO_MAX_ATTEMPTS,
  keyboardLetterStates,
  buildShareText,
  type LetterState,
} from "@/lib/games/termo-game";
import { normalizeWord } from "@/lib/games/termo-words";

const KEYBOARD_ROWS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];

const STATE_CLASS: Record<LetterState, string> = {
  correct: "bg-success text-success-foreground border-success",
  present: "bg-warning text-warning-foreground border-warning",
  absent: "bg-muted text-muted-foreground border-transparent",
};

/**
 * Termo — grade 6x5, teclado virtual, suporte a teclado físico. A
 * resposta do dia NUNCA chega ao cliente antes do fim da partida — toda
 * avaliação acontece em `submitTermoGuess` (servidor); este componente só
 * renderiza o resultado que volta de lá.
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

  const { data, isLoading } = useQuery({
    queryKey: ["termo-session"],
    queryFn: () => getSessionFn(),
  });
  const [current, setCurrent] = useState("");
  const [error, setError] = useState("");
  const [shared, setShared] = useState(false);

  const guesses = data?.guesses ?? [];
  const finished = !!data?.finished;
  const won = !!data?.won;

  const submitMutation = useMutation({
    mutationFn: (word: string) => submitFn({ data: { word } }),
    onSuccess: (result) => {
      queryClient.setQueryData(["termo-session"], result);
      setCurrent("");
      setError("");
    },
    onError: (e) => {
      setError(e instanceof Error ? e.message : "Não foi possível enviar a tentativa.");
    },
  });

  const keyboardStates = useMemo(() => keyboardLetterStates(guesses), [guesses]);

  const handleSubmit = () => {
    if (finished || submitMutation.isPending) return;
    if (normalizeWord(current).length !== TERMO_WORD_LENGTH) {
      setError("A palavra precisa ter 5 letras.");
      return;
    }
    submitMutation.mutate(current);
  };

  const handleKey = (k: string) => {
    if (finished) return;
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
      else if (/^[a-zA-ZçÇ]$/.test(e.key)) handleKey(normalizeWord(e.key));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, current, finished]);

  const handleShare = async () => {
    const results = guesses.map((g) => g.result);
    const dayNumber = Math.floor(Date.now() / 86_400_000) % 100000;
    const text = buildShareText(results, won, dayNumber);
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
    if (i < guesses.length)
      return { word: guesses[i].word, result: guesses[i].result, active: false };
    if (i === guesses.length)
      return { word: current.padEnd(TERMO_WORD_LENGTH, " "), result: null, active: true };
    return { word: "     ", result: null, active: false };
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent mobileFullScreen className="flex max-h-[92vh] max-w-md flex-col items-center">
        <DialogHeader className="w-full text-center">
          <DialogTitle>Termo</DialogTitle>
          <DialogDescription>Descubra a palavra de 5 letras em até 6 tentativas.</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex flex-1 items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="my-3 grid grid-rows-6 gap-1.5">
              {rows.map((row, ri) => (
                <div key={ri} className="grid grid-cols-5 gap-1.5">
                  {Array.from({ length: TERMO_WORD_LENGTH }, (_, ci) => {
                    const letter = row.word[ci]?.trim() ?? "";
                    const state = row.result?.[ci];
                    return (
                      <div
                        key={ci}
                        className={`flex h-11 w-11 items-center justify-center rounded-md border-2 text-lg font-bold uppercase sm:h-12 sm:w-12 ${
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

            {error && <p className="text-xs text-danger">{error}</p>}

            {finished && (
              <div className="mb-3 w-full rounded-xl bg-muted/60 p-3 text-center text-sm">
                {won ? (
                  <p className="font-semibold text-foreground">
                    Você acertou em {guesses.length}/{TERMO_MAX_ATTEMPTS}!
                  </p>
                ) : (
                  <p className="font-semibold text-foreground">
                    Não foi dessa vez. A palavra era{" "}
                    <span className="uppercase">{data?.answer}</span>.
                  </p>
                )}
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
              <div className="w-full space-y-1.5">
                {KEYBOARD_ROWS.map((row, ri) => (
                  <div key={ri} className="flex justify-center gap-1">
                    {ri === 2 && (
                      <button
                        type="button"
                        onClick={() => handleKey("ENTER")}
                        className="flex h-11 items-center justify-center rounded-md bg-muted px-2 text-[11px] font-semibold text-foreground hover:bg-muted/70"
                      >
                        Enviar
                      </button>
                    )}
                    {row.split("").map((letter) => (
                      <button
                        key={letter}
                        type="button"
                        onClick={() => handleKey(letter)}
                        className={`flex h-11 w-8 items-center justify-center rounded-md text-sm font-semibold uppercase transition-colors sm:w-9 ${
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
                        className="flex h-11 items-center justify-center rounded-md bg-muted px-2 text-foreground hover:bg-muted/70"
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
