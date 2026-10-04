import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  TIERS,
  FORMATOS,
  calcPacote,
  type PacoteLinha,
  type TierId,
  type FormatoId,
} from "@/lib/pricing";
import { loadPricing, fetchPricing, type PricingSettings } from "@/lib/pricing-store";
import { type PropostaSnapshot } from "@/lib/comercial";
import {
  isProposalDirty,
  proposalBaseline,
  valueImpactMessage,
} from "@/lib/comercial-proposal-form";
import { propostaMargem } from "@/lib/comercial-lead-view";
import { ComposicaoFinanceira } from "./proposta/ComposicaoFinanceira";
import { MAX_LINHAS, PacoteEditor } from "./proposta/PacoteEditor";
import { PrecoFinal } from "./proposta/PrecoFinal";

function newLinha(): PacoteLinha {
  return { id: crypto.randomUUID(), tier: TIERS[1].id, formato: FORMATOS[0].id, qtd: 1 };
}

const DEFAULT_LINE = { tier: TIERS[1].id as string, formato: FORMATOS[0].id as string, qtd: 1 };

/**
 * Simulador de Proposta — traz pra dentro do Comercial a lógica da planilha
 * "Calculadora custos op" (Custos por Tier × Simulador de Pacote): soma o
 * custo dos influenciadores por Tier×Formato×Qtd e aplica os percentuais
 * fixos da agência (Configurações → Precificação) pra chegar no preço final
 * a propor ao cliente. Ver src/lib/pricing.ts (fórmula) e PrecificacaoTab
 * (ConfiguracoesSection.tsx, onde os percentuais/custos são configurados).
 *
 * Três blocos, nesta ordem: A) o pacote (o que está sendo vendido),
 * B) a composição financeira (custos → encargos → resultado) e C) o preço
 * final com a ação de aplicá-lo ao negócio. A conta (`calcPacote`) e o
 * snapshot gravado são os mesmos de sempre.
 *
 * `SimuladorPropostaForm` é o formulário puro, sem Dialog em volta — usado
 * inline na aba Proposta da oportunidade. `SimuladorPropostaDialog` embrulha
 * o mesmo formulário num Dialog, pra qualquer outro lugar que o precise como
 * painel modal.
 */
export function SimuladorPropostaForm({
  initial,
  applyLabel = "Usar como valor do negócio",
  currentValue,
  applying = false,
  applyError = null,
  onDirtyChange,
  onApply,
}: {
  initial?: PropostaSnapshot;
  applyLabel?: string;
  /** Valor atual do negócio — quando informado, a ação de aplicar diz o que
   * vai mudar ("passa de X para Y"). */
  currentValue?: number;
  /** Aplicação em andamento / erro da última tentativa (a tela de cima é
   * quem persiste; aqui só se mostra o estado). */
  applying?: boolean;
  applyError?: string | null;
  /** Avisa quando há alterações ainda NÃO aplicadas (para não perdê-las). */
  onDirtyChange?: (dirty: boolean) => void;
  onApply: (precoFinal: number, snapshot: PropostaSnapshot) => void;
}) {
  const [settings, setSettings] = useState<PricingSettings>(() => loadPricing());
  const [pricingLoading, setPricingLoading] = useState(true);
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
  const [focusId, setFocusId] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");

  useEffect(() => {
    let alive = true;
    void fetchPricing()
      .then((p) => alive && setSettings(p))
      .finally(() => alive && setPricingLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const { custoTotal, precoFinal: precoCalculado } = calcPacote(
    linhas,
    settings.custos,
    settings.percentuais,
  );
  // Preço exibido: o calculado, a não ser que a pessoa tenha digitado por
  // cima manualmente. A composição financeira é sempre derivada DESSE valor
  // exibido — não do preço calculado puro — pra continuar batendo com o
  // percentual mesmo depois de um ajuste manual.
  const editadoManualmente = precoManual !== null;
  const precoFinalExibido = precoManual ?? precoCalculado;

  const baseline = useMemo(() => proposalBaseline(initial, DEFAULT_LINE), [initial]);
  const dirty = isProposalDirty(
    { linhas: linhas.map(({ tier, formato, qtd }) => ({ tier, formato, qtd })), precoManual },
    baseline,
  );
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const updateLinha = (id: string, patch: Partial<PacoteLinha>) =>
    setLinhas((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  const addLinha = () => {
    if (linhas.length >= MAX_LINHAS) return;
    const nova = newLinha();
    setLinhas((ls) => [...ls, nova]);
    setFocusId(nova.id);
    setAnnounce(`Linha ${linhas.length + 1} adicionada`);
  };

  const removeLinha = (id: string) => {
    const idx = linhas.findIndex((l) => l.id === id);
    if (idx < 0 || linhas.length === 1) return;
    const removed = linhas[idx];
    setLinhas((ls) => ls.filter((l) => l.id !== id));
    setAnnounce(`Linha ${idx + 1} removida`);
    toast("Linha removida", {
      duration: 6000,
      action: {
        label: "Desfazer",
        onClick: () =>
          setLinhas((ls) =>
            ls.some((l) => l.id === removed.id) || ls.length >= MAX_LINHAS
              ? ls
              : [...ls.slice(0, idx), removed, ...ls.slice(idx)],
          ),
      },
    });
  };

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

  const applied =
    !dirty &&
    !!initial &&
    currentValue !== undefined &&
    !applyError &&
    Math.round(precoFinalExibido) === Math.round(initial.precoFinal) &&
    Math.round(currentValue) === Math.round(initial.precoFinal);

  return (
    <div className="space-y-6">
      <PacoteEditor
        linhas={linhas}
        custos={settings.custos}
        focusId={focusId}
        onUpdate={updateLinha}
        onAdd={addLinha}
        onRemove={removeLinha}
      />

      <ComposicaoFinanceira
        custoTotal={custoTotal}
        precoFinal={precoFinalExibido}
        percentuais={settings.percentuais}
        loading={pricingLoading}
      />

      <PrecoFinal
        precoCalculado={precoCalculado}
        precoManual={precoManual}
        precoExibido={precoFinalExibido}
        onPrecoChange={setPrecoManual}
        onResetManual={() => setPrecoManual(null)}
        margem={propostaMargem({ precoFinal: precoFinalExibido, custoTotal })}
        margemMinima={settings.percentuais.margem}
        currentValue={currentValue}
        impactMessage={
          currentValue !== undefined ? valueImpactMessage(currentValue, precoFinalExibido) : null
        }
        applyLabel={applyLabel}
        applying={applying}
        applied={applied}
        applyError={applyError}
        blockedReason={
          precoFinalExibido > 0
            ? null
            : "Defina os custos em Configurações → Precificação ou informe o preço final para aplicar."
        }
        onApply={apply}
      />

      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>
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
        <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col gap-0 p-0" mobileFullScreen>
          <div className="border-b border-border/60 px-6 py-5">
            <div className="min-w-0">
              <DialogTitle>Simular proposta</DialogTitle>
              <DialogDescription className="mt-0.5">
                Monte o pacote por tier e formato — o preço final já embute os percentuais da
                agência.
              </DialogDescription>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-6">
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
