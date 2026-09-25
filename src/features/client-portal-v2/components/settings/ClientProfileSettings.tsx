import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useClientProfile } from "../../lib/client-profile";
import { ClientAvatarUploader } from "./ClientAvatarUploader";

const inputCls =
  "h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring";

/** Dados pessoais editáveis pelo próprio usuário — só os campos que
 * `profiles` realmente tem (`full_name`, `phone`). Nada de "nome de
 * exibição" ou "cargo" à parte: não existem no modelo hoje, e o pedido é
 * explícito em não inventar campo sem uso real. RLS já garante que só dá
 * pra atualizar a própria linha (`auth.uid() = id`). */
export function ClientProfileSettings() {
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
    return <div className="h-32 animate-pulse rounded-lg bg-muted/50" />;
  }

  return (
    <section id="perfil" className="space-y-5 scroll-mt-20">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Perfil</h2>
        <p className="mt-0.5 text-xs text-text-secondary">Sua foto e como seu nome aparece.</p>
      </div>

      <ClientAvatarUploader name={currentName} />

      <div className="grid max-w-md grid-cols-1 gap-4">
        <label className="space-y-1">
          <span className="text-xs font-medium text-foreground">Nome completo</span>
          <input
            value={currentName}
            onChange={(e) => setFullName(e.target.value)}
            className={inputCls}
          />
        </label>
        <label className="space-y-1">
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
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button type="button" disabled={!dirty || saving} onClick={() => void handleSave()}>
          {saving ? "Salvando…" : "Salvar alterações"}
        </Button>
        {dirty && !saving && (
          <span className="text-xs text-text-secondary">Alterações não salvas</span>
        )}
      </div>
    </section>
  );
}
