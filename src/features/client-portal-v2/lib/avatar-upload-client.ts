import { supabase } from "@/integrations/supabase/client";
import {
  avatarValidationMessage,
  extensionForType,
  sniffImageType,
  validateAvatarFile,
} from "./avatar-upload";

const SIGNED_URL_TTL = 60 * 60 * 24 * 365; // 1 ano — mesmo padrão do time (PerfilSection.tsx)

/** Valida o arquivo pelo conteúdo real (não pela extensão). Devolve a mensagem de erro ou `null`. */
export async function checkAvatarFile(file: File): Promise<string | null> {
  const bytes = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  const error = validateAvatarFile(file.size, sniffImageType(bytes));
  return error ? avatarValidationMessage(error) : null;
}

/**
 * Grava o avatar já recortado: mesmo bucket `avatars`, mesmo caminho `{userId}/avatar.jpg` (RLS por
 * pasta do usuário) e `profiles.photo_url` com a URL assinada. Devolve a URL. Usado pelo Perfil e
 * pelo onboarding — um só caminho de upload.
 */
export async function uploadClientAvatar(blob: Blob): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sessão expirada.");
  const path = `${user.id}/avatar.${extensionForType("image/jpeg")}`;
  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, blob, { upsert: true, contentType: "image/jpeg" });
  if (uploadError) throw uploadError;
  const { data: signed, error: signedError } = await supabase.storage
    .from("avatars")
    .createSignedUrl(path, SIGNED_URL_TTL);
  if (signedError) throw signedError;
  const { error: dbError } = await supabase
    .from("profiles")
    .update({ photo_url: signed.signedUrl })
    .eq("id", user.id);
  if (dbError) throw dbError;
  return signed.signedUrl;
}
