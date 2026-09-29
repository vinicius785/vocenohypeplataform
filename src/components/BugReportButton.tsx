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

export function BugReportButton() {
  // O Chat V2 já tem "Bugs reportados" na sidebar — o botão flutuante fica
  // oculto inteiramente nessa rota (ver `isChatV2` abaixo).
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isChatV2 = pathname.startsWith("/chat-v2");
  // Reuniões (`/time?section=reunioes`) não é uma rota própria — é uma
  // `SectionKey` dentro de `time.tsx` — então a mesma exclusão condicional
  // do Chat V2 aqui é feita pela search string em vez do pathname.
  const searchString = useRouterState({ select: (s) => s.location.searchStr });
  const isReunioes =
    pathname === "/time" && new URLSearchParams(searchString).get("section") === "reunioes";
  // Mesma exclusão condicional pras seções recém-migradas pro padrão visual
  // de Reuniões (Clientes, Campanhas, Projetos, Comercial, Time e Metas).
  const sectionParam = new URLSearchParams(searchString).get("section");
  const isMigratedSection =
    pathname === "/time" &&
    ["clientes", "campanhas", "projetos", "comercial", "time", "metas"].includes(
      sectionParam ?? "",
    );
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (isReunioes) return null;
  if (isChatV2) return null;
  if (isMigratedSection) return null;

  const reset = () => {
    setDescription("");
    setFile(null);
    setPreview(null);
    setError("");
    setDone(false);
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
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
      <Button
        onClick={() => setOpen(true)}
        size="sm"
        variant="outline"
        className="fixed bottom-4 right-4 z-40 gap-1.5 rounded-full border-destructive/60 bg-background/95 text-xs text-muted-foreground shadow-md backdrop-blur hover:text-foreground"
      >
        <Bug className="h-3.5 w-3.5" />
        Encontrou um bug?
      </Button>

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
