import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { PublicStatus } from "./meta-data-deletion";

/** Consulta PÚBLICA (sem login) do estado de um pedido de exclusão pelo código de confirmação (128 bits,
 * imprevisível). Devolve só estado, datas e contagem: nunca ID da Meta, e-mail ou dados da conta. */
export const getMetaDeletionStatus = createServerFn({ method: "GET" })
  .inputValidator((raw: unknown) => z.object({ code: z.string().max(64) }).parse(raw))
  .handler(async ({ data }): Promise<PublicStatus> => {
    const { getPublicDeletionStatus } = await import("./meta-data-deletion");
    const { createSupabaseDeletionRepo } = await import("./meta-data-deletion-repo.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return getPublicDeletionStatus(createSupabaseDeletionRepo(supabaseAdmin), data.code);
  });
