import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import {
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";
import type { MetaAtualizacao } from "@/lib/metas-store";
import { formatIndicadorValor } from "./metas-ui-utils";

type ChartPoint = { label: string; valor: number };

function HistoricoTooltip({
  active,
  payload,
  tipo,
  unidade,
}: TooltipProps<number, string> & {
  tipo: "numero" | "percentual" | "moeda" | "min" | "max" | "binario" | "marco" | "manual";
  unidade?: string;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload as ChartPoint;
  return (
    <div className="rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md">
      <p className="font-medium text-foreground">
        {formatIndicadorValor(tipo, point.valor, unidade)}
      </p>
      <p className="text-muted-foreground">{point.label}</p>
    </div>
  );
}

/** Lista colapsável de atualizações manuais de um indicador, com um mini
 * gráfico de evolução (recharts) por cima quando há histórico numérico
 * suficiente (≥2 pontos) — sem gráfico permanente em todo card, só aqui,
 * dentro do mesmo toggle que já existia. Meta esperada, quando definida,
 * aparece como linha de referência. */
export function IndicadorHistorico({
  atualizacoes,
  tipo,
  unidade,
  metaEsperada,
}: {
  atualizacoes: MetaAtualizacao[];
  tipo?: "numero" | "percentual" | "moeda" | "min" | "max" | "binario" | "marco" | "manual";
  unidade?: string;
  metaEsperada?: number;
}) {
  const [open, setOpen] = useState(false);
  const chartData = useMemo<ChartPoint[]>(
    () =>
      atualizacoes
        .filter((a): a is MetaAtualizacao & { valor: number } => a.valor != null)
        .map((a) => ({
          label: new Date(a.createdAt).toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "short",
          }),
          valor: a.valor,
        })),
    [atualizacoes],
  );

  if (atualizacoes.length === 0) return null;

  return (
    <div className="border-t border-border px-6 py-3 sm:px-7">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
      >
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {atualizacoes.length} atualizaç{atualizacoes.length === 1 ? "ão" : "ões"}
      </button>
      {open && (
        <>
          {chartData.length >= 2 && tipo && (
            <div className="mt-3 h-32 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ left: -20, right: 8, top: 4, bottom: 0 }}>
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                    width={36}
                  />
                  <Tooltip content={<HistoricoTooltip tipo={tipo} unidade={unidade} />} />
                  {metaEsperada != null && (
                    <ReferenceLine
                      y={metaEsperada}
                      stroke="var(--muted-foreground)"
                      strokeDasharray="3 3"
                    />
                  )}
                  <Line
                    type="monotone"
                    dataKey="valor"
                    stroke="var(--chart-1)"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          <ul className="mt-2 space-y-1.5">
            {[...atualizacoes].reverse().map((a) => (
              <li key={a.id} className="flex items-start gap-2 text-xs">
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-muted text-[8px] font-semibold text-foreground">
                  {a.initials}
                </span>
                <div className="min-w-0 flex-1">
                  <span className="text-foreground">
                    {a.author}
                    {a.valor !== undefined
                      ? ` atualizou para ${a.valor.toLocaleString("pt-BR")}`
                      : ""}
                    {a.nota ? ` — ${a.nota}` : ""}
                  </span>
                  <span className="ml-1.5 text-muted-foreground">
                    {new Date(a.createdAt).toLocaleDateString("pt-BR")}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
