import { useEffect, useState } from "react";
import { Paperclip, X } from "lucide-react";
import { getAeoEvidenciaUrl, removeAeoEvidencia, uploadAeoEvidencia } from "@/lib/aeo-evidence";
import type { AeoIa } from "@/lib/aeo-store";

/** Trata os dois formatos de evidência: `evidenciaPath` (novo — path no
 * Storage, precisa de signed URL) e `evidenciaUrl` (legado — data: URL
 * base64 já pronta, nunca mais escrita mas ainda renderizável). */
export function EvidenciaField({
  rodadaId,
  promptId,
  ia,
  evidenciaPath,
  evidenciaUrl,
  onChange,
}: {
  rodadaId: string;
  promptId: string;
  ia: AeoIa;
  evidenciaPath?: string;
  evidenciaUrl?: string;
  onChange: (next: { evidenciaPath?: string; evidenciaUrl?: string }) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (evidenciaPath) {
      getAeoEvidenciaUrl(evidenciaPath)
        .then((url) => {
          if (!cancelled) setSignedUrl(url);
        })
        .catch(() => {
          if (!cancelled) setSignedUrl(null);
        });
    } else {
      setSignedUrl(null);
    }
    return () => {
      cancelled = true;
    };
  }, [evidenciaPath]);

  const displayUrl = evidenciaPath ? signedUrl : evidenciaUrl;

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const path = await uploadAeoEvidencia(rodadaId, promptId, ia, file);
      onChange({ evidenciaPath: path, evidenciaUrl: undefined });
    } catch {
      /* ignore — upload falhou, mantém estado anterior */
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    if (evidenciaPath) await removeAeoEvidencia(evidenciaPath);
    onChange({ evidenciaPath: undefined, evidenciaUrl: undefined });
  };

  if (displayUrl) {
    return (
      <div className="flex items-center gap-2">
        <a href={displayUrl} target="_blank" rel="noreferrer">
          <img src={displayUrl} alt="Evidência" className="h-16 w-16 rounded object-cover" />
        </a>
        <button
          type="button"
          onClick={() => void handleRemove()}
          aria-label="Remover evidência"
          className="rounded p-1 text-muted-foreground hover:text-destructive"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground hover:border-foreground hover:text-foreground">
      <Paperclip className="h-3.5 w-3.5" />
      {uploading ? "Enviando..." : "Anexar print"}
      <input
        type="file"
        accept="image/*"
        className="hidden"
        disabled={uploading}
        onChange={(e) => e.target.files?.[0] && void handleFile(e.target.files[0])}
      />
    </label>
  );
}
