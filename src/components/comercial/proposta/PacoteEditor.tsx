import { Minus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { formatBRL } from "@/lib/comercial";
import {
  FORMATOS,
  TIERS,
  custoUnitario,
  type CustoTierFormato,
  type FormatoId,
  type PacoteLinha,
  type TierId,
} from "@/lib/pricing";

export const MAX_LINHAS = 10;

/**
 * Bloco A — o que está sendo vendido. Cada linha é um item da proposta
 * (influenciador por tier × formato × quantidade) e mostra o custo que ela
 * soma. Sem borda por campo: o item é uma superfície suave e os controles
 * ficam dentro dela.
 */
export function PacoteEditor({
  linhas,
  custos,
  focusId,
  onUpdate,
  onAdd,
  onRemove,
}: {
  linhas: PacoteLinha[];
  custos: CustoTierFormato;
  /** Linha recém-adicionada: recebe o foco no seletor de tier. */
  focusId: string | null;
  onUpdate: (id: string, patch: Partial<PacoteLinha>) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  const noLimite = linhas.length >= MAX_LINHAS;

  return (
    <section className="space-y-3" aria-label="Pacote de influenciadores">
      <div>
        <p role="heading" aria-level={3} className="text-[15px] font-semibold text-foreground">
          Pacote de influenciadores
        </p>
        <p className="mt-0.5 text-xs text-text-secondary">
          Cada linha é um item da proposta: o tier, o formato e quantos entram.
        </p>
      </div>

      <ul className="space-y-2">
        {linhas.map((l, i) => {
          const unit = custoUnitario(custos, l.tier, l.formato);
          const qtd = Math.max(0, l.qtd || 0);
          return (
            <li
              key={l.id}
              className="rounded-xl bg-muted/40 p-3 animate-in fade-in-0 slide-in-from-top-1 duration-200"
            >
              <div className="flex items-start gap-3">
                <span
                  className="mt-1.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-background text-[11px] font-semibold tabular-nums text-text-secondary"
                  aria-hidden="true"
                >
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1 space-y-2.5">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <NativeSelect
                      id={`proposta-linha-${l.id}-tier`}
                      aria-label={`Linha ${i + 1}: tier do influenciador`}
                      autoFocus={focusId === l.id}
                      value={l.tier}
                      onChange={(e) => onUpdate(l.id, { tier: e.target.value as TierId })}
                    >
                      {TIERS.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label}
                        </option>
                      ))}
                    </NativeSelect>
                    <NativeSelect
                      aria-label={`Linha ${i + 1}: formato`}
                      value={l.formato}
                      onChange={(e) => onUpdate(l.id, { formato: e.target.value as FormatoId })}
                    >
                      {FORMATOS.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.label}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                    <div
                      className="flex items-center gap-1"
                      role="group"
                      aria-label={`Quantidade da linha ${i + 1}`}
                    >
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        aria-label="Diminuir quantidade"
                        disabled={l.qtd <= 1}
                        onClick={() => onUpdate(l.id, { qtd: Math.max(1, l.qtd - 1) })}
                      >
                        <Minus />
                      </Button>
                      <Input
                        inputMode="numeric"
                        aria-label="Quantidade"
                        value={l.qtd}
                        onChange={(e) =>
                          onUpdate(l.id, {
                            qtd: Math.max(
                              1,
                              Math.floor(Number(e.target.value.replace(/\D/g, "")) || 1),
                            ),
                          })
                        }
                        className="h-8 w-14 px-1 text-center tabular-nums"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        aria-label="Aumentar quantidade"
                        onClick={() => onUpdate(l.id, { qtd: l.qtd + 1 })}
                      >
                        <Plus />
                      </Button>
                      {unit > 0 && (
                        <span className="ml-1.5 text-xs tabular-nums text-text-secondary">
                          × {formatBRL(unit)}
                        </span>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums text-foreground">
                        {formatBRL(unit * qtd)}
                      </p>
                      {unit === 0 && (
                        <p
                          className="text-[11px] text-warning-soft-foreground"
                          title="Defina o custo deste tier/formato em Configurações → Precificação"
                        >
                          Sem custo configurado
                        </p>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(l.id)}
                  disabled={linhas.length === 1}
                  className="mt-1 shrink-0 rounded p-1 text-text-secondary hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-text-secondary"
                  aria-label={`Remover linha ${i + 1}`}
                  title={
                    linhas.length === 1 ? "A proposta precisa de ao menos uma linha" : undefined
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <Button type="button" variant="ghost" size="sm" onClick={onAdd} disabled={noLimite}>
        <Plus /> {noLimite ? `Limite de ${MAX_LINHAS} linhas` : "Adicionar linha"}
      </Button>
    </section>
  );
}
