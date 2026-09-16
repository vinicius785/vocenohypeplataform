import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { AlertTriangle, BarChart3, Calendar, Users } from "lucide-react";
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
import { PortalDemandButton } from "@/components/PortalDemandButton";
import { usePortalData } from "@/components/portal/portal-context";
import {
  KpiCard,
  InfluencerGalleryCard,
  InfluencerDetail,
  RelatorioMensalCard,
  fmtDate,
  pendingReason,
} from "@/components/portal/portal-widgets";

const searchSchema = z.object({
  influ: z.string().optional(),
  relatorio: z.string().optional(),
});

export const Route = createFileRoute("/portal/$token/campanhas/$campanhaId")({
  validateSearch: searchSchema,
  component: PortalCampanhaPage,
});

/**
 * Página de campanha do portal — movida verbatim do bloco de detalhe de
 * campanha do antigo `portal.$token.tsx` (Etapa 2: só ganhou URL própria).
 * Abrir um influenciador ou relatório específico por link direto (vindo da
 * Início) é feito via search params (`?influ=`/`?relatorio=`) em vez de
 * estado local entre "páginas" que antes viviam na mesma rota. Conteúdo/
 * redesenho real desta página (tabs, `PageHeader`, etc.) é a Etapa 4 do
 * pedido do usuário.
 */
function PortalCampanhaPage() {
  const { campanhaId } = Route.useParams();
  const search = Route.useSearch();
  const { token, data, lang, reload } = usePortalData();
  const respondInfluFn = useServerFn(respondCampanhaInflu);
  const respondEntregaFn = useServerFn(respondCampanhaEntrega);
  const updateBriefingFn = useServerFn(updateInfluBriefing);
  const updateObservacoesFn = useServerFn(updateInfluObservacoes);
  const updateBriefingAnexoFn = useServerFn(updateInfluBriefingAnexo);

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
      <EmptyState
        icon={<AlertTriangle className="h-5 w-5" />}
        title={t(lang, "notFoundTitle")}
        description={t(lang, "notFoundBody")}
      />
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
    );
  }

  return (
    <>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            {activeCampanha.nome}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            {activeCampanha.prazo && (
              <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <Calendar className="h-3.5 w-3.5" /> {t(lang, "prazo")}{" "}
                {fmtDate(activeCampanha.prazo)}
              </p>
            )}
            {activeCampanha.isRecorrente && (
              <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                Mês
                <select
                  value={portalMonth}
                  onChange={(e) => setPortalMonth(e.target.value)}
                  className="h-7 rounded-md border border-border bg-background px-1.5 text-xs font-medium text-foreground outline-none focus:ring-1 focus:ring-ring"
                >
                  {monthOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </div>
        <PortalDemandButton token={token} campanhaId={activeCampanha.id} lang={lang} />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {activeCampanha.planejado > 0 && (
          <KpiCard label={t(lang, "planejado")} value={activeCampanha.planejado.toString()} />
        )}
        <KpiCard
          label={t(lang, "statInfluenciadores")}
          value={monthFilteredInflus.length.toString()}
        />
        <KpiCard
          label={t(lang, "aguardandoVoce")}
          value={monthFilteredInflus.filter((i) => pendingReason(i, lang)).length.toString()}
          tone={monthFilteredInflus.some((i) => pendingReason(i, lang)) ? "warning" : "default"}
        />
        <KpiCard
          label={t(lang, "postados")}
          value={monthFilteredInflus
            .reduce((s, i) => s + i.entregas.filter((e) => e.status === "publicado").length, 0)
            .toString()}
        />
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
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
        <p className="rounded-xl border border-dashed border-border py-14 text-center text-sm text-muted-foreground">
          {influTab === "reprovados" ? t(lang, "semReprovados") : t(lang, "semInfluenciadores")}
        </p>
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

      {activeCampanha.relatorios.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 flex items-center gap-2 text-sm font-semibold text-foreground">
            <BarChart3 className="h-4 w-4" /> {t(lang, "relatorioHeader")}
          </h2>
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
        </>
      )}

      {activeCampanha.cronograma.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Calendar className="h-4 w-4" /> {t(lang, "cronogramaHeader")}
          </h2>
          <ul className="divide-y divide-border rounded-xl border border-border bg-background">
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
        </>
      )}
    </>
  );
}
