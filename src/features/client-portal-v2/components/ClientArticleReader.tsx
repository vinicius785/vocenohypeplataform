import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { MARKDOWN_LITE_CLASSES, renderMarkdownLite } from "@/components/marketing/blog/markdown";
import { initialsOf } from "@/lib/blog-engagement";
import type { PublicArticle } from "@/lib/portal-types";
import { artigoDateLongLabel } from "../lib/blog-artigos";
import { ClientArticleEngagement, MobileEngagementHint } from "./ClientArticleEngagement";

/** Leitor editorial do Portal V2: cabeçalho próprio (categoria + X, fora da capa), corpo que rola
 * por dentro, capa em 16:9 limitada, título, autor com foto · data e o texto em coluna de leitura.
 * Reutiliza `renderMarkdownLite` (mesmo renderer do resto da plataforma). Somente leitura. */
export function ClientArticleReader({
  artigo,
  onClose,
  engagementSlot,
}: {
  artigo: PublicArticle | null;
  onClose: () => void;
  /** Substitui o painel real (revisão visual/teste). */
  engagementSlot?: ReactNode;
}) {
  const author = artigo?.authorName?.trim();
  const date = artigoDateLongLabel(artigo?.publishDate);
  return (
    <Dialog open={!!artigo} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        mobileFullScreen
        showCloseButton={false}
        className="flex h-[min(92vh,60rem)] max-w-[min(72rem,calc(100vw-2rem))] flex-col gap-0 overflow-hidden p-0 sm:rounded-2xl"
      >
        <DialogTitle className="sr-only">{artigo?.title ?? "Conteúdo"}</DialogTitle>
        <DialogDescription className="sr-only">Leitura do conteúdo.</DialogDescription>
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border/60 px-4 py-2.5 md:px-6">
          <span className="min-w-0 truncate text-xs font-medium uppercase tracking-wide text-text-secondary">
            {artigo?.category ?? "Conteúdo"}
          </span>
          <DialogClose
            aria-label="Fechar"
            className="-mr-2 flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-text-secondary hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-5 w-5" />
          </DialogClose>
        </header>
        {artigo && (
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain md:flex md:overflow-hidden">
            <article className="mx-auto w-full max-w-3xl px-5 pb-12 pt-6 md:min-w-0 md:max-w-none md:flex-1 md:overflow-y-auto md:overscroll-contain md:px-10 md:pt-8 [scrollbar-gutter:stable]">
              <div className="mx-auto w-full max-w-3xl">
                {artigo.cover && (
                  <img src={artigo.cover} alt="" className="block h-auto w-full rounded-xl" />
                )}
                <h1 className="mt-6 text-2xl font-semibold leading-tight tracking-tight text-foreground md:text-[32px]">
                  {artigo.title}
                </h1>
                <div className="mt-4 flex items-center gap-2.5 text-sm text-text-secondary">
                  <Avatar className="h-8 w-8">
                    {artigo.authorAvatar && <AvatarImage src={artigo.authorAvatar} alt="" />}
                    <AvatarFallback className="text-[11px] font-semibold text-foreground">
                      {initialsOf(author || "Você no Hype") || "?"}
                    </AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 truncate">
                    <span className="font-medium text-foreground">{author || "Você no Hype"}</span>
                    {date && <span> · {date}</span>}
                  </span>
                </div>
                <div
                  className={`mt-8 border-t border-border/60 pt-8 ${MARKDOWN_LITE_CLASSES} md:text-base md:leading-[1.8]`}
                  dangerouslySetInnerHTML={{
                    __html: renderMarkdownLite(artigo.content ?? artigo.excerpt ?? ""),
                  }}
                />
              </div>
            </article>
            <aside
              id="artigo-engajamento"
              aria-label="Curtidas e comentários"
              className="flex flex-col border-t border-border/60 md:min-h-0 md:w-80 md:shrink-0 md:border-l md:border-t-0"
            >
              {engagementSlot ?? <ClientArticleEngagement key={artigo.id} postId={artigo.id} />}
            </aside>
            <MobileEngagementHint />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
