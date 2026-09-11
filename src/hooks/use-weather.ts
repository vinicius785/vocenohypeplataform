import { useCallback, useEffect, useState } from "react";
import {
  getCachedWeather,
  ensureWeatherFresh,
  subscribeWeather,
  type WeatherSnapshot,
} from "@/lib/weather-cache";

/** Hook único que a Home consome — nunca acessa o serviço/cache
 * diretamente (item 16: "não colocar requisições diretamente dentro de
 * componentes de apresentação"). Pinta o último clima em cache
 * imediatamente (se houver) e dispara revalidação em segundo plano sem
 * bloquear o render (item 3: "não bloquear a renderização da Home
 * aguardando o clima"). Quando `enabled` é `false` (preferência
 * desligada), não busca nem mantém nenhum estado de clima. */
export function useWeather(enabled: boolean): { weather: WeatherSnapshot | null } {
  const [weather, setWeather] = useState<WeatherSnapshot | null>(() =>
    enabled ? getCachedWeather() : null,
  );

  const sync = useCallback(() => setWeather(getCachedWeather()), []);

  useEffect(() => {
    if (!enabled) {
      setWeather(null);
      return;
    }
    sync();
    return subscribeWeather(sync);
  }, [enabled, sync]);

  useEffect(() => {
    if (!enabled) return;
    void ensureWeatherFresh();
  }, [enabled]);

  return { weather };
}
