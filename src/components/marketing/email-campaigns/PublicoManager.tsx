import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Plus, X, Search, MessageCircle } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { useConfirm } from "@/hooks/use-confirm";
import {
  addCampaignRecipients,
  removeCampaignRecipient,
  markRecipientResponded,
  listLeadsForPicker,
  listClientesForPicker,
  listBancoInfluenciadoresForPicker,
  type getCampaignDetail,
} from "@/lib/email-campaigns.functions";
import {
  RECIPIENT_SOURCE_LABEL,
  RECIPIENT_STATUS_LABEL,
  type RecipientSource,
} from "@/lib/email-campaigns-constants";

type Detail = Awaited<ReturnType<typeof getCampaignDetail>>;
type Recipient = Detail["recipients"][number];

export function PublicoManager({
  campaignId,
  recipients,
  onChanged,
  onOpenContact,
}: {
  campaignId: string;
  recipients: Recipient[];
  onChanged: () => void;
  onOpenContact: (recipient: Recipient) => void;
}) {
  const removeFn = useServerFn(removeCampaignRecipient);
  const respondedFn = useServerFn(markRecipientResponded);
  const { confirm, confirmDialog } = useConfirm();
  const [addOpen, setAddOpen] = useState(false);
  const [picker, setPicker] = useState<RecipientSource | null>(null);

  const remove = async (id: string) => {
    const ok = await confirm("Remover este contato do público da campanha?");
    if (!ok) return;
    await removeFn({ data: { id } });
    onChanged();
  };

  return (
    <div className="space-y-3">
      {confirmDialog}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{recipients.length}</span> contato(s) no
          público
        </p>
        <Popover open={addOpen} onOpenChange={setAddOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-2.5 py-1.5 text-xs font-medium text-background hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" /> Adicionar contatos
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 p-1">
            {(["banco_influenciador", "lead", "cliente", "manual"] as RecipientSource[]).map(
              (s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setAddOpen(false);
                    setPicker(s);
                  }}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-foreground hover:bg-muted"
                >
                  {RECIPIENT_SOURCE_LABEL[s]}
                </button>
              ),
            )}
          </PopoverContent>
        </Popover>
      </div>

      {recipients.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum contato adicionado ainda.</p>
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {recipients.map((r) => (
            <div key={r.id} className="flex items-center gap-3 px-3 py-2 text-xs">
              <button
                type="button"
                onClick={() => onOpenContact(r)}
                className="min-w-0 flex-1 text-left hover:underline"
              >
                <p className="truncate font-medium text-foreground">{r.name || r.email}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {r.email} · {RECIPIENT_SOURCE_LABEL[r.source as RecipientSource]}
                </p>
              </button>
              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {RECIPIENT_STATUS_LABEL[r.status] ?? r.status}
              </span>
              {r.status === "active" && (
                <button
                  type="button"
                  onClick={() => void respondedFn({ data: { id: r.id } }).then(onChanged)}
                  title="Marcar como respondido"
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => void remove(r.id)}
                className="shrink-0 text-muted-foreground hover:text-destructive"
                aria-label="Remover"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {picker && (
        <RecipientPicker
          campaignId={campaignId}
          source={picker}
          existingEmails={new Set(recipients.map((r) => r.email))}
          onClose={() => setPicker(null)}
          onAdded={() => {
            setPicker(null);
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function RecipientPicker({
  campaignId,
  source,
  existingEmails,
  onClose,
  onAdded,
}: {
  campaignId: string;
  source: RecipientSource;
  existingEmails: Set<string>;
  onClose: () => void;
  onAdded: () => void;
}) {
  const addFn = useServerFn(addCampaignRecipients);

  if (source === "manual")
    return (
      <ManualPicker campaignId={campaignId} onClose={onClose} onAdded={onAdded} addFn={addFn} />
    );
  if (source === "lead")
    return (
      <ListPicker
        campaignId={campaignId}
        source="lead"
        existingEmails={existingEmails}
        onClose={onClose}
        onAdded={onAdded}
        addFn={addFn}
        loader={async () => {
          const rows = await listLeadsForPicker();
          return rows.map((l) => ({
            id: l.id,
            email: l.email ?? "",
            name: l.name,
            hint: l.company ?? "",
          }));
        }}
      />
    );
  if (source === "cliente")
    return (
      <ListPicker
        campaignId={campaignId}
        source="cliente"
        existingEmails={existingEmails}
        onClose={onClose}
        onAdded={onAdded}
        addFn={addFn}
        loader={async () => {
          const rows = await listClientesForPicker();
          return rows.map((c) => ({
            id: c.id,
            email: c.email,
            name: c.empresa,
            hint: c.responsavel,
          }));
        }}
      />
    );
  return (
    <ListPicker
      campaignId={campaignId}
      source="banco_influenciador"
      existingEmails={existingEmails}
      onClose={onClose}
      onAdded={onAdded}
      addFn={addFn}
      loader={async () => {
        const rows = await listBancoInfluenciadoresForPicker();
        return rows.map((b) => ({
          id: b.id,
          email: b.email,
          name: b.nome,
          hint: [b.nicho, ...b.plataformas].filter(Boolean).join(" · "),
        }));
      }}
    />
  );
}

function ManualPicker({
  campaignId,
  onClose,
  onAdded,
  addFn,
}: {
  campaignId: string;
  onClose: () => void;
  onAdded: () => void;
  addFn: ReturnType<typeof useServerFn<typeof addCampaignRecipients>>;
}) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  const entries = useMemo(() => {
    return text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [email, ...rest] = line.split(",").map((p) => p.trim());
        return { email, name: rest.join(", ") || undefined };
      })
      .filter((e) => /\S+@\S+\.\S+/.test(e.email));
  }, [text]);

  const save = async () => {
    if (entries.length === 0) return;
    setSaving(true);
    try {
      await addFn({ data: { campaignId, source: "manual", entries } });
      onAdded();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md space-y-3 rounded-lg border border-border bg-background p-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h4 className="text-sm font-semibold text-foreground">Adicionar contatos manualmente</h4>
        <p className="text-[11px] text-muted-foreground">
          Um por linha: <code>email@exemplo.com, Nome</code> (nome é opcional).
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          placeholder={"maria@exemplo.com, Maria Silva\njoao@exemplo.com"}
          className="w-full rounded-md border border-border bg-background px-2.5 py-2 font-mono text-xs outline-none focus:ring-1 focus:ring-ring"
        />
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-muted-foreground">{entries.length} contato(s) válido(s)</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || entries.length === 0}
              className="rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? "Adicionando..." : `Adicionar ${entries.length || ""}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ListPicker({
  campaignId,
  source,
  existingEmails,
  onClose,
  onAdded,
  addFn,
  loader,
}: {
  campaignId: string;
  source: RecipientSource;
  existingEmails: Set<string>;
  onClose: () => void;
  onAdded: () => void;
  addFn: ReturnType<typeof useServerFn<typeof addCampaignRecipients>>;
  loader: () => Promise<{ id: string; email: string; name?: string; hint?: string }[]>;
}) {
  const [items, setItems] = useState<
    { id: string; email: string; name?: string; hint?: string }[] | null
  >(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void loader().then(setItems);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (items ?? []).filter((i) => {
      if (existingEmails.has(i.email.toLowerCase())) return false;
      if (!q) return true;
      return i.email.toLowerCase().includes(q) || (i.name ?? "").toLowerCase().includes(q);
    });
  }, [items, search, existingEmails]);

  const toggle = (id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const save = async () => {
    const entries = filtered
      .filter((i) => selected.has(i.id))
      .map((i) => ({ sourceId: i.id, email: i.email, name: i.name }));
    if (entries.length === 0) return;
    setSaving(true);
    try {
      await addFn({ data: { campaignId, source, entries } });
      onAdded();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-md flex-col rounded-lg border border-border bg-background shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border p-3">
          <h4 className="text-sm font-semibold text-foreground">
            Adicionar de {RECIPIENT_SOURCE_LABEL[source]}
          </h4>
          <div className="relative mt-2">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar..."
              className="w-full rounded-md border border-border bg-background py-1.5 pl-7 pr-2.5 text-xs outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-1">
          {items === null ? (
            <div className="p-3 text-xs text-muted-foreground">Carregando...</div>
          ) : filtered.length === 0 ? (
            <div className="p-3 text-xs text-muted-foreground">Nada encontrado.</div>
          ) : (
            filtered.map((item) => (
              <label
                key={item.id}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted"
              >
                <input
                  type="checkbox"
                  checked={selected.has(item.id)}
                  onChange={() => toggle(item.id)}
                  className="shrink-0"
                />
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">{item.name || item.email}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {item.email}
                    {item.hint ? ` · ${item.hint}` : ""}
                  </p>
                </div>
              </label>
            ))
          )}
        </div>
        <div className="flex items-center justify-between border-t border-border p-3">
          <p className="text-[11px] text-muted-foreground">{selected.size} selecionado(s)</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || selected.size === 0}
              className="rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? "Adicionando..." : `Adicionar ${selected.size || ""}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
