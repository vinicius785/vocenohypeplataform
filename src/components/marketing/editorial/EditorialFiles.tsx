import { useEffect, useRef, useState } from "react";
import { FileText, Film, Image as ImageIcon, Loader2, Paperclip, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { editorialFileUrl } from "@/lib/marketing-editorial-files";
import {
  fileKind,
  formatFileSize,
  type EditorialFile,
  type FileKind,
} from "@/lib/marketing-editorial";

const KIND_LABEL: Record<FileKind, string> = {
  imagem: "Imagem",
  video: "Vídeo",
  pdf: "PDF",
  outro: "Arquivo",
};
const KIND_ICON = { imagem: ImageIcon, video: Film, pdf: FileText, outro: Paperclip } as const;

function useFileUrl(path: string, enabled: boolean) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void editorialFileUrl(path).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [path, enabled]);
  return url;
}

function Thumb({ file }: { file: EditorialFile }) {
  const kind = fileKind(file);
  const url = useFileUrl(file.path, kind === "imagem");
  const Icon = KIND_ICON[kind];
  return (
    <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-md bg-muted text-text-secondary">
      {kind === "imagem" && url ? (
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <Icon className="h-4 w-4" />
      )}
    </span>
  );
}

async function openFile(file: EditorialFile) {
  const url = await editorialFileUrl(file.path);
  if (!url) {
    toast.error("Não foi possível abrir o arquivo.");
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

/** Arquivos do conteúdo: lista compacta (miniatura ou ícone, nome, tipo · tamanho), abrir e remover. */
export function EditorialFiles({
  files,
  uploading,
  onAdd,
  onRemove,
}: {
  files: EditorialFile[];
  /** Nomes dos arquivos que estão sendo enviados agora. */
  uploading: string[];
  onAdd: (files: File[]) => void;
  onRemove: (file: EditorialFile) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const empty = files.length === 0 && uploading.length === 0;
  return (
    <section aria-label="Arquivos" className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
          Arquivos
        </h3>
        <Button variant="ghost" size="sm" onClick={() => input.current?.click()}>
          <Plus className="h-3.5 w-3.5" /> Adicionar arquivo
        </Button>
        <input
          ref={input}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            const list = Array.from(e.target.files ?? []);
            if (list.length > 0) onAdd(list);
            e.target.value = "";
          }}
        />
      </div>
      {empty ? (
        <p className="text-sm text-text-secondary">Nenhum arquivo anexado.</p>
      ) : (
        <ul className="divide-y divide-border/40">
          {files.map((f) => {
            const kind = fileKind(f);
            return (
              <li key={f.id} className="flex items-center gap-3 py-2">
                <button
                  type="button"
                  onClick={() => void openFile(f)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  aria-label={`Abrir ${f.name}`}
                >
                  <Thumb file={f} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-foreground">{f.name}</span>
                    <span className="block text-xs text-text-secondary">
                      {KIND_LABEL[kind]} · {formatFileSize(f.size)}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(f)}
                  aria-label={`Remover ${f.name}`}
                  className="rounded p-1 text-text-secondary hover:bg-muted hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
          {uploading.map((name) => (
            <li key={name} className="flex items-center gap-3 py-2 text-sm text-text-secondary">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-muted">
                <Loader2 className="h-4 w-4 animate-spin" />
              </span>
              <span className="min-w-0 truncate">Enviando {name}…</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
