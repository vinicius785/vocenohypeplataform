import { WEATHER_LOCATION } from "@/lib/weather-location";

/** Serviço climático — item 3 do pedido. Open-Meteo é usado porque não
 * exige chave/segredo pro endpoint de "current weather", então, seguindo
 * a instrução explícita do pedido ("se o provedor não exigir segredo...
 * centralizar a chamada em um serviço próprio do frontend"), a consulta
 * fica aqui, num serviço só (nunca inline num componente de
 * apresentação), em vez de passar por uma server function como as
 * integrações que exigem segredo (`google-calendar.functions.ts`). Só os
 * campos realmente usados pela Home são pedidos. */

const ENDPOINT = "https://api.open-meteo.com/v1/forecast";
const TIMEOUT_MS = 6000;

export type RawWeather = {
  temperatureC: number;
  apparentTemperatureC: number | null;
  weatherCode: number;
  precipitationMm: number;
  rainMm: number;
  cloudCoverPct: number | null;
  isDay: boolean;
  observedAt: string;
};

function buildUrl(): string {
  const params = new URLSearchParams({
    latitude: String(WEATHER_LOCATION.latitude),
    longitude: String(WEATHER_LOCATION.longitude),
    current: [
      "temperature_2m",
      "apparent_temperature",
      "precipitation",
      "rain",
      "weather_code",
      "cloud_cover",
      "is_day",
    ].join(","),
    timezone: WEATHER_LOCATION.timezone,
  });
  return `${ENDPOINT}?${params.toString()}`;
}

function isValidPayload(json: unknown): json is { current: Record<string, unknown> } {
  if (!json || typeof json !== "object") return false;
  const current = (json as Record<string, unknown>).current;
  if (!current || typeof current !== "object") return false;
  const c = current as Record<string, unknown>;
  return typeof c.temperature_2m === "number" && typeof c.weather_code === "number";
}

/** Busca o clima atual de Itaim Bibi. Nunca lança — falha de rede,
 * timeout ou resposta inválida sempre resolvem `null`, pra quem chama
 * decidir o fallback (item 3/4: "tratar indisponibilidade e respostas
 * inválidas", "não exibir erro técnico pro usuário"). */
export async function fetchWeather(): Promise<RawWeather | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(buildUrl(), { signal: controller.signal });
    if (!res.ok) return null;
    const json: unknown = await res.json();
    if (!isValidPayload(json)) return null;
    const c = json.current;
    return {
      temperatureC: c.temperature_2m as number,
      apparentTemperatureC:
        typeof c.apparent_temperature === "number" ? c.apparent_temperature : null,
      weatherCode: c.weather_code as number,
      precipitationMm: typeof c.precipitation === "number" ? c.precipitation : 0,
      rainMm: typeof c.rain === "number" ? c.rain : 0,
      cloudCoverPct: typeof c.cloud_cover === "number" ? c.cloud_cover : null,
      isDay: c.is_day === 1 || c.is_day === true,
      observedAt: typeof c.time === "string" ? c.time : new Date().toISOString(),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
