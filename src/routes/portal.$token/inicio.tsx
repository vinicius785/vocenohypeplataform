import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  BarChart3,
  CalendarClock,
  CheckCircle2,
  Clock,
  FileBarChart,
  Megaphone,
  Newspaper,
  PlayCircle,
  Sparkles,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ArticleReader, renderMarkdownLite } from "@/components/marketing/BlogPanel";
import { BackButton } from "@/components/BackButton";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageContainer } from "@/components/shared/PageContainer";
import { MetricCard } from "@/components/shared/MetricCard";
import { HypitoPortalSummary } from "@/components/portal/HypitoPortalSummary";
import { campanhaStatus } from "@/components/campanhas/campanha-ui";
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
import type { PublicCampanha } from "@/lib/portal-types";

export const Route = createFileRoute("/portal/$token/inicio")({
  component: PortalInicioPage,
});

function toStatusShim(c: PublicCampanha) {
  return {
    prazo: c.prazo,
    pagClienteTipo: c.isRecorrente ? ("Recorrente" as const) : undefined,
  } as Parameters<typeof campanhaStatus>[0];
}

/**
 * Página inicial do portal — Etapa 3 do redesenho (conteúdo real desta
 * página; a Etapa 2 só moveu o corpo antigo verbatim pra cá). Ordem:
 * cabeçalho → resumo do Hypito (Seção 3/14) → "Aguardando você" (sempre
 * visível, com `EmptyState` quando não há pendência) → indicadores
 * (`MetricCard`) → campanhas ativas (cards) → últimos conteúdos →
 * relatórios recentes → novidades (de-enfatizada) → artigos. Todo ponto
 * vazio usa `EmptyState` (Seção 24) em vez de `<p>` solto.
 */
function PortalInicioPage() {
  const { token, data, lang } = usePortalData();
  const navigate = useNavigate();
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

  const today = new Date();
  const campanhasAtivas = data.campanhas.filter(
    (c) => campanhaStatus(toStatusShim(c), today) !== "encerrada",
  );

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

  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const publicadosEsteMes = contentFeed.filter((item) => {
    const d = item.entrega.publicadoEm ?? item.entrega.dataPostagem ?? "";
    return d.slice(0, 7) === currentMonth;
  }).length;
  const relatoriosNovos = novidades.filter((n) => n.kind === "relatorio").length;

  const relatoriosRecentes = data.campanhas
    .flatMap((c) =>
      c.relatorios.map((r) => ({ campanhaId: c.id, campanhaNome: c.nome, relatorio: r })),
    )
    .sort((a, b) => b.relatorio.mes.localeCompare(a.relatorio.mes))
    .slice(0, 4);

  if (readingArticleId) {
    const reading = data.artigos.find((a) => a.id === readingArticleId) ?? null;
    if (!reading) return null;
    return (
      <PageContainer>
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
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5" /> {t(lang, "visaoGeral")}
      </div>
      <h1 className="mb-4 text-2xl font-semibold tracking-tight text-foreground">
        {t(lang, "ola", { name: data.clienteNome })}
      </h1>

      <div className="mb-6">
        <HypitoPortalSummary token={token} data={data} lang={lang} />
      </div>

      {/* AGUARDANDO VOCÊ — sempre visível, EmptyState quando não há nada
          (nunca só um contador zerado, per Seção 3 do pedido). */}
      <section id="aguardando-voce" className="mb-6 space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Clock className="h-4 w-4" /> {t(lang, "acoesPendentes")}
        </h2>
        {feed.length === 0 ? (
          <EmptyState
            compact
            icon={<CheckCircle2 className="h-5 w-5" />}
            title="Tudo certo por aqui"
            description="Nenhuma ação sua é necessária no momento."
          />
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {feed.map((item) => (
              <Link
                key={`${item.campanhaId}:${item.inf.id}`}
                to="/portal/$token/campanhas/$campanhaId"
                params={{ token, campanhaId: item.campanhaId }}
                search={{ influ: item.inf.id }}
                className="flex min-h-11 items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2 text-left transition-colors hover:border-amber-500/50"
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
        )}
      </section>

      {/* INDICADORES */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard
          label={t(lang, "statCampanhas")}
          value={campanhasAtivas.length.toString()}
          icon={<Megaphone className="h-4 w-4" />}
          onClick={() => navigate({ to: "/portal/$token/campanhas", params: { token } })}
        />
        <MetricCard
          label={t(lang, "aguardandoVoce")}
          value={totalAguardando.toString()}
          tone={totalAguardando > 0 ? "warning" : "neutral"}
          icon={<Clock className="h-4 w-4" />}
          onClick={() =>
            document.getElementById("aguardando-voce")?.scrollIntoView({ behavior: "smooth" })
          }
        />
        <MetricCard
          label={t(lang, "postados")}
          value={publicadosEsteMes.toString()}
          icon={<PlayCircle className="h-4 w-4" />}
          complement="Este mês"
        />
        <MetricCard
          label={t(lang, "navRelatorios")}
          value={relatoriosNovos.toString()}
          icon={<FileBarChart className="h-4 w-4" />}
          onClick={() => navigate({ to: "/portal/$token/relatorios", params: { token } })}
        />
      </div>

      {/* CAMPANHAS ATIVAS */}
      <section className="mb-6 space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Megaphone className="h-4 w-4" /> {t(lang, "statCampanhas")}
        </h2>
        {campanhasAtivas.length === 0 ? (
          <EmptyState
            compact
            icon={<Megaphone className="h-5 w-5" />}
            title={t(lang, "navNoCampanhas")}
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {campanhasAtivas.map((c) => {
              const planejado = c.planejado || 0;
              const publicadas = c.influencers.reduce(
                (s, i) => s + i.entregas.filter((e) => e.status === "publicado").length,
                0,
              );
              const proximaEtapa =
                c.influencers.map((i) => pendingReason(i, lang)).find((r) => !!r) ?? null;
              return (
                <div
                  key={c.id}
                  className="group relative rounded-xl border border-border bg-card p-4 transition-colors hover:border-foreground/20"
                >
                  <Link
                    to="/portal/$token/campanhas/$campanhaId"
                    params={{ token, campanhaId: c.id }}
                    className="absolute inset-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    aria-label={`Abrir campanha ${c.nome}`}
                  />
                  <p className="truncate text-sm font-semibold text-foreground">{c.nome}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t(lang, "influenciadoresCount", { n: c.influencers.length })}
                  </p>
                  {planejado > 0 && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {publicadas}/{planejado} entregas publicadas
                    </p>
                  )}
                  <p className="mt-2 truncate text-xs font-medium text-amber-700 dark:text-amber-400">
                    {proximaEtapa ?? "Sem pendências"}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ÚLTIMOS CONTEÚDOS */}
      <section className="mb-6 space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <PlayCircle className="h-4 w-4" /> {t(lang, "ultimosConteudos")}
        </h2>
        {contentFeed.length === 0 ? (
          <EmptyState
            compact
            icon={<PlayCircle className="h-5 w-5" />}
            title={t(lang, "semConteudo")}
          />
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
                  className="group overflow-hidden rounded-xl border border-border bg-card text-left transition-colors hover:border-foreground/30"
                >
                  <ContentThumb
                    thumbUrl={thumbUrl}
                    tipo={item.entrega.tipo}
                    titulo={item.entrega.titulo}
                  />
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

      {/* RELATÓRIOS RECENTES */}
      <section className="mb-6 space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <BarChart3 className="h-4 w-4" /> {t(lang, "navRelatorios")}
        </h2>
        {relatoriosRecentes.length === 0 ? (
          <EmptyState
            compact
            icon={<BarChart3 className="h-5 w-5" />}
            title={t(lang, "semConteudo")}
          />
        ) : (
          <div className="space-y-2">
            {relatoriosRecentes.map(({ campanhaId, campanhaNome, relatorio }) => (
              <Link
                key={relatorio.id}
                to="/portal/$token/campanhas/$campanhaId"
                params={{ token, campanhaId }}
                search={{ relatorio: relatorio.id }}
                className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2 transition-colors hover:bg-muted/40"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-foreground">
                    {mesLabel(relatorio.mes)} · {campanhaNome}
                  </p>
                </div>
                <span className="shrink-0 text-[11px] font-semibold text-foreground underline underline-offset-2">
                  Ver relatório
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* NOVIDADES — de-enfatizada, abaixo do conteúdo operacional */}
      <section className="mb-6 space-y-3">
        <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <CalendarClock className="h-3.5 w-3.5" /> {t(lang, "novidades")}
        </h2>
        {novidades.length === 0 ? (
          <EmptyState compact title={t(lang, "tudoEmDia")} />
        ) : (
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {novidades.slice(0, 4).map((item) =>
              item.kind === "influ" ? (
                <Link
                  key={`influ:${item.campanhaId}:${item.inf.id}`}
                  to="/portal/$token/campanhas/$campanhaId"
                  params={{ token, campanhaId: item.campanhaId }}
                  search={{ influ: item.inf.id }}
                  className="flex min-h-11 items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-muted/40"
                >
                  <Avatar className="h-7 w-7 shrink-0">
                    {item.inf.foto && <AvatarImage src={item.inf.foto} alt={item.inf.nome} />}
                    <AvatarFallback className="text-[10px] font-semibold">
                      {initialsOf(item.inf.nome)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-foreground">{item.inf.nome}</p>
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
                  className="flex min-h-11 items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-muted/40"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <BarChart3 className="h-3.5 w-3.5" />
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
                className="flex items-center gap-3 overflow-hidden rounded-lg border border-border bg-card p-2 text-left transition-colors hover:bg-muted/40"
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
                    <p className="text-[10px] text-muted-foreground">{fmtDate(a.publishDate)}</p>
                  )}
                </div>
              </button>
            ))}
          </div>
        </section>
      )}
    </PageContainer>
  );
}

/** Thumbnail de "Últimos conteúdos" com fallback real: se a imagem falhar
 * ao carregar (arquivo removido/link quebrado — Seção 22), troca pro ícone
 * genérico em vez de deixar um quadrado cinza vazio. */
function ContentThumb({
  thumbUrl,
  tipo,
  titulo,
}: {
  thumbUrl?: string;
  tipo: string;
  titulo?: string;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = !!thumbUrl && !failed;
  return (
    <div className="flex aspect-square items-center justify-center overflow-hidden bg-muted">
      {showImage ? (
        <img
          src={thumbUrl}
          alt={titulo ?? tipo}
          className="h-full w-full object-cover transition-transform group-hover:scale-105"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
          <PlayCircle className="h-6 w-6" strokeWidth={1.5} />
          <span className="text-[11px]">{tipo}</span>
        </div>
      )}
    </div>
  );
}
