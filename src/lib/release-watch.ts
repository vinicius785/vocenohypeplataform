import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { APP_VERSION } from "@/lib/app-version";
import { compareSemver, isValidSemver } from "@/lib/semver";
import { mapPlatformReleaseRow, type PlatformRelease } from "@/lib/platform-releases";
import {
  getDismissedVersion,
  getSeenVersion,
  subscribeReleaseSeen,
} from "@/lib/release-seen-store";

/** Fallback de polling — 90s (dentro dos 60-120s pedidos), pausado
 * quando a aba está oculta. O Realtime (`postgres_changes`) é a via
 * primária; o polling cobre o intervalo entre "canal caiu" e "o cliente
 * Supabase reconectou sozinho" (o SDK já reconecta com seu próprio
 * backoff — não precisamos reimplementar isso aqui). */
const POLL_MS = 90_000;

/** Lock leve entre abas — a primeira aba a decidir mostrar o aviso
 * "reivindica" a versão por alguns segundos; as demais, ao verem a
 * reivindicação (via `storage`/`BroadcastChannel`), não mostram a
 * própria cópia. Não é uma trava forte (não precisa ser — é só UX, não
 * segurança), só o suficiente pra "duas abas abertas mostram só um
 * aviso visível" ser verdade na prática. */
const SHOWING_KEY = "vnh:release-showing";
const SHOWING_TTL_MS = 8_000;
const TAB_ID = Math.random().toString(36).slice(2);

function claimShowing(version: string): boolean {
  try {
    const raw = localStorage.getItem(SHOWING_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { version: string; tabId: string; ts: number };
      const fresh = Date.now() - parsed.ts < SHOWING_TTL_MS;
      if (fresh && parsed.version === version && parsed.tabId !== TAB_ID) return false;
    }
    localStorage.setItem(SHOWING_KEY, JSON.stringify({ version, tabId: TAB_ID, ts: Date.now() }));
    return true;
  } catch {
    return true;
  }
}

async function fetchLatestProduction(): Promise<PlatformRelease | null> {
  const { data, error } = await supabase
    .from("platform_releases")
    .select("*")
    .eq("environment", "production")
    .order("released_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return mapPlatformReleaseRow(data);
}

export type ReleaseWatchState = {
  /** Release a mostrar — só quando é realmente mais nova que o bundle
   * atual, ainda não vista/dispensada nesta sessão, e ninguém em outra
   * aba já mostrou. */
  release: PlatformRelease | null;
  userId: string | null;
};

/**
 * Realtime + fallback + dedup entre abas do aviso de nova versão. Usado
 * só por `HypitoReleaseAlert.tsx` (interno) — o Portal do Cliente
 * continua com `VersionWatcher.tsx`/`public/version.json`, intocado.
 */
export function useReleaseWatch(): ReleaseWatchState {
  const [userId, setUserId] = useState<string | null>(null);
  const [latest, setLatest] = useState<PlatformRelease | null>(null);
  const [, forceTick] = useState(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (mountedRef.current) setUserId(data.user?.id ?? null);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const row = await fetchLatestProduction();
      if (!cancelled && row) setLatest(row);
    };
    check();

    // Primário: Realtime.
    const channel = supabase
      .channel("rt-platform-releases")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "platform_releases" },
        (payload) => {
          const row = payload.new as Record<string, unknown> | null;
          if (!row || row.environment !== "production") return;
          setLatest(mapPlatformReleaseRow(row as Parameters<typeof mapPlatformReleaseRow>[0]));
        },
      )
      .subscribe();

    // Fallback: polling, pausado quando a aba está oculta, imediato ao
    // voltar a ficar visível ou ao recuperar conexão.
    let iv: number | null = null;
    const startPolling = () => {
      if (iv) return;
      iv = window.setInterval(() => {
        if (document.visibilityState === "visible") void check();
      }, POLL_MS);
    };
    const stopPolling = () => {
      if (iv) {
        window.clearInterval(iv);
        iv = null;
      }
    };
    startPolling();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void check();
    };
    const onOnline = () => void check();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);

    // Reflete atualizações vindas de outra aba (dedup).
    const unsubSeen = subscribeReleaseSeen(() => forceTick((n) => n + 1));

    return () => {
      cancelled = true;
      stopPolling();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      unsubSeen();
      void supabase.removeChannel(channel);
    };
  }, []);

  const eligible =
    !!latest &&
    isValidSemver(latest.version) &&
    compareSemver(latest.version, APP_VERSION) > 0 &&
    (!userId || getSeenVersion(userId) !== latest.version) &&
    getDismissedVersion() !== latest.version;

  const claimedRef = useRef<{ version: string; won: boolean } | null>(null);
  if (eligible && claimedRef.current?.version !== latest!.version) {
    claimedRef.current = { version: latest!.version, won: claimShowing(latest!.version) };
  }
  const shouldShow = eligible && claimedRef.current?.won === true;

  return { release: shouldShow ? latest : null, userId };
}
