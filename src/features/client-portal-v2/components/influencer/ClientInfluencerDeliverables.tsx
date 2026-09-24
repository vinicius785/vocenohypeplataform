import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, ChevronDown, Download, ExternalLink, Film, Paperclip, X } from "lucide-react";
import { respondCampanhaEntregaSession } from "@/lib/portal-auth.functions";
import { usePortalSessionData } from "@/components/portal/portal-session-context";
import { InfluencerDrawerSection } from "./InfluencerDrawerSection";
import { formatMetricValue } from "../../lib/metric-format";
import {
  activeAjuste,
  ajusteSemDetalheDisponivel,
  formatAjusteSummary,
} from "../../lib/ajuste-format";
import {
  anexosPorCategoria,
  arquivosDaEntrega,
  conteudoAtual,
  entregaTemDetalhes,
  roteiroAtual,
} from "../../lib/entrega-content";
import type { PublicEntrega } from "@/lib/portal-types";

const CAN_DECIDE_STAGES = new Set(["ROTEIRO_APROVACAO", "CONTEUDO_APROVACAO"]);
const ROTEIRO_STAGES = new Set(["ROTEIRO_APROVACAO", "ROTEIRO_AJUSTES"]);

function formatDateTime(iso: string): string {
  return `${new Date(iso).toLocaleDateString("pt-BR")}, ${new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

function AdjustForm({
  onConfirm,
  onCancel,
  disabled,
}: {
  onConfirm: (motivo: string) => void;
  onCancel: () => void;
  disabled: boolean;
}) {
  const [motivo, setMotivo] = useState("");
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-background p-2">
      <textarea
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder="Descreva o ajuste necessário (obrigatório)..."
        className="min-h-16 rounded-md border border-border bg-card px-2 py-1.5 text-sm"
      />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-2.5 py-1 text-xs text-text-secondary hover:bg-muted"
        >
          Cancelar
        </button>
        <button
          type="button"
          disabled={!motivo.trim() || disabled}
          onClick={() => onConfirm(motivo.trim())}
          className="rounded-md bg-warning px-2.5 py-1 text-xs font-medium text-brand-foreground disabled:opacity-50"
        >
          Enviar solicitação
        </button>
      </div>
    </div>
  );
}

/** Versão + briefing/roteiro ou conteúdo, com histórico compacto de
 * versões anteriores quando existir mais de uma — nunca mistura roteiro
 * com conteúdo final na mesma lista (categorias diferentes). */
function VersionSection({
  title,
  categoria,
  entrega,
}: {
  title: string;
  categoria: "Roteiro" | "Conteúdo final";
  entrega: PublicEntrega;
}) {
  const versions = anexosPorCategoria(entrega, categoria);
  if (versions.length === 0) return null;
  const [current, ...previous] = versions;

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">{title}</p>
      <div className="flex items-center justify-between gap-2 rounded-lg bg-card p-2.5">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-foreground">
            Versão {current.versao ?? 1}
            {current.criadoEm ? ` · Enviada ${formatDateTime(current.criadoEm)}` : ""}
          </p>
        </div>
        <a
          href={current.url}
          target="_blank"
          rel="noreferrer"
          className="flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-muted"
        >
          <ExternalLink className="h-3.5 w-3.5" /> Visualizar
        </a>
      </div>

      {previous.length > 0 && (
        <details className="rounded-lg bg-card/60 px-2.5 py-2">
          <summary className="cursor-pointer text-xs font-medium text-text-secondary">
            Histórico de versões
          </summary>
          <div className="mt-1.5 space-y-1.5 border-t border-border/60 pt-1.5">
            {versions.map((v, i) => (
              <a
                key={v.id}
                href={v.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between gap-2 rounded-md px-1.5 py-1 hover:bg-muted/40"
              >
                <span className="text-xs text-foreground">
                  Versão {v.versao ?? 1} {i === 0 ? "· Atual" : ""}
                </span>
                <span className="text-xs text-text-secondary">
                  {v.criadoEm ? formatDateTime(v.criadoEm) : ""}
                </span>
              </a>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

/**
 * Entregas e conteúdos — a entrega é a entidade principal; conteúdo,
 * versões, briefing/roteiro, ajuste, arquivos e resultados vivem TODOS
 * dentro dela (nunca uma segunda seção "Conteúdos e versões" repetindo o
 * mesmo formato). Ações reaproveitam a MESMA server function já usada
 * antes (`respondCampanhaEntregaSession`) — nenhum novo caminho de
 * escrita.
 */
export function ClientInfluencerDeliverables({
  entregas,
  campanhaId,
  influencerId,
  initialOpenEntregaId,
}: {
  entregas: PublicEntrega[];
  campanhaId: string;
  influencerId: string;
  /** Deep link `?entrega=`/`?conteudo=` — abre esta entrega já expandida. */
  initialOpenEntregaId?: string;
}) {
  const { reload, readOnly } = usePortalSessionData();
  const queryClient = useQueryClient();
  const respondFn = useServerFn(respondCampanhaEntregaSession);
  const [expandedId, setExpandedId] = useState<string | null>(initialOpenEntregaId ?? null);
  const [adjustingId, setAdjustingId] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (vars: { entregaId: string; status: "aprovado" | "reprovado"; motivo?: string }) =>
      respondFn({ data: { campanhaId, influencerId, ...vars } }),
    onSuccess: () => {
      reload();
      queryClient.invalidateQueries();
      toast.success("Decisão registrada.");
      setAdjustingId(null);
    },
    onError: () => toast.error("Não foi possível registrar a decisão. Tente novamente."),
  });

  if (entregas.length === 0) return null;

  return (
    <InfluencerDrawerSection icon={<Film className="h-4 w-4" />} title="Entregas e conteúdos">
      <div className="space-y-1.5 rounded-2xl bg-card p-2 dark:shadow-none">
        {entregas.map((entrega) => {
          const canDecide = CAN_DECIDE_STAGES.has(entrega.stage) && !readOnly;
          const hasDetails = entregaTemDetalhes(entrega, canDecide);
          const expanded = hasDetails && expandedId === entrega.id;
          const ajuste = activeAjuste(entrega);
          const semDetalheAjuste = !ajuste && ajusteSemDetalheDisponivel(entrega);
          const isRoteiroStage = ROTEIRO_STAGES.has(entrega.stage);
          const arquivos = arquivosDaEntrega(entrega);
          const conteudo = conteudoAtual(entrega);
          const roteiro = roteiroAtual(entrega);

          const summaryLine = (
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">
                {entrega.quantidade} {entrega.titulo || entrega.tipo}
              </p>
              <p className="mt-0.5 text-xs text-text-secondary">
                {entrega.statusCliente}
                {entrega.dataPostagem && !entrega.publicadoEm
                  ? ` · Prazo ${new Date(entrega.dataPostagem).toLocaleDateString("pt-BR")}`
                  : ""}
              </p>
              {!expanded && ajuste && (
                <p className="mt-0.5 truncate text-xs text-text-secondary">
                  {formatAjusteSummary(ajuste.veredito)}
                </p>
              )}
              {!expanded && semDetalheAjuste && (
                <p className="mt-0.5 truncate text-xs text-text-secondary">
                  Ajuste solicitado anteriormente.
                </p>
              )}
            </div>
          );

          return (
            <div key={entrega.id} className="rounded-xl px-3 py-2.5">
              {hasDetails ? (
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setExpandedId(expanded ? null : entrega.id)}
                  className="flex w-full items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                >
                  {summaryLine}
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
                  />
                </button>
              ) : (
                <div className="flex w-full items-center gap-3">{summaryLine}</div>
              )}

              {expanded && (
                <div className="mt-3 space-y-3 border-t border-border/60 pt-3">
                  {roteiro && (
                    <VersionSection
                      title="Briefing e roteiro"
                      categoria="Roteiro"
                      entrega={entrega}
                    />
                  )}

                  {conteudo ? (
                    <VersionSection title="Conteúdo" categoria="Conteúdo final" entrega={entrega} />
                  ) : (
                    !isRoteiroStage && (
                      <div className="space-y-1">
                        <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                          Conteúdo
                        </p>
                        <p className="text-xs text-text-secondary">Ainda não enviado</p>
                        <p className="text-xs text-text-secondary">
                          Aguardando a equipe da Você no Hype.
                        </p>
                      </div>
                    )
                  )}

                  {ajuste && (
                    <div className="rounded-lg bg-warning-soft p-2.5">
                      <p className="text-xs font-medium text-foreground">Solicitação de ajuste</p>
                      <p className="text-xs text-text-secondary">
                        {formatAjusteSummary(ajuste.veredito)}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-xs text-foreground">
                        “{ajuste.veredito.motivo}”
                      </p>
                      <p className="mt-1.5 text-xs text-text-secondary">
                        Aguardando nova versão da equipe da Você no Hype.
                      </p>
                    </div>
                  )}
                  {semDetalheAjuste && (
                    <div className="rounded-lg bg-warning-soft p-2.5">
                      <p className="text-xs font-medium text-foreground">
                        Ajuste solicitado anteriormente.
                      </p>
                      <p className="mt-1 text-xs text-text-secondary">
                        Os detalhes da solicitação não estão disponíveis.
                      </p>
                    </div>
                  )}

                  {arquivos.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                        Arquivos relacionados
                      </p>
                      <div className="space-y-1">
                        {arquivos.map((a) => (
                          <div
                            key={a.id}
                            className="flex items-center gap-2 rounded-lg bg-card px-2.5 py-1.5"
                          >
                            <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            <p className="min-w-0 flex-1 truncate text-xs text-foreground">
                              {a.nome}
                            </p>
                            <a
                              href={a.url}
                              download
                              className="shrink-0 text-muted-foreground hover:text-foreground"
                              aria-label={`Baixar ${a.nome}`}
                            >
                              <Download className="h-3.5 w-3.5" />
                            </a>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {entrega.publicadoEm && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                        Publicação
                      </p>
                      <p className="text-xs text-text-secondary">
                        Publicado em {new Date(entrega.publicadoEm).toLocaleDateString("pt-BR")}
                      </p>
                      {entrega.url && (
                        <a
                          href={entrega.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-block text-xs font-medium text-brand hover:underline"
                        >
                          Ver publicação
                        </a>
                      )}
                      {entrega.metrics && (
                        <div className="grid grid-cols-2 gap-2 pt-1 sm:grid-cols-4">
                          <Metric label="Visualizações" value={entrega.metrics.views} />
                          <Metric label="Interações" value={entrega.metrics.likes} />
                          <Metric label="Comentários" value={entrega.metrics.comments} />
                          <Metric label="Alcance" value={entrega.metrics.reach} />
                        </div>
                      )}
                    </div>
                  )}

                  {canDecide &&
                    (adjustingId === entrega.id ? (
                      <AdjustForm
                        disabled={mutation.isPending}
                        onCancel={() => setAdjustingId(null)}
                        onConfirm={(motivo) =>
                          mutation.mutate({ entregaId: entrega.id, status: "reprovado", motivo })
                        }
                      />
                    ) : (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={mutation.isPending}
                          onClick={() =>
                            mutation.mutate({ entregaId: entrega.id, status: "aprovado" })
                          }
                          className="flex items-center gap-1 rounded-md bg-success px-2.5 py-1.5 text-xs font-medium text-brand-foreground disabled:opacity-50"
                        >
                          <Check className="h-3.5 w-3.5" /> Aprovar
                        </button>
                        <button
                          type="button"
                          disabled={mutation.isPending}
                          onClick={() => setAdjustingId(entrega.id)}
                          className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-warning hover:bg-warning-soft disabled:opacity-50"
                        >
                          <X className="h-3.5 w-3.5" /> Solicitar ajuste
                        </button>
                      </div>
                    ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </InfluencerDrawerSection>
  );
}

function Metric({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div>
      <p className="text-xs text-text-secondary">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
        {formatMetricValue(value)}
      </p>
    </div>
  );
}
