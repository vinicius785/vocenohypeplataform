import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AEO_IAS, type AeoIa, type AeoResposta, type AeoRodada } from "@/lib/aeo-store";
import { serieEvolucao } from "@/lib/aeo-engine";
import { fmtDate } from "../aeo-ui-utils";
import { NativeSelect } from "@/components/ui/native-select";

export function EvolucaoChart({
  rodadas,
  respostas,
}: {
  rodadas: AeoRodada[];
  respostas: AeoResposta[];
}) {
  const [filtro, setFiltro] = useState<AeoIa | "Geral">("Geral");
  const serie = useMemo(
    () => serieEvolucao(rodadas, respostas, filtro),
    [rodadas, respostas, filtro],
  );
  const data = serie.map((s) => ({ label: fmtDate(s.label), pct: s.pct }));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-text-secondary">
          Evolução da visibilidade
        </h3>
        <NativeSelect
          value={filtro}
          onChange={(e) => setFiltro(e.target.value as AeoIa | "Geral")}
          aria-label="Evolução por IA"
          size="sm"
        >
          <option value="Geral">Todas as IAs</option>
          {AEO_IAS.map((ia) => (
            <option key={ia} value={ia}>
              {ia}
            </option>
          ))}
        </NativeSelect>
      </div>
      {data.length < 2 ? (
        <p className="mt-3 text-sm text-text-secondary">
          Ainda não há rodadas suficientes para mostrar uma tendência.
        </p>
      ) : (
        <div className="mt-3 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
              <YAxis
                tick={{ fontSize: 11 }}
                stroke="var(--muted-foreground)"
                domain={[0, 100]}
                unit="%"
              />
              <Tooltip
                cursor={{ stroke: "var(--border)" }}
                content={({ active, payload, label }) =>
                  active && payload?.length ? (
                    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
                      <p className="text-text-secondary">Rodada {label}</p>
                      <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
                        {payload[0].value}%{" "}
                        <span className="font-normal text-text-secondary">de visibilidade</span>
                      </p>
                    </div>
                  ) : null
                }
              />
              <Line
                type="monotone"
                dataKey="pct"
                name={filtro === "Geral" ? "Todas as IAs" : filtro}
                stroke="var(--chart-1)"
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
