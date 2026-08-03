import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { sendBlogWebhook } from "./blog-webhook";

const blogEventSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("upsert"),
    id: z.string(),
    title: z.string(),
    slug: z.string().optional(),
    excerpt: z.string().optional(),
    content: z.string().optional(),
    cover: z.string().optional(),
    category: z.string().optional(),
    authorName: z.string().optional(),
  }),
  z.object({ action: z.literal("archive"), id: z.string() }),
  z.object({ action: z.literal("delete"), id: z.string() }),
]);

/** Dispara o webhook de blog (ver src/lib/blog-webhook.ts) pro ciclo de vida
 * completo de um artigo: upsert (criado/atualizado), archive, delete. */
export const notifyBlogEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.infer<typeof blogEventSchema>) => blogEventSchema.parse(input))
  .handler(async ({ data }) => {
    await sendBlogWebhook(data.action, data);
    return { ok: true };
  });
