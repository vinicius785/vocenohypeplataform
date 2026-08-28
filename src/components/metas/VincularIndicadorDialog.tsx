import { useEffect, useState } from "react";
import { ArrowLeft, Plus, Search } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { COMPARISON_OPERATORS, type ComparisonOperator, type Indicador } from "@/lib/metas-store";
import { COMPARISON_OPERATOR_LABEL, direcaoParaComparadorPadrao } from "@/lib/metas-engine";
import { formatValorAtual, timeAgo } from "./metas-ui-utils";

const FIELD_CLS =
  "mt-1 h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring";
const LABEL_CLS = "block text-xs font-medium text-muted-foreground";

/** Vincular um indicador JÁ EXISTENTE a um objetivo — 2 passos: buscar
 * (lista os indicadores ainda não vinculados aqui, com "+ Criar novo
 * indicador" no rodapé) e configurar (Condição/Meta/Peso do VÍNCULO,
 * nunca do indicador em si). Confirmar cria só o vínculo — nunca duplica
 * o indicador. Criar novo indicador continua sendo o fluxo já existente
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
      <DialogContent className="max-w-sm">
        {!selected ? (
          <>
            <DialogTitle className="text-base font-semibold">Vincular indicador</DialogTitle>
            <DialogDescription className="sr-only">
              Escolha um indicador já existente pra vincular a este objetivo, ou crie um novo.
            </DialogDescription>
            <div className="relative mt-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar indicador..."
                className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div className="mt-2 max-h-64 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="px-1 py-6 text-center text-xs text-muted-foreground">
                  {search.trim()
                    ? `Nenhum indicador encontrado para "${search.trim()}"`
                    : "Nenhum indicador disponível pra vincular."}
                </p>
              ) : (
                <ul className="space-y-0.5">
                  {filtered.map((i) => (
                    <li key={i.id}>
                      <button
                        type="button"
                        onClick={() => pick(i)}
                        className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-muted"
                      >
                        <span className="block truncate text-sm text-foreground">{i.titulo}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {formatValorAtual(i)} · Atualizado {timeAgo(i.updatedAt ?? i.createdAt)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <button
              type="button"
              onClick={onCreateNew}
              className="mt-2 flex w-full items-center gap-1.5 rounded-md border border-dashed border-border px-2.5 py-2 text-left text-xs font-medium text-muted-foreground hover:border-foreground/30 hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" /> Criar novo indicador
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3 w-3" /> Voltar
            </button>
            <DialogTitle className="mt-1 text-base font-semibold">Vincular ao objetivo</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {selected.titulo} · Valor atual: {formatValorAtual(selected)}
            </DialogDescription>
            <div className="mt-3 space-y-3">
              <div>
                <label className={LABEL_CLS}>Condição</label>
                <select
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
                  <label className={LABEL_CLS}>Meta</label>
                  <input
                    type="number"
                    value={meta}
                    onChange={(e) => setMeta(e.target.value)}
                    placeholder="Ex: 63"
                    className={FIELD_CLS}
                  />
                </div>
                <div>
                  <label className={LABEL_CLS}>Peso</label>
                  <input
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
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmar}
                className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90"
              >
                Vincular
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
