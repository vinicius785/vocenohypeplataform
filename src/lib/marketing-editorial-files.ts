import { supabase } from "@/integrations/supabase/client";
import type { EditorialFile } from "@/lib/marketing-editorial";

/** Arquivos do conteúdo no bucket privado `marketing-conteudos`. O link de acesso é gerado na hora
 * (curto), nunca gravado — não expira "escondido" no banco nem circula por aí. */
const BUCKET = "marketing-conteudos";

export async function uploadEditorialFile(
  projetoId: string,
  itemId: string,
  file: File,
): Promise<EditorialFile> {
  const safe = file.name.replace(/[^\w.-]+/g, "_");
  const path = `${projetoId}/${itemId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (error) throw error;
  return {
    id: crypto.randomUUID(),
    name: file.name,
    path,
    size: file.size,
    type: file.type || "application/octet-stream",
  };
}

export async function removeEditorialFile(path: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw error;
}

export async function editorialFileUrl(path: string, expiresInSec = 3600): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresInSec);
  if (error) return null;
  return data?.signedUrl ?? null;
}
