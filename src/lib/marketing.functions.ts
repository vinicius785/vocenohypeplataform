import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { dispatchOutgoingWebhook } from "./outgoing-webhooks";

const blogEventSchema = z.object({
  action: z.enum(["published", "archived", "deleted"]),
  id: z.string(),
  title: z.string(),
  slug: z.string().optional(),
  excerpt: z.string().optional(),
  content: z.string().optional(),
  cover: z.string().optional(),
  category: z.string().optional(),
  authorName: z.string().optional(),
  publishDate: z.string().optional(),
});

/** Dispara o evento `blog` (publicado/arquivado/apagado, diferenciados pelo
 * campo `action` no payload) para os webhooks de saída configurados — ver
 * Configurações > Integrações. Um único evento em vez de três, pra quem
 * consome o webhook não precisar assinar/tratar múltiplos endpoints pra
 * acompanhar o ciclo de vida de um artigo. */
export const notifyBlogEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.infer<typeof blogEventSchema>) => blogEventSchema.parse(input))
  .handler(async ({ data }) => {
    await dispatchOutgoingWebhook("blog", data);
    return { ok: true };
  });
