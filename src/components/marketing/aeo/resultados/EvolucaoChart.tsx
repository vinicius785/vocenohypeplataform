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
import { inputCls, fmtDate } from "../aeo-ui-utils";

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
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Evolução da visibilidade
        </h3>
        <select
          value={filtro}
          onChange={(e) => setFiltro(e.target.value as AeoIa | "Geral")}
          className={inputCls}
        >
          <option value="Geral">Geral</option>
          {AEO_IAS.map((ia) => (
            <option key={ia} value={ia}>
              {ia}
            </option>
          ))}
        </select>
      </div>
      {data.length < 2 ? (
        <p className="mt-4 text-xs text-muted-foreground">
          Ainda não há rodadas suficientes pra mostrar uma tendência.
        </p>
      ) : (
        <div className="mt-3 h-64">
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
              <Tooltip />
              <Line
                type="monotone"
                dataKey="pct"
                name={filtro}
                stroke="var(--chart-1)"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
