import { fetchWeather, type RawWeather } from "@/lib/weather-service";
import { normalizeWeatherCode, type WeatherCondition } from "@/lib/weather-condition";

/** Cache local com TTL + stale-while-revalidate (item 4 do pedido) —
 * mesmo padrão de evento próprio + `storage` já usado em
 * `notif-prefs.ts`/`focus-mode-store.ts` pra reatividade na mesma aba e
 * entre abas. Nenhum outro módulo deve ler `localStorage` do clima
 * diretamente — sempre por aqui. */

export type WeatherSnapshot = {
  temperatureC: number;
  apparentTemperatureC: number | null;
  condition: WeatherCondition;
  isDay: boolean;
  observedAt: string;
};

type CacheEntry = { data: WeatherSnapshot; fetchedAt: number };

const CACHE_KEY = "inicio.weather.cache.v1";
const EVENT = "weather:changed";
/** 25 min — dentro da faixa pedida (20-30 min). */
const TTL_MS = 25 * 60_000;

function toSnapshot(raw: RawWeather): WeatherSnapshot {
  return {
    temperatureC: raw.temperatureC,
    apparentTemperatureC: raw.apparentTemperatureC,
    condition: normalizeWeatherCode(raw.weatherCode),
    isDay: raw.isDay,
    observedAt: raw.observedAt,
  };
}

function loadEntry(): CacheEntry | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CacheEntry>;
    if (!parsed?.data || typeof parsed.fetchedAt !== "number") return null;
    return parsed as CacheEntry;
  } catch {
    return null;
  }
}

function saveEntry(entry: CacheEntry) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
    /* ignore — cache é só otimização, nunca crítico */
  }
  window.dispatchEvent(new CustomEvent(EVENT));
}

function isFresh(entry: CacheEntry | null): boolean {
  return !!entry && Date.now() - entry.fetchedAt < TTL_MS;
}

export function getCachedWeather(): WeatherSnapshot | null {
  return loadEntry()?.data ?? null;
}

export function subscribeWeather(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

let inFlight: Promise<void> | null = null;

/** Garante que o clima em cache está fresco, revalidando em segundo
 * plano quando ausente ou vencido. Chamadas concorrentes compartilham a
 * mesma promessa (item 4: "não disparar várias requisições
 * simultâneas"); se a consulta falhar, o cache anterior é preservado tal
 * qual (item 4: "preservar o último resultado válido se a atualização
 * falhar") — nunca grava um valor inventado. */
export function ensureWeatherFresh(): Promise<void> {
  if (isFresh(loadEntry())) return Promise.resolve();
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const raw = await fetchWeather();
    if (raw) saveEntry({ data: toSnapshot(raw), fetchedAt: Date.now() });
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}
