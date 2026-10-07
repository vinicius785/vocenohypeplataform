import { useMemo, useRef, useState } from "react";
import { BookOpen, ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardHeader } from "@/components/shared/SectionCard";
import { ClientArticleReader } from "./ClientArticleReader";
import type { PublicArticle } from "@/lib/portal-types";
import { artigoDateLabel, findArtigo, sortArtigos } from "../lib/blog-artigos";

const MAX_ITEMS = 8;

/** Carrossel "Conteúdos" do Início: artigos recentes publicados para este cliente (filtrados no
 * servidor). Leitura apenas — abre o artigo num diálogo, sem rota nem item de menu próprios. */
export function ClientBlogCarousel({ artigos }: { artigos: readonly PublicArticle[] }) {
  const items = useMemo(() => sortArtigos(artigos).slice(0, MAX_ITEMS), [artigos]);
  const trackRef = useRef<HTMLDivElement>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  if (items.length === 0) return null;
  const reading = findArtigo(items, openId ?? undefined);

  const scrollBy = (dir: 1 | -1) =>
    trackRef.current?.scrollBy({
      left: dir * trackRef.current.clientWidth * 0.8,
      behavior: "smooth",
    });

  return (
    <>
      <Card>
        <CardHeader
          icon={<BookOpen className="h-4 w-4" />}
          title="Conteúdos"
          action={
            items.length > 2 ? (
              <div className="hidden items-center gap-1 md:flex">
                <button
                  type="button"
                  aria-label="Anteriores"
                  onClick={() => scrollBy(-1)}
                  className="cursor-pointer rounded-md p-1 text-text-secondary hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="Próximos"
                  onClick={() => scrollBy(1)}
                  className="cursor-pointer rounded-md p-1 text-text-secondary hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            ) : undefined
          }
        />
        <div
          ref={trackRef}
          className="flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 md:px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {items.map((a) => {
            const date = artigoDateLabel(a.publishDate);
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => setOpenId(a.id)}
                className="group w-64 shrink-0 cursor-pointer snap-start text-left focus-visible:outline-none"
              >
                {/* Miniatura SEMPRE 16:9 e com a arte inteira (a capa tem texto embutido): a imagem é
                 * ajustada por dentro (`contain`), nunca recortada; o que sobra fica no fundo neutro.
                 * A altura vem do container, não da imagem — o resto do card não se mexe. */}
                <span className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-lg bg-muted group-focus-visible:ring-2 group-focus-visible:ring-ring">
                  {a.cover && (
                    <img
                      src={a.cover}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-contain transition-opacity group-hover:opacity-90"
                    />
                  )}
                </span>
                <span className="mt-2 block h-4 truncate text-xs leading-4 text-text-secondary">
                  {[a.category, date].filter(Boolean).join(" · ")}
                </span>
                <span className="mt-0.5 line-clamp-2 block min-h-10 text-sm font-medium leading-5 text-foreground group-hover:underline">
                  {a.title}
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      <ClientArticleReader artigo={reading} onClose={() => setOpenId(null)} />
    </>
  );
}
