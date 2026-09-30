import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Download, Loader2, RefreshCw, X } from "lucide-react";
import { fileKindLabel, formatFileSize, inferFileKind } from "../../lib/client-file-format";
import { downloadCrossOriginFile } from "../../lib/download-file";
import type { ClientFile } from "../../types/files";

/** Botão de download real — ver `downloadCrossOriginFile` pro motivo de
 * não usar `<a download>` puro (silenciosamente ignorado em link
 * cross-origin, que é sempre o caso aqui: signed URL do Supabase
 * Storage). Mesmo visual dos 3 lugares que precisavam disso. */
function DownloadButton({
  url,
  filename,
  variant = "icon",
}: {
  url: string;
  filename: string;
  variant?: "icon" | "button";
}) {
  const [downloading, setDownloading] = useState(false);
  const run = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      await downloadCrossOriginFile(url, filename);
    } finally {
      setDownloading(false);
    }
  };
  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={() => void run()}
        disabled={downloading}
        aria-label="Baixar arquivo"
        className="shrink-0 rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
      >
        {downloading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => void run()}
      disabled={downloading}
      className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-md bg-brand px-3.5 text-sm font-medium text-brand-foreground hover:bg-brand-hover disabled:opacity-60"
    >
      {downloading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Download className="h-3.5 w-3.5" />
      )}
      {downloading ? "Baixando…" : "Baixar arquivo"}
    </button>
  );
}

/**
 * Viewer nativo único, compartilhado por Relatórios, Arquivos, a página
 * da campanha e o drawer do influenciador — nenhuma área tem seu próprio
 * viewer. Overlay amplo no desktop/tablet (Radix Dialog já resolve foco
 * preso, `Escape`, clique fora, retorno do foco de graça); tela cheia no
 * mobile via classes responsivas. Nunca abre nova aba, nunca inicia
 * download sozinho.
 */
export function ClientFileViewer({
  file,
  onClose,
}: {
  file: ClientFile | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!file} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="flex h-[100dvh] w-screen max-w-none flex-col gap-0 rounded-none p-0 sm:h-[92dvh] sm:w-[92vw] sm:max-w-5xl sm:rounded-2xl"
        onOpenAutoFocus={(e) => e.preventDefault()}
        showCloseButton={false}
      >
        {file && <ClientFileViewerBody file={file} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function ClientFileViewerBody({ file, onClose }: { file: ClientFile; onClose: () => void }) {
  const kind = file.url ? inferFileKind(file.url) : "unsupported";
  const [currentUrl, setCurrentUrl] = useState(file.url);
  const [loadError, setLoadError] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    setCurrentUrl(file.url);
    setLoadError(false);
  }, [file]);

  const handleRetry = async () => {
    setLoadError(false);
    if (!file.regenerate) return;
    setRegenerating(true);
    try {
      const fresh = await file.regenerate();
      setCurrentUrl(fresh);
      if (!fresh) setLoadError(true);
    } catch {
      setLoadError(true);
    } finally {
      setRegenerating(false);
    }
  };

  const contextLine = [file.campanhaNome, file.competenciaLabel, file.influencerNome]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <header
        className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top, 0px))" }}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{file.friendlyName}</p>
          {contextLine && <p className="truncate text-xs text-text-secondary">{contextLine}</p>}
        </div>
        <span className="hidden shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground sm:inline-block">
          {fileKindLabel(kind)}
        </span>
        {currentUrl && <DownloadButton url={currentUrl} filename={file.friendlyName} />}
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="shrink-0 rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-auto bg-muted/30">
        {!currentUrl || loadError ? (
          <ViewerError
            canRetry={!!file.regenerate}
            regenerating={regenerating}
            onRetry={() => void handleRetry()}
            downloadUrl={currentUrl}
            filename={file.friendlyName}
          />
        ) : kind === "pdf" ? (
          <PdfBody url={currentUrl} onError={() => setLoadError(true)} />
        ) : kind === "image" ? (
          <ImageBody url={currentUrl} alt={file.friendlyName} onError={() => setLoadError(true)} />
        ) : kind === "video" ? (
          <VideoBody
            url={currentUrl}
            filename={file.friendlyName}
            onError={() => setLoadError(true)}
          />
        ) : kind === "audio" ? (
          <AudioBody url={currentUrl} name={file.friendlyName} onError={() => setLoadError(true)} />
        ) : kind === "text" ? (
          <TextBody url={currentUrl} onError={() => setLoadError(true)} />
        ) : (
          <UnsupportedBody file={file} downloadUrl={currentUrl} />
        )}
      </div>
    </>
  );
}

function ViewerError({
  canRetry,
  regenerating,
  onRetry,
  downloadUrl,
  filename,
}: {
  canRetry: boolean;
  regenerating: boolean;
  onRetry: () => void;
  downloadUrl: string | null;
  filename: string;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-sm font-medium text-foreground">Não foi possível abrir este arquivo.</p>
      <p className="max-w-xs text-xs text-text-secondary">
        Tente novamente ou faça o download para visualizar no seu dispositivo.
      </p>
      <div className="flex gap-2">
        {canRetry && (
          <button
            type="button"
            onClick={onRetry}
            disabled={regenerating}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3.5 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {regenerating ? "Tentando…" : "Tentar novamente"}
          </button>
        )}
        {downloadUrl && <DownloadButton url={downloadUrl} filename={filename} variant="button" />}
      </div>
    </div>
  );
}

function PdfBody({ url, onError }: { url: string; onError: () => void }) {
  // Sem PDF.js nesta rodada (nenhuma lib de PDF já instalada no projeto,
  // e adicionar uma nova depende de aprovação — trava de 24h em
  // bunfig.toml pra dependências novas). O visualizador nativo do
  // navegador dentro de um `<iframe>` já resolve paginação, zoom e busca
  // de texto sozinho; o que fica por nossa conta é a moldura (nome,
  // contexto, download, fechar), que já está no cabeçalho acima — nunca
  // um iframe cru sem esse contexto.
  return (
    <iframe
      src={url}
      title="Visualizador de PDF"
      className="h-full w-full border-0"
      onError={onError}
    />
  );
}

function ImageBody({ url, alt, onError }: { url: string; alt: string; onError: () => void }) {
  const [zoomed, setZoomed] = useState(false);
  return (
    <div className="flex h-full w-full items-center justify-center overflow-auto p-4">
      <img
        src={url}
        alt={alt}
        onError={onError}
        onClick={() => setZoomed((z) => !z)}
        className={`select-none rounded-md transition-transform ${
          zoomed ? "max-w-none scale-150 cursor-zoom-out" : "max-h-full max-w-full cursor-zoom-in"
        }`}
      />
    </div>
  );
}

/** Alguns vídeos (ex: `.MOV` do iPhone em HEVC) chegam com um container
 * que o navegador reconhece o suficiente pra tocar o ÁUDIO, mas cujo
 * codec de vídeo ele não consegue decodificar — nesse caso o elemento
 * `<video>` não dispara `onError` nenhum, só renderiza a barra de
 * controle nativa sem nenhuma imagem (exatamente o bug relatado: "só
 * vem o áudio"). Detectamos isso checando `videoWidth === 0` depois do
 * `loadedmetadata` — sem trilha de vídeo decodificada, a largura nunca é
 * preenchida — e trocamos pra um aviso claro + download em destaque, em
 * vez de deixar a barra de áudio "crua" do navegador sem explicação. */
function VideoBody({
  url,
  filename,
  onError,
}: {
  url: string;
  filename: string;
  onError: () => void;
}) {
  const [videoOnlyAudio, setVideoOnlyAudio] = useState(false);

  if (videoOnlyAudio) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm font-medium text-foreground">
          Este navegador não consegue exibir a imagem deste vídeo.
        </p>
        <p className="max-w-xs text-xs text-text-secondary">
          O formato do arquivo não é compatível com a pré-visualização do portal. Baixe o arquivo
          para assistir normalmente.
        </p>
        <DownloadButton url={url} filename={filename} variant="button" />
      </div>
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center p-4">
      <video
        src={url}
        controls
        autoPlay={false}
        onError={onError}
        onLoadedMetadata={(e) => {
          const v = e.currentTarget;
          if (v.videoWidth === 0 && v.videoHeight === 0) setVideoOnlyAudio(true);
        }}
        className="max-h-full max-w-full rounded-md"
      />
    </div>
  );
}

function AudioBody({ url, name, onError }: { url: string; name: string; onError: () => void }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6">
      <p className="text-sm font-medium text-foreground">{name}</p>
      <audio src={url} controls autoPlay={false} onError={onError} className="w-full max-w-sm" />
    </div>
  );
}

const MAX_TEXT_BYTES = 512 * 1024;

function TextBody({ url, onError }: { url: string; onError: () => void }) {
  const [content, setContent] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const requested = useRef(false);

  useEffect(() => {
    if (requested.current) return;
    requested.current = true;
    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error("fetch failed");
        const buf = await res.arrayBuffer();
        const isTruncated = buf.byteLength > MAX_TEXT_BYTES;
        const slice = isTruncated ? buf.slice(0, MAX_TEXT_BYTES) : buf;
        setContent(new TextDecoder("utf-8").decode(slice));
        setTruncated(isTruncated);
      } catch {
        onError();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  if (content === null) {
    return <div className="h-full animate-pulse bg-muted/50" />;
  }

  return (
    <div className="h-full overflow-auto p-4">
      <pre className="whitespace-pre-wrap break-words text-xs text-foreground">{content}</pre>
      {truncated && (
        <p className="mt-2 text-xs text-text-secondary">
          Prévia limitada — baixe o arquivo para ver o conteúdo completo.
        </p>
      )}
    </div>
  );
}

function UnsupportedBody({ file, downloadUrl }: { file: ClientFile; downloadUrl: string | null }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
      <p className="text-sm font-medium text-foreground">Prévia indisponível</p>
      <p className="max-w-xs text-xs text-text-secondary">
        Este formato ainda não pode ser visualizado no portal.
      </p>
      <dl className="mt-2 space-y-1 text-xs text-text-secondary">
        {file.sizeBytes !== undefined && (
          <div>Tamanho: {formatFileSize(file.sizeBytes) ?? "—"}</div>
        )}
        {file.createdAt && <div>Data: {new Date(file.createdAt).toLocaleDateString("pt-BR")}</div>}
      </dl>
      {downloadUrl && (
        <DownloadButton url={downloadUrl} filename={file.friendlyName} variant="button" />
      )}
    </div>
  );
}
