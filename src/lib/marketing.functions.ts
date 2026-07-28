import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { dispatchOutgoingWebhook } from "./outgoing-webhooks";

const blogPublishedSchema = z.object({
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

/** Dispara o evento `blog.published` para os webhooks de saída configurados (ver Configurações > Integrações). */
export const notifyBlogPublished = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.infer<typeof blogPublishedSchema>) => blogPublishedSchema.parse(input))
  .handler(async ({ data }) => {
    await dispatchOutgoingWebhook("blog.published", data);
    return { ok: true };
  });
