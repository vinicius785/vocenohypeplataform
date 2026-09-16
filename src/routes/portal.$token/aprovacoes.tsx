import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import { z } from "zod";
import { respondCampanhaInflu, respondCampanhaEntrega } from "@/lib/cliente-link.functions";
import { HYPITO_AVATAR_URL, HYPITO_NAME } from "@/lib/hypito";
import { t } from "@/lib/portal-i18n";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageContainer } from "@/components/shared/PageContainer";
import { PageHeader } from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { usePortalData } from "@/components/portal/portal-context";
import {
  ApproveRejectBar,
  EntregaAnexoPreview,
  fmtDate,
  initialsOf,
} from "@/components/portal/portal-widgets";
import type { PublicEntrega, PublicInfluencer } from "@/lib/portal-types";

const searchSchema = z.object({ campanha: z.string().optional() });

export const Route = createFileRoute("/portal/$token/aprovacoes")({
  validateSearch: searchSchema,
  component: PortalAprovacoesPage,
});

type ApprovalItem =
  | { kind: "influ"; campanhaId: string; campanhaNome: string; inf: PublicInfluencer }
  | {
      kind: "roteiro" | "conteudo";
      campanhaId: string;
      campanhaNome: string;
      inf: PublicInfluencer;
      entrega: PublicEntrega;
    };

/** Urgência baseada só em `dataPostagem` (data planejada de publicação,
 * campo real já existente) — nunca um SLA/prazo de resposta inventado,
 * já que nenhum dos dois existe no backend hoje. Item sem `dataPostagem`
 * nunca ganha selo. */
function urgencyOf(dataPostagem?: string): "atrasado" | "proximo" | null {
  if (!dataPostagem) return null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const alvo = new Date(dataPostagem);
  const diffDias = Math.round((alvo.getTime() - hoje.getTime()) / 86_400_000);
  if (diffDias < 0) return "atrasado";
  if (diffDias <= 3) return "proximo";
  return null;
}

function UrgencyBadge({ dataPostagem }: { dataPostagem?: string }) {
  const urgencia = urgencyOf(dataPostagem);
  if (urgencia === "atrasado") return <Badge variant="danger">Atrasado</Badge>;
  if (urgencia === "proximo") return <Badge variant="warning">Prazo próximo</Badge>;
  return null;
}

/** Toast "assinado" pelo Hypito — confirmação pontual de UI, não um
 * sistema de notificação (isso é a Etapa 9). Mensagens genéricas e reais,
 * sem inventar prazo de resposta da equipe. */
function hypitoToast(message: string) {
  toast(
    <div className="flex items-center gap-2.5">
      <img src={HYPITO_AVATAR_URL} alt="" aria-hidden="true" className="h-7 w-7 rounded-full" />
      <div>
        <p className="text-xs font-semibold text-foreground">{HYPITO_NAME}</p>
        <p className="text-xs text-muted-foreground">{message}</p>
      </div>
    </div>,
  );
}

/**
 * Central de Aprovações (Etapa 6) — agrega TODAS as pendências do
 * cliente entre TODAS as campanhas, diferente da tab "Aprovações" da
 * página de campanha (Etapa 4), que é só um recorte local. Reusa as
 * mesmas mutações/componentes já usados em `InfluencerDetail`
 * (`ApproveRejectBar`, `respondCampanhaInflu`/`respondCampanhaEntrega`) —
 * nenhuma lógica de aprovação nova, só uma visão agregada.
 */
function PortalAprovacoesPage() {
  const { token, data, lang, reload } = usePortalData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const respondInfluFn = useServerFn(respondCampanhaInflu);
  const respondEntregaFn = useServerFn(respondCampanhaEntrega);

  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [rejectingKey, setRejectingKey] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState<"todos" | "influ" | "entregas">("todos");

  const items: ApprovalItem[] = data.campanhas.flatMap((c) => {
    const out: ApprovalItem[] = [];
    for (const inf of c.influencers) {
      if (inf.status === "ENVIADO_AO_CLIENTE" && !inf.clienteReprovacao) {
        out.push({ kind: "influ", campanhaId: c.id, campanhaNome: c.nome, inf });
      }
      for (const entrega of inf.entregas) {
        if (entrega.stage === "ROTEIRO_APROVACAO") {
          out.push({ kind: "roteiro", campanhaId: c.id, campanhaNome: c.nome, inf, entrega });
        } else if (entrega.stage === "CONTEUDO_APROVACAO") {
          out.push({ kind: "conteudo", campanhaId: c.id, campanhaNome: c.nome, inf, entrega });
        }
      }
    }
    return out;
  });

  const filtered = items
    .filter((it) => !search.campanha || it.campanhaId === search.campanha)
    .filter((it) => {
      if (tipoFiltro === "todos") return true;
      if (tipoFiltro === "influ") return it.kind === "influ";
      return it.kind === "roteiro" || it.kind === "conteudo";
    });

  const campanhasComPendencia = Array.from(
    new Map(items.map((it) => [it.campanhaId, it.campanhaNome])).entries(),
  );

  const byCampanha = new Map<string, { campanhaNome: string; items: ApprovalItem[] }>();
  for (const it of filtered) {
    const entry = byCampanha.get(it.campanhaId) ?? { campanhaNome: it.campanhaNome, items: [] };
    entry.items.push(it);
    byCampanha.set(it.campanhaId, entry);
  }
  // Ordena cada grupo: atrasado primeiro, depois próximo do prazo, depois
  // sem data; dentro do mesmo nível de urgência, `dataPostagem` crescente.
  const urgencyRank = { atrasado: 0, proximo: 1, null: 2 } as const;
  for (const entry of byCampanha.values()) {
    entry.items.sort((a, b) => {
      const da = a.kind === "influ" ? undefined : a.entrega.dataPostagem;
      const db = b.kind === "influ" ? undefined : b.entrega.dataPostagem;
      const ra = urgencyRank[urgencyOf(da) ?? "null"];
      const rb = urgencyRank[urgencyOf(db) ?? "null"];
      if (ra !== rb) return ra - rb;
      return (da ?? "").localeCompare(db ?? "");
    });
  }

  const runInflu = async (
    item: Extract<ApprovalItem, { kind: "influ" }>,
    status: "aprovado" | "reprovado",
  ) => {
    const key = `influ:${item.inf.id}`;
    setBusyKey(key);
    try {
      await respondInfluFn({
        data: {
          token,
          campanhaId: item.campanhaId,
          influencerId: item.inf.id,
          status,
          motivo: status === "reprovado" ? motivo.trim() : undefined,
        },
      });
      hypitoToast(
        status === "aprovado"
          ? "Aprovado! A equipe foi avisada."
          : "Ajustes solicitados — a equipe vai revisar.",
      );
      setRejectingKey(null);
      setMotivo("");
      reload();
    } catch {
      toast.error("Erro ao enviar. Tente novamente.");
    } finally {
      setBusyKey(null);
    }
  };

  const runEntrega = async (
    item: Extract<ApprovalItem, { kind: "roteiro" | "conteudo" }>,
    status: "aprovado" | "reprovado",
  ) => {
    const key = `${item.kind}:${item.entrega.id}`;
    setBusyKey(key);
    try {
      await respondEntregaFn({
        data: {
          token,
          campanhaId: item.campanhaId,
          influencerId: item.inf.id,
          entregaId: item.entrega.id,
          status,
          motivo: status === "reprovado" ? motivo.trim() : undefined,
        },
      });
      hypitoToast(
        status === "aprovado"
          ? "Aprovado! A equipe foi avisada."
          : "Ajustes solicitados — a equipe vai revisar.",
      );
      setRejectingKey(null);
      setMotivo("");
      reload();
    } catch {
      toast.error("Erro ao enviar. Tente novamente.");
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="Central de aprovações"
        description="Tudo que precisa da sua decisão, em todas as campanhas."
      />

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {campanhasComPendencia.length > 1 && (
          <SegmentedControl
            aria-label="Filtrar por campanha"
            value={search.campanha ?? "todas"}
            onChange={(v) =>
              navigate({ search: v === "todas" ? {} : { campanha: v }, replace: true })
            }
            options={[
              { value: "todas", label: "Todas as campanhas" },
              ...campanhasComPendencia.map(([id, nome]) => ({ value: id, label: nome })),
            ]}
          />
        )}
        <SegmentedControl
          aria-label="Filtrar por tipo"
          value={tipoFiltro}
          onChange={setTipoFiltro}
          options={[
            { value: "todos", label: "Todos os tipos" },
            { value: "influ", label: "Influenciadores" },
            { value: "entregas", label: "Roteiro/conteúdo" },
          ]}
        />
      </div>

      <div className="mt-6 space-y-8">
        {byCampanha.size === 0 ? (
          <EmptyState
            icon={<CheckCircle2 className="h-5 w-5" />}
            title="Tudo certo por aqui"
            description="Nenhuma aprovação sua é necessária no momento."
          />
        ) : (
          Array.from(byCampanha.entries()).map(([campanhaId, { campanhaNome, items: group }]) => (
            <section key={campanhaId} className="space-y-3">
              <h2 className="text-sm font-semibold text-foreground">{campanhaNome}</h2>
              <div className="space-y-3">
                {group.map((item) => {
                  const key =
                    item.kind === "influ"
                      ? `influ:${item.inf.id}`
                      : `${item.kind}:${item.entrega.id}`;
                  const dataPostagem =
                    item.kind === "influ" ? undefined : item.entrega.dataPostagem;
                  const ultimoHistorico =
                    item.kind === "influ"
                      ? item.inf.historico?.at(-1)
                      : item.entrega.historico?.at(-1);
                  return (
                    <div key={key} className="rounded-xl border border-border bg-card p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <Avatar className="h-9 w-9 shrink-0">
                            {item.inf.foto && (
                              <AvatarImage src={item.inf.foto} alt={item.inf.nome} />
                            )}
                            <AvatarFallback className="text-xs font-semibold">
                              {initialsOf(item.inf.nome)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">
                              {item.inf.nome}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {item.kind === "influ"
                                ? t(lang, "pendingInflu")
                                : item.kind === "roteiro"
                                  ? t(lang, "pendingRoteiro")
                                  : t(lang, "pendingConteudo")}
                            </p>
                          </div>
                        </div>
                        <UrgencyBadge dataPostagem={dataPostagem} />
                      </div>

                      {item.kind !== "influ" && (item.entrega.anexos ?? []).length > 0 && (
                        <div className="mt-3 space-y-2">
                          {(item.entrega.anexos ?? [])
                            .filter((a) =>
                              item.kind === "roteiro"
                                ? a.categoria === "Roteiro"
                                : a.categoria === "Conteúdo final",
                            )
                            .map((a) => (
                              <EntregaAnexoPreview key={a.id} nome={a.nome} url={a.url} />
                            ))}
                        </div>
                      )}

                      {ultimoHistorico && (
                        <p className="mt-2 text-[11px] text-muted-foreground">
                          {item.kind === "influ" && "status" in ultimoHistorico
                            ? ultimoHistorico.status
                            : "key" in ultimoHistorico
                              ? t(lang, ultimoHistorico.key as Parameters<typeof t>[1])
                              : null}
                          {" · "}
                          {fmtDate(ultimoHistorico.at.slice(0, 10))}
                        </p>
                      )}

                      <div className="mt-3">
                        <ApproveRejectBar
                          busy={busyKey === key}
                          rejecting={rejectingKey === key}
                          motivo={motivo}
                          lang={lang}
                          setRejecting={(v) => {
                            setRejectingKey(v ? key : null);
                            setMotivo("");
                          }}
                          setMotivo={setMotivo}
                          onApprove={() =>
                            void (item.kind === "influ"
                              ? runInflu(item, "aprovado")
                              : runEntrega(item, "aprovado"))
                          }
                          onConfirmReject={() =>
                            void (item.kind === "influ"
                              ? runInflu(item, "reprovado")
                              : runEntrega(item, "reprovado"))
                          }
                        />
                      </div>

                      <Link
                        to="/portal/$token/campanhas/$campanhaId"
                        params={{ token, campanhaId: item.campanhaId }}
                        search={{ influ: item.inf.id }}
                        className="mt-2 inline-block text-[11px] font-medium text-brand underline-offset-2 hover:underline"
                      >
                        Ver influenciador completo
                      </Link>
                    </div>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>
    </PageContainer>
  );
}
