import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Camera, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { checkAvatarFile, uploadClientAvatar } from "../../lib/avatar-upload-client";
import {
  CLIENT_PROFILE_QUERY_KEY,
  initialsFromName,
  useClientProfile,
} from "../../lib/client-profile";
import { formatPhoneBR, phoneForInput, validateOnboarding } from "../../lib/onboarding";
import { ClientAvatarCropDialog } from "../settings/ClientAvatarCropDialog";
import { ONBOARDING_QUERY_KEY } from "./PortalOnboardingGate";

const FIELD =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-brand";

/**
 * Modal obrigatório de "confirme seus dados". Sem botão de fechar e sem Esc/clique fora: só sai
 * concluindo (ou saindo da conta). Não pede senha: quem precisa definir uma senha já passa por
 * `/criar-senha` antes de chegar ao portal (`must_change_password`).
 */
export function PortalOnboardingDialog() {
  const { data: profile } = useClientProfile();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const seeded = useRef(false);

  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Pré-preenche UMA vez com o que a plataforma já sabe (depois disso, o que o usuário digita manda).
  useEffect(() => {
    if (!profile || seeded.current) return;
    seeded.current = true;
    setName(profile.fullName);
    setPhone(phoneForInput(profile.phone));
  }, [profile]);

  const errors = validateOnboarding({ name, phone });
  const invalid = Boolean(errors.name || errors.phone);

  const pickPhoto = async (file: File | null) => {
    if (!file || photoBusy) return;
    setPhotoError(null);
    const error = await checkAvatarFile(file);
    if (error) {
      setPhotoError(error);
      return;
    }
    setPendingFile(file);
    setCropOpen(true);
  };

  const confirmCrop = async (blob: Blob) => {
    setCropOpen(false);
    setPhotoBusy(true);
    try {
      await uploadClientAvatar(blob);
      await queryClient.invalidateQueries({ queryKey: CLIENT_PROFILE_QUERY_KEY });
    } catch {
      // Só a foto falhou: nome e telefone digitados continuam intactos.
      setPhotoError("Não foi possível enviar a foto. Tente novamente.");
    } finally {
      setPhotoBusy(false);
      setPendingFile(null);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (invalid || saving || !profile) return;
    setSaving(true);
    setSaveError(null);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: name.trim(),
          phone: phone.trim(),
          portal_onboarding_completed_at: new Date().toISOString(),
        } as never)
        .eq("id", profile.id);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: CLIENT_PROFILE_QUERY_KEY });
      queryClient.setQueryData(ONBOARDING_QUERY_KEY, "done");
    } catch {
      setSaveError("Não foi possível atualizar seu perfil. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    void navigate({ to: "/" });
  };

  const initials = initialsFromName(name || profile?.email || "");

  return (
    <Dialog open>
      <DialogContent
        mobileFullScreen
        showCloseButton={false}
        className="max-w-sm content-start gap-6"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="items-center space-y-4 text-center sm:text-center">
          <div className="relative">
            <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border border-border bg-muted text-2xl font-semibold text-muted-foreground">
              {profile?.photoUrl ? (
                <img
                  src={profile.photoUrl}
                  alt="Sua foto de perfil"
                  className="h-full w-full object-cover"
                />
              ) : (
                initials
              )}
              {photoBusy && (
                <span className="absolute inset-0 flex items-center justify-center rounded-full bg-background/70">
                  <Loader2 className="h-5 w-5 animate-spin" aria-label="Enviando foto" />
                </span>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                void pickPhoto(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={photoBusy}
            onClick={() => fileRef.current?.click()}
            aria-label={profile?.photoUrl ? "Alterar foto de perfil" : "Adicionar foto de perfil"}
            className="-mt-2 gap-1.5 text-text-secondary"
          >
            <Camera className="h-3.5 w-3.5" aria-hidden="true" />
            {profile?.photoUrl ? "Alterar foto" : "Adicionar foto"}
          </Button>
          {photoError && (
            <p role="alert" className="-mt-2 text-xs text-destructive">
              {photoError}
            </p>
          )}
          <div className="space-y-1.5">
            <DialogTitle className="text-xl">Complete seu perfil</DialogTitle>
            <DialogDescription>
              Antes de começar, confirme seus dados para manter seu acesso atualizado.
            </DialogDescription>
          </div>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <label htmlFor="onb-nome" className="text-sm font-medium text-foreground">
              Nome
            </label>
            <input
              id="onb-nome"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              autoFocus
              aria-invalid={touched && !!errors.name}
              aria-describedby={touched && errors.name ? "onb-nome-erro" : undefined}
              className={FIELD}
            />
            {touched && errors.name && (
              <p id="onb-nome-erro" role="alert" className="text-xs text-destructive">
                {errors.name}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="onb-tel" className="text-sm font-medium text-foreground">
              Telefone
            </label>
            <input
              id="onb-tel"
              value={phone}
              onChange={(e) => setPhone(formatPhoneBR(e.target.value))}
              inputMode="tel"
              autoComplete="tel-national"
              placeholder="(11) 99999-9999"
              aria-invalid={touched && !!errors.phone}
              aria-describedby={touched && errors.phone ? "onb-tel-erro" : undefined}
              className={FIELD}
            />
            {touched && errors.phone && (
              <p id="onb-tel-erro" role="alert" className="text-xs text-destructive">
                {errors.phone}
              </p>
            )}
          </div>

          {saveError && (
            <p role="alert" className="text-sm text-destructive">
              {saveError}
            </p>
          )}

          <Button
            type="submit"
            variant="primary"
            size="comfortable"
            disabled={saving || photoBusy || !profile}
            className="w-full"
          >
            {saving ? "Salvando..." : "Continuar"}
          </Button>
          <button
            type="button"
            onClick={() => void signOut()}
            className="mx-auto block text-xs text-text-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Sair da conta
          </button>
        </form>

        <ClientAvatarCropDialog
          file={pendingFile}
          open={cropOpen}
          onCancel={() => {
            setCropOpen(false);
            setPendingFile(null);
          }}
          onConfirm={(blob) => void confirmCrop(blob)}
        />
      </DialogContent>
    </Dialog>
  );
}
