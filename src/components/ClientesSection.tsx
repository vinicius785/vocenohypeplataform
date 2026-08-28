import { useEffect, useRef, useState } from "react";
import {
  Plus,
  ImageIcon,
  Mail,
  MessageCircle,
  X,
  Link2,
  Building2,
  Pencil,
  Megaphone,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatIsoDate } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { VincularCampanhaDialog, type Campaign } from "./VincularCampanhaDialog";
import FlowingMenu from "@/components/FlowingMenu";
import { clientesStore, useClientes, type Cliente } from "@/lib/clientes-store";
import { loadMembers } from "@/lib/chat-store";
import { SectionHeader } from "./SectionHeader";
import { useConfirm } from "@/hooks/use-confirm";
import { OPEN_CLIENTE_KEY, OPEN_CLIENTE_EVENT } from "./AppShell";

const emptyForm: Omit<Cliente, "id" | "campanhas"> = {
  photo: undefined,
  empresa: "",
  responsavel: "",
  responsavelInterno: "",
  email: "",
  whatsapp: "",
  clienteDesde: "",
};

const inputCls =
  "w-full rounded-lg border border-border bg-card px-3.5 py-2 text-sm text-foreground shadow-sm outline-none transition-all placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold uppercase tracking-tight text-foreground/80">
        {label}
      </label>
      {children}
    </div>
  );
}

export function ClientesSection() {
  const clientes = useClientes();
  const setClientes = clientesStore.set;
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingClienteId, setEditingClienteId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [campanhaOpen, setCampanhaOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { confirm, confirmDialog } = useConfirm();

  const selected = clientes.find((c) => c.id === selectedId) ?? null;

  // Deep link vindo de uma @menção de cliente no Chat (mesmo padrão de
  // OPEN_CAMPANHA_TASK_KEY em CampanhasSection) — `clientes` só carrega de
  // forma assíncrona, então tenta de novo sempre que a lista mudar, e só
  // limpa o sessionStorage quando encontrar o cliente de verdade.
  useEffect(() => {
    const openFromSession = () => {
      try {
        const raw = sessionStorage.getItem(OPEN_CLIENTE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw) as { clienteId?: string };
        if (!parsed.clienteId) return;
        const match = clientes.find((c) => c.id === parsed.clienteId);
        if (!match) return;
        sessionStorage.removeItem(OPEN_CLIENTE_KEY);
        setSelectedId(match.id);
      } catch {
        /* ignore */
      }
    };
    openFromSession();
    window.addEventListener(OPEN_CLIENTE_EVENT, openFromSession);
    return () => window.removeEventListener(OPEN_CLIENTE_EVENT, openFromSession);
  }, [clientes]);

  const copyClientLink = (cliente: Cliente) => {
    let token = cliente.publicToken;
    if (!token) {
      token = crypto.randomUUID().replace(/-/g, "");
      setClientes((prev) =>
        prev.map((cl) => (cl.id === cliente.id ? { ...cl, publicToken: token } : cl)),
      );
    }
    void navigator.clipboard.writeText(`${window.location.origin}/portal/${token}`).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1500);
    });
  };

  const update = <K extends keyof typeof emptyForm>(k: K, v: (typeof emptyForm)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const onPhoto = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => update("photo", reader.result as string);
    reader.readAsDataURL(file);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.empresa.trim()) return;
    if (editingClienteId) {
      setClientes((prev) => prev.map((c) => (c.id === editingClienteId ? { ...c, ...form } : c)));
    } else {
      setClientes((prev) => [...prev, { ...form, id: crypto.randomUUID(), campanhas: [] }]);
    }
    setForm(emptyForm);
    setEditingClienteId(null);
    setOpen(false);
  };

  const openEditCliente = (c: Cliente) => {
    const { id: _id, campanhas: _cs, ...rest } = c;
    setForm(rest);
    setEditingClienteId(c.id);
    // Close the detail dialog first — no need for two stacked dialogs at once.
    setSelectedId(null);
    setOpen(true);
  };

  const openNovoCliente = () => {
    setForm(emptyForm);
    setEditingClienteId(null);
    setOpen(true);
  };

  const saveCampaign = (c: Campaign) => {
    if (!selected) return;
    setClientes((prev) =>
      prev.map((cli) => {
        if (cli.id !== selected.id) return cli;
        const list = cli.campanhas ?? [];
        const exists = list.some((x) => x.id === c.id);
        return {
          ...cli,
          campanhas: exists ? list.map((x) => (x.id === c.id ? c : x)) : [...list, c],
        };
      }),
    );
  };

  const totalClientes = clientes.length;
  const totalCampanhas = clientes.reduce((s, c) => s + (c.campanhas?.length ?? 0), 0);
  const comCampanha = clientes.filter((c) => (c.campanhas?.length ?? 0) > 0).length;

  return (
    <div className="mx-auto w-full max-w-6xl">
      <SectionHeader
        title="Clientes"
        subtitle="Gerencie seus clientes."
        kpis={[
          { label: "TOTAL", value: totalClientes },
          {
            label: "COM CAMPANHA",
            value: comCampanha,
            tone: "text-emerald-600 dark:text-emerald-400",
          },
          {
            label: "CAMPANHAS ATIVAS",
            value: totalCampanhas,
            tone: "text-sky-600 dark:text-sky-400",
          },
        ]}
        action={
          <button
            onClick={openNovoCliente}
            className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" /> Novo cliente
          </button>
        }
      />
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) {
            setEditingClienteId(null);
            setForm(emptyForm);
          }
        }}
      >
        <DialogContent className="flex max-h-[90vh] max-w-xl flex-col gap-0 overflow-hidden border-border bg-card p-0">
          <div className="flex items-center gap-3 border-b border-border px-6 py-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
              <Building2 className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <DialogTitle className="text-lg font-light tracking-tight text-foreground">
                {editingClienteId ? "Editar cliente" : "Novo cliente"}
              </DialogTitle>
              <DialogDescription className="mt-0.5 text-xs text-muted-foreground">
                {editingClienteId
                  ? "Atualize as informações do cliente."
                  : "Cadastre as informações básicas para iniciar o workspace."}
              </DialogDescription>
            </div>
          </div>

          <form onSubmit={submit} className="min-h-0 flex-1 space-y-6 overflow-y-auto p-6">
            <div className="flex items-center gap-5">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="group flex h-16 w-16 flex-col items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-border bg-muted text-muted-foreground transition-colors hover:border-foreground/40 hover:bg-muted"
                >
                  {form.photo ? (
                    <img src={form.photo} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <ImageIcon className="h-5 w-5" strokeWidth={1.75} />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    form.photo ? update("photo", undefined) : fileRef.current?.click()
                  }
                  className="absolute -right-1 -bottom-1 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:text-foreground"
                  aria-label={form.photo ? "Remover foto" : "Adicionar foto"}
                >
                  {form.photo ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => onPhoto(e.target.files?.[0])}
                />
              </div>

              <div className="flex-1 space-y-3">
                <Field label="Nome da empresa">
                  <input
                    value={form.empresa}
                    onChange={(e) => update("empresa", e.target.value)}
                    placeholder="Ex: Acme Corp"
                    required
                    className={inputCls}
                  />
                </Field>
                <Field label="Nome do responsável">
                  <input
                    value={form.responsavel}
                    onChange={(e) => update("responsavel", e.target.value)}
                    placeholder="Nome completo"
                    className={inputCls}
                  />
                </Field>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-x-4 gap-y-4 rounded-2xl border border-border bg-muted/40 p-4 sm:grid-cols-2">
              <Field label="E-mail do cliente">
                <div className="relative">
                  <Mail className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-muted-foreground" />
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => update("email", e.target.value)}
                    placeholder="email@empresa.com"
                    className={`${inputCls} pl-9`}
                  />
                </div>
              </Field>

              <Field label="WhatsApp do cliente">
                <div className="relative">
                  <MessageCircle className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-muted-foreground" />
                  <input
                    type="tel"
                    value={form.whatsapp}
                    onChange={(e) => update("whatsapp", e.target.value)}
                    placeholder="+55 (00) 00000-0000"
                    className={`${inputCls} pl-9`}
                  />
                </div>
              </Field>

              <Field label="Responsável interno">
                <select
                  value={form.responsavelInterno}
                  onChange={(e) => update("responsavelInterno", e.target.value)}
                  className={inputCls}
                >
                  <option value="">Selecione um membro</option>
                  {loadMembers().map((m) => (
                    <option key={m.id} value={m.name}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Cliente desde">
                <input
                  type="date"
                  value={form.clienteDesde}
                  onChange={(e) => update("clienteDesde", e.target.value)}
                  className={inputCls}
                />
              </Field>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="rounded-full border-2 border-foreground bg-foreground px-5 py-2 text-sm font-medium text-background transition-colors duration-200 hover:bg-transparent hover:text-foreground"
              >
                {editingClienteId ? "Salvar alterações" : "Criar cliente"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <div className="mt-8">
        {clientes.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            Nenhum cliente cadastrado ainda.
          </div>
        ) : (
          <FlowingMenu
            items={clientes.map((c) => ({
              id: c.id,
              text: c.empresa,
              subtitle: c.responsavel || "Sem responsável",
              image: c.photo,
              onSelect: () => setSelectedId(c.id),
            }))}
          />
        )}
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelectedId(null)}>
        <DialogContent className="max-w-2xl gap-0 overflow-hidden border-border bg-card p-0">
          {selected && (
            <>
              <div className="border-b border-border/60 px-8 pt-8 pb-6">
                <div className="flex items-center gap-4">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-muted">
                    {selected.photo ? (
                      <img src={selected.photo} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <Building2 className="h-7 w-7 text-muted-foreground" strokeWidth={1.5} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <DialogTitle className="truncate text-xl font-semibold">
                      {selected.empresa}
                    </DialogTitle>
                    <DialogDescription className="mt-0.5 truncate text-sm text-muted-foreground">
                      {selected.responsavel || "Sem responsável"}
                    </DialogDescription>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => copyClientLink(selected)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-1.5 text-xs font-medium text-background shadow-sm hover:opacity-90"
                  >
                    <Link2 className="h-3.5 w-3.5" />
                    {linkCopied ? "Link copiado!" : "Link do cliente"}
                  </button>
                  <button
                    type="button"
                    onClick={() => openEditCliente(selected)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium shadow-sm hover:bg-muted"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Editar
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await confirm(
                        `Excluir o cliente "${selected.empresa}"? Todas as campanhas vinculadas também serão removidas.`,
                      );
                      if (!ok) return;
                      setClientes((prev) => prev.filter((c) => c.id !== selected.id));
                      setSelectedId(null);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-destructive shadow-sm hover:bg-destructive/10"
                    aria-label="Excluir cliente"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Excluir
                  </button>
                </div>
              </div>

              <div className="max-h-[60vh] space-y-6 overflow-y-auto p-8">
                <div className="space-y-4">
                  <InfoRow label="E-mail" value={selected.email || "—"} />
                  <InfoRow label="WhatsApp" value={selected.whatsapp || "—"} />
                  <InfoRow label="Responsável interno" value={selected.responsavelInterno || "—"} />
                  <InfoRow
                    label="Cliente desde"
                    value={
                      selected.clienteDesde
                        ? new Date(selected.clienteDesde).toLocaleDateString("pt-BR")
                        : "—"
                    }
                  />
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="text-xs font-semibold uppercase tracking-tight text-foreground/80">
                      Campanhas
                    </h4>
                    <span className="text-xs text-muted-foreground">
                      {selected.campanhas?.length ?? 0}
                    </span>
                  </div>
                  {selected.campanhas && selected.campanhas.length > 0 ? (
                    <ul className="divide-y divide-border/60 rounded-lg border border-border">
                      {selected.campanhas.map((camp) => (
                        <li key={camp.id} className="flex items-center gap-3 p-3">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted text-muted-foreground">
                            {selected.photo ? (
                              <img
                                src={selected.photo}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <Megaphone className="h-4 w-4" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{camp.nome}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {camp.prazo ? `Prazo ${formatIsoDate(camp.prazo)}` : "Sem prazo"}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingCampaign(camp);
                              setCampanhaOpen(true);
                            }}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-medium hover:bg-muted"
                          >
                            <Pencil className="h-3 w-3" /> Editar
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                      Nenhuma campanha vinculada.
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-border/60 px-8 py-4">
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground transition-all hover:bg-muted hover:text-foreground"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingCampaign(null);
                    setCampanhaOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90"
                >
                  <Link2 className="h-3.5 w-3.5" /> Vincular campanha
                </button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <VincularCampanhaDialog
        open={campanhaOpen}
        onOpenChange={(o) => {
          setCampanhaOpen(o);
          if (!o) setEditingCampaign(null);
        }}
        clienteNome={selected?.empresa}
        clienteOrcamentoSugerido={selected?.orcamentoSugerido}
        initial={editingCampaign}
        onSave={saveCampaign}
      />
      {confirmDialog}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/40 pb-3 last:border-0 last:pb-0">
      <span className="text-xs font-semibold uppercase tracking-tight text-muted-foreground">
        {label}
      </span>
      <span className="min-w-0 max-w-[60%] break-words text-right text-sm text-foreground">
        {value}
      </span>
    </div>
  );
}
