import { useEffect, useState } from "react";
import { Plus, Trash2, Calculator } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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

/**
 * Simulador de Proposta — traz pra dentro do Comercial a lógica da planilha
 * "Calculadora custos op" (Custos por Tier × Simulador de Pacote): soma o
 * custo dos influenciadores por Tier×Formato×Qtd e aplica os percentuais
 * fixos da agência (Configurações → Precificação) pra chegar no preço final
 * a propor ao cliente. Ver src/lib/pricing.ts (fórmula) e PrecificacaoTab
 * (ConfiguracoesSection.tsx, onde os percentuais/custos são configurados).
 */
export function SimuladorPropostaDialog({
  open,
  onClose,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  onApply: (precoFinal: number, snapshot: PropostaSnapshot) => void;
}) {
  const [settings, setSettings] = useState<PricingSettings>(() => loadPricing());
  const [linhas, setLinhas] = useState<PacoteLinha[]>([newLinha()]);
  const [precoManual, setPrecoManual] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    void fetchPricing().then(setSettings);
    setLinhas([newLinha()]);
    setPrecoManual(null);
  }, [open]);

  const resultado = calcPacote(linhas, settings.custos, settings.percentuais);
  const precoFinalExibido = precoManual !== null ? Number(precoManual) || 0 : resultado.precoFinal;

  const updateLinha = (id: string, patch: Partial<PacoteLinha>) =>
    setLinhas((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const addLinha = () => setLinhas((ls) => (ls.length >= 10 ? ls : [...ls, newLinha()]));
  const removeLinha = (id: string) => setLinhas((ls) => ls.filter((l) => l.id !== id));

  const apply = () => {
    const snapshot: PropostaSnapshot = {
      linhas: linhas.map((l) => ({ tier: l.tier, formato: l.formato, qtd: l.qtd })),
      percentuais: settings.percentuais,
      custoTotal: resultado.custoTotal,
      precoFinal: precoFinalExibido,
      calculadoEm: Date.now(),
    };
    onApply(precoFinalExibido, snapshot);
    onClose();
  };

  return (
    // stopPropagation aqui: este diálogo é aberto de dentro do formulário de
    // lead (ComercialSection), cujo container raiz fecha o formulário ao
    // detectar qualquer clique (`onClick={onClose}`). O conteúdo deste
    // Dialog é portalado pro <body>, mas o React ainda borbulha o evento
    // pela árvore de componentes (não pela árvore do DOM) — sem isso,
    // qualquer clique aqui dentro (overlay, selects, botões) também fechava
    // o formulário de lead por trás.
    <div onClick={(e) => e.stopPropagation()}>
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col">
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="h-4 w-4" /> Simular proposta
          </DialogTitle>
          <DialogDescription>
            Monte o pacote de influenciadores por tier e formato — o preço final já embute os
            percentuais da agência (imposto, comissão, bonificação e margem).
          </DialogDescription>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
            <div className="space-y-2">
              {linhas.map((l) => (
                <div key={l.id} className="flex items-center gap-2">
                  <select
                    value={l.tier}
                    onChange={(e) => updateLinha(l.id, { tier: e.target.value as TierId })}
                    className="h-9 flex-1 rounded-md border border-input bg-background px-2 text-xs focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
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
                    className="h-9 flex-1 rounded-md border border-input bg-background px-2 text-xs focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
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
                    onChange={(e) =>
                      updateLinha(l.id, { qtd: Math.max(1, Number(e.target.value)) })
                    }
                    className="h-9 w-16 rounded-md border border-input bg-background px-2 text-center text-xs focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <button
                    type="button"
                    onClick={() => removeLinha(l.id)}
                    disabled={linhas.length === 1}
                    className="text-muted-foreground hover:text-destructive disabled:opacity-30"
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
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-40"
              >
                <Plus className="h-3 w-3" /> adicionar linha
              </button>
            </div>

            <div className="space-y-1.5 rounded-lg border border-border bg-muted/20 p-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Custo total dos influenciadores</span>
                <span className="font-medium text-foreground">
                  {formatBRL(resultado.custoTotal)}
                </span>
              </div>
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Imposto ({(settings.percentuais.imposto * 100).toFixed(1)}%)</span>
                <span>{formatBRL(resultado.imposto)}</span>
              </div>
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Comissão ({(settings.percentuais.comissao * 100).toFixed(1)}%)</span>
                <span>{formatBRL(resultado.comissao)}</span>
              </div>
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Bonificação ({(settings.percentuais.bonificacao * 100).toFixed(1)}%)</span>
                <span>{formatBRL(resultado.bonificacao)}</span>
              </div>
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Margem de lucro ({(settings.percentuais.margem * 100).toFixed(1)}%)</span>
                <span>{formatBRL(resultado.lucro)}</span>
              </div>
              <p className="pt-1 text-[11px] text-muted-foreground">
                Percentuais definidos em Configurações → Precificação.
              </p>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Preço final ao cliente (R$) — pode ajustar por cima do calculado
              </label>
              <input
                type="number"
                value={precoManual !== null ? precoManual : Math.round(resultado.precoFinal)}
                onChange={(e) => setPrecoManual(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-base font-semibold focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="button" onClick={apply}>
              Usar como valor do negócio
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
