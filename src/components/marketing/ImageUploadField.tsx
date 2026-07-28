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
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      <div className="aspect-video overflow-hidden rounded-md border border-border bg-muted">
        {cover ? (
          <img src={cover} alt={label} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <ImageIcon className="h-6 w-6 text-muted-foreground" />
          </div>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && void handleFile(e.target.files[0])}
      />
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className={`${inputCls} inline-flex w-auto flex-1 items-center justify-center gap-1.5 font-medium hover:bg-muted`}
        >
          <Upload className="h-3.5 w-3.5" />
          {cover ? "Trocar imagem" : "Enviar imagem"}
        </button>
        {cover && (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            aria-label="Remover imagem"
            className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {error && <p className="text-[10px] text-rose-600">{error}</p>}
    </div>
  );
}
