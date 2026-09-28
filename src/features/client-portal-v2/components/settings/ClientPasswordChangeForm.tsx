import { useState } from "react";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

const MIN_LENGTH = 8;

/**
 * Alterar senha — nunca dois campos vazios permanentemente abertos na
 * página: começa como um botão só, abre um formulário inline ao clicar.
 * Usa `supabase.auth.updateUser({password})` — o único fluxo que o
 * Supabase Auth oferece pra conta autenticada por e-mail/senha trocar a
 * própria senha (não pede "senha atual": a sessão já autenticada é a
 * prova de identidade, e é assim que a API funciona — não simulamos uma
 * validação de senha atual que o backend não faz de verdade).
 */
export function ClientPasswordChangeForm() {
  const [open, setOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const reset = () => {
    setNewPassword("");
    setConfirmPassword("");
    setError(null);
  };

  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const tooShort = newPassword.length > 0 && newPassword.length < MIN_LENGTH;

  const handleSave = async () => {
    setError(null);
    if (newPassword.length < MIN_LENGTH) {
      setError(`A senha precisa ter pelo menos ${MIN_LENGTH} caracteres.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }
    setSaving(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;
      setSuccess(true);
      reset();
      toast.success("Senha alterada com sucesso.");
      setTimeout(() => {
        setSuccess(false);
        setOpen(false);
      }, 1200);
    } catch (err) {
      // Preserva o texto digitado em caso de falha — nunca apaga.
      setError(err instanceof Error ? err.message : "Não foi possível alterar a senha.");
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <KeyRound className="h-3.5 w-3.5" />
        Alterar senha
      </Button>
    );
  }

  return (
    <div className="max-w-sm space-y-3 rounded-lg border border-border bg-card p-4">
      <div>
        <label htmlFor="settings-new-password" className="text-xs font-medium text-foreground">
          Nova senha
        </label>
        <div className="relative mt-1">
          <input
            id="settings-new-password"
            type={showPassword ? "text" : "password"}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            aria-invalid={tooShort}
            aria-describedby={tooShort ? "settings-password-hint" : undefined}
            className="h-9 w-full rounded-md border border-border bg-background px-2.5 pr-9 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <p id="settings-password-hint" className="mt-1 text-[11px] text-text-secondary">
          Pelo menos {MIN_LENGTH} caracteres.
        </p>
      </div>

      <div>
        <label htmlFor="settings-confirm-password" className="text-xs font-medium text-foreground">
          Confirmar nova senha
        </label>
        <input
          id="settings-confirm-password"
          type={showPassword ? "text" : "password"}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          aria-invalid={mismatch}
          className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        {mismatch && <p className="mt-1 text-xs text-destructive">As senhas não coincidem.</p>}
      </div>

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      {success && <p className="text-xs text-success">Senha alterada com sucesso.</p>}

      <div className="flex justify-end gap-2 pt-1">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setOpen(false);
            reset();
          }}
        >
          Cancelar
        </Button>
        <Button
          type="button"
          disabled={saving || !newPassword || !confirmPassword}
          onClick={() => void handleSave()}
        >
          {saving ? "Salvando…" : "Salvar nova senha"}
        </Button>
      </div>
    </div>
  );
}
