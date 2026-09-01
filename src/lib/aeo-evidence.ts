import { supabase } from "@/integrations/supabase/client";
import type { AeoIa } from "./aeo-store";

/** Path determinístico por rodada+prompt+IA — reenviar evidência da mesma
 * combinação substitui (upsert), nunca duplica ou orfaniza o arquivo
 * anterior. Mesmo padrão de `bug-reports.ts`, adaptado pra chave natural
 * em vez de sufixo aleatório (aqui a "entidade" é a própria combinação
 * rodada+prompt+ia, não um registro isolado como um bug report). */
export async function uploadAeoEvidencia(
  rodadaId: string,
  promptId: string,
  ia: AeoIa,
  file: File,
): Promise<string> {
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${rodadaId}/${promptId}/${ia}.${ext}`;
  const { error } = await supabase.storage
    .from("aeo-evidencias")
    .upload(path, file, { contentType: file.type, upsert: true });
  if (error) throw new Error(error.message);
  return path;
}

export async function removeAeoEvidencia(path: string): Promise<void> {
  await supabase.storage.from("aeo-evidencias").remove([path]);
}

export async function getAeoEvidenciaUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from("aeo-evidencias")
    .createSignedUrl(path, 60 * 60);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}
