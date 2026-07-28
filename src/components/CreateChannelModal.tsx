import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Hash, Lock, Upload, X } from "lucide-react";
import type { ChatMember } from "@/lib/chat-store";

export type NewChannelPayload = {
  name: string;
  photo?: string;
  private: boolean;
  allowedMemberIds?: string[];
};

export function CreateChannelModal({
  members,
  meId,
  existingNames,
  initial,
  onCreate,
  onClose,
}: {
  members: ChatMember[];
  meId: string;
  existingNames: string[];
  initial?: { name: string; photo?: string; private?: boolean; allowedMemberIds?: string[] } | null;
  onCreate: (payload: NewChannelPayload) => void;
  onClose: () => void;
}) {
  const isEdit = !!initial;
  const [name, setName] = useState(initial?.name ?? "");
  const [photo, setPhoto] = useState<string | undefined>(initial?.photo);
  const [isPrivate, setIsPrivate] = useState(!!initial?.private);
  const [allowed, setAllowed] = useState<Set<string>>(
    new Set((initial?.allowedMemberIds ?? []).filter((id) => id !== meId)),
  );
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const trimmed = name.trim().replace(/\s+/g, "-");
  const normalized = trimmed ? trimmed.charAt(0).toUpperCase() + trimmed.slice(1) : "";

  const toggleMember = (id: string) => {
    const next = new Set(allowed);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setAllowed(next);
  };

  const onPickFile = (f: File) => {
    const reader = new FileReader();
    reader.onload = () => setPhoto(String(reader.result));
    reader.readAsDataURL(f);
  };

  const submit = () => {
    if (!normalized) return setError("Informe um nome.");
    const collides = existingNames
      .filter((n) => !isEdit || n !== initial?.name)
      .includes(normalized);
    if (collides) return setError("Já existe um canal com esse nome.");
    onCreate({
      name: normalized,
      photo,
      private: isPrivate,
      allowedMemberIds: isPrivate ? [meId, ...Array.from(allowed)] : undefined,
    });
  };

  // Via portal para document.body: a sidebar tem um `translate-x` (para o
  // slide-in/out no mobile) que cria um containing block para descendentes
  // `fixed`, o que travava esse modal dentro da coluna estreita do menu
  // lateral em vez de cobrir a tela inteira.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-background p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">
            {isEdit ? "Editar canal" : "Novo canal"}
          </h3>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="rounded p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-border bg-muted"
              aria-label="Foto do canal"
            >
              {photo ? (
                <img src={photo} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                  <Upload className="h-4 w-4" />
                </div>
              )}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onPickFile(e.target.files[0])}
            />
            <div className="flex-1">
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                Nome
              </label>
              <div className="flex items-center gap-1 rounded-md border border-border bg-background px-2 focus-within:ring-2 focus-within:ring-ring">
                {isPrivate ? (
                  <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setError(null);
                  }}
                  placeholder="ex: marketing"
                  className="flex-1 bg-transparent py-2 text-sm outline-none"
                />
              </div>
              {normalized && (
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Será criado como #{normalized}
                </p>
              )}
            </div>
          </div>

          <label className="flex items-start gap-2 rounded-md border border-border p-3 text-xs">
            <input
              type="checkbox"
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span className="block font-medium text-foreground">Canal privado</span>
              <span className="text-muted-foreground">
                Apenas pessoas convidadas podem acessar.
              </span>
            </span>
          </label>

          {isPrivate && (
            <div>
              <div className="mb-1 text-[11px] font-medium text-muted-foreground">
                Quem pode acessar
              </div>
              {members.length === 0 ? (
                <p className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
                  Nenhum membro no time ainda. Você será o único com acesso.
                </p>
              ) : (
                <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border p-2">
                  {members.map((m) => {
                    const checked = allowed.has(m.id);
                    return (
                      <li key={m.id}>
                        <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-muted">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleMember(m.id)}
                          />
                          {m.photo ? (
                            <img
                              src={m.photo}
                              alt=""
                              className="h-5 w-5 rounded-full object-cover"
                            />
                          ) : (
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
                              {m.name.slice(0, 1).toUpperCase()}
                            </span>
                          )}
                          <span className="truncate">{m.name}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground hover:bg-muted"
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            className="rounded-md bg-foreground px-3 py-1.5 text-xs text-background hover:opacity-90"
          >
            {isEdit ? "Salvar" : "Criar canal"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
