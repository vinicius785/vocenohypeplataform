import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";

/**
 * Gráfico somente-leitura de uma distribuição demográfica (gênero/faixa
 * etária/país/cidade) — extraído de `InfluencerBoard.tsx` (onde nasceu,
 * pro editor interno de métricas de perfil) pra ser a MESMA peça visual
 * usada também no Portal do Cliente (`ClientInfluencerMetrics.tsx`):
 * antes disso, o Portal simplesmente nunca renderizava esses 4 campos
 * (eles já chegavam intactos até o componente — bug de omissão de
 * frontend, não de dado/permissão), então não existia nenhum
 * equivalente "resumo" a reaproveitar de lá. Shape de entrada genérico
 * (`{id,label,percentual}`) pra não acoplar este módulo compartilhado ao
 * tipo `DemographicEntry` de nenhum dos dois lados (interno vs portal já
 * têm cada um o seu, estruturalmente idênticos).
 */
export type DemographicEntryLike = { id: string; label: string; percentual: number };

/** Paleta fixa (mesmas cores do design system, `--chart-1..5`) usada nos
 * gráficos de pizza — arrays maiores repetem o ciclo. */
const PIE_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

/** Rótulo com a % fora da fatia, ligado por uma linha — padrão recharts
 * pra pizza/donut (a prop `label` não aceita texto customizado sem isso). */
function renderPieLabel(props: {
  cx: number;
  cy: number;
  midAngle: number;
  outerRadius: number;
  valor: number;
}) {
  const { cx, cy, midAngle, outerRadius, valor } = props;
  const RADIAN = Math.PI / 180;
  const radius = outerRadius + 16;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text
      x={x}
      y={y}
      fill="var(--muted-foreground)"
      fontSize={10}
      textAnchor={x > cx ? "start" : "end"}
      dominantBaseline="central"
    >
      {`${valor}%`}
    </text>
  );
}

/** Gráfico de barra (horizontal) ou pizza pra uma lista `{ name, valor }%` —
 * usado tanto no editor interno quanto no resumo somente-leitura (interno
 * e Portal do Cliente). */
export function DemographicMiniChart({
  data,
  chartType,
}: {
  data: { name: string; valor: number }[];
  chartType: "bar" | "pie";
}) {
  if (data.length === 0) return null;
  if (chartType === "pie") {
    return (
      <div className="h-[150px] w-full pt-1">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="valor"
              nameKey="name"
              innerRadius="42%"
              outerRadius="72%"
              isAnimationActive={false}
              label={renderPieLabel}
              labelLine={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }}
            >
              {data.map((entry, i) => (
                <Cell key={entry.name} fill={PIE_COLORS[i % PIE_COLORS.length]} />
              ))}
            </Pie>
            <Legend
              layout="vertical"
              verticalAlign="middle"
              align="right"
              formatter={(value, entry) =>
                `${value} — ${(entry as { payload?: { valor?: number } }).payload?.valor ?? 0}%`
              }
              wrapperStyle={{ fontSize: 10, color: "var(--muted-foreground)" }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  }
  return (
    <div className="h-[100px] w-full pt-1">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 0, right: 28 }}>
          <CartesianGrid horizontal={false} strokeOpacity={0.15} />
          <XAxis type="number" domain={[0, 100]} hide />
          <YAxis
            type="category"
            dataKey="name"
            width={90}
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            axisLine={false}
            tickLine={false}
          />
          <Bar
            dataKey="valor"
            fill="var(--foreground)"
            radius={3}
            barSize={12}
            isAnimationActive={false}
          >
            <LabelList
              dataKey="valor"
              position="right"
              formatter={(v: number) => `${v}%`}
              style={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Gráfico (barra ou pizza) somente-leitura para uma distribuição
 * demográfica, com título — usado no resumo do perfil (interno, fora do
 * modo de edição) e no Portal do Cliente. `null` quando não há nenhuma
 * fatia com label+percentual preenchidos (nunca um gráfico vazio/0%
 * fingindo dado real — ver critério de estado vazio do pedido). */
export function DemographicChart({
  title,
  entries,
  chartType = "bar",
}: {
  title: string;
  entries?: DemographicEntryLike[];
  chartType?: "bar" | "pie";
}) {
  const data = (entries ?? [])
    .filter((e) => e.label.trim() && e.percentual > 0)
    .map((e) => ({ name: e.label, valor: e.percentual }))
    .sort((a, b) => b.valor - a.valor);
  if (data.length === 0) return null;
  return (
    <div>
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <DemographicMiniChart data={data} chartType={chartType} />
    </div>
  );
}
