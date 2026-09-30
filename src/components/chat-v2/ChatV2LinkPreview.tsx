import { ExternalLink, FolderOpen, Link2, Video, Youtube } from "lucide-react";
import { extractUrls, recognizeLinkPreview, type LinkPreview } from "@/lib/link-preview";

function linkPreviewIcon(kind: LinkPreview["kind"]) {
  const cls = "h-4 w-4 shrink-0 text-muted-foreground";
  if (kind === "drive") return <FolderOpen className={cls} />;
  if (kind === "youtube") return <Youtube className={cls} />;
  if (kind === "meet") return <Video className={cls} />;
  return <Link2 className={cls} />;
}

/** Mesmo reconhecimento por padrão de URL da V1 (`recognizeLinkPreview`,
 * nunca busca metadados de terceiros) — card compacto abaixo do texto. */
export function ChatV2LinkPreviews({ text }: { text: string }) {
  const previews = extractUrls(text)
    .map(recognizeLinkPreview)
    .filter((p): p is LinkPreview => p !== null);
  if (previews.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-col gap-1.5">
      {previews.map((p) => (
        <a
          key={p.url}
          href={p.url}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="flex max-w-[360px] items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-left hover:bg-muted/60"
        >
          {linkPreviewIcon(p.kind)}
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-foreground">{p.title}</p>
            <p className="truncate text-[11px] text-muted-foreground">{p.domain}</p>
          </div>
          <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </a>
      ))}
    </div>
  );
}
