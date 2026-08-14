import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_PERCENTUAIS,
  EMPTY_CUSTOS,
  type CustoTierFormato,
  type PricingPercentuais,
} from "./pricing";

export type PricingSettings = {
  percentuais: PricingPercentuais;
  custos: CustoTierFormato;
};

const KEY = "config:pricing";
const DEFAULT: PricingSettings = { percentuais: DEFAULT_PERCENTUAIS, custos: EMPTY_CUSTOS };
export const PRICING_EVENT = "pricing:changed";

export function loadPricing(): PricingSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT;
    const parsed = JSON.parse(raw) as Partial<PricingSettings>;
    return {
      percentuais: { ...DEFAULT.percentuais, ...(parsed.percentuais ?? {}) },
      custos: { ...DEFAULT.custos, ...(parsed.custos ?? {}) },
    };
  } catch {
    return DEFAULT;
  }
}

function writeCache(p: PricingSettings) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(p));
  window.dispatchEvent(new CustomEvent(PRICING_EVENT));
}

export async function fetchPricing(): Promise<PricingSettings> {
  const { data, error } = await supabase
    .from("pricing_settings")
    .select("imposto_pct, comissao_pct, bonificacao_pct, margem_pct, custos_tier")
    .eq("id", true)
    .maybeSingle();
  if (error || !data) return loadPricing();
  const p: PricingSettings = {
    percentuais: {
      imposto: Number(data.imposto_pct) || 0,
      comissao: Number(data.comissao_pct) || 0,
      bonificacao: Number(data.bonificacao_pct) || 0,
      margem: Number(data.margem_pct) || 0,
    },
    custos: { ...EMPTY_CUSTOS, ...((data.custos_tier as CustoTierFormato | null) ?? {}) },
  };
  writeCache(p);
  return p;
}

export async function savePricing(p: PricingSettings): Promise<{ error?: string }> {
  const { error } = await supabase
    .from("pricing_settings")
    .update({
      imposto_pct: p.percentuais.imposto,
      comissao_pct: p.percentuais.comissao,
      bonificacao_pct: p.percentuais.bonificacao,
      margem_pct: p.percentuais.margem,
      custos_tier: p.custos,
    })
    .eq("id", true);
  if (error) return { error: error.message };
  writeCache(p);
  return {};
}

let realtimeStarted = false;
export function initPricingSync() {
  if (realtimeStarted) return;
  realtimeStarted = true;
  void fetchPricing();
  supabase
    .channel("pricing_settings_changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "pricing_settings" }, () => {
      void fetchPricing();
    })
    .subscribe();
}

export function subscribePricing(cb: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) cb();
  };
  const onCustom = () => cb();
  window.addEventListener("storage", onStorage);
  window.addEventListener(PRICING_EVENT, onCustom);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(PRICING_EVENT, onCustom);
  };
}
