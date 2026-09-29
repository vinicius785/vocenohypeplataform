import { useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { Bug, Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { submitBugReport } from "@/lib/bug-reports";

/**
 * Dialog de "Reportar bug", separado do gatilho flutuante pra poder ser
 * aberto a partir de outro lugar (ex.: o item de bug na faixa compacta do
 * Chat V2, ver `ChatCompactRail.tsx`) sem duplicar o formulário — mesmo
 * componente, controlado de fora via `open`/`onOpenChange`.
 */
export function BugReportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setDescription("");
    setFile(null);
    setPreview(null);
    setError("");
    setDone(false);
  };

  const handleOpenChange = (next: boolean) => {
    onOpenChange(next);
    if (!next) reset();
  };

  const handleFile = (f: File | null) => {
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : null);
  };

  const submit = async () => {
    if (!description.trim()) {
      setError("Descreva o que aconteceu.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await submitBugReport({
        description,
        screenshotFile: file,
        pageContext: window.location.pathname + window.location.search,
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar. Tente novamente.");
    }
    setSubmitting(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Encontrou um bug?</DialogTitle>
          </DialogHeader>

          {done ? (
            <div className="space-y-4 py-4 text-center">
              <p className="text-sm text-foreground">
                Obrigado! Seu relato foi enviado e já está disponível pra equipe em Time.
              </p>
              <Button onClick={() => handleOpenChange(false)}>Fechar</Button>
            </div>
          ) : (
            <div className="space-y-4">
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descreva o que aconteceu, o que você esperava e como reproduzir..."
                className="min-h-32"
              />

              {preview ? (
                <div className="relative w-fit">
                  <img
                    src={preview}
                    alt="Print anexado"
                    className="max-h-40 rounded-md border border-border object-contain"
                  />
                  <button
                    type="button"
                    onClick={() => handleFile(null)}
                    className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileRef.current?.click()}
                  className="gap-2"
                >
                  <Paperclip className="h-3.5 w-3.5" />
                  Anexar print
                </Button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
              />

              {error && <p className="text-xs text-destructive">{error}</p>}

              <DialogFooter>
                <Button variant="outline" onClick={() => handleOpenChange(false)}>
                  Cancelar
                </Button>
                <Button onClick={submit} disabled={submitting}>
                  {submitting ? "Enviando..." : "Enviar"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Botão flutuante "Encontrou um bug?" — visível em toda a plataforma, EXCETO
 * no Chat V2, onde a ação equivalente fica na faixa compacta (ver
 * `ChatCompactRail.tsx`), pra não flutuar sobre a área de conversa. Reaproveita
 * o mesmo `BugReportDialog`, nunca duplica o formulário.
 */
export function BugReportButton() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isChatV2 = pathname.startsWith("/chat-v2");
  const [open, setOpen] = useState(false);

  if (isChatV2) return null;

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        size="sm"
        variant="outline"
        className="fixed bottom-4 right-4 z-40 gap-1.5 rounded-full border-destructive/60 bg-background/95 text-xs text-muted-foreground shadow-md backdrop-blur hover:text-foreground"
      >
        <Bug className="h-3.5 w-3.5" />
        Encontrou um bug?
      </Button>
      <BugReportDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
