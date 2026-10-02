import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { mapResponseTimeRow, type MemberResponseTime } from "@/lib/member-response-time";

const Input = z.object({
  userId: z.string().uuid(),
  from: z.string().datetime({ offset: true }),
  to: z.string().datetime({ offset: true }),
});

/** Só agregados. A autorização real (membro interno + o próprio membro OU
 * permissão `time`) mora DENTRO da RPC `get_member_response_time` — ela é
 * SECURITY DEFINER pra conseguir contar DMs que nem admin lê via RLS, então
 * não pode depender de quem a chama checar nada. Aqui só chamamos com o
 * client do usuário (nunca service-role) e propagamos uma mensagem genérica
 * em caso de erro, sem texto cru do Postgres. */
export const getMemberResponseTime = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => Input.parse(raw))
  .handler(async ({ data, context }): Promise<MemberResponseTime> => {
    const { data: rows, error } = await context.supabase.rpc("get_member_response_time", {
      p_user_id: data.userId,
      p_from: data.from,
      p_to: data.to,
    });
    if (error) {
      console.error("[time] get_member_response_time:", error.message);
      throw new Error("Não foi possível carregar o tempo de resposta.");
    }
    return mapResponseTimeRow(Array.isArray(rows) ? rows[0] : rows);
  });
