import { useRef, useState } from "react";
import { ImageIcon, Upload, X } from "lucide-react";
import { resizeImageToDataUrl } from "@/lib/image-upload";

const inputCls =
  "h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs outline-none focus:ring-2 focus:ring-ring";

/** Cover/creative image field with real file upload (resized client-side to a data URL). */
export function CoverUploadField({
  cover,
  onChange,
  label = "Capa",
}: {
  cover?: string;
  onChange: (cover: string | undefined) => void;
  label?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");

  const handleFile = async (file: File) => {
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      onChange(dataUrl);
      setError("");
    } catch {
      setError("Não foi possível processar a imagem.");
    }
  };

  return (
    <div className="space-y-1">
      <span className="text-xs font-semibold uppercase tracking-widest text-text-secondary">
        {label}
      </span>
      {cover ? (
        <div className="aspect-video overflow-hidden rounded-lg border border-border bg-muted">
          <img src={cover} alt={label} className="h-full w-full object-cover" />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex h-24 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 text-sm text-text-secondary hover:border-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <ImageIcon className="h-4 w-4" /> Adicionar imagem de capa
        </button>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && void handleFile(e.target.files[0])}
      />
      {cover && (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className={`${inputCls} inline-flex w-auto flex-1 items-center justify-center gap-1.5 font-medium hover:bg-muted`}
          >
            <Upload className="h-3.5 w-3.5" />
            Trocar imagem
          </button>
          <button
            type="button"
            onClick={() => onChange(undefined)}
            aria-label="Remover imagem"
            className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      {error && <p className="text-[11px] text-rose-600">{error}</p>}
    </div>
  );
}
