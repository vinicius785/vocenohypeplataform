import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Star } from "lucide-react";
import { ToolEmpty, ToolError, ToolLoading } from "./tools/CampaignToolShell";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
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
import type { NpsRating } from "@/lib/campanha-nps";
import { TYPOGRAPHY } from "@/lib/design-tokens";
import { cn } from "@/lib/utils";

/** Amostra pequena demais pro NPS significar algo estatisticamente — só
 * comunicação visual (o cálculo em si nunca muda, `npsIndex` já conta
 * qualquer amostra ≥1). Abaixo deste número, mostra "Amostra pequena"
 * ao lado da contagem, pra um +100 com 1 resposta não parecer um
 * resultado consolidado. */
const SMALL_SAMPLE_THRESHOLD = 5;

/** Cor do texto de cada avaliação (Comunicação/Briefing/...) — só pra
 * notas do meio pra baixo chamarem atenção o suficiente pra serem
 * percebidas rápido, sem virar alarme (nunca ícone/badge/fundo, só o
 * tom do texto, tokens semânticos já existentes no design system). */
const RATING_TONE: Record<NpsRating, string> = {
  muito_ruim: "text-danger",
  ruim: "text-danger",
  regular: "text-warning",
  boa: "text-foreground",
  excelente: "text-foreground",
};

const CATEGORY_TEXT_TONE: Record<NpsCategory, string> = {
  promotor: "text-success",
  neutro: "text-warning",
  detrator: "text-danger",
};

const CATEGORY_BADGE_TONE: Record<NpsCategory, string> = {
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
 * Campanha → Recursos → NPS → aba "Influenciadores" — reconstruída como
 * uma tela de acompanhamento da experiência, não um relatório: o NPS é o
 * elemento visual principal (hierarquia tipográfica, não um card entre
 * outros 5 de peso igual), a lista de avaliações é escaneável em vez de
 * tabular, e o detalhe de UMA resposta abre num drawer lateral (nunca um
 * segundo modal grande) — mesmos dados/cálculo de sempre
 * (`getCampanhaNpsInfluenciadoresInterno`, `npsIndex`/`classifyNpsScore`
 * em `campanha-nps-insights.ts`, inalterados), só a apresentação muda.
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

  const smallSample = aggregate.respondidos > 0 && aggregate.respondidos < SMALL_SAMPLE_THRESHOLD;

  return (
    <div className="space-y-6">
      {/* NPS — protagonista: número grande primeiro, contexto da amostra
       * COLADO nele (nunca um card isolado com peso igual aos outros
       * números), distribuição logo abaixo em texto corrido, não em
       * caixas. */}
      <div className="space-y-2">
        <p className={TYPOGRAPHY.label}>NPS dos influenciadores</p>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className={cn(TYPOGRAPHY.display, "leading-none")}>
            {formatNpsIndex(aggregate.nps)}
          </span>
          <span className={TYPOGRAPHY.bodySecondary}>
            {aggregate.respondidos} de {aggregate.total} avaliações
            {smallSample && " · amostra pequena"}
          </span>
        </div>
        {aggregate.respondidos > 0 && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span>
              <span className="font-semibold tabular-nums text-success">
                {aggregate.promotores}
              </span>{" "}
              <span className="text-text-secondary">
                {aggregate.promotores === 1 ? "Promotor" : "Promotores"}
              </span>
            </span>
            <span>
              <span className="font-semibold tabular-nums text-warning">{aggregate.neutros}</span>{" "}
              <span className="text-text-secondary">
                {aggregate.neutros === 1 ? "Neutro" : "Neutros"}
              </span>
            </span>
            <span>
              <span className="font-semibold tabular-nums text-danger">{aggregate.detratores}</span>{" "}
              <span className="text-text-secondary">
                {aggregate.detratores === 1 ? "Detrator" : "Detratores"}
              </span>
            </span>
            {aggregate.media !== null && (
              <span className="text-text-secondary">Média {formatMedia(aggregate.media)}</span>
            )}
          </div>
        )}
      </div>

      {/* Lista de avaliações — escaneável: quem respondeu mostra nota em
       * destaque + categoria discreta ao lado; quem não respondeu usa um
       * texto baixo-contraste, sem repetir um rótulo pesado por linha. */}
      <div>
        <p className={cn(TYPOGRAPHY.label, "mb-1")}>Avaliações</p>
        <ul className="divide-y divide-border/60">
          {influenciadores.map((i) => (
            <li key={i.influenciadorId}>
              <button
                type="button"
                disabled={!i.respondido}
                onClick={() => setDetail(i)}
                className="flex w-full items-center justify-between gap-3 py-2.5 text-left disabled:cursor-default enabled:hover:bg-muted/40 enabled:focus-visible:bg-muted/40 enabled:focus-visible:outline-none rounded-md px-1 -mx-1"
              >
                <span className="truncate text-sm font-medium text-foreground">{i.nome}</span>
                {i.respondido && i.category ? (
                  <span className="shrink-0 text-sm">
                    <span className="font-semibold tabular-nums text-foreground">{i.score}</span>{" "}
                    <span className={CATEGORY_TEXT_TONE[i.category]}>
                      · {NPS_CATEGORY_LABEL[i.category]}
                    </span>
                  </span>
                ) : (
                  <span className="shrink-0 text-sm text-text-secondary/70">
                    Aguardando avaliação
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <Sheet open={detail !== null} onOpenChange={(o) => !o && setDetail(null)}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 overflow-y-auto p-6 sm:max-w-[440px]"
        >
          {detail && (
            <>
              <SheetTitle className="sr-only">Avaliação de {detail.nome}</SheetTitle>
              <SheetDescription className="sr-only">
                Nota de NPS, avaliações da experiência e comentários de {detail.nome}.
              </SheetDescription>

              <p className={TYPOGRAPHY.sectionTitle}>{detail.nome}</p>

              <div className="mt-3 flex items-center gap-3">
                <span className={cn(TYPOGRAPHY.display, "leading-none")}>{detail.score}</span>
                {detail.category && (
                  <Badge
                    variant="secondary"
                    className={cn("border-0", CATEGORY_BADGE_TONE[detail.category])}
                  >
                    {NPS_CATEGORY_LABEL[detail.category]}
                  </Badge>
                )}
              </div>

              <div className="mt-6 space-y-1 border-t border-border/60 pt-5">
                <p className={cn(TYPOGRAPHY.label, "mb-2")}>Experiência</p>
                {(
                  [
                    { label: "Comunicação", value: detail.communicationRating },
                    { label: "Briefing", value: detail.briefingRating },
                    { label: "Acompanhamento e aprovação", value: detail.approvalProcessRating },
                    { label: "Pagamento", value: detail.paymentExperienceRating },
                    { label: "Experiência geral", value: detail.overallExperienceRating },
                  ] satisfies { label: string; value: NpsRating | null }[]
                ).map((r) => (
                  <div key={r.label} className="flex items-center justify-between py-1 text-sm">
                    <span className="text-text-secondary">{r.label}</span>
                    <span
                      className={cn(
                        "font-medium",
                        r.value ? RATING_TONE[r.value] : "text-text-secondary",
                      )}
                    >
                      {r.value ? ratingLabel(r.value) : "—"}
                    </span>
                  </div>
                ))}
              </div>

              {detail.wouldWorkAgain && (
                <div className="mt-5 flex items-center justify-between border-t border-border/60 pt-5 text-sm">
                  <span className="text-text-secondary">Trabalharia novamente?</span>
                  <span className="font-medium text-foreground">
                    {wouldWorkAgainLabel(detail.wouldWorkAgain)}
                  </span>
                </div>
              )}

              {detail.positiveComment && (
                <div className="mt-5 space-y-1 border-t border-border/60 pt-5">
                  <p className={TYPOGRAPHY.label}>O que mais gostou</p>
                  <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
                    {detail.positiveComment}
                  </p>
                </div>
              )}
              {detail.improvementComment && (
                <div className="mt-5 space-y-1 border-t border-border/60 pt-5">
                  <p className={TYPOGRAPHY.label}>O que poderia melhorar</p>
                  <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
                    {detail.improvementComment}
                  </p>
                </div>
              )}

              {detail.answeredAt && (
                <div className="mt-5 border-t border-border/60 pt-5">
                  <p className={TYPOGRAPHY.label}>Respondido em</p>
                  <p className="mt-0.5 text-sm text-foreground">
                    {formatAnsweredAt(detail.answeredAt)}
                  </p>
                </div>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
