import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { MessageSquareQuote, Star } from "lucide-react";
import { SummaryStat } from "@/components/shared/SummaryStat";
import { ToolEmpty, ToolError, ToolLoading } from "./tools/CampaignToolShell";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  getCampanhaNpsInfluenciadoresInterno,
  type CampanhaNpsInfluenciadoresInterno,
} from "@/lib/campanha-nps-influenciador-interno.functions";
import {
  NPS_CATEGORY_LABEL,
  formatNpsIndex,
  ratingLabel,
  type NpsCategory,
} from "@/lib/campanha-nps-insights";
import { WOULD_WORK_AGAIN_OPTIONS } from "@/lib/campanha-nps-influenciador";

const CATEGORY_BADGE: Record<NpsCategory, string> = {
  promotor: "bg-success/15 text-success",
  neutro: "bg-warning/15 text-warning",
  detrator: "bg-danger/15 text-danger",
};

type InfluNpsEntry = CampanhaNpsInfluenciadoresInterno["influenciadores"][number];

function formatAnsweredAt(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMedia(value: number | null): string {
  if (value === null) return "—";
  return value.toFixed(1).replace(".", ",");
}

function wouldWorkAgainLabel(value: string | null): string | null {
  return WOULD_WORK_AGAIN_OPTIONS.find((o) => o.value === value)?.label ?? null;
}

type Load =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; result: CampanhaNpsInfluenciadoresInterno };

/**
 * Campanha → Recursos → NPS → aba "Influenciadores". Consulta pura (igual
 * à aba "Cliente"): mostra NPS/respostas/média/distribuição calculados a
 * partir das respostas reais em `campanha_nps_influenciador`, e a lista de
 * influenciadores com quem respondeu e quem ainda não. Clicar numa resposta
 * abre o detalhe completo (todas as perguntas) — a lista em si mostra só
 * nota + categoria, pra não virar uma parede de texto. Nenhum dado
 * financeiro é buscado ou exibido aqui.
 */
export function CampanhaNpsInfluenciadoresPanel({
  open,
  campanhaId,
}: {
  open: boolean;
  campanhaId: string;
}) {
  const fetchNps = useServerFn(getCampanhaNpsInfluenciadoresInterno);
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
  const [detail, setDetail] = useState<InfluNpsEntry | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoad({ state: "loading" });
    fetchNps({ data: { campanhaId } })
      .then((result) => {
        if (cancelled) return;
        setLoad({ state: "ready", result });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setLoad({
          state: "error",
          message: e instanceof Error ? e.message : "Não foi possível carregar o NPS.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [open, campanhaId, reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps -- fetchNps (useServerFn) não é estável entre renders

  if (load.state === "loading") return <ToolLoading label="Carregando avaliações…" />;

  if (load.state === "error") {
    return (
      <ToolError
        title="Não foi possível carregar o NPS"
        message={load.message}
        onRetry={() => setReloadKey((k) => k + 1)}
      />
    );
  }

  const { influenciadores, aggregate } = load.result;

  if (aggregate.total === 0) {
    return (
      <ToolEmpty
        icon={Star}
        title="Ainda não há influenciadores aprovados nesta campanha."
        description="O link de avaliação é gerado automaticamente assim que um influenciador é aprovado."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border border-border/60 bg-background">
        <div className="flex flex-wrap">
          <SummaryStat label="Respostas" value={`${aggregate.respondidos} / ${aggregate.total}`} />
          <SummaryStat label="NPS" value={formatNpsIndex(aggregate.nps)} />
          <SummaryStat label="Média" value={formatMedia(aggregate.media)} />
          <SummaryStat label="Promotores" value={String(aggregate.promotores)} />
          <SummaryStat label="Neutros" value={String(aggregate.neutros)} />
          <SummaryStat label="Detratores" value={String(aggregate.detratores)} />
        </div>
      </div>

      <section className="rounded-xl border border-border/60 bg-background p-4">
        <h3 className="text-sm font-semibold text-foreground">Influenciadores</h3>
        <ul className="mt-3 divide-y divide-border/60">
          {influenciadores.map((i) => (
            <li key={i.influenciadorId}>
              <button
                type="button"
                disabled={!i.respondido}
                onClick={() => setDetail(i)}
                className="flex w-full items-center justify-between gap-3 rounded-lg py-3 text-left first:pt-0 last:pb-0 disabled:cursor-default enabled:hover:bg-muted/60"
              >
                <span className="truncate text-sm font-medium text-foreground">{i.nome}</span>
                {i.respondido && i.category ? (
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-sm font-semibold tabular-nums text-foreground">
                      {i.score}
                    </span>
                    <Badge variant="secondary" className={`border-0 ${CATEGORY_BADGE[i.category]}`}>
                      {NPS_CATEGORY_LABEL[i.category]}
                    </Badge>
                  </div>
                ) : (
                  <span className="shrink-0 text-xs text-text-secondary">Não respondido</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <Dialog open={detail !== null} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-md">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle>{detail.nome}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="text-lg font-semibold tabular-nums text-foreground">
                    Nota {detail.score}
                  </span>
                  {detail.category && (
                    <Badge
                      variant="secondary"
                      className={`border-0 ${CATEGORY_BADGE[detail.category]}`}
                    >
                      {NPS_CATEGORY_LABEL[detail.category]}
                    </Badge>
                  )}
                </div>

                <dl className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Comunicação", value: detail.communicationRating },
                    { label: "Briefing", value: detail.briefingRating },
                    { label: "Acompanhamento/aprovação", value: detail.approvalProcessRating },
                    { label: "Pagamento", value: detail.paymentExperienceRating },
                    { label: "Experiência geral", value: detail.overallExperienceRating },
                  ].map((r) => (
                    <div key={r.label}>
                      <dt className="text-[10px] font-medium uppercase tracking-wide text-text-secondary">
                        {r.label}
                      </dt>
                      <dd className="mt-0.5 text-sm font-semibold text-foreground">
                        {r.value ? ratingLabel(r.value) : "—"}
                      </dd>
                    </div>
                  ))}
                  {detail.wouldWorkAgain && (
                    <div>
                      <dt className="text-[10px] font-medium uppercase tracking-wide text-text-secondary">
                        Trabalharia de novo?
                      </dt>
                      <dd className="mt-0.5 text-sm font-semibold text-foreground">
                        {wouldWorkAgainLabel(detail.wouldWorkAgain)}
                      </dd>
                    </div>
                  )}
                </dl>

                {detail.positiveComment && (
                  <div className="rounded-lg bg-muted/60 p-3">
                    <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-text-secondary">
                      <MessageSquareQuote className="h-3.5 w-3.5" /> O que mais gostou
                    </p>
                    <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
                      {detail.positiveComment}
                    </p>
                  </div>
                )}
                {detail.improvementComment && (
                  <div className="rounded-lg bg-muted/60 p-3">
                    <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-text-secondary">
                      <MessageSquareQuote className="h-3.5 w-3.5" /> O que poderia melhorar
                    </p>
                    <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
                      {detail.improvementComment}
                    </p>
                  </div>
                )}

                {detail.answeredAt && (
                  <p className="text-xs text-text-secondary">
                    Respondido em {formatAnsweredAt(detail.answeredAt)}
                  </p>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
