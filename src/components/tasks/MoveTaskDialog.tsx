import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { loadProjetos } from "@/lib/projetos";
import { useClientes } from "@/lib/clientes-store";
import type { MoveTarget } from "@/lib/move-task";
import type { TaskBoardScope } from "./TaskBoard";

/** Picker de destino pra "Mover tarefa" — mesmo padrão de busca + lista
 * clicável já usado em `LinkTasksPanel.tsx` (Roadmap). Projetos vêm de
 * `loadProjetos()`; campanhas não têm uma lista própria (vivem dentro
 * de `Cliente.campanhas`), então são achatadas aqui — mesmo padrão já
 * usado em `TimeSection.tsx` pra resolver nome de campanha por id.
 * Marketing é uma linha fixa (só existe um board). O board atual nunca
 * aparece como opção (mover pra onde já está não faz sentido). */
export function MoveTaskDialog({
  open,
  onOpenChange,
  currentScope,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  currentScope: TaskBoardScope;
  onConfirm: (target: MoveTarget) => void;
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<MoveTarget | null>(null);

  const clientes = useClientes();
  const campanhas = useMemo(() => {
    const list: { id: string; nome: string; clienteNome: string }[] = [];
    for (const c of clientes) {
      for (const camp of c.campanhas ?? [])
        list.push({ id: camp.id, nome: camp.nome, clienteNome: c.empresa });
    }
    return list;
  }, [clientes]);

  const q = search.trim().toLowerCase();
  const filteredProjetos = loadProjetos()
    .filter((p) => !(currentScope.kind === "projeto" && currentScope.id === p.id))
    .filter((p) => !q || p.name.toLowerCase().includes(q));
  const filteredCampanhas = campanhas
    .filter((c) => !(currentScope.kind === "campanha" && currentScope.id === c.id))
    .filter((c) => !q || c.nome.toLowerCase().includes(q));
  const showMarketing = currentScope.kind !== "marketing" && (!q || "marketing".includes(q));

  const reset = () => {
    setSearch("");
    setSelected(null);
  };

  const confirm = () => {
    if (!selected) return;
    onConfirm(selected);
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent mobileFullScreen className="flex max-h-[80vh] max-w-md flex-col gap-0 p-0">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle className="text-base">Mover tarefa</DialogTitle>
        </DialogHeader>

        <div className="border-b border-border px-6 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar projeto ou campanha..."
              className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-2.5 text-xs outline-none focus:border-ring focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {showMarketing && (
            <button
              type="button"
              onClick={() => setSelected({ kind: "marketing", label: "Marketing" })}
              className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs hover:bg-muted/60 ${
                selected?.kind === "marketing" ? "bg-muted" : ""
              }`}
            >
              <span className="font-medium text-foreground">Marketing</span>
              <span className="text-[11px] text-muted-foreground">Kanban compartilhado</span>
            </button>
          )}

          {filteredProjetos.length > 0 && (
            <>
              <p className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Projetos
              </p>
              {filteredProjetos.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelected({ kind: "projeto", id: p.id, label: p.name })}
                  className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs hover:bg-muted/60 ${
                    selected?.kind === "projeto" && selected.id === p.id ? "bg-muted" : ""
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate text-foreground">{p.name}</span>
                </button>
              ))}
            </>
          )}

          {filteredCampanhas.length > 0 && (
            <>
              <p className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Campanhas
              </p>
              {filteredCampanhas.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelected({ kind: "campanha", id: c.id, label: c.nome })}
                  className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs hover:bg-muted/60 ${
                    selected?.kind === "campanha" && selected.id === c.id ? "bg-muted" : ""
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate text-foreground">{c.nome}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {c.clienteNome}
                  </span>
                </button>
              ))}
            </>
          )}

          {!showMarketing && filteredProjetos.length === 0 && filteredCampanhas.length === 0 && (
            <p className="p-4 text-center text-xs text-muted-foreground">
              Nenhum resultado encontrado.
            </p>
          )}
        </div>

        <DialogFooter className="border-t border-border px-6 py-3.5">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!selected}
            onClick={confirm}
            className="cursor-pointer rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Mover
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
