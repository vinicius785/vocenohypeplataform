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

/** Correção de segurança (auditoria): antes só exigia uma sessão válida
 * (`requireSupabaseAuth`) e assinava a URL via `supabaseAdmin`, que
 * ignora a própria policy de Storage do bucket `chat-attachments`
 * (`bucket_id = 'chat-attachments' and is_internal_team_member(auth.uid())`,
 * migration `20260929015524_chat_v2_foundation.sql`) — ou seja, qualquer
 * usuário autenticado, incluindo uma sessão do portal do cliente (que
 * NUNCA é membro interno), conseguia baixar qualquer anexo de chat
 * interno bastando saber/adivinhar o `path`. Agora a função exige
 * explicitamente a mesma condição que a policy do bucket já impõe pra
 * acesso direto, fechando o desvio criado pelo service-role. */
export const getChatAttachmentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => AttachmentUrlInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { data: isInternal, error: rpcError } = await context.supabase.rpc(
      "is_internal_team_member",
      { _user_id: context.userId },
    );
    if (rpcError) throw new Error(rpcError.message);
    if (!isInternal) {
      throw new Error("Sem permissão para acessar anexos do chat.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from("chat-attachments")
      .createSignedUrl(data.path, 60 * 10, data.download ? { download: data.name } : undefined);
    if (error || !signed) return { ok: false as const, reason: "unavailable" as const };
    return { ok: true as const, url: signed.signedUrl };
  });
