import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * URL de visualização/download sob demanda pra anexos do Chat — o
 * upload (`uploadChatAttachment`, `chat-store.ts`) já grava `path`
 * (chave permanente no bucket `chat-attachments`) ao lado de uma `url`
 * assinada de 1 ano cacheada pra sempre (mesmo anti-padrão já corrigido
 * pro mídia kit de influenciadores). Como `path` já existe, não precisa
 * de migração de dado — só esta função nova, que os componentes de
 * visualização (lightbox de imagem, card de PDF) passam a usar em vez
 * de confiar na `url` cacheada, que pode ter expirado.
 */
const AttachmentUrlInput = z.object({
  path: z.string().min(1),
  name: z.string().min(1),
  download: z.boolean().optional(),
});

export const getChatAttachmentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => AttachmentUrlInput.parse(raw))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from("chat-attachments")
      .createSignedUrl(data.path, 60 * 10, data.download ? { download: data.name } : undefined);
    if (error || !signed) return { ok: false as const, reason: "unavailable" as const };
    return { ok: true as const, url: signed.signedUrl };
  });
