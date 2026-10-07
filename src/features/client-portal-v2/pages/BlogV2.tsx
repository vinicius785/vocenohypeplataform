import { useMemo } from "react";
import { BookOpen, ChevronRight } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/shared/EmptyState";
import { BackButton } from "@/components/BackButton";
import { ArticleReader } from "@/components/marketing/blog/ArticleReader";
import { renderMarkdownLite } from "@/components/marketing/blog/markdown";
import { usePortalSessionData } from "@/components/portal/portal-session-context";
import { usePortalNavigate, usePortalRuntime } from "../runtime/portal-runtime";
import { PortalPageHeader } from "../components/shared/PortalPageHeader";
import { artigoDateLabel, artigoSummary, findArtigo, sortArtigos } from "../lib/blog-artigos";

/** Lista de artigos do cliente. Leitura apenas: os dados vêm do mesmo `ClienteLinkData` do
 * portal (já filtrado no servidor por publicado + `portalClienteIds`). */
export function BlogV2() {
  const { data } = usePortalSessionData();
  const navigate = usePortalNavigate();
  const { paths } = usePortalRuntime();
  const artigos = useMemo(() => sortArtigos(data.artigos ?? []), [data.artigos]);

  return (
    <PageContainer className="space-y-6">
      <PortalPageHeader title="Conteúdos" description="Conteúdos e materiais da Você no Hype." />
      {artigos.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="h-5 w-5" />}
          title="Nenhum conteúdo por aqui ainda"
          description="Quando a Você no Hype publicar algo para você, ele aparece neste espaço."
        />
      ) : (
        <ul className="surface-card divide-y divide-border/70">
          {artigos.map((a) => {
            const date = artigoDateLabel(a.publishDate);
            const summary = artigoSummary(a);
            return (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => navigate({ to: paths.artigo(a.id) })}
                  className="group flex w-full cursor-pointer items-center gap-4 px-4 py-4 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset md:px-5"
                >
                  {a.cover && (
                    <img
                      src={a.cover}
                      alt=""
                      loading="lazy"
                      className="hidden aspect-video w-32 shrink-0 rounded-lg object-cover sm:block"
                    />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 text-xs text-text-secondary">
                      {a.category && <span>{a.category}</span>}
                      {a.category && date && <span aria-hidden>·</span>}
                      {date && <span>{date}</span>}
                    </span>
                    <span className="mt-0.5 block text-sm font-medium text-foreground group-hover:underline">
                      {a.title}
                    </span>
                    {summary && (
                      <span className="mt-1 line-clamp-2 block text-sm text-text-secondary">
                        {summary}
                      </span>
                    )}
                  </span>
                  <ChevronRight
                    className="h-4 w-4 shrink-0 text-text-secondary transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </PageContainer>
  );
}

/** Leitura de um artigo (URL direta e refresh funcionam: o artigo vem dos dados da sessão). */
export function BlogArtigoV2({ postId }: { postId: string }) {
  const { data } = usePortalSessionData();
  const navigate = usePortalNavigate();
  const { paths } = usePortalRuntime();
  const artigo = findArtigo(data.artigos ?? [], postId);
  const voltar = () => navigate({ to: paths.blog() });

  if (!artigo) {
    return (
      <PageContainer className="space-y-6">
        <BackButton onClick={voltar} label="Voltar" />
        <EmptyState
          icon={<BookOpen className="h-5 w-5" />}
          title="Conteúdo não encontrado"
          description="Ele pode ter sido despublicado ou não estar disponível para você."
          primaryAction={{ label: "Ver conteúdos", onClick: voltar }}
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <div className="mx-auto max-w-3xl">
        <ArticleReader
          cover={artigo.cover}
          category={artigo.category}
          title={artigo.title}
          authorLabel={artigo.authorName || "Você no Hype"}
          dateLabel={artigoDateLabel(artigo.publishDate)}
          contentHtml={renderMarkdownLite(artigo.content ?? artigo.excerpt ?? "")}
          headerExtra={<BackButton onClick={voltar} label="Voltar" className="mb-4" />}
        />
      </div>
    </PageContainer>
  );
}
