import { useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { inviteClientAccessMember } from "@/lib/client-access.functions";
import type { ClientAccessRole } from "@/lib/client-access-rules";

const ROLE_OPTIONS: { value: ClientAccessRole; label: string; description: string }[] = [
  {
    value: "client_standard",
    label: "Administrador",
    description: "Pode gerenciar pessoas, aprovar e acompanhar todas as campanhas.",
  },
  {
    value: "client_approver",
    label: "Aprovador",
    description: "Pode avaliar perfis, aprovar conteúdos e solicitar ajustes.",
  },
  {
    value: "client_viewer",
    label: "Visualizador",
    description: "Pode acompanhar campanhas, conteúdos, relatórios e arquivos.",
  },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function InviteClientMemberDialog({
  open,
  onClose,
  onInvited,
}: {
  open: boolean;
  onClose: () => void;
  onInvited: () => void;
}) {
  const inviteFn = useServerFn(inviteClientAccessMember);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ClientAccessRole>("client_approver");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalizedEmail = email.trim().toLowerCase();
  const canSubmit = EMAIL_RE.test(normalizedEmail);

  const handleSubmit = async () => {
    if (!canSubmit || sending) return;
    setSending(true);
    setError(null);
    try {
      await inviteFn({ data: { email: normalizedEmail, role } });
      toast.success(`Convite enviado para ${normalizedEmail}.`);
      setEmail("");
      setRole("client_approver");
      onInvited();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível enviar o convite.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !sending && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Convidar pessoa</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-foreground">E-mail</span>
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError(null);
              }}
              autoFocus
              placeholder="pessoa@empresa.com"
              className="h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </label>

          <fieldset className="space-y-2">
            <legend className="mb-1.5 text-xs font-medium text-foreground">Nível de acesso</legend>
            {ROLE_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 text-left transition-colors ${
                  role === opt.value ? "border-brand bg-brand/5" : "border-border hover:bg-muted/40"
                }`}
              >
                <input
                  type="radio"
                  name="client-access-role"
                  value={opt.value}
                  checked={role === opt.value}
                  onChange={() => setRole(opt.value)}
                  className="mt-0.5"
                />
                <span>
                  <span className="block text-sm font-medium text-foreground">{opt.label}</span>
                  <span className="block text-xs text-text-secondary">{opt.description}</span>
                </span>
              </label>
            ))}
          </fieldset>

          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={sending}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={!canSubmit || sending}
            onClick={() => void handleSubmit()}
          >
            {sending ? "Enviando…" : "Enviar convite"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
