import { useEffect, useState } from "react";
import { Plus, Trash2, Calculator, RotateCcw, ArrowRight } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { FormattedNumberInput } from "@/components/ui/formatted-number-input";
import {
  TIERS,
  FORMATOS,
  calcPacote,
  type PacoteLinha,
  type TierId,
  type FormatoId,
} from "@/lib/pricing";
import { loadPricing, fetchPricing, type PricingSettings } from "@/lib/pricing-store";
import { formatBRL, type PropostaSnapshot } from "@/lib/comercial";

function newLinha(): PacoteLinha {
  return { id: crypto.randomUUID(), tier: TIERS[1].id, formato: FORMATOS[0].id, qtd: 1 };
}

const selectCls =
  "h-9 flex-1 rounded-md border border-input bg-background px-2 text-xs focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring";

/**
 * Simulador de Proposta — traz pra dentro do Comercial a lógica da planilha
 * "Calculadora custos op" (Custos por Tier × Simulador de Pacote): soma o
 * custo dos influenciadores por Tier×Formato×Qtd e aplica os percentuais
 * fixos da agência (Configurações → Precificação) pra chegar no preço final
 * a propor ao cliente. Ver src/lib/pricing.ts (fórmula) e PrecificacaoTab
 * (ConfiguracoesSection.tsx, onde os percentuais/custos são configurados).
 *
 * `SimuladorPropostaForm` é o formulário puro, sem Dialog em volta — usado
 * inline na aba Proposta da oportunidade (não faz sentido esconder o
 * simulador atrás de um botão dentro de uma aba que já é sobre a proposta).
 * `SimuladorPropostaDialog` embrulha o mesmo formulário num Dialog, pra
 * qualquer outro lugar que precise dele como painel modal.
 */
export function SimuladorPropostaForm({
  initial,
  applyLabel = "Usar como valor do negócio",
  onApply,
}: {
  initial?: PropostaSnapshot;
  applyLabel?: string;
  onApply: (precoFinal: number, snapshot: PropostaSnapshot) => void;
}) {
  const [settings, setSettings] = useState<PricingSettings>(() => loadPricing());
  const [linhas, setLinhas] = useState<PacoteLinha[]>(() =>
    initial?.linhas.length
      ? initial.linhas.map((l) => ({
          id: crypto.randomUUID(),
          tier: l.tier as TierId,
          formato: l.formato as FormatoId,
          qtd: l.qtd,
        }))
      : [newLinha()],
  );
  const [precoManual, setPrecoManual] = useState<number | null>(
    initial?.ajustadoManualmente ? Math.round(initial.precoFinal) : null,
  );

  useEffect(() => {
    void fetchPricing().then(setSettings);
  }, []);

  const { custoTotal, precoFinal: precoCalculado } = calcPacote(
    linhas,
    settings.custos,
    settings.percentuais,
  );
  // Preço exibido: o calculado, a não ser que a pessoa tenha digitado por
  // cima manualmente. A quebra abaixo (imposto/comissão/bonificação/margem)
  // é sempre derivada DESSE valor exibido — não do preço calculado puro —
  // pra continuar batendo com o percentual mesmo depois de um ajuste manual.
  const editadoManualmente = precoManual !== null;
  const precoFinalExibido = precoManual ?? precoCalculado;
  const breakdown = {
    imposto: precoFinalExibido * settings.percentuais.imposto,
    comissao: precoFinalExibido * settings.percentuais.comissao,
    bonificacao: precoFinalExibido * settings.percentuais.bonificacao,
    lucro: precoFinalExibido * settings.percentuais.margem,
  };

  const updateLinha = (id: string, patch: Partial<PacoteLinha>) =>
    setLinhas((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const addLinha = () => setLinhas((ls) => (ls.length >= 10 ? ls : [...ls, newLinha()]));
  const removeLinha = (id: string) => setLinhas((ls) => ls.filter((l) => l.id !== id));

  const apply = () => {
    const snapshot: PropostaSnapshot = {
      linhas: linhas.map((l) => ({ tier: l.tier, formato: l.formato, qtd: l.qtd })),
      percentuais: settings.percentuais,
      custoTotal,
      precoFinal: precoFinalExibido,
      precoCalculado,
      ajustadoManualmente: editadoManualmente,
      calculadoEm: Date.now(),
    };
    onApply(precoFinalExibido, snapshot);
  };

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Pacote de influenciadores
        </p>
        {linhas.map((l, i) => (
          <div
            key={l.id}
            className="flex items-center gap-2 rounded-xl border border-border bg-muted/20 p-2"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-background text-[11px] font-semibold text-muted-foreground">
              {i + 1}
            </span>
            <select
              value={l.tier}
              onChange={(e) => updateLinha(l.id, { tier: e.target.value as TierId })}
              className={selectCls}
            >
              {TIERS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
            <select
              value={l.formato}
              onChange={(e) => updateLinha(l.id, { formato: e.target.value as FormatoId })}
              className={selectCls}
            >
              {FORMATOS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              value={l.qtd}
              onChange={(e) => updateLinha(l.id, { qtd: Math.max(1, Number(e.target.value)) })}
              className="h-9 w-14 shrink-0 rounded-md border border-input bg-background px-2 text-center text-xs focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <button
              type="button"
              onClick={() => removeLinha(l.id)}
              disabled={linhas.length === 1}
              className="shrink-0 text-muted-foreground hover:text-destructive disabled:opacity-30"
              aria-label="Remover linha"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addLinha}
          disabled={linhas.length >= 10}
          className="inline-flex items-center gap-1 text-xs font-medium text-foreground hover:underline disabled:opacity-40"
        >
          <Plus className="h-3 w-3" /> adicionar linha
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border">
        <div className="flex items-center justify-between bg-muted/40 px-4 py-2.5">
          <span className="text-xs font-medium text-muted-foreground">
            Custo dos influenciadores
          </span>
          <span className="text-sm font-semibold text-foreground">{formatBRL(custoTotal)}</span>
        </div>
        <div className="space-y-1.5 px-4 py-3 text-xs">
          <BreakdownRow
            label="Imposto"
            pct={settings.percentuais.imposto}
            value={breakdown.imposto}
          />
          <BreakdownRow
            label="Comissão de vendas"
            pct={settings.percentuais.comissao}
            value={breakdown.comissao}
          />
          <BreakdownRow
            label="Bonificação"
            pct={settings.percentuais.bonificacao}
            value={breakdown.bonificacao}
          />
          <BreakdownRow
            label="Margem de lucro"
            pct={settings.percentuais.margem}
            value={breakdown.lucro}
            emphasis
          />
        </div>
        <div className="flex items-center gap-2 border-t border-dashed border-border px-4 py-2.5 text-[11px] text-muted-foreground">
          <ArrowRight className="h-3 w-3 shrink-0" />
          Percentuais definidos em Configurações → Precificação.
        </div>
      </div>

      <div className="rounded-2xl border-2 border-foreground bg-muted/40 p-4">
        <div className="flex items-center justify-between gap-2">
          <label className="text-xs font-medium text-foreground">Preço final ao cliente (R$)</label>
          {editadoManualmente && (
            <button
              type="button"
              onClick={() => setPrecoManual(null)}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="h-3 w-3" /> usar valor calculado
            </button>
          )}
        </div>
        <FormattedNumberInput
          mode="currency"
          value={precoManual ?? Math.round(precoCalculado)}
          onValueChange={(v) => setPrecoManual(v ?? null)}
          className="mt-2 h-12 w-full rounded-lg border border-border bg-background px-3 text-2xl font-bold outline-none focus:ring-2 focus:ring-ring"
        />
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          {editadoManualmente
            ? "Ajustado manualmente — a quebra acima recalcula com base neste valor."
            : "Calculado a partir do custo + percentuais. Pode editar por cima."}
        </p>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={apply}
          className="rounded-full border-2 border-foreground bg-foreground px-5 py-2 text-sm font-medium text-background transition-colors duration-200 hover:bg-transparent hover:text-foreground"
        >
          {applyLabel}
        </button>
      </div>
    </div>
  );
}

export function SimuladorPropostaDialog({
  open,
  onClose,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  onApply: (precoFinal: number, snapshot: PropostaSnapshot) => void;
}) {
  return (
    // stopPropagation aqui: este diálogo pode ser aberto de dentro de outro
    // painel cujo container raiz fecha ao detectar qualquer clique
    // (`onClick={onClose}`). O conteúdo deste Dialog é portalado pro
    // <body>, mas o React ainda borbulha o evento pela árvore de
    // componentes (não pela árvore do DOM) — sem isso, qualquer clique aqui
    // dentro (overlay, selects, botões) também fechava o painel por trás.
    <div onClick={(e) => e.stopPropagation()}>
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col gap-0 p-0">
          <div className="flex items-center gap-3 border-b border-border px-5 py-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
              <Calculator className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <DialogTitle>Simular proposta</DialogTitle>
              <DialogDescription className="mt-0.5">
                Monte o pacote por tier e formato — o preço final já embute os percentuais da
                agência.
              </DialogDescription>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            <SimuladorPropostaForm
              onApply={(precoFinal, snapshot) => {
                onApply(precoFinal, snapshot);
                onClose();
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BreakdownRow({
  label,
  pct,
  value,
  emphasis,
}: {
  label: string;
  pct: number;
  value: number;
  emphasis?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between ${emphasis ? "font-medium text-foreground" : "text-muted-foreground"}`}
    >
      <span>
        {label} <span className="text-muted-foreground/70">({(pct * 100).toFixed(1)}%)</span>
      </span>
      <span>{formatBRL(value)}</span>
    </div>
  );
}
