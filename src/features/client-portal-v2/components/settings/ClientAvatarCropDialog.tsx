import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AVATAR_OUTPUT_SIZE } from "../../lib/avatar-upload";

const VIEWPORT = 280; // área de recorte visível, em px

/**
 * Recorte quadrado com zoom + reposicionamento — construído do zero em
 * `<canvas>` (sem lib nova: nenhum componente de crop já existia no
 * projeto, e `bunfig.toml` tem uma trava de 24h pra dependências novas).
 * `createImageBitmap(file, {imageOrientation: "from-image"})` já corrige
 * a orientação EXIF de fábrica no navegador — nenhum parsing manual de
 * EXIF necessário.
 */
export function ClientAvatarCropDialog({
  file,
  open,
  onCancel,
  onConfirm,
}: {
  file: File | null;
  open: boolean;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{
    startX: number;
    startY: number;
    origin: { x: number; y: number };
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!file || !open) return;
    let cancelled = false;
    setError(null);
    createImageBitmap(file, { imageOrientation: "from-image" })
      .then((bmp) => {
        if (cancelled) return;
        setBitmap(bmp);
        setZoom(1);
        setOffset({ x: 0, y: 0 });
      })
      .catch(() => !cancelled && setError("Não foi possível abrir esta imagem."));
    return () => {
      cancelled = true;
    };
  }, [file, open]);

  const baseScale = bitmap ? VIEWPORT / Math.min(bitmap.width, bitmap.height) : 1;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !bitmap) return;
    canvas.width = VIEWPORT;
    canvas.height = VIEWPORT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, VIEWPORT, VIEWPORT);
    const scale = baseScale * zoom;
    const w = bitmap.width * scale;
    const h = bitmap.height * scale;
    const x = (VIEWPORT - w) / 2 + offset.x;
    const y = (VIEWPORT - h) / 2 + offset.y;
    ctx.drawImage(bitmap, x, y, w, h);
  }, [bitmap, zoom, offset, baseScale]);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, origin: offset };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setOffset({ x: dragRef.current.origin.x + dx, y: dragRef.current.origin.y + dy });
  };
  const onPointerUp = () => {
    dragRef.current = null;
  };

  const handleConfirm = () => {
    if (!bitmap) return;
    const out = document.createElement("canvas");
    out.width = AVATAR_OUTPUT_SIZE;
    out.height = AVATAR_OUTPUT_SIZE;
    const ctx = out.getContext("2d");
    if (!ctx) return;
    const scale = (baseScale * zoom * AVATAR_OUTPUT_SIZE) / VIEWPORT;
    const w = bitmap.width * scale;
    const h = bitmap.height * scale;
    const x = (AVATAR_OUTPUT_SIZE - w) / 2 + (offset.x * AVATAR_OUTPUT_SIZE) / VIEWPORT;
    const y = (AVATAR_OUTPUT_SIZE - h) / 2 + (offset.y * AVATAR_OUTPUT_SIZE) / VIEWPORT;
    ctx.drawImage(bitmap, x, y, w, h);
    out.toBlob(
      (blob) => {
        if (blob) onConfirm(blob);
      },
      "image/jpeg",
      0.9,
    );
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Ajustar foto</DialogTitle>
        </DialogHeader>

        {error ? (
          <p className="py-6 text-center text-sm text-destructive">{error}</p>
        ) : (
          <>
            <div className="flex justify-center">
              <canvas
                ref={canvasRef}
                width={VIEWPORT}
                height={VIEWPORT}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerLeave={onPointerUp}
                className="cursor-move touch-none rounded-full border border-border bg-muted"
                role="img"
                aria-label="Área de recorte da foto de perfil — arraste para reposicionar"
              />
            </div>
            <div className="mt-4 flex items-center gap-3">
              <span className="text-xs text-text-secondary">Zoom</span>
              <input
                type="range"
                min={1}
                max={3}
                step={0.01}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="flex-1"
                aria-label="Zoom da foto"
              />
            </div>
          </>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="button" disabled={!bitmap || !!error} onClick={handleConfirm}>
            Confirmar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
