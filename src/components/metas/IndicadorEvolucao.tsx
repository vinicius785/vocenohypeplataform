import { useMemo } from "react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";
import type { MetaAtualizacao } from "@/lib/metas-store";
import { formatIndicadorValor } from "./metas-ui-utils";

type ChartPoint = { label: string; valor: number };
type Tipo = "numero" | "percentual" | "moeda" | "min" | "max" | "binario" | "marco" | "manual";

function EvolucaoTooltip({
  active,
  payload,
  tipo,
  unidade,
}: TooltipProps<number, string> & { tipo: Tipo; unidade?: string }) {
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

/** Seção "Evolução" — SEMPRE visível (não atrás de nenhum toggle),
 * diferente do histórico textual. Indicador não tem meta global (seção
 * 25 do pedido), então nunca desenha linha de referência aqui — target
 * é sempre por vínculo, mostrado só na tabela de objetivos vinculados.
 * Nunca desenha gráfico vazio: com 0 ou 1 ponto, mostra uma mensagem em
 * vez de um gráfico sem sentido. */
export function IndicadorEvolucao({
  atualizacoes,
  tipo,
  unidade,
}: {
  atualizacoes: MetaAtualizacao[];
  tipo: Tipo;
  unidade?: string;
}) {
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

  return (
    <div className="mt-9">
      <h2 className="text-sm font-semibold text-foreground">Evolução</h2>
      {chartData.length >= 2 ? (
        <div className="mt-3 h-40 w-full">
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
              <Tooltip content={<EvolucaoTooltip tipo={tipo} unidade={unidade} />} />
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
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          {chartData.length === 0
            ? "Nenhuma atualização ainda."
            : "Este indicador ainda não possui histórico suficiente para mostrar uma tendência."}
        </p>
      )}
    </div>
  );
}
