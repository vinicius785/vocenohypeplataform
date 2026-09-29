import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ChevronRight,
  Download,
  Eye,
  FileText,
  Loader2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { IconButton } from "@/components/ui/icon-button";
import { VoiceMessagePlayer } from "@/components/chat/VoiceMessagePlayer";
import type { ChatAttachment, ChatMessage } from "@/lib/chat-store";

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Busca uma URL fresca sob demanda em vez de confiar na `url` cacheada
 * (que pode ter expirado — mesmo padrão corrigido pro mídia kit de
 * influenciadores). Usada tanto pelo lightbox quanto pelo card de PDF. */
async function fetchFreshAttachmentUrl(
  a: ChatAttachment,
  download: boolean,
): Promise<string | null> {
  if (!a.path) return download ? a.url : a.url; // anexo antigo sem `path` — só a URL cacheada mesmo
  const { getChatAttachmentUrl } = await import("@/lib/chat-attachments.functions");
  const res = await getChatAttachmentUrl({ data: { path: a.path, name: a.name, download } });
  return res.ok ? res.url : null;
}

/** Lightbox de imagem (pedido, seção 9) — zoom simples, baixar, navegação
 * entre imagens da mesma mensagem. Busca uma URL fresca ao abrir em vez
 * de reaproveitar a `url` cacheada da mensagem. */
function ImageLightbox({
  images,
  startIndex,
  onClose,
}: {
  images: ChatAttachment[];
  startIndex: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(startIndex);
  const [zoom, setZoom] = useState(1);
  const [state, setState] = useState<{ loading: boolean; url?: string; error?: boolean }>({
    loading: true,
  });
  const current = images[index];

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true });
    setZoom(1);
    void fetchFreshAttachmentUrl(current, false).then((url) => {
      if (cancelled) return;
      if (!url) setState({ loading: false, error: true });
      else setState({ loading: false, url });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current.path, current.url]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="h-[90vh] w-[min(1100px,calc(100vw-32px))] max-w-none overflow-hidden p-0">
        <DialogTitle className="sr-only">{current.name}</DialogTitle>
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2">
            <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
              {current.name}
            </p>
            {images.length > 1 && (
              <span className="shrink-0 text-xs text-muted-foreground">
                {index + 1} / {images.length}
              </span>
            )}
            <div className="flex shrink-0 items-center gap-1">
              <IconButton
                label="Diminuir zoom"
                onClick={() => setZoom((z) => Math.max(1, z - 0.25))}
              >
                <ZoomOut className="h-4 w-4" />
              </IconButton>
              <IconButton
                label="Aumentar zoom"
                onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
              >
                <ZoomIn className="h-4 w-4" />
              </IconButton>
              <IconButton
                label="Baixar"
                onClick={() =>
                  void fetchFreshAttachmentUrl(current, true).then(
                    (u) => u && window.open(u, "_blank", "noopener,noreferrer"),
                  )
                }
              >
                <Download className="h-4 w-4" />
              </IconButton>
            </div>
          </div>
          <div className="relative flex flex-1 items-center justify-center overflow-auto bg-muted/30">
            {images.length > 1 && index > 0 && (
              <button
                type="button"
                onClick={() => setIndex((i) => i - 1)}
                className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-background/80 p-2 shadow hover:bg-background"
                aria-label="Anterior"
              >
                <ChevronRight className="h-4 w-4 rotate-180" />
              </button>
            )}
            {state.loading && <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />}
            {!state.loading && state.error && (
              <div className="flex flex-col items-center gap-2 text-center text-sm text-muted-foreground">
                <AlertTriangle className="h-5 w-5" />
                Não foi possível carregar a imagem.
              </div>
            )}
            {!state.loading && !state.error && state.url && (
              <img
                src={state.url}
                alt={current.name}
                style={{ transform: `scale(${zoom})` }}
                className="max-h-full max-w-full object-contain transition-transform"
              />
            )}
            {images.length > 1 && index < images.length - 1 && (
              <button
                type="button"
                onClick={() => setIndex((i) => i + 1)}
                className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-background/80 p-2 shadow hover:bg-background"
                aria-label="Próxima"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Card de PDF (pedido, seção 9) — Visualizar sempre busca uma URL
 * fresca (nunca a `url` cacheada), abre num `<iframe>` (paginação/zoom
 * nativos do navegador, sem biblioteca nova). */
function PdfAttachmentCard({ attachment }: { attachment: ChatAttachment }) {
  const [preview, setPreview] = useState<{
    loading: boolean;
    url?: string;
    error?: boolean;
  } | null>(null);
  const openPreview = () => {
    setPreview({ loading: true });
    void fetchFreshAttachmentUrl(attachment, false).then((url) => {
      setPreview(url ? { loading: false, url } : { loading: false, error: true });
    });
  };
  const download = () => {
    void fetchFreshAttachmentUrl(attachment, true).then(
      (u) => u && window.open(u, "_blank", "noopener,noreferrer"),
    );
  };
  return (
    <>
      <div className="flex max-w-sm items-center gap-2 rounded-md border border-border bg-muted/40 px-2 py-1.5 text-xs">
        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-foreground">{attachment.name}</p>
          <p className="text-[10px] text-muted-foreground">PDF · {formatBytes(attachment.size)}</p>
        </div>
        <button
          type="button"
          onClick={openPreview}
          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Visualizar"
        >
          <Eye className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={download}
          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Baixar"
        >
          <Download className="h-3.5 w-3.5" />
        </button>
      </div>
      {preview && (
        <Dialog open onOpenChange={(o) => !o && setPreview(null)}>
          <DialogContent className="h-[85vh] w-[min(900px,calc(100vw-48px))] max-w-none">
            <DialogTitle>{attachment.name}</DialogTitle>
            <div className="mt-2 h-[70vh] w-full overflow-hidden rounded-md border border-border bg-muted">
              {preview.loading && (
                <div className="flex h-full items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}
              {!preview.loading && preview.error && (
                <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
                  <AlertTriangle className="h-5 w-5 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Arquivo indisponível.</p>
                  <button
                    type="button"
                    onClick={download}
                    className="text-sm font-medium text-foreground underline underline-offset-2"
                  >
                    Baixar arquivo
                  </button>
                </div>
              )}
              {!preview.loading && !preview.error && preview.url && (
                <iframe src={preview.url} title={attachment.name} className="h-full w-full" />
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

export function AttachmentList({
  message,
  attachments,
}: {
  message: ChatMessage;
  attachments: ChatAttachment[];
}) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const images = attachments.filter((a) => a.type.startsWith("image/"));
  const others = attachments.filter((a) => !a.type.startsWith("image/"));

  return (
    <div className="mt-1.5 flex flex-col gap-1.5">
      {images.length > 0 && (
        <div
          className={`grid max-w-sm gap-1 ${images.length === 1 ? "grid-cols-1" : images.length <= 4 ? "grid-cols-2" : "grid-cols-3"}`}
        >
          {images.map((a, i) => (
            <button
              key={a.path || a.url}
              type="button"
              onClick={() => setLightboxIndex(i)}
              className="block overflow-hidden rounded-md border border-border"
            >
              <img
                src={a.url}
                alt={a.name}
                className={`w-full object-cover ${images.length === 1 ? "max-h-64" : "h-28"}`}
              />
            </button>
          ))}
        </div>
      )}
      {others.map((a) => {
        if (a.type.startsWith("audio/")) {
          return <VoiceMessagePlayer key={a.path || a.url} message={message} attachment={a} />;
        }
        if (a.type === "application/pdf") {
          return <PdfAttachmentCard key={a.path || a.url} attachment={a} />;
        }
        return (
          <a
            key={a.path}
            href={a.url}
            target="_blank"
            rel="noreferrer"
            download={a.name}
            className="inline-flex max-w-sm items-center gap-2 rounded-md border border-border bg-muted/40 px-2 py-1.5 text-xs hover:bg-muted"
          >
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="flex-1 truncate">{a.name}</span>
            <span className="text-[10px] text-muted-foreground">{formatBytes(a.size)}</span>
            <Download className="h-3 w-3 text-muted-foreground" />
          </a>
        );
      })}
      {lightboxIndex !== null && (
        <ImageLightbox
          images={images}
          startIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  );
}
