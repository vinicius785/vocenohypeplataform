import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { formatBRL } from "@/lib/comercial";
import type { PricingPercentuais } from "@/lib/pricing";

const groupLabelCls = "text-[11px] font-medium uppercase tracking-wide text-text-secondary";

function Row({
  label,
  pct,
  value,
  tone = "normal",
}: {
  label: string;
  pct?: number;
  value: number;
  tone?: "normal" | "strong";
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-3 py-1.5 text-sm ${
        tone === "strong" ? "font-semibold text-foreground" : "text-foreground"
      }`}
    >
      <span className="min-w-0">
        {label}
        {pct !== undefined && (
          <span className="ml-2 text-xs font-normal tabular-nums text-text-secondary">
            {(pct * 100).toFixed(1).replace(".", ",")}%
          </span>
        )}
      </span>
      <span className={`shrink-0 tabular-nums ${tone === "strong" ? "" : "text-text-secondary"}`}>
        {formatBRL(value)}
      </span>
    </div>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className={groupLabelCls}>{label}</p>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

/**
 * Bloco B — onde o dinheiro vai: CUSTOS (influenciadores), ENCARGOS
 * (imposto, comissão, bonificação) e RESULTADO (margem). Os percentuais são
 * secundários e os valores são sempre calculados sobre o preço final exibido
 * (mesma conta de antes, inclusive depois de um ajuste manual do preço).
 */
export function ComposicaoFinanceira({
  custoTotal,
  precoFinal,
  percentuais,
  loading,
}: {
  custoTotal: number;
  precoFinal: number;
  percentuais: PricingPercentuais;
  loading: boolean;
}) {
  return (
    <section className="space-y-4 rounded-xl bg-muted/30 p-4" aria-label="Composição financeira">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p role="heading" aria-level={3} className="text-[15px] font-semibold text-foreground">
          Composição financeira
        </p>
        {loading && (
          <span
            role="status"
            className="inline-flex items-center gap-1 text-[11px] text-text-secondary"
          >
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> Atualizando custos…
          </span>
        )}
      </div>

      {custoTotal === 0 && !loading && (
        <Alert variant="warning" className="py-2.5 text-xs">
          Nenhum custo configurado para estes itens — por isso o preço calculado é R$ 0. Defina os
          custos em Configurações → Precificação ou informe o preço final manualmente.
        </Alert>
      )}

      <Group label="Custos">
        <Row label="Custo dos influenciadores" value={custoTotal} tone="strong" />
      </Group>
      <Group label="Encargos">
        <Row label="Impostos" pct={percentuais.imposto} value={precoFinal * percentuais.imposto} />
        <Row
          label="Comissão de vendas"
          pct={percentuais.comissao}
          value={precoFinal * percentuais.comissao}
        />
        <Row
          label="Bonificação"
          pct={percentuais.bonificacao}
          value={precoFinal * percentuais.bonificacao}
        />
      </Group>
      <Group label="Resultado">
        <Row
          label="Margem de lucro"
          pct={percentuais.margem}
          value={precoFinal * percentuais.margem}
          tone="strong"
        />
      </Group>
      <p className="text-[11px] text-text-secondary">
        Percentuais sobre o preço final, definidos em Configurações → Precificação.
      </p>
    </section>
  );
}
