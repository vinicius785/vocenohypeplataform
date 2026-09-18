import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { Sparkles, Users } from "lucide-react";
import { usePortalSessionData } from "@/components/portal/portal-session-context";
import {
  respondCampanhaInfluSession,
  respondCampanhaEntregaSession,
  reopenCampanhaInfluSession,
  updateInfluBriefingSession,
  updateInfluObservacoesSession,
  updateInfluBriefingAnexoSession,
} from "@/lib/portal-auth.functions";
import type { PerfilRejeicaoMotivo } from "@/lib/campanha-status";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageContainer } from "@/components/shared/PageContainer";
import { HomeHeaderShell } from "@/components/shared/HomeHeaderShell";
import { PortalSectionCard } from "@/components/portal/PortalSectionCard";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Button } from "@/components/ui/button";
import {
  InfluencerGalleryCard,
  InfluencerDetail,
  fmtDate,
} from "@/components/portal/portal-widgets";

const searchSchema = z.object({
  influ: z.string().optional(),
  entregaId: z.string().optional(),
});

/**
 * `/portal-app/campanhas/$campanhaId` — Fase 2c: substitui a UI mais
 * enxuta da Fase 2b pela mesma apresentação do fluxo por token
 * (`routes/portal.$token/campanhas.$campanhaId.tsx`): cabeçalho compacto
 * (`HomeHeaderShell`), filtro segmentado com contadores, banner de revisão
 * do Hypito, e a grade de `InfluencerGalleryCard`/`InfluencerDetail`.
 *
 * Reaproveita os componentes de `portal-widgets.tsx` TAL QUAL o fluxo por
 * token usa — nenhum deles foi copiado/duplicado. Eles já eram
 * agnósticos a token (recebem dados já resolvidos + callbacks), com uma
 * única exceção real: `InfluencerDetail` ganhou um novo prop opcional
 * `readOnly` (default `undefined`/falso, portanto sem efeito no fluxo por
 * token, que nunca o passa) para esconder a UI de mutação quando o papel
 * da sessão é `client_viewer`. Os callbacks aqui chamam as `*Session`
 * server functions (`respondCampanhaInfluSession` etc.), o equivalente
 * exato de `respondCampanhaInflu` etc. usado pelo token, sem duplicar
 * nenhuma regra de negócio (ambos delegam pra
 * `applyInfluApproval`/`applyEntregaApproval`).
 *
 * Sem seção de "cronograma"/"relatórios mensais" aqui — não fazem parte
 * do modelo de dados de sessão ainda tocado nesta fase (cronograma existe
 * em `ClienteLinkData`, mas `RelatorioMensalCard` depende de `token` pra
 * enviar NPS, o que ficou fora do escopo pedido — ver relatório final).
 */
export const Route = createFileRoute("/portal-app/campanhas/$campanhaId")({
  ssr: false,
  validateSearch: searchSchema,
  component: PortalAppCampanhaDetalhe,
});

function PortalAppCampanhaDetalhe() {
  const { campanhaId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { data, reload, readOnly, lang } = usePortalSessionData();

  const respondInfluFn = useServerFn(respondCampanhaInfluSession);
  const respondEntregaFn = useServerFn(respondCampanhaEntregaSession);
  const reopenInfluFn = useServerFn(reopenCampanhaInfluSession);
  const updateBriefingFn = useServerFn(updateInfluBriefingSession);
  const updateObservacoesFn = useServerFn(updateInfluObservacoesSession);
  const updateBriefingAnexoFn = useServerFn(updateInfluBriefingAnexoSession);

  const [influFiltro, setInfluFiltro] = useState<
    "todos" | "aguardando" | "aprovados" | "nao_aprovados"
  >("todos");
  const [viewingId, setViewingId] = useState<string | null>(search.influ ?? null);

  const activeCampanha = data.campanhas.find((c) => c.id === campanhaId) ?? null;

  useEffect(() => {
    setInfluFiltro("todos");
    setViewingId(search.influ ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campanhaId]);

  if (!activeCampanha) {
    // Nunca vaza a existência de campanhas de outras organizações — mesma
    // tela de "não encontrado" tanto pra id inexistente quanto pra id de
    // outra organização (a posse real é sempre re-checada no servidor a
    // cada mutação, nunca confiada aqui).
    throw notFound();
  }

  const naoAprovados = activeCampanha.influencers.filter(
    (i) => i.status === "RECUSADO" || i.clienteReprovacao,
  );
  const aprovados = activeCampanha.influencers.filter((i) => i.status === "APROVADO");
  const aguardandoAnalise = activeCampanha.influencers.filter(
    (i) => i.status === "ENVIADO_AO_CLIENTE" && !i.clienteReprovacao,
  );
  const influenciadoresVisiveis =
    influFiltro === "todos"
      ? activeCampanha.influencers
      : influFiltro === "aguardando"
        ? aguardandoAnalise
        : influFiltro === "aprovados"
          ? aprovados
          : naoAprovados;
  const viewing = activeCampanha.influencers.find((i) => i.id === viewingId) ?? null;

  const enviadosParaDecisao = activeCampanha.influencers.filter((i) =>
    ["ENVIADO_AO_CLIENTE", "APROVADO", "RECUSADO"].includes(i.status),
  );
  const decididos = enviadosParaDecisao.length - aguardandoAnalise.length;
  const publicadas = activeCampanha.influencers.reduce(
    (s, i) => s + i.entregas.filter((e) => e.status === "publicado").length,
    0,
  );

  const respondInflu = viewing
    ? async (
        status: "aprovado" | "reprovado",
        motivoLabel?: PerfilRejeicaoMotivo,
        comentario?: string,
      ) => {
        await respondInfluFn({
          data: {
            campanhaId: activeCampanha.id,
            influencerId: viewing.id,
            status,
            motivoLabel,
            comentario,
          },
        });
        reload();
      }
    : undefined;
  const reopenInflu = viewing
    ? async () => {
        await reopenInfluFn({ data: { campanhaId: activeCampanha.id, influencerId: viewing.id } });
        reload();
      }
    : undefined;
  const respondEntrega = viewing
    ? async (entregaId: string, status: "aprovado" | "reprovado", motivo?: string) => {
        await respondEntregaFn({
          data: {
            campanhaId: activeCampanha.id,
            influencerId: viewing.id,
            entregaId,
            status,
            motivo,
          },
        });
        reload();
      }
    : undefined;
  const saveBriefing = viewing
    ? async (briefingPersonalizado: string) => {
        await updateBriefingFn({
          data: { campanhaId: activeCampanha.id, influencerId: viewing.id, briefingPersonalizado },
        });
        reload();
      }
    : undefined;
  const saveObservacoes = viewing
    ? async (observacoes: string) => {
        await updateObservacoesFn({
          data: { campanhaId: activeCampanha.id, influencerId: viewing.id, observacoes },
        });
        reload();
      }
    : undefined;
  const saveBriefingAnexo = viewing
    ? async (file: { nome: string; dataUrl: string } | null) => {
        await updateBriefingAnexoFn({
          data: { campanhaId: activeCampanha.id, influencerId: viewing.id, file },
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
          onBack={() => setViewingId(null)}
          onRespondInflu={respondInflu!}
          onRespondEntrega={respondEntrega!}
          onSaveBriefing={saveBriefing!}
          onSaveObservacoes={saveObservacoes!}
          onSaveBriefingAnexo={saveBriefingAnexo!}
          onReopen={reopenInflu}
          focusEntregaId={search.entregaId}
          readOnly={readOnly}
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer className="space-y-6">
      <HomeHeaderShell
        title={activeCampanha.nome}
        subtitle={activeCampanha.prazo ? `Prazo ${fmtDate(activeCampanha.prazo)}` : undefined}
        indicators={[
          {
            label: "Influenciadores",
            value: activeCampanha.influencers.length.toString(),
            onClick: () =>
              document.getElementById("influenciadores")?.scrollIntoView({ behavior: "smooth" }),
          },
          {
            label: "Aguardando você",
            value: aguardandoAnalise.length.toString(),
            tone: aguardandoAnalise.length > 0 ? "warning" : "neutral",
          },
          { label: "Postados", value: publicadas.toString() },
        ]}
      />

      {!readOnly && aguardandoAnalise.length > 0 && (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400">
              <Sparkles className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">
                {aguardandoAnalise.length} perfil{aguardandoAnalise.length > 1 ? "is" : ""} aguarda
                {aguardandoAnalise.length > 1 ? "m" : ""} sua análise
              </p>
              <p className="text-xs text-muted-foreground">
                Revise os perfis sugeridos pelo time para liberar o início da produção.
              </p>
              {decididos > 0 && (
                <p className="mt-1 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                  {decididos} de {enviadosParaDecisao.length} perfis analisados
                </p>
              )}
            </div>
          </div>
          <Button
            size="sm"
            className="shrink-0 gap-1.5"
            onClick={() =>
              void navigate({
                to: "/portal-app/campanhas/$campanhaId/revisar",
                params: { campanhaId: activeCampanha.id },
              })
            }
          >
            {decididos > 0 ? "Continuar revisão" : "Revisar perfis"}
          </Button>
        </div>
      )}

      <PortalSectionCard
        id="influenciadores"
        icon={<Users className="h-4 w-4" />}
        title="Influenciadores"
        action={
          <SegmentedControl
            aria-label="Filtrar influenciadores"
            size="sm"
            value={influFiltro}
            onChange={setInfluFiltro}
            options={[
              { value: "todos", label: `Todos (${activeCampanha.influencers.length})` },
              { value: "aguardando", label: `Aguardando análise (${aguardandoAnalise.length})` },
              { value: "aprovados", label: `Aprovados (${aprovados.length})` },
              { value: "nao_aprovados", label: `Não aprovados (${naoAprovados.length})` },
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
                ? "Nenhum perfil não aprovado."
                : "Nenhum influenciador enviado ainda."
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
    </PageContainer>
  );
}
