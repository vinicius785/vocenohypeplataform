import { useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { checkAvatarFile, uploadClientAvatar } from "../../lib/avatar-upload-client";
import { initialsFromName, useClientProfile } from "../../lib/client-profile";
import { useConfirm } from "@/hooks/use-confirm";
import { ClientAvatarCropDialog } from "./ClientAvatarCropDialog";

/**
 * Avatar do Portal V2 — mesmo bucket `avatars` e mesmo padrão de path
 * (`{userId}/avatar.{ext}`) já usado pelo time (`PerfilSection.tsx`), com
 * a MESMA política RLS (`(storage.foldername(name))[1] = auth.uid()`) —
 * ninguém troca o avatar de outra pessoa, sem precisar de nenhuma policy
 * nova. `upsert: true` sobrescreve o arquivo anterior (nunca deixa órfão)
 * e uma signed URL nova a cada upload já resolve cache-busting sozinho
 * (token novo na query string). `photo_url` fica só o caminho assinado —
 * nunca base64 no banco.
 */
export function ClientAvatarUploader({ name, roleLabel }: { name: string; roleLabel?: string }) {
  const { data: profile, invalidate } = useClientProfile();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const { confirm, confirmDialog } = useConfirm();

  const initials = initialsFromName(name);

  const onPick = async (file: File | null) => {
    if (!file || busy) return;
    const error = await checkAvatarFile(file);
    if (error) {
      toast.error(error);
      return;
    }
    setPendingFile(file);
    setCropOpen(true);
  };

  const handleConfirmCrop = async (blob: Blob) => {
    setCropOpen(false);
    setBusy(true);
    try {
      await uploadClientAvatar(blob);
      await invalidate();
      toast.success("Foto de perfil atualizada.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível salvar a foto.");
    } finally {
      setBusy(false);
      setPendingFile(null);
    }
  };

  const handleRemove = async () => {
    if (busy || !profile?.photoUrl) return;
    const ok = await confirm("Sua foto de perfil será removida.", {
      title: "Remover foto?",
      confirmLabel: "Remover foto",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Sessão expirada.");
      // Remove os 3 formatos possíveis (o upload atual sempre grava .jpg,
      // mas registros antigos podem ter outra extensão) — nunca deixa
      // arquivo órfão no bucket.
      await supabase.storage
        .from("avatars")
        .remove(["jpg", "png", "webp"].map((ext) => `${user.id}/avatar.${ext}`));
      const { error: dbError } = await supabase
        .from("profiles")
        .update({ photo_url: null })
        .eq("id", user.id);
      if (dbError) throw dbError;
      await invalidate();
      toast.success("Foto removida.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível remover a foto.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-4">
      {confirmDialog}
      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full border border-border bg-muted">
        {profile?.photoUrl ? (
          <img
            src={profile.photoUrl}
            alt={`Foto de perfil de ${name || "usuário"}`}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-lg font-semibold text-muted-foreground">
            {initials}
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{name || "Sem nome"}</p>
        {roleLabel && <p className="truncate text-xs text-text-secondary">{roleLabel}</p>}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            void onPick(e.target.files?.[0] ?? null);
            e.target.value = "";
          }}
        />
        <div className="mt-2.5 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
          >
            <Camera className="h-3.5 w-3.5" />
            {profile?.photoUrl ? "Alterar foto" : "Adicionar foto"}
          </Button>
          {profile?.photoUrl && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => void handleRemove()}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remover
            </Button>
          )}
        </div>
        <p className="mt-1.5 text-[11px] text-text-secondary">JPG, PNG ou WebP, até 8 MB.</p>
      </div>

      <ClientAvatarCropDialog
        file={pendingFile}
        open={cropOpen}
        onCancel={() => {
          setCropOpen(false);
          setPendingFile(null);
        }}
        onConfirm={(blob) => void handleConfirmCrop(blob)}
      />
    </div>
  );
}
