import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  barWidth,
  formatShare,
  hasAudienceData,
  toDistribution,
  type AudienceData,
  type DistributionInput,
} from "@/lib/audience-distribution";

/**
 * Apresentação de AUDIÊNCIA do influenciador — componente de domínio ÚNICO, usado pelo Portal do
 * Time (editor do influenciador) e pelo Portal do Cliente (novo e legado). Só apresentação: o dado
 * e a permissão continuam de cada portal; aqui entra apenas o que ele já tem.
 *
 * Em vez de mini-gráficos (donut/barras recharts) comprimidos, são listas ordenadas com barra
 * horizontal simples: o NÚMERO é o protagonista, a barra é só apoio de comparação. Cores sóbrias
 * (neutro do Design System) — nada de rosa/azul por gênero. Responsivo ao contêiner (`@container`),
 * então funciona igual num drawer estreito e numa página larga.
 */
export type AudienceLabels = {
  audience: string;
  gender: string;
  age: string;
  location: string;
  countries: string;
  cities: string;
  empty: string;
};

export const AUDIENCE_LABELS_PT: AudienceLabels = {
  audience: "Audiência",
  gender: "Gênero",
  age: "Faixa etária",
  location: "Localização",
  countries: "Principais países",
  cities: "Principais cidades",
  empty: "Sem dados de audiência cadastrados.",
};

const kicker = "text-[11px] font-semibold uppercase tracking-wide text-text-secondary";

/** Lista ordenada com barra horizontal. `null` quando não há nenhuma entrada válida. */
export function DistributionBars({
  title,
  entries,
  scale = "share",
  limit,
  level = "section",
}: {
  title: string;
  entries?: readonly DistributionInput[] | null;
  scale?: "share" | "relative";
  limit?: number;
  level?: "section" | "sub";
}) {
  const { items, hidden } = toDistribution(entries, limit);
  if (items.length === 0) return null;
  const max = items[0].percent;
  return (
    <section aria-label={title} className="min-w-0">
      <h4 className={level === "sub" ? "text-xs font-medium text-foreground" : kicker}>{title}</h4>
      <ul className="mt-2 space-y-2.5">
        {items.map((item, i) => (
          <li
            key={item.label}
            className="group"
            title={`${item.label}: ${formatShare(item.percent)} da audiência`}
          >
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-foreground">{item.label}</span>
              <span className="shrink-0 font-medium tabular-nums text-foreground">
                {formatShare(item.percent)}
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <div
                className={cn(
                  "h-full rounded-full transition-colors",
                  i === 0
                    ? "bg-foreground/80 group-hover:bg-foreground"
                    : "bg-foreground/35 group-hover:bg-foreground/60",
                )}
                style={{ width: `${barWidth(item.percent, max, scale)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
      {hidden > 0 && <p className="mt-2 text-xs text-text-secondary">+ {hidden} outros</p>}
    </section>
  );
}

/** Bloco completo: cabeçalho (rede · seguidores) + Gênero → Faixa etária → Localização. */
export function AudienceInsights({
  network,
  followers,
  data,
  labels = AUDIENCE_LABELS_PT,
  headerExtra,
  className,
}: {
  /** Nome da rede (ex.: "Instagram"). */
  network?: string;
  /** Texto de seguidores já formatado (ex.: "92.700 seguidores"). */
  followers?: string;
  data: AudienceData;
  labels?: AudienceLabels;
  headerExtra?: ReactNode;
  className?: string;
}) {
  const hasLocation =
    toDistribution(data.paises).items.length > 0 || toDistribution(data.cidades).items.length > 0;
  return (
    <div className={cn("@container space-y-5", className)}>
      <header className="space-y-0.5">
        <p className={kicker}>{labels.audience}</p>
        {(network || followers) && (
          <p className="text-sm text-foreground">
            {[network, followers].filter(Boolean).join(" · ")}
          </p>
        )}
        {headerExtra}
      </header>

      {!hasAudienceData(data) ? (
        <p className="text-sm text-text-secondary">{labels.empty}</p>
      ) : (
        <>
          <DistributionBars title={labels.gender} entries={data.genero} scale="share" />
          <DistributionBars title={labels.age} entries={data.faixaEtaria} scale="share" />
          {hasLocation && (
            <section aria-label={labels.location} className="space-y-3">
              <h4 className={kicker}>{labels.location}</h4>
              <div className="grid gap-5 @md:grid-cols-2">
                <DistributionBars
                  title={labels.countries}
                  entries={data.paises}
                  scale="relative"
                  limit={5}
                  level="sub"
                />
                <DistributionBars
                  title={labels.cities}
                  entries={data.cidades}
                  scale="relative"
                  limit={6}
                  level="sub"
                />
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
