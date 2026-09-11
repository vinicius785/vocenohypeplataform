import { useState } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { TYPOGRAPHY } from "@/lib/design-tokens";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { EmptyState } from "@/components/shared/EmptyState";
import { SkeletonMetric } from "@/components/shared/SkeletonPatterns";

const DATA = [
  { mes: "Jan", valor: 12 },
  { mes: "Fev", valor: 18 },
  { mes: "Mar", valor: 15 },
  { mes: "Abr", valor: 24 },
  { mes: "Mai", valor: 21 },
  { mes: "Jun", valor: 30 },
];

const chartConfig: ChartConfig = {
  valor: { label: "Valor", color: "var(--brand)" },
};

export function ChartSection() {
  const [state, setState] = useState<"dados" | "vazio" | "carregando">("dados");

  return (
    <section id="grafico" className="space-y-4">
      <h2 className={TYPOGRAPHY.sectionTitle}>Gráfico</h2>
      <p className={TYPOGRAPHY.bodySecondary}>
        Estrutura sobre `ui/chart.tsx` (shadcn, já existente, não alterado) — usa `#6F95FF` como cor
        principal; cor semântica só quando o dado tem significado de estado (não é o caso aqui).
      </p>
      <div className="flex gap-1">
        {(["dados", "vazio", "carregando"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setState(s)}
            className={`rounded-md px-2.5 py-1 text-xs ${state === s ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            {s}
          </button>
        ))}
      </div>
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="mb-3">
          <p className={TYPOGRAPHY.cardTitle}>Novos leads por mês</p>
          <p className={TYPOGRAPHY.caption}>Últimos 6 meses</p>
        </div>
        {state === "carregando" && <SkeletonMetric />}
        {state === "vazio" && <EmptyState compact title="Sem dados no período" />}
        {state === "dados" && (
          <ChartContainer config={chartConfig} className="h-52 w-full">
            <LineChart data={DATA} margin={{ left: 0, right: 8, top: 4 }}>
              <CartesianGrid vertical={false} strokeOpacity={0.15} />
              <XAxis dataKey="mes" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} width={32} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line
                type="linear"
                dataKey="valor"
                stroke="var(--color-valor)"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ChartContainer>
        )}
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="h-2 w-2 rounded-full" style={{ background: "var(--brand)" }} />
          Novos leads
        </div>
      </div>
    </section>
  );
}
