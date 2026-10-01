import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { MessageSquareQuote, Star } from "lucide-react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";
import { SummaryStat } from "@/components/shared/SummaryStat";
import { CampaignToolShell, ToolEmpty, ToolError, ToolLoading } from "./tools/CampaignToolShell";
import { CAMPAIGN_TOOLS } from "./tools/campaign-tools";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getCampanhaNpsInterno } from "@/lib/campanha-nps.functions";
import {
  MIN_MONTHS_FOR_NPS_INDEX,
  NPS_CATEGORY_LABEL,
  formatNpsIndex,
  formatOutOfFive,
  formatReferenceMonth,
  ratingLabel,
  type CampanhaNpsMonthSummary,
  type NpsCategory,
} from "@/lib/campanha-nps-insights";
import { NPS_SATISFACTION_LABELS, currentReferenceMonth } from "@/lib/campanha-nps";

const CATEGORY_BADGE: Record<NpsCategory, string> = {
  promotor: "bg-success/15 text-success",
  neutro: "bg-warning/15 text-warning",
  detrator: "bg-danger/15 text-danger",
};
const CATEGORY_BAR: Record<NpsCategory, string> = {
  promotor: "bg-success",
  neutro: "bg-warning",
  detrator: "bg-danger",
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

type Load =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; months: CampanhaNpsMonthSummary[] };

/**
 * Campanha → Ferramentas → NPS. Consulta pura (nenhuma ação de escrita) do
 * NPS mensal da campanha, vindo de `getCampanhaNpsInterno` — que valida no
 * backend que quem chama é do time interno com permissão. Resumo/índice/
 * distribuição já chegam calculados do servidor; aqui só se escolhe o mês.
 * Renderizado dentro do `CampaignToolShell` (tamanho `medium`); o seletor
 * de mês ocupa o lugar de "ação principal" do header. Só busca quando aberto.
 */
export function CampanhaNpsTool({
  open,
  onOpenChange,
  campanhaId,
  campanhaNome,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campanhaId: string;
  campanhaNome: string;
}) {
  const meta = CAMPAIGN_TOOLS.nps;
  const fetchNps = useServerFn(getCampanhaNpsInterno);
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [selected, setSelected] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoad({ state: "loading" });
    fetchNps({ data: { campanhaId } })
      .then((r) => {
        if (cancelled) return;
        setLoad({ state: "ready", months: r.months });
        setSelected(r.months.length ? r.months[r.months.length - 1].referenceMonth : null);
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

  const months = load.state === "ready" ? load.months : [];
  const current = months.find((m) => m.referenceMonth === selected) ?? null;
  const thisMonth = currentReferenceMonth();
  const thisMonthMissing =
    load.state === "ready" && !months.some((m) => m.referenceMonth === thisMonth);

  return (
    <CampaignToolShell
      open={open}
      onOpenChange={onOpenChange}
      size={meta.size}
      campanhaNome={campanhaNome}
      icon={meta.icon}
      title={meta.label}
      description={meta.description}
      actions={
        months.length > 0 &&
        selected && (
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger className="h-8 w-full text-xs sm:w-44" aria-label="Mês de referência">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[...months].reverse().map((m) => (
                <SelectItem key={m.referenceMonth} value={m.referenceMonth}>
                  {formatReferenceMonth(m.referenceMonth)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )
      }
    >
      <div className="space-y-4">
        {load.state === "loading" && <ToolLoading label="Carregando avaliações…" />}

        {load.state === "error" && (
          <ToolError
            title="Não foi possível carregar o NPS"
            message={load.message}
            onRetry={() => setReloadKey((k) => k + 1)}
          />
        )}

        {load.state === "ready" && months.length === 0 && (
          <ToolEmpty
            icon={Star}
            title="Ainda não temos uma avaliação para este mês."
            description={`A avaliação mensal será exibida aqui assim que o cliente responder. Esta campanha ainda não recebeu nenhuma avaliação de NPS (mês atual: ${formatReferenceMonth(thisMonth)}).`}
          />
        )}

        {current && (
          <>
            {thisMonthMissing && (
              <p className="rounded-lg bg-muted px-3 py-2 text-xs text-text-secondary">
                Ainda não temos uma avaliação para {formatReferenceMonth(thisMonth)}. A avaliação
                mensal será exibida aqui assim que o cliente responder.
              </p>
            )}

            <div className="overflow-hidden rounded-xl border border-border/60 bg-background">
              <div className="flex flex-wrap">
                <SummaryStat
                  label="NPS"
                  value={formatNpsIndex(current.cumulative.nps)}
                  complement={
                    current.cumulative.nps === null
                      ? `Nota do mês: ${current.entry.score} · ${NPS_CATEGORY_LABEL[current.category]}`
                      : `${current.cumulative.distribution.total} meses · nota do mês ${current.entry.score}`
                  }
                />
                <SummaryStat
                  label="Satisfação geral"
                  value={formatOutOfFive(current.entry.satisfactionScore)}
                  complement={NPS_SATISFACTION_LABELS[current.entry.satisfactionScore]}
                />
                <SummaryStat
                  label="Qualidade das entregas"
                  value={formatOutOfFive(current.deliveryScore)}
                  complement={ratingLabel(current.entry.deliveryQuality)}
                />
                <SummaryStat
                  label="Atendimento e comunicação"
                  value={formatOutOfFive(current.communicationScore)}
                  complement={ratingLabel(current.entry.communicationRating)}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-5">
              <NpsEvolucao months={months} selected={current.referenceMonth} />
              <NpsDistribuicao current={current} />
            </div>

            <RespostaDoCliente current={current} />
          </>
        )}
      </div>
    </CampaignToolShell>
  );
}

type ChartPoint = { label: string; month: string; score: number };

function EvolucaoTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as ChartPoint;
  return (
    <div className="rounded-lg bg-popover px-2.5 py-1.5 text-xs shadow-lg dark:shadow-none">
      <p className="font-medium text-foreground">Nota {p.score}/10</p>
      <p className="text-text-secondary">{formatReferenceMonth(p.month)}</p>
    </div>
  );
}

function NpsEvolucao({
  months,
  selected,
}: {
  months: CampanhaNpsMonthSummary[];
  selected: string;
}) {
  const data = useMemo<ChartPoint[]>(
    () =>
      months.map((m) => ({
        label: formatReferenceMonth(m.referenceMonth, true),
        month: m.referenceMonth,
        score: m.entry.score,
      })),
    [months],
  );
  return (
    <section className="rounded-xl border border-border/60 bg-background p-4 md:col-span-3">
      <h3 className="text-sm font-semibold text-foreground">Evolução do NPS</h3>
      <p className="text-[11px] text-text-secondary">Nota mensal (0-10) dada pelo cliente</p>
      {data.length >= 2 ? (
        <div className="mt-3 h-44 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ left: -20, right: 8, top: 6, bottom: 0 }}>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "var(--text-secondary)" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={[0, 10]}
                ticks={[0, 2, 4, 6, 8, 10]}
                tick={{ fontSize: 10, fill: "var(--text-secondary)" }}
                axisLine={false}
                tickLine={false}
                width={36}
              />
              <Tooltip content={<EvolucaoTooltip />} />
              <Line
                type="monotone"
                dataKey="score"
                stroke="var(--brand)"
                strokeWidth={2}
                isAnimationActive={false}
                dot={(props: {
                  cx?: number;
                  cy?: number;
                  payload?: ChartPoint;
                  index?: number;
                }) => (
                  <circle
                    key={props.index}
                    cx={props.cx}
                    cy={props.cy}
                    r={props.payload?.month === selected ? 5 : 3}
                    fill="var(--brand)"
                    stroke="var(--background)"
                    strokeWidth={props.payload?.month === selected ? 2 : 0}
                  />
                )}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="mt-3 rounded-lg bg-muted px-3 py-6 text-center text-xs text-text-secondary">
          Histórico insuficiente: só há avaliação de {formatReferenceMonth(data[0].month)}. A
          evolução aparece a partir do segundo mês avaliado.
        </p>
      )}
    </section>
  );
}

function NpsDistribuicao({ current }: { current: CampanhaNpsMonthSummary }) {
  const d = current.cumulative.distribution;
  const rows: { key: NpsCategory; label: string; range: string; n: number }[] = [
    { key: "promotor", label: "Promotores", range: "9-10", n: d.promotores },
    { key: "neutro", label: "Neutros", range: "7-8", n: d.neutros },
    { key: "detrator", label: "Detratores", range: "0-6", n: d.detratores },
  ];
  const period =
    current.cumulative.fromMonth === current.referenceMonth
      ? formatReferenceMonth(current.referenceMonth)
      : `${formatReferenceMonth(current.cumulative.fromMonth, true)} a ${formatReferenceMonth(current.referenceMonth, true)}`;
  return (
    <section className="rounded-xl border border-border/60 bg-background p-4 md:col-span-2">
      <h3 className="text-sm font-semibold text-foreground">Distribuição</h3>
      <p className="text-[11px] text-text-secondary">
        Meses avaliados · {period} (1 avaliação por mês)
      </p>
      <div className="mt-2 flex items-center gap-2 text-xs text-text-secondary">
        Este mês:
        <Badge variant="secondary" className={`border-0 ${CATEGORY_BADGE[current.category]}`}>
          {NPS_CATEGORY_LABEL[current.category]} · nota {current.entry.score}
        </Badge>
      </div>
      <ul className="mt-3 space-y-2.5">
        {rows.map((r) => (
          <li key={r.key}>
            <div className="flex items-baseline justify-between text-xs">
              <span className="font-medium text-foreground">
                {r.label} <span className="font-normal text-text-secondary">({r.range})</span>
              </span>
              <span className="tabular-nums text-text-secondary">
                {r.n} {r.n === 1 ? "mês" : "meses"}
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full ${CATEGORY_BAR[r.key]}`}
                style={{ width: `${d.total ? (r.n / d.total) * 100 : 0}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
      {d.total < MIN_MONTHS_FOR_NPS_INDEX && (
        <p className="mt-3 text-[11px] text-text-secondary">
          O índice NPS (% promotores − % detratores) é calculado a partir de{" "}
          {MIN_MONTHS_FOR_NPS_INDEX} meses avaliados.
        </p>
      )}
    </section>
  );
}

function RespostaDoCliente({ current }: { current: CampanhaNpsMonthSummary }) {
  const e = current.entry;
  const items = [
    { label: "Nota NPS", value: `${e.score}/10` },
    { label: "Satisfação geral", value: NPS_SATISFACTION_LABELS[e.satisfactionScore] ?? "—" },
    { label: "Qualidade das entregas", value: ratingLabel(e.deliveryQuality) },
    { label: "Atendimento", value: ratingLabel(e.communicationRating) },
  ];
  return (
    <section className="rounded-xl border border-border/60 bg-background p-4">
      <h3 className="text-sm font-semibold text-foreground">
        Resposta do cliente · {formatReferenceMonth(current.referenceMonth)}
      </h3>
      <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {items.map((i) => (
          <div key={i.label}>
            <dt className="text-[10px] font-medium uppercase tracking-wide text-text-secondary">
              {i.label}
            </dt>
            <dd className="mt-0.5 text-sm font-semibold text-foreground">{i.value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 rounded-lg bg-muted/60 p-3">
        <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-text-secondary">
          <MessageSquareQuote className="h-3.5 w-3.5" /> Comentário
        </p>
        {e.comment ? (
          <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
            {e.comment}
          </p>
        ) : (
          <p className="mt-1.5 text-sm text-text-secondary">O cliente não deixou comentário.</p>
        )}
      </div>
      <p className="mt-3 text-xs text-text-secondary">
        Respondido por{" "}
        <span className="font-medium text-foreground">
          {e.answeredByName ?? "usuário do portal"}
        </span>{" "}
        em {formatAnsweredAt(e.answeredAt)}
      </p>
    </section>
  );
}
