import { useEffect, useRef, useState } from "react";
import { DollarSign, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LockedSection } from "@/components/LockedSection";
import { supabase } from "@/integrations/supabase/client";
import { loadPricing, fetchPricing, savePricing, type PricingSettings } from "@/lib/pricing-store";
import { TIERS, FORMATOS, type TierId, type FormatoId } from "@/lib/pricing";
import { logSettingsAudit } from "@/lib/settings-audit";
import { SettingsCard, SettingsSectionHeader, SettingsSaveBar } from "./settings-shared";

const PCT_FIELD_LABEL: Record<keyof PricingSettings["percentuais"], string> = {
  imposto: "Imposto",
  comissao: "Comissão de vendas",
  bonificacao: "Bonificação",
  margem: "Margem de lucro",
};

function diffPricing(before: PricingSettings, after: PricingSettings): string | null {
  const parts: string[] = [];
  for (const key of Object.keys(PCT_FIELD_LABEL) as (keyof PricingSettings["percentuais"])[]) {
    const from = before.percentuais[key];
    const to = after.percentuais[key];
    if (from !== to) {
      parts.push(
        `${PCT_FIELD_LABEL[key]}: ${(from * 100).toFixed(1)}% → ${(to * 100).toFixed(1)}%`,
      );
    }
  }
  let custosChanged = 0;
  for (const t of TIERS) {
    for (const f of FORMATOS) {
      if ((before.custos[t.id]?.[f.id] ?? null) !== (after.custos[t.id]?.[f.id] ?? null)) {
        custosChanged++;
      }
    }
  }
  if (custosChanged > 0) parts.push(`${custosChanged} custo(s) por tier/formato`);
  return parts.length ? parts.join("; ") : null;
}

export function PrecificacaoSection({ canConfig }: { canConfig: boolean }) {
  if (!canConfig) return <LockedSection title="Custos e precificação" />;
  return <PrecificacaoForm />;
}

function PrecificacaoForm() {
  const [settings, setSettings] = useState<PricingSettings>(() => loadPricing());
  const [baseline, setBaseline] = useState<PricingSettings | null>(null);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const baselineRef = useRef<PricingSettings | null>(null);

  useEffect(() => {
    void fetchPricing().then((w) => {
      setSettings(w);
      setBaseline(w);
      baselineRef.current = w;
    });
  }, []);

  const setPct = (key: keyof PricingSettings["percentuais"], percentValue: string) => {
    const n = Number(percentValue.replace(",", "."));
    setSettings((s) => ({
      ...s,
      percentuais: { ...s.percentuais, [key]: Number.isFinite(n) ? n / 100 : 0 },
    }));
  };

  const setCusto = (tier: TierId, formato: FormatoId, value: string) => {
    const n = Number(value.replace(/[^\d.,]/g, "").replace(",", "."));
    setSettings((s) => ({
      ...s,
      custos: {
        ...s.custos,
        [tier]: { ...s.custos[tier], [formato]: value.trim() ? n || 0 : undefined },
      },
    }));
  };

  const totalPct =
    (settings.percentuais.imposto +
      settings.percentuais.comissao +
      settings.percentuais.bonificacao +
      settings.percentuais.margem) *
    100;
  const totalTone: "neutral" | "warning" | "danger" =
    totalPct >= 100 ? "danger" : totalPct >= 80 ? "warning" : "neutral";

  const dirty = baseline !== null && JSON.stringify(settings) !== JSON.stringify(baseline);

  const save = async () => {
    setErr(null);
    setSaving(true);
    const res = await savePricing(settings);
    setSaving(false);
    if (res.error) {
      setErr(res.error);
      return;
    }
    const detail = baselineRef.current ? diffPricing(baselineRef.current, settings) : null;
    if (detail) logSettingsAudit({ category: "pricing", action: "Atualizou precificação", detail });
    baselineRef.current = settings;
    setBaseline(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-6">
      {historyOpen && <PricingHistoryDialog onClose={() => setHistoryOpen(false)} />}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SettingsSectionHeader
          icon={<DollarSign className="h-4 w-4" />}
          title="Custos e precificação"
          description="Parâmetros usados pelo Simulador de Proposta (Comercial)."
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setHistoryOpen(true)}
          className="shrink-0"
        >
          <History className="h-3.5 w-3.5" />
          Ver histórico
        </Button>
      </div>

      <SettingsCard
        title="Percentuais da agência"
        description="Usados pelo Simulador de Proposta pra calcular o preço final a partir do custo dos influenciadores: Preço final = Custo total ÷ (1 − soma dos percentuais)."
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(
            [
              ["imposto", "Imposto"],
              ["comissao", "Comissão de vendas"],
              ["bonificacao", "Bonificação"],
              ["margem", "Margem de lucro"],
            ] as [keyof PricingSettings["percentuais"], string][]
          ).map(([key, label]) => (
            <label key={key} className="block space-y-1 text-xs font-medium text-muted-foreground">
              <span>{label}</span>
              <div className="relative">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={(settings.percentuais[key] * 100).toFixed(1).replace(/\.0$/, "")}
                  onChange={(e) => setPct(key, e.target.value)}
                  className="h-9 w-full rounded-md border border-border bg-background pl-2.5 pr-6 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  %
                </span>
              </div>
            </label>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Total:{" "}
          <Badge
            variant={totalTone === "neutral" ? "secondary" : totalTone}
            className="align-middle"
          >
            {totalPct.toFixed(1)}%
          </Badge>
          {totalPct >= 100 && (
            <span className="ml-1.5 text-destructive">
              — não pode chegar a 100%, o preço final ficaria infinito.
            </span>
          )}
        </p>
      </SettingsCard>

      <SettingsCard
        title="Custo médio por Tier × Formato"
        description="Valores praticados com os influenciadores, em R$. Deixe em branco quando não fizer sentido pro tier (ex.: Live geralmente não é orçado à parte)."
      >
        <div className="max-h-[420px] overflow-auto rounded-lg border border-border/60">
          <table className="w-full min-w-[720px] border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-card">
              <tr>
                <th className="sticky left-0 z-20 bg-card px-3 py-2 text-left font-medium text-muted-foreground">
                  Tier
                </th>
                {FORMATOS.map((f) => (
                  <th key={f.id} className="px-3 py-2 text-left font-medium text-muted-foreground">
                    {f.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TIERS.map((t) => (
                <tr key={t.id} className="border-t border-border/60">
                  <td className="sticky left-0 z-10 whitespace-nowrap bg-card px-3 py-1.5 font-medium text-foreground">
                    {t.label}
                  </td>
                  {FORMATOS.map((f) => (
                    <td key={f.id} className="px-2 py-1">
                      <div className="relative">
                        <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">
                          R$
                        </span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={settings.custos[t.id]?.[f.id] ?? ""}
                          onChange={(e) => setCusto(t.id, f.id, e.target.value)}
                          placeholder="Sem custo"
                          className="h-8 w-28 rounded-md border border-border bg-background py-1 pl-7 pr-2 text-xs outline-none focus:ring-2 focus:ring-ring"
                        />
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SettingsCard>

      <SettingsSaveBar
        mode="manual"
        dirty={dirty}
        saving={saving}
        error={err}
        onDiscard={() => baseline && setSettings(baseline)}
        onSave={() => void save()}
      />
      {saved && !dirty && <p className="text-xs text-emerald-600 dark:text-emerald-400">Salvo.</p>}
    </div>
  );
}

type PricingAuditRow = {
  id: string;
  action: string;
  detail: string | null;
  actor_name: string;
  created_at: string;
};

function PricingHistoryDialog({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<PricingAuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void supabase
      .from("settings_audit_log")
      .select("id, action, detail, actor_name, created_at")
      .eq("category", "pricing")
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) setError(err.message);
        else setRows((data ?? []) as PricingAuditRow[]);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Histórico de alterações — Precificação</DialogTitle>
        </DialogHeader>
        <div className="max-h-[420px] space-y-2 overflow-y-auto">
          {error && <p className="text-xs text-destructive">{error}</p>}
          {loading && <p className="text-xs text-muted-foreground">Carregando...</p>}
          {!loading && rows.length === 0 && (
            <p className="text-xs text-muted-foreground">Nenhuma alteração registrada ainda.</p>
          )}
          {rows.map((r) => (
            <div key={r.id} className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{r.actor_name}</span>
                <span>{new Date(r.created_at).toLocaleString("pt-BR")}</span>
              </div>
              {r.detail && <p className="mt-1 text-xs text-foreground">{r.detail}</p>}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
