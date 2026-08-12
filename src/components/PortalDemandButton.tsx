import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ClipboardList, Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { submitClientDemand } from "@/lib/cliente-link.functions";
import { t, type PortalLang } from "@/lib/portal-i18n";

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

/** Botão "Nova solicitação" dentro de uma campanha no portal — cai como uma
 * Tarefa normal (tag "Cliente") no board interno daquela campanha, sem
 * aparecer de volta pro cliente (não é uma lista visível no portal). */
export function PortalDemandButton({
  token,
  campanhaId,
  lang,
}: {
  token: string;
  campanhaId: string;
  lang: PortalLang;
}) {
  const submitFn = useServerFn(submitClientDemand);
  const [open, setOpen] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setTitulo("");
    setDescricao("");
    setFile(null);
    setError("");
    setDone(false);
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) reset();
  };

  const submit = async () => {
    if (!titulo.trim()) {
      setError(t(lang, "demandTituloRequired"));
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const fileData = file ? { nome: file.name, dataUrl: await fileToDataUrl(file) } : undefined;
      await submitFn({
        data: {
          token,
          campanhaId,
          titulo,
          descricao: descricao.trim() || undefined,
          file: fileData,
        },
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t(lang, "demandError"));
    }
    setSubmitting(false);
  };

  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm" variant="outline" className="gap-1.5 text-xs">
        <ClipboardList className="h-3.5 w-3.5" />
        {t(lang, "demandButton")}
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t(lang, "demandButton")}</DialogTitle>
          </DialogHeader>

          {done ? (
            <div className="space-y-4 py-4 text-center">
              <p className="text-sm text-foreground">{t(lang, "demandSent")}</p>
              <Button onClick={() => handleOpenChange(false)}>{t(lang, "demandClose")}</Button>
            </div>
          ) : (
            <div className="space-y-4">
              <input
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder={t(lang, "demandTituloPlaceholder")}
                autoFocus
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
              />
              <Textarea
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder={t(lang, "demandDescricaoPlaceholder")}
                className="min-h-24"
              />

              {file ? (
                <div className="flex items-center gap-2 text-xs">
                  <span className="inline-flex items-center gap-1 text-foreground">
                    <Paperclip className="h-3.5 w-3.5" /> {file.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => setFile(null)}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Remover anexo"
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
                  {t(lang, "anexarArquivo")}
                </Button>
              )}
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />

              {error && <p className="text-xs text-destructive">{error}</p>}

              <DialogFooter>
                <Button variant="outline" onClick={() => handleOpenChange(false)}>
                  {t(lang, "cancelar")}
                </Button>
                <Button onClick={submit} disabled={submitting}>
                  {submitting ? t(lang, "enviando") : t(lang, "demandSend")}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
