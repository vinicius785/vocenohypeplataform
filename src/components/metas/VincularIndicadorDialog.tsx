import { useEffect, useState } from "react";
import { ArrowLeft, Plus, Search } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { COMPARISON_OPERATORS, type ComparisonOperator, type Indicador } from "@/lib/metas-store";
import { COMPARISON_OPERATOR_LABEL, direcaoParaComparadorPadrao } from "@/lib/metas-engine";
import { formatValorAtual, timeAgo } from "./metas-ui-utils";

const FIELD_CLS =
  "mt-1 h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand";

/** Vincular um indicador JÁ EXISTENTE a um objetivo — 2 passos: buscar
 * (lista os indicadores ainda não vinculados aqui — os já vinculados
 * nunca aparecem em `linkable`, então não há caso de "já vinculado" pra
 * indicar nesta lista — com "+ Criar novo indicador" no rodapé) e
 * configurar (Condição/Meta/Peso do VÍNCULO, nunca do indicador em si).
 * Confirmar cria só o vínculo — nunca duplica o indicador. Criar novo
 * indicador continua sendo o fluxo já existente
 * (`IndicadorQuickCreateDialog`, via `onCreateNew`), sem reimplementar
 * nada aqui. */
export function VincularIndicadorDialog({
  open,
  linkable,
  onClose,
  onCreateNew,
  onLink,
}: {
  open: boolean;
  /** Indicadores ainda não vinculados a este objetivo. */
  linkable: Indicador[];
  onClose: () => void;
  onCreateNew: () => void;
  onLink: (
    indicadorId: string,
    cfg: { peso?: number; meta?: number; comparador?: ComparisonOperator },
  ) => void;
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Indicador | null>(null);
  const [comparador, setComparador] = useState<ComparisonOperator>(">=");
  const [meta, setMeta] = useState("");
  const [peso, setPeso] = useState("");

  useEffect(() => {
    if (!open) return;
    setSearch("");
    setSelected(null);
  }, [open]);

  const pick = (ind: Indicador) => {
    setSelected(ind);
    setComparador(direcaoParaComparadorPadrao(ind.direcao));
    setMeta(ind.niveis.esperado != null ? String(ind.niveis.esperado) : "");
    setPeso("");
  };

  const confirmar = () => {
    if (!selected) return;
    onLink(selected.id, {
      meta: meta.trim() ? Number(meta) : undefined,
      comparador,
      peso: peso.trim() ? Number(peso) : undefined,
    });
  };

  const filtered = linkable.filter((i) =>
    i.titulo.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        {!selected ? (
          <>
            <DialogTitle className="text-base font-semibold">Vincular indicador</DialogTitle>
            <DialogDescription className="text-xs text-text-secondary">
              Escolha um indicador já existente pra vincular a este objetivo, ou crie um novo.
            </DialogDescription>
            <div className="relative mt-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-secondary" />
              <Input
                type="text"
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar indicador..."
                className="h-9 pl-8 focus-visible:ring-brand"
              />
            </div>
            <div className="mt-2 max-h-72 space-y-1 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="px-1 py-6 text-center text-xs text-text-secondary">
                  {search.trim()
                    ? `Nenhum indicador encontrado para "${search.trim()}"`
                    : "Nenhum indicador disponível pra vincular."}
                </p>
              ) : (
                filtered.map((i) => (
                  <button
                    key={i.id}
                    type="button"
                    onClick={() => pick(i)}
                    className="block w-full rounded-xl px-3 py-2.5 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-sm font-medium text-foreground">
                        {i.titulo}
                      </span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                        {formatValorAtual(i)}
                        {i.unidade && i.unidade !== "%" && i.unidade !== "R$" ? (
                          <span className="ml-1 text-xs font-normal text-text-secondary">
                            {i.unidade}
                          </span>
                        ) : null}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-text-secondary">
                      Atualizado {timeAgo(i.updatedAt ?? i.createdAt)}
                    </span>
                  </button>
                ))
              )}
            </div>
            <button
              type="button"
              onClick={onCreateNew}
              className="mt-2 flex w-full items-center gap-1.5 rounded-xl border border-dashed border-border px-3 py-2.5 text-left text-sm font-medium text-text-secondary hover:border-brand/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <Plus className="h-3.5 w-3.5" /> Criar novo indicador
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="inline-flex items-center gap-1 rounded text-xs text-text-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <ArrowLeft className="h-3 w-3" /> Voltar
            </button>
            <DialogTitle className="mt-1 text-base font-semibold">Vincular ao objetivo</DialogTitle>
            <DialogDescription className="text-xs text-text-secondary">
              {selected.titulo} · Valor atual: {formatValorAtual(selected)}
              {selected.unidade ? ` ${selected.unidade}` : ""}
            </DialogDescription>
            <div className="mt-3 space-y-3">
              <div>
                <Label
                  htmlFor="vincular-comparador"
                  className="text-xs font-medium text-text-secondary"
                >
                  Condição
                </Label>
                <select
                  id="vincular-comparador"
                  value={comparador}
                  onChange={(e) => setComparador(e.target.value as ComparisonOperator)}
                  className={FIELD_CLS}
                >
                  {COMPARISON_OPERATORS.map((op) => (
                    <option key={op} value={op}>
                      {COMPARISON_OPERATOR_LABEL[op]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label
                    htmlFor="vincular-meta"
                    className="text-xs font-medium text-text-secondary"
                  >
                    Meta
                  </Label>
                  <input
                    id="vincular-meta"
                    type="number"
                    value={meta}
                    onChange={(e) => setMeta(e.target.value)}
                    placeholder="Ex: 63"
                    className={FIELD_CLS}
                  />
                </div>
                <div>
                  <Label
                    htmlFor="vincular-peso"
                    className="text-xs font-medium text-text-secondary"
                  >
                    Peso
                  </Label>
                  <input
                    id="vincular-peso"
                    type="number"
                    value={peso}
                    onChange={(e) => setPeso(e.target.value)}
                    placeholder="Divide igual"
                    className={FIELD_CLS}
                  />
                </div>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <Button variant="outline" size="comfortable" onClick={onClose}>
                Cancelar
              </Button>
              <Button variant="primary" size="comfortable" onClick={confirmar}>
                Vincular
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
