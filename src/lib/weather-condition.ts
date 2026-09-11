/** Camada de normalização — independente do provedor (item 5 do pedido:
 * "não espalhar códigos numéricos do provedor pelos componentes
 * visuais"). Traduz o `weather_code` (WMO) do Open-Meteo pra um conjunto
 * fechado de condições que o resto do app conhece; se algum dia o
 * provedor mudar, só esta função precisa mudar. */
export type WeatherCondition =
  | "clear"
  | "partly-cloudy"
  | "cloudy"
  | "fog"
  | "drizzle"
  | "rain"
  | "heavy-rain"
  | "thunderstorm"
  | "snow"
  | "unknown";

/** Tabela de códigos WMO (usada pelo Open-Meteo) — ver
 * https://open-meteo.com/en/docs (seção "WMO Weather interpretation
 * codes"). */
export function normalizeWeatherCode(code: number): WeatherCondition {
  if (code === 0 || code === 1) return "clear";
  if (code === 2) return "partly-cloudy";
  if (code === 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if ([51, 53, 55, 56, 57].includes(code)) return "drizzle";
  if ([61, 63, 66, 80, 81].includes(code)) return "rain";
  if ([65, 67, 82].includes(code)) return "heavy-rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "snow";
  if ([95, 96, 99].includes(code)) return "thunderstorm";
  return "unknown";
}

/** Rótulo em português pra exibição na saudação — "unknown" nunca
 * aparece como texto (item 7: "não mostrar undefined/NaN/código
 * numérico ou texto técnico"), quem consome isso já trata `null`. */
export const WEATHER_CONDITION_LABEL_PT: Record<WeatherCondition, string | null> = {
  clear: "Céu limpo",
  "partly-cloudy": "Parcialmente nublado",
  cloudy: "Nublado",
  fog: "Neblina",
  drizzle: "Garoa",
  rain: "Chuva",
  "heavy-rain": "Chuva forte",
  thunderstorm: "Tempestade",
  snow: "Neve",
  unknown: null,
};

/** Grupos usados só pela camada visual (item 5) — cada grupo tem sua
 * própria ambientação; "unknown" cai fora de todos (fundo neutro, sem
 * animação). */
export function hasPrecipitationEffect(
  condition: WeatherCondition,
): condition is "drizzle" | "rain" | "heavy-rain" | "thunderstorm" {
  return (
    condition === "drizzle" ||
    condition === "rain" ||
    condition === "heavy-rain" ||
    condition === "thunderstorm"
  );
}
