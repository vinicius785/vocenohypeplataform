import { useState } from "react";
import { Search } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ClienteLogo } from "@/components/clientes/ClienteLogo";
import type { Cliente } from "@/lib/clientes-store";

/**
 * Passo obrigatório antes de "Nova campanha" pela listagem de Campanhas —
 * `Campaign` vive embutida em `Cliente.campanhas` (sem cliente não há onde
 * salvar), então o wizard compartilhado (`VincularCampanhaDialog`) sempre
 * recebeu o cliente pronto via prop (nunca teve seletor próprio). Em vez
 * de inventar um cliente "genérico" ou permitir campanha sem cliente,
 * este passo curto pede a seleção antes de abrir o wizard — preservando a
 * validação/payload atuais.
 */
export function SelecionarClienteDialog({
  open,
  onOpenChange,
  clientes,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  clientes: Cliente[];
  onSelect: (cliente: Cliente) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = clientes.filter((c) =>
    c.empresa.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setQuery("");
      }}
    >
      <DialogContent className="flex max-h-[70vh] max-w-md flex-col gap-0 overflow-hidden border-border bg-card p-0">
        <div className="border-b border-border/60 px-6 py-5">
          <DialogTitle>Selecionar cliente</DialogTitle>
          <DialogDescription className="mt-0.5">
            Toda campanha pertence a um cliente. Escolha para quem é a nova campanha.
          </DialogDescription>
        </div>

        <div className="border-b border-border/60 px-6 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar cliente..."
              className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <p className="p-4 text-center text-sm text-text-secondary">
              {clientes.length === 0
                ? "Nenhum cliente cadastrado ainda."
                : "Nenhum cliente encontrado."}
            </p>
          ) : (
            <ul className="space-y-1">
              {filtered.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(c)}
                    className="flex w-full items-center gap-3 rounded-lg p-2.5 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    <ClienteLogo photo={c.photo} empresa={c.empresa} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                      {c.empresa}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
