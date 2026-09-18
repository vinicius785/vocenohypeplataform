import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { BarChart3, CheckCircle2, ChevronDown, X, XCircle } from "lucide-react";
import { respondCampanhaInfluSession } from "@/lib/portal-auth.functions";
import type { PerfilRejeicaoMotivo } from "@/lib/campanha-status";
import { usePortalSessionData } from "@/components/portal/portal-session-context";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  PlatformIcon,
  profileUrl,
  initialsOf,
  DemographicChart,
  MetricStat,
  hasRedeMetrics,
  entregasSummary,
  PerfilRejectDialog,
} from "@/components/portal/portal-widgets";
import { formatSeguidores } from "@/lib/format";

/**
 * `/portal-app/campanhas/$campanhaId/revisar` — porta o modo de revisão
 * sequencial do fluxo por token
 * (`routes/portal.$token/campanhas.$campanhaId.revisar.tsx`) pro Portal
 * autenticado. Reaproveita os mesmos componentes de apresentação
 * (`PerfilRejectDialog`, `DemographicChart`, `MetricStat`, etc.) sem
 * duplicá-los — só a mutação muda: aqui chama
 * `respondCampanhaInfluSession` (equivalente de sessão de
 * `respondCampanhaInflu`, mesma regra de negócio via
 * `applyInfluApproval`). `client_viewer` nunca deveria chegar aqui (não há
 * link "Revisar perfis" pra ele na página de campanha), mas o `beforeLoad`
 * abaixo fecha a porta mesmo assim, redirecionando de volta pra campanha
 * — a trava real e definitiva continua sendo a rejeição no servidor
 * dentro de `respondCampanhaInfluSession`.
 */
export const Route = createFileRoute("/portal-app/campanhas/$campanhaId/revisar")({
  ssr: false,
  component: RevisarPerfisPage,
});

function RevisarPerfisPage() {
  const { campanhaId } = Route.useParams();
  const navigate = useNavigate({ from: Route.fullPath });
  const { data, reload, readOnly, lang } = usePortalSessionData();
  const respondInfluFn = useServerFn(respondCampanhaInfluSession);

  const campanha = data.campanhas.find((c) => c.id === campanhaId) ?? null;

  const goBack = () =>
    void navigate({ to: "/portal-app/campanhas/$campanhaId", params: { campanhaId } });

  const frozenIds = useRef<string[] | null>(null);
  if (frozenIds.current === null && campanha) {
    frozenIds.current = campanha.influencers
      .filter((i) => i.status === "ENVIADO_AO_CLIENTE" && !i.clienteReprovacao)
      .map((i) => i.id);
  }
  const ids = frozenIds.current ?? [];
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [metricsOpen, setMetricsOpen] = useState(false);

  if (readOnly) {
    // `client_viewer` nunca deveria chegar aqui — se chegar (link direto,
    // etc.), volta pra campanha sem tentar renderizar nada de mutação.
    goBack();
    return null;
  }

  if (!campanha) {
    return (
      <PageContainer>
        <EmptyState title="Campanha não encontrada." />
      </PageContainer>
    );
  }

  if (ids.length === 0) {
    return (
      <PageContainer>
        <EmptyState
          icon={<CheckCircle2 className="h-5 w-5" />}
          title="Nenhum perfil aguardando sua análise"
          description="Todos os perfis desta campanha já foram revisados."
        />
        <div className="mt-4 flex justify-center">
          <Button onClick={goBack}>Voltar para a campanha</Button>
        </div>
      </PageContainer>
    );
  }

  const clampedIndex = Math.min(index, ids.length - 1);
  const inf = campanha.influencers.find((i) => i.id === ids[clampedIndex]) ?? null;
  const total = ids.length;
  const progressPct = Math.round(((clampedIndex + 1) / total) * 100);

  const advance = () => {
    if (clampedIndex + 1 < ids.length) setIndex(clampedIndex + 1);
    else goBack();
  };

  const decide = async (
    status: "aprovado" | "reprovado",
    motivoLabel?: PerfilRejeicaoMotivo,
    comentario?: string,
  ) => {
    if (!inf) return;
    setBusy(true);
    try {
      await respondInfluFn({
        data: { campanhaId, influencerId: inf.id, status, motivoLabel, comentario },
      });
      setRejectOpen(false);
      reload();
      toast.success(status === "aprovado" ? "Perfil aprovado." : "Perfil não aprovado.");
      advance();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar a decisão.");
    } finally {
      setBusy(false);
    }
  };

  if (!inf) {
    advance();
    return null;
  }

  const redesComMetrics = inf.redes.filter((r) =>
    hasRedeMetrics(inf.profileMetrics?.porRede?.[r.id ?? r.plataforma]),
  );

  return (
    <PageContainer>
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">
            Perfil {clampedIndex + 1} de {total}
          </p>
          <div className="mt-1.5 h-1.5 w-40 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-brand transition-all" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={goBack}
          className="gap-1.5 text-muted-foreground"
        >
          <X className="h-4 w-4" />
          Fechar e continuar depois
        </Button>
      </div>

      <div className="flex items-center justify-between gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={clampedIndex === 0}
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
        >
          Voltar
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={clampedIndex + 1 >= ids.length}
          onClick={() => setIndex((i) => Math.min(ids.length - 1, i + 1))}
        >
          Próximo
        </Button>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-background shadow-sm">
        <div className="h-14 bg-muted/40" />
        <div className="px-5 pb-5">
          <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:items-end sm:text-left">
            <Avatar className="-mt-9 h-20 w-20 shrink-0 ring-4 ring-background">
              {inf.foto && <AvatarImage src={inf.foto} alt={inf.nome} />}
              <AvatarFallback className="text-xl font-semibold">
                {initialsOf(inf.nome)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1 pb-1">
              <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                <h2 className="text-xl font-semibold text-foreground">{inf.nome}</h2>
                {inf.nicho && <Badge variant="secondary">{inf.nicho}</Badge>}
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5 sm:justify-start">
                {inf.redes.length === 0 ? (
                  <span className="text-xs text-muted-foreground">Nenhuma rede cadastrada.</span>
                ) : (
                  inf.redes.map((r, i) => {
                    const url = profileUrl(r.plataforma, r.handle);
                    const content = (
                      <>
                        <PlatformIcon plataforma={r.plataforma} className="h-3.5 w-3.5" />
                        {r.handle || r.plataforma}
                        {r.seguidores
                          ? ` · ${formatSeguidores(r.seguidores)} seg.`
                          : " · Não informado"}
                      </>
                    );
                    const className =
                      "inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground" +
                      (url ? " hover:bg-muted-foreground/20" : "");
                    return url ? (
                      <a key={i} href={url} target="_blank" rel="noreferrer" className={className}>
                        {content}
                      </a>
                    ) : (
                      <span key={i} className={className}>
                        {content}
                      </span>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {inf.entregas.length > 0 && (
            <p className="mt-4 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Entregas planejadas: </span>
              {entregasSummary(inf.entregas)}
            </p>
          )}

          {inf.justificativaTime && (
            <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-xs font-semibold text-foreground">Justificativa do time</p>
              <p className="mt-1 text-xs text-muted-foreground">{inf.justificativaTime}</p>
            </div>
          )}

          {inf.observacoes && (
            <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-xs font-semibold text-foreground">Observações</p>
              <p className="mt-1 whitespace-pre-line text-xs text-muted-foreground">
                {inf.observacoes}
              </p>
            </div>
          )}

          <div className="mt-4">
            <button
              type="button"
              onClick={() => setMetricsOpen((o) => !o)}
              className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
            >
              <BarChart3 className="h-3.5 w-3.5" />
              {metricsOpen ? "Fechar audiência completa" : "Ver audiência completa"}
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${metricsOpen ? "rotate-180" : ""}`}
              />
            </button>
          </div>

          {metricsOpen &&
            (redesComMetrics.length === 0 ? (
              <p className="mt-3 text-xs text-muted-foreground">Métricas indisponíveis.</p>
            ) : (
              <div className="mt-3 space-y-3">
                {redesComMetrics.map((r) => {
                  const rm = inf.profileMetrics!.porRede![r.id ?? r.plataforma]!;
                  return (
                    <div
                      key={r.id ?? r.plataforma}
                      className="space-y-4 rounded-xl border border-border bg-muted/20 p-4"
                    >
                      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <PlatformIcon plataforma={r.plataforma} className="h-3.5 w-3.5" />
                        {r.handle ? `@${r.handle}` : r.plataforma}
                      </p>
                      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
                        <MetricStat
                          label="Seguidores"
                          value={r.seguidores ? formatSeguidores(r.seguidores) : "Não informado"}
                        />
                        <MetricStat
                          label="Interações"
                          value={
                            rm.interacoes ? rm.interacoes.toLocaleString("pt-BR") : "Não informado"
                          }
                        />
                        <MetricStat
                          label="Visualizações"
                          value={
                            rm.visualizacoes
                              ? rm.visualizacoes.toLocaleString("pt-BR")
                              : "Não informado"
                          }
                        />
                        <MetricStat
                          label="Taxa de engajamento"
                          value={rm.taxaInteracao ? `${rm.taxaInteracao}%` : "Não informado"}
                        />
                        <MetricStat
                          label="Retenção inicial"
                          value={
                            rm.taxaAtencaoInicial ? `${rm.taxaAtencaoInicial}%` : "Não informado"
                          }
                        />
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <DemographicChart title="Gênero" entries={rm.genero} chartType="pie" />
                        <DemographicChart title="Faixa etária" entries={rm.faixaEtaria} />
                        <DemographicChart title="Principais países" entries={rm.paises} />
                        <DemographicChart title="Principais cidades" entries={rm.cidades} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
        </div>
      </div>

      <div className="sticky -bottom-4 z-10 -mx-4 mt-6 border-t border-border bg-background/95 p-3 backdrop-blur sm:-bottom-6 sm:-mx-6">
        <div className="mx-auto flex max-w-3xl gap-2">
          <Button
            variant="outline"
            className="flex-1 gap-1.5 border-rose-500/40 text-rose-600 hover:bg-rose-500/10 dark:text-rose-400"
            disabled={busy}
            onClick={() => setRejectOpen(true)}
          >
            <XCircle className="h-4 w-4" />
            Não aprovar perfil
          </Button>
          <Button
            className="flex-1 gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
            disabled={busy}
            onClick={() => void decide("aprovado")}
          >
            <CheckCircle2 className="h-4 w-4" />
            Aprovar perfil
          </Button>
        </div>
      </div>

      <PerfilRejectDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        lang={lang}
        busy={busy}
        onConfirm={(motivoLabel, comentario) => void decide("reprovado", motivoLabel, comentario)}
      />
    </PageContainer>
  );
}
