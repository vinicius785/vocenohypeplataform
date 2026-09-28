import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { usePortalSessionData } from "@/components/portal/portal-session-context";
import { useClientProfile } from "../../lib/client-profile";
import { ClientAvatarUploader } from "./ClientAvatarUploader";
import { ClientAccountInformation } from "./ClientAccountInformation";
import { UnsavedChangesGuard } from "./UnsavedChangesGuard";
import { CLIENT_ROLE_LABEL } from "../ClientSidebarProfile";

const inputCls =
  "h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring";

/**
 * Página de Perfil — dois blocos visuais (foto+identificação, depois
 * dados pessoais) seguidos de "Informações da conta" (a antiga seção
 * "Conta" isolada, incorporada aqui porque só tinha dado somente-leitura
 * — nunca um destino de navegação próprio agora). Dados pessoais
 * editáveis são só os campos que `profiles` realmente tem (`full_name`,
 * `phone`) — RLS já garante que só dá pra atualizar a própria linha.
 */
export function ClientProfileSettingsPage() {
  const { data: session } = usePortalSessionData();
  const roleLabel = CLIENT_ROLE_LABEL[session.role] ?? session.role;
  const { data: profile, isLoading, invalidate } = useClientProfile();
  const [fullName, setFullName] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentName = fullName ?? profile?.fullName ?? "";
  const currentPhone = phone ?? profile?.phone ?? "";
  const dirty =
    (fullName !== null && fullName !== profile?.fullName) ||
    (phone !== null && phone !== profile?.phone);

  const handleSave = async () => {
    if (!profile) return;
    setError(null);
    setSaving(true);
    try {
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ full_name: currentName.trim(), phone: currentPhone.trim() })
        .eq("id", profile.id);
      if (updateError) throw updateError;
      await invalidate();
      setFullName(null);
      setPhone(null);
      toast.success("Perfil atualizado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return <div className="h-48 max-w-xl animate-pulse rounded-lg bg-muted/50" />;
  }

  return (
    <div className="max-w-xl">
      <header className="mb-6">
        <h2 className="text-lg font-semibold text-foreground">Perfil</h2>
        <p className="mt-0.5 text-sm text-text-secondary">
          Gerencie sua foto e suas informações pessoais.
        </p>
      </header>

      <ClientAvatarUploader name={currentName} roleLabel={roleLabel} />

      <div className="mt-8 space-y-4">
        <label className="block space-y-1">
          <span className="text-xs font-medium text-foreground">Nome completo</span>
          <input
            value={currentName}
            onChange={(e) => setFullName(e.target.value)}
            className={inputCls}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-foreground">Telefone</span>
          <input
            value={currentPhone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(00) 00000-0000"
            className={inputCls}
          />
        </label>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-xs text-destructive">
          {error}
        </p>
      )}

      <div className="mt-4 flex items-center gap-3">
        <Button type="button" disabled={!dirty || saving} onClick={() => void handleSave()}>
          {saving ? "Salvando…" : "Salvar alterações"}
        </Button>
        {dirty && !saving && (
          <span className="text-xs text-text-secondary" aria-live="polite">
            Alterações não salvas
          </span>
        )}
      </div>

      <div className="mt-8">
        <ClientAccountInformation />
      </div>

      <UnsavedChangesGuard when={dirty} />
    </div>
  );
}
