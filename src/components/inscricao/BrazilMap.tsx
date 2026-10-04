import { BR_MAP_TRANSFORM, BR_MAP_VIEWBOX, BR_STATE_PATHS } from "@/lib/br-map-data";
import { UF_NAMES } from "@/lib/campanha-localidades";

/** Mapa do Brasil por estados (malha do IBGE) com os estados da campanha em destaque: base neutra,
 * seleção na cor de destaque da plataforma. Só mostra o que os dados dizem — a precisão é a do
 * ESTADO; o texto ao lado (lista de localidades) é a informação completa e acessível. Carregado
 * sob demanda (`React.lazy`) para não pesar no primeiro carregamento da página. */
export default function BrazilMap({ states, label }: { states: string[]; label: string }) {
  const selected = new Set(states);
  return (
    <svg
      viewBox={BR_MAP_VIEWBOX}
      role="img"
      aria-label={label}
      className="h-auto w-full max-w-sm"
      preserveAspectRatio="xMidYMid meet"
    >
      <g transform={BR_MAP_TRANSFORM}>
        {Object.entries(BR_STATE_PATHS).map(([uf, d]) => {
          const on = selected.has(uf);
          return (
            <path
              key={uf}
              d={d}
              vectorEffect="non-scaling-stroke"
              strokeWidth={1}
              className={`stroke-background transition-colors duration-200 ${
                on ? "fill-brand" : "fill-muted"
              } ${on ? "hover:opacity-85" : ""}`}
            >
              {on && <title>{UF_NAMES[uf]}</title>}
            </path>
          );
        })}
      </g>
    </svg>
  );
}
