import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { NativeSelect } from "@/components/ui/native-select";
import { CATEGORIAS, type Senha } from "./cofre-model";

const FIELD =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-brand";

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

function Field({
  label,
  htmlFor,
  optional,
  children,
}: {
  label: string;
  htmlFor: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
        {label}
        {optional && <span className="ml-1 font-normal text-text-secondary">(opcional)</span>}
      </label>
      {children}
    </div>
  );
}

/** Mesmo formulário para criar e editar. Validação igual à de antes: nome e senha obrigatórios. */
export function SenhaForm({
  initial,
  initialPlainSenha,
  onClose,
  onSave,
}: {
  initial: Senha | null;
  initialPlainSenha: string;
  onClose: () => void;
  onSave: (s: Senha, plainSenha: string) => void | Promise<void>;
}) {
  const [nome, setNome] = useState(initial?.nome ?? "");
  const [categoria, setCategoria] = useState(initial?.categoria ?? "");
  const [usuario, setUsuario] = useState(initial?.usuario ?? "");
  const [senha, setSenha] = useState(initialPlainSenha);
  const [showSenha, setShowSenha] = useState(false);
  const [url, setUrl] = useState(initial?.url ?? "");
  const [notas, setNotas] = useState(initial?.notas ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim() || !senha.trim()) {
      setError("Nome e senha são obrigatórios.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      await onSave(
        {
          id: initial?.id ?? crypto.randomUUID(),
          nome: nome.trim(),
          categoria: categoria.trim(),
          usuario: usuario.trim(),
          senha: "",
          url: url.trim() || undefined,
          notas: notas.trim() || undefined,
        },
        senha,
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent mobileFullScreen className="max-w-md gap-5">
        <DialogHeader>
          <DialogTitle>{initial ? "Editar senha" : "Nova senha"}</DialogTitle>
          <DialogDescription>
            {initial ? "Atualize os dados desta credencial." : "Adicione uma credencial ao cofre."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-5" noValidate>
          <Group title="Identificação">
            <Field label="Nome" htmlFor="cofre-nome">
              <input
                id="cofre-nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className={FIELD}
                placeholder="Instagram, Meta Ads..."
                autoFocus
                required
              />
            </Field>
            <Field label="Categoria" htmlFor="cofre-categoria" optional>
              <NativeSelect
                id="cofre-categoria"
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                selectClassName="h-10 border-input bg-background shadow-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <option value="">Selecione uma categoria</option>
                {CATEGORIAS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </Group>

          <Group title="Credencial">
            <Field label="Usuário / e-mail" htmlFor="cofre-usuario" optional>
              <input
                id="cofre-usuario"
                value={usuario}
                onChange={(e) => setUsuario(e.target.value)}
                className={FIELD}
                autoComplete="off"
              />
            </Field>
            <Field label="Senha" htmlFor="cofre-senha">
              <div className="flex items-center gap-2">
                <input
                  id="cofre-senha"
                  type={showSenha ? "text" : "password"}
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  className={`${FIELD} font-mono`}
                  autoComplete="new-password"
                  required
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={showSenha ? "Ocultar senha" : "Mostrar senha"}
                  aria-pressed={showSenha}
                  onClick={() => setShowSenha((v) => !v)}
                  className="h-10 w-10 shrink-0"
                >
                  {showSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </Field>
          </Group>

          <Group title="Acesso">
            <Field label="URL" htmlFor="cofre-url" optional>
              <input
                id="cofre-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className={FIELD}
                placeholder="https://"
                inputMode="url"
              />
            </Field>
          </Group>

          <Group title="Observações">
            <Field label="Notas" htmlFor="cofre-notas" optional>
              <textarea
                id="cofre-notas"
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                rows={3}
                className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand"
              />
            </Field>
          </Group>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? "Salvando..." : initial ? "Salvar alterações" : "Salvar senha"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
