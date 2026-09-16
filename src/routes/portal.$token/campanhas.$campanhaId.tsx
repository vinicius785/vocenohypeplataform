import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, PlayCircle, Users } from "lucide-react";
import { z } from "zod";
import {
  respondCampanhaInflu,
  respondCampanhaEntrega,
  updateInfluBriefing,
  updateInfluObservacoes,
  updateInfluBriefingAnexo,
} from "@/lib/cliente-link.functions";
import { t } from "@/lib/portal-i18n";
import { buildMesReferenciaOptions } from "@/lib/inscricao-page";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageContainer } from "@/components/shared/PageContainer";
import { HomeHeaderShell } from "@/components/shared/HomeHeaderShell";
import { PortalSectionCard } from "@/components/portal/PortalSectionCard";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Badge } from "@/components/ui/badge";
import { usePortalData } from "@/components/portal/portal-context";
import {
  InfluencerGalleryCard,
  InfluencerDetail,
  RelatorioMensalCard,
  fmtDate,
  pendingReason,
  initialsOf,
} from "@/components/portal/portal-widgets";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const searchSchema = z.object({
  influ: z.string().optional(),
  relatorio: z.string().optional(),
  // Mantido só pra compatibilidade com links antigos (?tab=...) da versão
  // com abas — o componente redireciona pra âncora e descarta o param.
  tab: z.string().optional(),
});

const TAB_TO_HASH: Record<string, string | undefined> = {
  "visao-geral": undefined,
  influenciadores: "influenciadores",
  aprovacoes: "aguardando-voce",
  cronograma: "cronograma",
  relatorios: "relatorios",
};

export const Route = createFileRoute("/portal/$token/campanhas/$campanhaId")({
  validateSearch: searchSchema,
  component: PortalCampanhaPage,
});

/**
 * Página de campanha do portal — correção visual/estrutural: remove as
 * tabs por completo (Visão geral/Influenciadores/Aprovações/Cronograma/
 * Relatórios), vira uma página única de rolagem vertical, com
 * `HomeHeaderShell` (mesmo padrão de cabeçalho+indicadores da Início) e
 * seções em `PortalSectionCard`. Links antigos com `?tab=` são
 * redirecionados pra âncora da seção equivalente e o parâmetro é
 * descartado.
 */
function PortalCampanhaPage() {
  const { campanhaId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { token, data, lang, reload } = usePortalData();
  const respondInfluFn = useServerFn(respondCampanhaInflu);
  const respondEntregaFn = useServerFn(respondCampanhaEntrega);
  const updateBriefingFn = useServerFn(updateInfluBriefing);
  const updateObservacoesFn = useServerFn(updateInfluObservacoes);
  const updateBriefingAnexoFn = useServerFn(updateInfluBriefingAnexo);

  const [influFiltro, setInfluFiltro] = useState<"todos" | "ativos" | "nao_aprovados">("ativos");
  const [portalMonth, setPortalMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [viewingId, setViewingId] = useState<string | null>(search.influ ?? null);
  const [viewingRelatorioId, setViewingRelatorioId] = useState<string | null>(
    search.relatorio ?? null,
  );
  const [cronogramaExpandido, setCronogramaExpandido] = useState(false);

  const activeCampanha = data.campanhas.find((c) => c.id === campanhaId) ?? null;

  useEffect(() => {
    const now = new Date();
    setPortalMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  }, [campanhaId]);

  // Link antigo (?tab=...) — redireciona pra âncora equivalente e
  // descarta o parâmetro, sem reintroduzir abas.
  useEffect(() => {
    if (!search.tab) return;
    const hash = TAB_TO_HASH[search.tab];
    void navigate({
      search: (prev) => {
        const { tab: _tab, ...rest } = prev;
        return rest;
      },
      hash,
      replace: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.tab]);

  // Rola até a âncora da URL (link vindo da Início/sino/link antigo).
  useEffect(() => {
    const hash = window.location.hash.replace("#", "");
    if (!hash) return;
    const el = document.getElementById(hash);
    if (el) requestAnimationFrame(() => el.scrollIntoView({ behavior: "smooth" }));
  }, [campanhaId, activeCampanha]);

  if (!activeCampanha) {
    return (
      <PageContainer>
        <EmptyState
          icon={<AlertTriangle className="h-5 w-5" />}
          title={t(lang, "notFoundTitle")}
          description={t(lang, "notFoundBody")}
        />
      </PageContainer>
    );
  }

  const monthOptions = activeCampanha.isRecorrente
    ? buildMesReferenciaOptions(activeCampanha.recorrenteInicio)
    : [];
  const monthFilteredInflus = activeCampanha.influencers.filter(
    (i) =>
      !activeCampanha.isRecorrente || (i.cicloMes ?? i.criadoEm ?? "").slice(0, 7) === portalMonth,
  );
  const naoAprovados = monthFilteredInflus.filter(
    (i) => i.status === "RECUSADO" || i.clienteReprovacao,
  );
  const ativos = monthFilteredInflus.filter((i) => i.status !== "RECUSADO" && !i.clienteReprovacao);
  const influenciadoresVisiveis =
    influFiltro === "todos"
      ? monthFilteredInflus
      : influFiltro === "ativos"
        ? ativos
        : naoAprovados;
  const viewing = activeCampanha.influencers.find((i) => i.id === viewingId) ?? null;

  const pendentes = monthFilteredInflus
    .map((inf) => ({ inf, reason: pendingReason(inf, lang) }))
    .filter((x): x is { inf: (typeof monthFilteredInflus)[number]; reason: string } => !!x.reason);

  const publicadas = monthFilteredInflus.reduce(
    (s, i) => s + i.entregas.filter((e) => e.status === "publicado").length,
    0,
  );

  const conteudosPublicados = monthFilteredInflus.flatMap((inf) =>
    inf.entregas.filter((e) => e.status === "publicado").map((entrega) => ({ inf, entrega })),
  );

  const cronogramaOrdenado = [...activeCampanha.cronograma].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  const hoje = new Date().toISOString().slice(0, 10);
  const proximoCronogramaId = cronogramaOrdenado.find((item) => item.date >= hoje)?.id;
  const cronogramaVisivel = cronogramaExpandido
    ? cronogramaOrdenado
    : cronogramaOrdenado.slice(0, 3);

  const respondInflu = viewing
    ? async (respStatus: "aprovado" | "reprovado", motivo?: string) => {
        await respondInfluFn({
          data: {
            token,
            campanhaId: activeCampanha.id,
            influencerId: viewing.id,
            status: respStatus,
            motivo,
          },
        });
        reload();
      }
    : undefined;
  const respondEntrega = viewing
    ? async (entregaId: string, respStatus: "aprovado" | "reprovado", motivo?: string) => {
        await respondEntregaFn({
          data: {
            token,
            campanhaId: activeCampanha.id,
            influencerId: viewing.id,
            entregaId,
            status: respStatus,
            motivo,
          },
        });
        reload();
      }
    : undefined;
  const saveBriefing = viewing
    ? async (briefingPersonalizado: string) => {
        await updateBriefingFn({
          data: {
            token,
            campanhaId: activeCampanha.id,
            influencerId: viewing.id,
            briefingPersonalizado,
          },
        });
        reload();
      }
    : undefined;
  const saveObservacoes = viewing
    ? async (observacoes: string) => {
        await updateObservacoesFn({
          data: { token, campanhaId: activeCampanha.id, influencerId: viewing.id, observacoes },
        });
        reload();
      }
    : undefined;
  const saveBriefingAnexo = viewing
    ? async (file: { nome: string; dataUrl: string } | null) => {
        await updateBriefingAnexoFn({
          data: { token, campanhaId: activeCampanha.id, influencerId: viewing.id, file },
        });
        reload();
      }
    : undefined;

  if (viewing) {
    return (
      <PageContainer>
        <InfluencerDetail
          inf={viewing}
          lang={lang}
          campanhaNome={activeCampanha.nome}
          mes={
            activeCampanha.isRecorrente
              ? (viewing.cicloMes ?? viewing.criadoEm ?? "").slice(0, 7)
              : undefined
          }
          onBack={() => setViewingId(null)}
          onRespondInflu={respondInflu!}
          onRespondEntrega={respondEntrega!}
          onSaveBriefing={saveBriefing!}
          onSaveObservacoes={saveObservacoes!}
          onSaveBriefingAnexo={saveBriefingAnexo!}
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer className="space-y-6">
      <HomeHeaderShell
        title={activeCampanha.nome}
        subtitle={
          activeCampanha.prazo
            ? `${t(lang, "prazo")} ${fmtDate(activeCampanha.prazo)}`
            : activeCampanha.isRecorrente
              ? "Campanha recorrente"
              : undefined
        }
        rightSlot={
          activeCampanha.isRecorrente ? (
            <select
              value={portalMonth}
              onChange={(e) => setPortalMonth(e.target.value)}
              className="h-9 rounded-md border border-border bg-background px-2 text-xs font-medium text-foreground outline-none focus:ring-1 focus:ring-ring"
            >
              {monthOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : undefined
        }
        indicators={[
          ...(activeCampanha.planejado > 0
            ? [{ label: t(lang, "planejado"), value: activeCampanha.planejado.toString() }]
            : []),
          {
            label: t(lang, "statInfluenciadores"),
            value: monthFilteredInflus.length.toString(),
            onClick: () =>
              document.getElementById("influenciadores")?.scrollIntoView({ behavior: "smooth" }),
          },
          {
            label: t(lang, "aguardandoVoce"),
            value: pendentes.length.toString(),
            tone: pendentes.length > 0 ? "warning" : "neutral",
            onClick: () =>
              document.getElementById("aguardando-voce")?.scrollIntoView({ behavior: "smooth" }),
          },
          {
            label: t(lang, "postados"),
            value: publicadas.toString(),
            onClick: () =>
              document.getElementById("conteudos-entregas")?.scrollIntoView({ behavior: "smooth" }),
          },
        ]}
      />

      {pendentes.length > 0 && (
        <PortalSectionCard
          id="aguardando-voce"
          icon={<CheckCircle2 className="h-4 w-4" />}
          title={t(lang, "aguardandoVoce")}
        >
          <div className="space-y-1.5">
            {pendentes.map(({ inf, reason }) => (
              <button
                key={inf.id}
                type="button"
                onClick={() => setViewingId(inf.id)}
                className="flex min-h-11 w-full items-center gap-2.5 rounded-lg border border-border bg-background px-3 py-2 text-left transition-colors hover:border-amber-500/50"
              >
                <Avatar className="h-8 w-8 shrink-0">
                  {inf.foto && <AvatarImage src={inf.foto} alt={inf.nome} />}
                  <AvatarFallback className="text-xs font-semibold">
                    {initialsOf(inf.nome)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-foreground">{inf.nome}</p>
                  <p className="truncate text-[11px] text-amber-700 dark:text-amber-400">
                    {reason}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </PortalSectionCard>
      )}

      <PortalSectionCard
        id="influenciadores"
        icon={<Users className="h-4 w-4" />}
        title={t(lang, "influenciadoresHeader")}
        action={
          <SegmentedControl
            aria-label="Filtrar influenciadores"
            size="sm"
            value={influFiltro}
            onChange={setInfluFiltro}
            options={[
              { value: "todos", label: "Todos" },
              { value: "ativos", label: "Ativos" },
              { value: "nao_aprovados", label: "Não aprovados" },
            ]}
          />
        }
      >
        {influenciadoresVisiveis.length === 0 ? (
          <EmptyState
            compact
            icon={<Users className="h-5 w-5" />}
            title={
              influFiltro === "nao_aprovados"
                ? t(lang, "semReprovados")
                : t(lang, "semInfluenciadores")
            }
          />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {influenciadoresVisiveis.map((inf) => (
              <InfluencerGalleryCard
                key={inf.id}
                inf={inf}
                lang={lang}
                onOpen={() => setViewingId(inf.id)}
              />
            ))}
          </div>
        )}
      </PortalSectionCard>

      {conteudosPublicados.length > 0 && (
        <PortalSectionCard
          id="conteudos-entregas"
          icon={<PlayCircle className="h-4 w-4" />}
          title="Conteúdos e entregas"
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {conteudosPublicados.map(({ inf, entrega }) => (
              <button
                key={entrega.id}
                type="button"
                onClick={() => setViewingId(inf.id)}
                className="overflow-hidden rounded-xl border border-border bg-background text-left transition-colors hover:border-foreground/30"
              >
                <div className="flex aspect-square items-center justify-center bg-muted text-muted-foreground">
                  <PlayCircle className="h-6 w-6" strokeWidth={1.5} />
                </div>
                <div className="flex items-center gap-2 p-2.5">
                  <Avatar className="h-6 w-6 shrink-0">
                    {inf.foto && <AvatarImage src={inf.foto} alt={inf.nome} />}
                    <AvatarFallback className="text-[10px] font-semibold">
                      {initialsOf(inf.nome)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-foreground">{inf.nome}</p>
                    <p className="truncate text-[10px] text-muted-foreground">{entrega.tipo}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </PortalSectionCard>
      )}

      {activeCampanha.cronograma.length > 0 && (
        <PortalSectionCard
          id="cronograma"
          icon={<CalendarClock className="h-4 w-4" />}
          title={t(lang, "cronogramaHeader")}
        >
          <ol className="space-y-3 border-l border-border pl-4">
            {cronogramaVisivel.map((item) => {
              const concluido = item.date < hoje;
              const proximo = item.id === proximoCronogramaId;
              return (
                <li key={item.id} className="relative">
                  <span
                    className={`absolute -left-[21px] top-1 h-2 w-2 rounded-full ${
                      proximo ? "bg-brand" : concluido ? "bg-muted-foreground/40" : "bg-border"
                    }`}
                  />
                  <div
                    className={`rounded-lg px-3 py-2 ${proximo ? "border border-brand/40 bg-brand-subtle" : ""}`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs font-medium text-muted-foreground">
                        {item.recurring
                          ? t(lang, "cronogramaMonthlyDay", {
                              day: String(Number(item.date.slice(8, 10))),
                            })
                          : fmtDate(item.date)}
                      </p>
                      {proximo && <Badge variant="brand">Próximo</Badge>}
                      {concluido && !proximo && <Badge variant="secondary">Concluído</Badge>}
                    </div>
                    <p className="text-sm text-foreground">{item.title}</p>
                    {item.description && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
          {cronogramaOrdenado.length > 3 && (
            <button
              type="button"
              onClick={() => setCronogramaExpandido((v) => !v)}
              className="mt-3 text-xs font-semibold text-brand underline-offset-2 hover:underline"
            >
              {cronogramaExpandido ? "Ver menos" : "Ver cronograma completo"}
            </button>
          )}
        </PortalSectionCard>
      )}

      {activeCampanha.relatorios.length > 0 && (
        <PortalSectionCard id="relatorios" title={t(lang, "relatorioHeader")}>
          <div className="space-y-3">
            {[...activeCampanha.relatorios]
              .sort((a, b) => b.mes.localeCompare(a.mes))
              .map((r) => (
                <RelatorioMensalCard
                  key={r.id}
                  relatorio={r}
                  campanhaId={activeCampanha.id}
                  token={token}
                  viewing={viewingRelatorioId === r.id}
                  onToggleView={() =>
                    setViewingRelatorioId((prev) => (prev === r.id ? null : r.id))
                  }
                  onAnswered={() => reload()}
                />
              ))}
          </div>
        </PortalSectionCard>
      )}
    </PageContainer>
  );
}
