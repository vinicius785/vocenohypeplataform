import { useState } from "react";
import { toast } from "sonner";
import { Plus, Search } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ClienteLogo } from "@/components/clientes/ClienteLogo";
import { ClienteFormSheet } from "@/components/clientes/ClienteFormSheet";
import { clientesStore, type Cliente } from "@/lib/clientes-store";

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
  const [creatingOpen, setCreatingOpen] = useState(false);
  const [prefillEmpresa, setPrefillEmpresa] = useState("");
  const [saving, setSaving] = useState(false);
  const filtered = clientes.filter((c) =>
    c.empresa.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const trimmedQuery = query.trim();

  const openCreate = (prefill: string) => {
    setPrefillEmpresa(prefill);
    setCreatingOpen(true);
  };

  // Mesmo caminho de escrita de `ClientesSection.saveCliente` — sem
  // server function nova, sem duplicar o formulário. `onSave` do
  // `ClienteFormSheet` só entrega os dados do form; o id nasce aqui,
  // igual ao ponto de entrada canônico em Clientes. Quando `form.id` já
  // aponta pra um cliente existente (fluxo "Usar cliente existente" da
  // checagem de duplicidade), só seleciona — nunca cria de novo.
  const handleCreated = (form: Omit<Cliente, "id" | "campanhas"> & { id?: string }) => {
    const existing = form.id ? clientes.find((c) => c.id === form.id) : undefined;
    if (existing) {
      setCreatingOpen(false);
      onSelect(existing);
      return;
    }
    setSaving(true);
    const novo: Cliente = { ...form, id: form.id ?? crypto.randomUUID(), campanhas: [] };
    clientesStore.set((prev) => [...prev, novo]);
    setSaving(false);
    setCreatingOpen(false);
    toast.success("Cliente criado e selecionado");
    onSelect(novo);
  };

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
          <button
            type="button"
            disabled={saving}
            onClick={() => openCreate(trimmedQuery && filtered.length === 0 ? trimmedQuery : "")}
            className="mb-1 flex w-full items-center gap-3 rounded-lg border border-dashed border-border p-2.5 text-left text-brand hover:bg-brand-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-subtle">
              <Plus className="h-4 w-4" />
            </span>
            <span className="text-sm font-medium">Criar novo cliente</span>
          </button>

          {filtered.length === 0 ? (
            trimmedQuery ? (
              <div className="p-4 text-center">
                <p className="text-sm text-text-secondary">
                  Nenhum cliente encontrado para "{trimmedQuery}".
                </p>
                <button
                  type="button"
                  onClick={() => openCreate(trimmedQuery)}
                  className="mt-2 text-sm font-medium text-brand hover:underline"
                >
                  Criar cliente "{trimmedQuery}"
                </button>
              </div>
            ) : (
              <p className="p-4 text-center text-sm text-text-secondary">
                Nenhum cliente cadastrado ainda.
              </p>
            )
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

      <ClienteFormSheet
        open={creatingOpen}
        initial={null}
        prefill={prefillEmpresa ? { empresa: prefillEmpresa } : undefined}
        onClose={() => setCreatingOpen(false)}
        onSave={handleCreated}
      />
    </Dialog>
  );
}
