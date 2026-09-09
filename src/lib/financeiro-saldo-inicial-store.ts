import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Saldo inicial do caixa — mesmo padrão singleton de `workspace-store.ts`/
 * pricing_settings. `null` (não `undefined`) significa "nunca configurado":
 * a UI do Financeiro nunca deve inventar um "Saldo atual" sem isso. */
export type SaldoInicialConfig = { valor: number; data: string } | null;

const KEY = "config:financeiro-saldo-inicial";
export const SALDO_INICIAL_EVENT = "financeiro:saldo-inicial:changed";

export function loadSaldoInicial(): SaldoInicialConfig {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SaldoInicialConfig) : null;
  } catch {
    return null;
  }
}

function writeCache(v: SaldoInicialConfig) {
  if (typeof window === "undefined") return;
  if (v) localStorage.setItem(KEY, JSON.stringify(v));
  else localStorage.removeItem(KEY);
  window.dispatchEvent(new CustomEvent(SALDO_INICIAL_EVENT));
}

export async function fetchSaldoInicial(): Promise<SaldoInicialConfig> {
  const { data, error } = await supabase
    .from("financeiro_settings")
    .select("saldo_inicial, saldo_inicial_data")
    .eq("id", true)
    .maybeSingle();
  if (error || !data || data.saldo_inicial == null || !data.saldo_inicial_data) {
    writeCache(null);
    return null;
  }
  const v: SaldoInicialConfig = { valor: data.saldo_inicial, data: data.saldo_inicial_data };
  writeCache(v);
  return v;
}

export async function saveSaldoInicial(v: { valor: number; data: string }): Promise<{
  error?: string;
}> {
  const { error } = await supabase
    .from("financeiro_settings")
    .update({ saldo_inicial: v.valor, saldo_inicial_data: v.data })
    .eq("id", true);
  if (error) return { error: error.message };
  writeCache(v);
  return {};
}

let realtimeStarted = false;
export function initFinanceiroSaldoInicialSync() {
  if (realtimeStarted) return;
  realtimeStarted = true;
  void fetchSaldoInicial();
  supabase
    .channel("financeiro_settings_changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "financeiro_settings" }, () => {
      void fetchSaldoInicial();
    })
    .subscribe();
}

export function subscribeSaldoInicial(cb: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) cb();
  };
  const onCustom = () => cb();
  window.addEventListener("storage", onStorage);
  window.addEventListener(SALDO_INICIAL_EVENT, onCustom);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(SALDO_INICIAL_EVENT, onCustom);
  };
}

/** Hook de conveniência — mesmo padrão usado pra outros singletons de
 * config no app. */
export function useSaldoInicial(): SaldoInicialConfig {
  const [value, setValue] = useState<SaldoInicialConfig>(() => loadSaldoInicial());
  useEffect(() => {
    initFinanceiroSaldoInicialSync();
    return subscribeSaldoInicial(() => setValue(loadSaldoInicial()));
  }, []);
  return value;
}
