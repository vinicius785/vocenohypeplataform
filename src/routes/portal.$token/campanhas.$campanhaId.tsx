import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Users } from "lucide-react";
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
import { PageHeader } from "@/components/shared/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PortalDemandButton } from "@/components/PortalDemandButton";
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

const CAMPANHA_TABS = [
  "visao-geral",
  "influenciadores",
  "aprovacoes",
  "cronograma",
  "relatorios",
] as const;
type CampanhaTab = (typeof CAMPANHA_TABS)[number];
function resolveCampanhaTab(v: string | undefined): CampanhaTab {
  return (CAMPANHA_TABS as readonly string[]).includes(v ?? "")
    ? (v as CampanhaTab)
    : "visao-geral";
}

const searchSchema = z.object({
  influ: z.string().optional(),
  relatorio: z.string().optional(),
  tab: z.string().optional(),
});

export const Route = createFileRoute("/portal/$token/campanhas/$campanhaId")({
  validateSearch: searchSchema,
  component: PortalCampanhaPage,
});

/**
 * Página de campanha do portal — Etapa 4 do redesenho (Seção 4 do pedido):
 * `PageHeader` (indicadores/filtro de mês/ação de solicitação) + tabs
 * (Visão geral/Influenciadores/Aprovações/Cronograma/Relatórios), estado
 * da tab persistido em `?tab=` (mesmo princípio já usado em Configurações
 * com `?configTab=`). "Aprovações" aqui é um recorte simples só desta
 * campanha (reaproveita os mesmos cards de "Aguardando você" da Início) —
 * a Central de aprovações completa, agrupando todas as campanhas, é a
 * Etapa 6. Abrir um influenciador (`?influ=` ou clique num card) continua
 * substituindo a página inteira por `InfluencerDetail`, independente da
 * tab selecionada — comportamento inalterado das etapas anteriores.
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

  const tab = resolveCampanhaTab(search.tab);
  const setTab = (k: CampanhaTab) =>
    void navigate({ search: (prev) => ({ ...prev, tab: k }), replace: true });

  const [influTab, setInfluTab] = useState<"todos" | "reprovados">("todos");
  const [portalMonth, setPortalMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [viewingId, setViewingId] = useState<string | null>(search.influ ?? null);
  const [viewingRelatorioId, setViewingRelatorioId] = useState<string | null>(
    search.relatorio ?? null,
  );

  const activeCampanha = data.campanhas.find((c) => c.id === campanhaId) ?? null;

  useEffect(() => setInfluTab("todos"), [campanhaId]);
  useEffect(() => {
    const now = new Date();
    setPortalMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  }, [campanhaId]);

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
  const reprovados = monthFilteredInflus.filter(
    (i) => i.status === "RECUSADO" || i.clienteReprovacao,
  );
  const ativos = monthFilteredInflus.filter((i) => i.status !== "RECUSADO" && !i.clienteReprovacao);
  const viewing = activeCampanha.influencers.find((i) => i.id === viewingId) ?? null;

  const pendentes = monthFilteredInflus
    .map((inf) => ({ inf, reason: pendingReason(inf, lang) }))
    .filter((x): x is { inf: (typeof monthFilteredInflus)[number]; reason: string } => !!x.reason);

  const publicadas = monthFilteredInflus.reduce(
    (s, i) => s + i.entregas.filter((e) => e.status === "publicado").length,
    0,
  );

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
    <PageContainer>
      <PageHeader
        breadcrumb={[t(lang, "statCampanhas"), activeCampanha.nome]}
        title={activeCampanha.nome}
        actionsSlot={
          <PortalDemandButton token={token} campanhaId={activeCampanha.id} lang={lang} />
        }
        filters={
          activeCampanha.isRecorrente ? (
            <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              Mês
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
            </label>
          ) : undefined
        }
        indicators={[
          ...(activeCampanha.planejado > 0
            ? [{ label: t(lang, "planejado"), value: activeCampanha.planejado.toString() }]
            : []),
          { label: t(lang, "statInfluenciadores"), value: monthFilteredInflus.length.toString() },
          {
            label: t(lang, "aguardandoVoce"),
            value: pendentes.length.toString(),
            tone: pendentes.length > 0 ? "warning" : "neutral",
          },
          { label: t(lang, "postados"), value: publicadas.toString() },
        ]}
      />

      <Tabs value={tab} onValueChange={(v) => setTab(resolveCampanhaTab(v))} className="mt-6">
        <TabsList>
          <TabsTrigger value="visao-geral">Visão geral</TabsTrigger>
          <TabsTrigger value="influenciadores">{t(lang, "influenciadoresHeader")}</TabsTrigger>
          <TabsTrigger value="aprovacoes">
            Aprovações{pendentes.length > 0 ? ` (${pendentes.length})` : ""}
          </TabsTrigger>
          {activeCampanha.cronograma.length > 0 && (
            <TabsTrigger value="cronograma">{t(lang, "cronogramaHeader")}</TabsTrigger>
          )}
          {activeCampanha.relatorios.length > 0 && (
            <TabsTrigger value="relatorios">{t(lang, "relatorioHeader")}</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="visao-geral" className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Progresso
            </p>
            {activeCampanha.planejado > 0 ? (
              <>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-brand"
                    style={{
                      width: `${Math.min(100, (publicadas / activeCampanha.planejado) * 100)}%`,
                    }}
                  />
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {publicadas}/{activeCampanha.planejado} entregas publicadas
                </p>
              </>
            ) : (
              <p className="mt-1.5 text-sm text-foreground">
                {publicadas} entregas publicadas até agora.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">{t(lang, "aguardandoVoce")}</p>
              {pendentes.length > 0 && (
                <button
                  type="button"
                  onClick={() => setTab("aprovacoes")}
                  className="text-xs font-semibold text-brand underline-offset-2 hover:underline"
                >
                  Ver todas
                </button>
              )}
            </div>
            {pendentes.length === 0 ? (
              <EmptyState
                compact
                icon={<CheckCircle2 className="h-5 w-5" />}
                title="Tudo certo por aqui"
              />
            ) : (
              <div className="space-y-1.5">
                {pendentes.slice(0, 3).map(({ inf, reason }) => (
                  <PendenteRow
                    key={inf.id}
                    nome={inf.nome}
                    foto={inf.foto}
                    reason={reason}
                    onOpen={() => setViewingId(inf.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="influenciadores" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Users className="h-4 w-4" /> {t(lang, "influenciadoresHeader")}
            </h2>
            {reprovados.length > 0 && (
              <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-0.5">
                <button
                  type="button"
                  onClick={() => setInfluTab("todos")}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    influTab === "todos"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t(lang, "abaTodos")}
                </button>
                <button
                  type="button"
                  onClick={() => setInfluTab("reprovados")}
                  className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    influTab === "reprovados"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t(lang, "abaReprovados")}
                  <span className="rounded-full bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-rose-600 dark:text-rose-400">
                    {reprovados.length}
                  </span>
                </button>
              </div>
            )}
          </div>
          {(influTab === "reprovados" ? reprovados : ativos).length === 0 ? (
            <EmptyState
              compact
              icon={<Users className="h-5 w-5" />}
              title={
                influTab === "reprovados" ? t(lang, "semReprovados") : t(lang, "semInfluenciadores")
              }
            />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {(influTab === "reprovados" ? reprovados : ativos).map((inf) => (
                <InfluencerGalleryCard
                  key={inf.id}
                  inf={inf}
                  lang={lang}
                  onOpen={() => setViewingId(inf.id)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="aprovacoes" className="space-y-2">
          {pendentes.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 className="h-5 w-5" />}
              title="Tudo certo por aqui"
              description="Nenhuma aprovação sua é necessária nesta campanha no momento."
            />
          ) : (
            pendentes.map(({ inf, reason }) => (
              <PendenteRow
                key={inf.id}
                nome={inf.nome}
                foto={inf.foto}
                reason={reason}
                onOpen={() => setViewingId(inf.id)}
              />
            ))
          )}
        </TabsContent>

        {activeCampanha.cronograma.length > 0 && (
          <TabsContent value="cronograma">
            <ul className="divide-y divide-border rounded-xl border border-border bg-card">
              {activeCampanha.cronograma.map((item) => (
                <li key={item.id} className="flex items-start gap-3 px-4 py-3">
                  <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-muted-foreground">
                      {item.recurring
                        ? t(lang, "cronogramaMonthlyDay", {
                            day: String(Number(item.date.slice(8, 10))),
                          })
                        : fmtDate(item.date)}
                    </p>
                    <p className="text-sm text-foreground">{item.title}</p>
                    {item.description && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </TabsContent>
        )}

        {activeCampanha.relatorios.length > 0 && (
          <TabsContent value="relatorios" className="space-y-3">
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
          </TabsContent>
        )}
      </Tabs>
    </PageContainer>
  );
}

function PendenteRow({
  nome,
  foto,
  reason,
  onOpen,
}: {
  nome: string;
  foto?: string;
  reason: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-h-11 w-full items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2 text-left transition-colors hover:border-amber-500/50"
    >
      <Avatar className="h-8 w-8 shrink-0">
        {foto && <AvatarImage src={foto} alt={nome} />}
        <AvatarFallback className="text-xs font-semibold">{initialsOf(nome)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-foreground">{nome}</p>
        <p className="truncate text-[11px] text-amber-700 dark:text-amber-400">{reason}</p>
      </div>
    </button>
  );
}
