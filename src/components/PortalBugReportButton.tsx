import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
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
import { submitPortalBugReport } from "@/lib/cliente-link.functions";
import { t, type PortalLang } from "@/lib/portal-i18n";

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export function PortalBugReportButton({ token, lang }: { token: string; lang: PortalLang }) {
  const submitFn = useServerFn(submitPortalBugReport);
  const [open, setOpen] = useState(false);
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
    setOpen(next);
    if (!next) reset();
  };

  const handleFile = (f: File | null) => {
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : null);
  };

  const submit = async () => {
    if (!description.trim()) {
      setError(t(lang, "bugReportDescribe"));
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const screenshotDataUrl = file ? await fileToDataUrl(file) : undefined;
      await submitFn({
        data: {
          token,
          description,
          pageContext: window.location.pathname + window.location.search,
          screenshotDataUrl,
        },
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t(lang, "bugReportError"));
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
        {t(lang, "bugReportButton")}
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t(lang, "bugReportButton")}</DialogTitle>
          </DialogHeader>

          {done ? (
            <div className="space-y-4 py-4 text-center">
              <p className="text-sm text-foreground">{t(lang, "bugReportSent")}</p>
              <Button onClick={() => handleOpenChange(false)}>{t(lang, "bugReportClose")}</Button>
            </div>
          ) : (
            <div className="space-y-4">
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t(lang, "bugReportPlaceholder")}
                className="min-h-32"
              />

              {preview ? (
                <div className="relative w-fit">
                  <img
                    src={preview}
                    alt=""
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
                  {t(lang, "bugReportAttach")}
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
                  {t(lang, "bugReportCancel")}
                </Button>
                <Button onClick={submit} disabled={submitting}>
                  {submitting ? t(lang, "bugReportSending") : t(lang, "bugReportSend")}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
