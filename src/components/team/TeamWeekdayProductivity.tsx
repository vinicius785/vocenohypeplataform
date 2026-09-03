import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";
import { WEEKDAY_PERIOD_OPTIONS, type WeekdayBucket, type WeekdayPeriodMode } from "@/lib/score";

function ProductivityTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as WeekdayBucket;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold text-foreground">{row.label}-feira</p>
      <p className="text-foreground">
        Média: {row.average == null ? "—" : row.average.toFixed(1).replace(".", ",")} entregas
      </p>
      <p className="text-muted-foreground">Total: {row.totalCompletions} entregas</p>
      <p className="text-muted-foreground">
        {row.occurrences} {row.label.toLowerCase()}
        {row.occurrences === 1 ? "" : "s"} analisada{row.occurrences === 1 ? "" : "s"}
      </p>
    </div>
  );
}

/** Tabela "quantidade exata por membro" — só faz sentido no recorte
 * "Esta semana" (pedido explícito): nos demais recortes (30/90 dias,
 * ano) uma tabela pessoa×dia teria dezenas de ocorrências do mesmo dia
 * da semana misturadas numa única contagem, e ficaria grande/confusa —
 * o gráfico de média já serve pra esses recortes mais longos. */
function ByMemberTable({ data }: { data: WeekdayBucket[] }) {
  const names = Array.from(new Set(data.flatMap((d) => d.byMember.map((m) => m.name)))).sort(
    (a, b) => a.localeCompare(b, "pt-BR"),
  );
  if (names.length === 0) return null;
  const countFor = (name: string, bucket: WeekdayBucket) =>
    bucket.byMember.find((m) => m.name === name)?.count ?? 0;

  return (
    <div className="mt-4 overflow-x-auto border-t border-border pt-3">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="pb-1.5 pr-2 font-medium">Membro</th>
            {data.map((d) => (
              <th key={d.weekday} className="px-1.5 pb-1.5 text-center font-medium">
                {d.label.slice(0, 3).toUpperCase()}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {names.map((name) => (
            <tr key={name} className="border-t border-border/60">
              <td className="max-w-[9rem] truncate py-1.5 pr-2 text-foreground">{name}</td>
              {data.map((d) => {
                const count = countFor(name, d);
                return (
                  <td
                    key={d.weekday}
                    className={`px-1.5 py-1.5 text-center tabular-nums ${count > 0 ? "text-foreground" : "text-muted-foreground/40"}`}
                  >
                    {count > 0 ? count : "–"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** "Produtividade por dia da semana" — substitui "Entregas por semana".
 * Mostra a MÉDIA de entregas por ocorrência de cada dia (seg-sex) no
 * período, não o total bruto (evita distorção quando o período cobre
 * números diferentes de cada dia da semana). Sábado/domingo omitidos
 * por completo (não cinza/desabilitados) — não fazem parte do escopo
 * desta métrica ainda. Na "Esta semana", uma tabela "quantidade exata
 * por membro" complementa o gráfico (pedido explícito). */
export function TeamWeekdayProductivity({
  data,
  period,
  onPeriodChange,
}: {
  data: WeekdayBucket[];
  period: WeekdayPeriodMode;
  onPeriodChange: (v: WeekdayPeriodMode) => void;
}) {
  const hasAnyData = data.some((d) => d.totalCompletions > 0);

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Produtividade por dia da semana
        </h3>
        <select
          value={period}
          onChange={(e) => onPeriodChange(e.target.value as WeekdayPeriodMode)}
          className="h-8 rounded-md border border-border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
        >
          {WEEKDAY_PERIOD_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      {!hasAnyData ? (
        <p className="flex h-48 items-center justify-center text-center text-sm text-muted-foreground">
          Nenhuma entrega registrada nesse período.
        </p>
      ) : (
        <div className="mt-3 h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ left: 0, right: 8, top: 4 }}>
              <CartesianGrid vertical={false} strokeOpacity={0.15} stroke="var(--border)" />
              <XAxis
                dataKey="label"
                tickFormatter={(v: string) => v.slice(0, 3).toUpperCase()}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                axisLine={false}
                tickLine={false}
                width={28}
              />
              <Tooltip content={<ProductivityTooltip />} cursor={{ fill: "var(--muted)" }} />
              <Bar
                dataKey="average"
                fill="var(--chart-1)"
                radius={[4, 4, 0, 0]}
                barSize={40}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      {period === "semana" && <ByMemberTable data={data} />}
    </div>
  );
}
