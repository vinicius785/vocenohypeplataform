import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { MessageSquareQuote, Star } from "lucide-react";
import { SummaryStat } from "@/components/shared/SummaryStat";
import { ToolEmpty, ToolError, ToolLoading } from "./tools/CampaignToolShell";
import { Badge } from "@/components/ui/badge";
import {
  getCampanhaNpsInfluenciadoresInterno,
  type CampanhaNpsInfluenciadoresInterno,
} from "@/lib/campanha-nps-influenciador-interno.functions";
import { NPS_CATEGORY_LABEL, formatNpsIndex, type NpsCategory } from "@/lib/campanha-nps-insights";

const CATEGORY_BADGE: Record<NpsCategory, string> = {
  promotor: "bg-success/15 text-success",
  neutro: "bg-warning/15 text-warning",
  detrator: "bg-danger/15 text-danger",
};

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

type Load =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; result: CampanhaNpsInfluenciadoresInterno };

/**
 * Campanha → Recursos → NPS → aba "Influenciadores". Consulta pura (igual
 * à aba "Cliente"): mostra NPS/respostas/média/distribuição calculados a
 * partir das respostas reais em `campanha_nps_influenciador`, e a lista de
 * influenciadores com quem respondeu e quem ainda não. Nenhum dado
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
            <li key={i.influenciadorId} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-center justify-between gap-3">
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
              </div>
              {i.respondido && i.comment && (
                <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-muted/60 p-2.5">
                  <MessageSquareQuote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-secondary" />
                  <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground">
                    {i.comment}
                  </p>
                </div>
              )}
              {i.respondido && i.answeredAt && (
                <p className="mt-1.5 text-[11px] text-text-secondary">
                  Respondido em {formatAnsweredAt(i.answeredAt)}
                </p>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
