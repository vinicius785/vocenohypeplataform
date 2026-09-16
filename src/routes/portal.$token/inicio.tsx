import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  BarChart3,
  ChevronRight,
  Clock,
  Newspaper,
  PlayCircle,
  Sparkles,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ArticleReader } from "@/components/marketing/BlogPanel";
import { renderMarkdownLite } from "@/components/marketing/BlogPanel";
import { BackButton } from "@/components/BackButton";
import {
  loadArtigoEngagement,
  toggleArtigoLike,
  addArtigoComentario,
} from "@/lib/cliente-link.functions";
import type { BlogEngagement } from "@/lib/blog-engagement";
import { mesLabel } from "@/lib/relatorio-mensal";
import { t } from "@/lib/portal-i18n";
import { usePortalData } from "@/components/portal/portal-context";
import { fmtDate, initialsOf, isImageUrl, pendingReason } from "@/components/portal/portal-widgets";

export const Route = createFileRoute("/portal/$token/inicio")({
  component: PortalInicioPage,
});

/**
 * Página inicial do portal — movida verbatim do antigo `portal.$token.tsx`
 * (Etapa 2: só ganhou uma URL própria e passou a ler os dados do contexto
 * compartilhado em vez de estado local; conteúdo/redesenho real desta
 * página é a Etapa 3 do pedido do usuário). Abrir um influenciador ou um
 * relatório a partir daqui agora navega de verdade pra
 * `/campanhas/:campanhaId` (com `?influ=`/`?relatorio=` pra abrir o item
 * certo), em vez de só trocar estado local como antes.
 */
function PortalInicioPage() {
  const { token, data, lang } = usePortalData();
  const loadEngagementFn = useServerFn(loadArtigoEngagement);
  const toggleLikeFn = useServerFn(toggleArtigoLike);
  const addComentarioFn = useServerFn(addArtigoComentario);
  const [readingArticleId, setReadingArticleId] = useState<string | null>(null);
  const [readingEngagement, setReadingEngagement] = useState<BlogEngagement | null>(null);

  useEffect(() => {
    if (!readingArticleId) {
      setReadingEngagement(null);
      return;
    }
    let cancelled = false;
    loadEngagementFn({ data: { token, postId: readingArticleId } }).then((e) => {
      if (!cancelled) setReadingEngagement(e);
    });
    return () => {
      cancelled = true;
    };
  }, [readingArticleId, loadEngagementFn, token]);

  const allInfluencers = data.campanhas.flatMap((c) => c.influencers);
  const totalAguardando = allInfluencers.filter((i) => pendingReason(i, lang)).length;

  const feed = data.campanhas.flatMap((c) =>
    c.influencers
      .map((inf) => {
        const reason = pendingReason(inf, lang);
        if (!reason) return null;
        const mes = c.isRecorrente ? (inf.cicloMes ?? inf.criadoEm ?? "").slice(0, 7) : undefined;
        return { campanhaId: c.id, campanhaNome: c.nome, inf, reason, mes };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null),
  );

  const novidades = [
    ...feed.map((f) => ({ kind: "influ" as const, ...f })),
    ...data.campanhas.flatMap((c) =>
      c.relatorios
        .filter((r) => !r.nps)
        .map((r) => ({
          kind: "relatorio" as const,
          campanhaId: c.id,
          campanhaNome: c.nome,
          relatorio: r,
        })),
    ),
  ];

  const contentFeed = data.campanhas
    .flatMap((c) =>
      c.influencers.flatMap((inf) =>
        inf.entregas
          .filter((e) => e.status === "publicado")
          .map((entrega) => ({ campanhaId: c.id, campanhaNome: c.nome, inf, entrega })),
      ),
    )
    .sort((a, b) => {
      const da = a.entrega.publicadoEm ?? a.entrega.dataPostagem ?? "";
      const db = b.entrega.publicadoEm ?? b.entrega.dataPostagem ?? "";
      return db.localeCompare(da);
    });

  if (readingArticleId) {
    const reading = data.artigos.find((a) => a.id === readingArticleId) ?? null;
    if (!reading) return null;
    return (
      <div className="mx-auto max-w-4xl">
        <ArticleReader
          cover={reading.cover}
          category={reading.category}
          title={reading.title}
          authorLabel={reading.authorName || "Sem autor"}
          dateLabel={reading.publishDate ? fmtDate(reading.publishDate) : undefined}
          contentHtml={renderMarkdownLite(reading.content ?? reading.excerpt ?? "")}
          headerExtra={
            <BackButton
              onClick={() => setReadingArticleId(null)}
              label={t(lang, "back")}
              className="mb-4"
            />
          }
          engagement={{
            likeCount: readingEngagement?.likeCount ?? 0,
            likedByMe: readingEngagement?.likedByMe ?? false,
            comments: readingEngagement?.comments ?? [],
            commentPlaceholder: t(lang, "articleCommentPlaceholder"),
            onToggleLike: async () => {
              setReadingEngagement((e) =>
                e
                  ? {
                      ...e,
                      likedByMe: !e.likedByMe,
                      likeCount: e.likeCount + (e.likedByMe ? -1 : 1),
                    }
                  : e,
              );
              await toggleLikeFn({ data: { token, postId: reading.id } });
            },
            onAddComment: async (body) => {
              await addComentarioFn({ data: { token, postId: reading.id, body } });
              const next = await loadEngagementFn({ data: { token, postId: reading.id } });
              setReadingEngagement(next);
            },
          }}
        />
      </div>
    );
  }

  return (
    <>
      <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5" /> {t(lang, "visaoGeral")}
      </div>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight text-foreground">
        {t(lang, "ola", { name: data.clienteNome })}
      </h1>

      {feed.length > 0 && (
        <section className="mb-6 space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              {t(lang, "acoesPendentes")}
            </h2>
            <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
              {t(lang, "acoesPendentesCount", { n: feed.length })}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {feed.map((item) => (
              <Link
                key={`${item.campanhaId}:${item.inf.id}`}
                to="/portal/$token/campanhas/$campanhaId"
                params={{ token, campanhaId: item.campanhaId }}
                search={{ influ: item.inf.id }}
                className="flex items-center gap-2.5 rounded-lg border border-border bg-background px-3 py-2 text-left transition-colors hover:border-amber-500/50"
              >
                <Avatar className="h-8 w-8 shrink-0">
                  {item.inf.foto && <AvatarImage src={item.inf.foto} alt={item.inf.nome} />}
                  <AvatarFallback className="text-xs font-semibold">
                    {initialsOf(item.inf.nome)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-foreground">{item.inf.nome}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {item.campanhaNome}
                    {item.mes ? ` · ${mesLabel(item.mes)}` : ""} · {item.reason}
                  </p>
                </div>
                <span className="shrink-0 text-[11px] font-semibold text-foreground underline underline-offset-2">
                  {t(lang, "revisar")}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <PlayCircle className="h-4 w-4" /> {t(lang, "ultimosConteudos")}
            </h2>
            {contentFeed.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
                {t(lang, "semConteudo")}
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {contentFeed.slice(0, 12).map((item) => {
                  const conteudoAnexos = (item.entrega.anexos ?? []).filter(
                    (a) => a.categoria === "Conteúdo final",
                  );
                  const thumbUrl = conteudoAnexos.find((a) => isImageUrl(a.nome))?.url;
                  return (
                    <Link
                      key={`${item.campanhaId}:${item.inf.id}:${item.entrega.id}`}
                      to="/portal/$token/campanhas/$campanhaId"
                      params={{ token, campanhaId: item.campanhaId }}
                      search={{ influ: item.inf.id }}
                      className="group overflow-hidden rounded-xl border border-border bg-background text-left transition-colors hover:border-foreground/30"
                    >
                      <div className="flex aspect-square items-center justify-center overflow-hidden bg-muted">
                        {thumbUrl ? (
                          <img
                            src={thumbUrl}
                            alt={item.entrega.titulo ?? item.entrega.tipo}
                            className="h-full w-full object-cover transition-transform group-hover:scale-105"
                          />
                        ) : (
                          <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
                            <PlayCircle className="h-6 w-6" strokeWidth={1.5} />
                            <span className="text-[11px]">{item.entrega.tipo}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 p-2.5">
                        <Avatar className="h-6 w-6 shrink-0">
                          {item.inf.foto && <AvatarImage src={item.inf.foto} alt={item.inf.nome} />}
                          <AvatarFallback className="text-[10px] font-semibold">
                            {initialsOf(item.inf.nome)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium text-foreground">
                            {item.inf.nome}
                          </p>
                          <p className="truncate text-[10px] text-muted-foreground">
                            {item.campanhaNome}
                          </p>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>

          {data.artigos.length > 0 && (
            <section className="space-y-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Newspaper className="h-4 w-4" /> {t(lang, "artigos")}
              </h2>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {data.artigos.slice(0, 4).map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setReadingArticleId(a.id)}
                    className="flex items-center gap-3 overflow-hidden rounded-lg border border-border bg-background p-2 text-left transition-colors hover:bg-muted/40"
                  >
                    {a.cover ? (
                      <img
                        src={a.cover}
                        alt=""
                        className="h-12 w-12 shrink-0 rounded-md object-cover"
                      />
                    ) : (
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-muted">
                        <Newspaper className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1 space-y-0.5">
                      {a.category && (
                        <Badge variant="secondary" className="text-[9px]">
                          {a.category}
                        </Badge>
                      )}
                      <p className="truncate text-xs font-semibold text-foreground">{a.title}</p>
                      {a.publishDate && (
                        <p className="text-[10px] text-muted-foreground">
                          {fmtDate(a.publishDate)}
                        </p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="space-y-3">
          <section className="overflow-hidden rounded-xl border border-border bg-background">
            <h2 className="flex items-center gap-2 border-b border-border px-3.5 py-3 text-sm font-semibold text-foreground">
              <Clock className="h-4 w-4" /> {t(lang, "novidades")}
            </h2>
            {novidades.length === 0 ? (
              <p className="px-3.5 py-6 text-center text-xs text-muted-foreground">
                {t(lang, "tudoEmDia")}
              </p>
            ) : (
              <div className="divide-y divide-border">
                {novidades.slice(0, 6).map((item) =>
                  item.kind === "influ" ? (
                    <Link
                      key={`influ:${item.campanhaId}:${item.inf.id}`}
                      to="/portal/$token/campanhas/$campanhaId"
                      params={{ token, campanhaId: item.campanhaId }}
                      search={{ influ: item.inf.id }}
                      className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-muted/40"
                    >
                      <Avatar className="h-8 w-8 shrink-0">
                        {item.inf.foto && <AvatarImage src={item.inf.foto} alt={item.inf.nome} />}
                        <AvatarFallback className="text-xs font-semibold">
                          {initialsOf(item.inf.nome)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-foreground">
                          {item.inf.nome}
                        </p>
                        <p className="truncate text-[11px] text-amber-700 dark:text-amber-400">
                          {item.reason}
                        </p>
                      </div>
                    </Link>
                  ) : (
                    <Link
                      key={`relatorio:${item.relatorio.id}`}
                      to="/portal/$token/campanhas/$campanhaId"
                      params={{ token, campanhaId: item.campanhaId }}
                      search={{ relatorio: item.relatorio.id }}
                      className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-muted/40"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        <BarChart3 className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-foreground">
                          {mesLabel(item.relatorio.mes)} · {item.campanhaNome}
                        </p>
                        <p className="truncate text-[11px] text-amber-700 dark:text-amber-400">
                          Novo relatório de métricas
                        </p>
                      </div>
                    </Link>
                  ),
                )}
              </div>
            )}
          </section>

          <section className="overflow-hidden rounded-xl border border-border bg-background">
            <h2 className="flex items-center gap-2 border-b border-border px-3.5 py-3 text-sm font-semibold text-foreground">
              <BarChart3 className="h-4 w-4" /> {t(lang, "statCampanhas")}
            </h2>
            {data.campanhas.length === 0 ? (
              <p className="px-3.5 py-6 text-center text-xs text-muted-foreground">
                {t(lang, "navNoCampanhas")}
              </p>
            ) : (
              <div className="divide-y divide-border">
                {data.campanhas.map((c) => {
                  const aguardandoAqui = c.influencers.filter((i) => pendingReason(i, lang)).length;
                  return (
                    <Link
                      key={c.id}
                      to="/portal/$token/campanhas/$campanhaId"
                      params={{ token, campanhaId: c.id }}
                      className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-muted/40"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-foreground">{c.nome}</p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {t(lang, "influenciadoresCount", { n: c.influencers.length })}
                          {aguardandoAqui > 0 && (
                            <span className="text-amber-700 dark:text-amber-400">
                              {" "}
                              · {t(lang, "aguardandoVoceInline", { n: aguardandoAqui })}
                            </span>
                          )}
                        </p>
                      </div>
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    </Link>
                  );
                })}
              </div>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
