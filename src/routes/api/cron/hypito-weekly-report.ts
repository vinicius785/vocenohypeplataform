import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";

/**
 * Alvo do Vercel Cron pro relatório semanal do Hypito (ver `crons` em
 * `vercel.json`) — mesmo padrão de autenticação de
 * `src/routes/api/cron/email-flows.ts` (`Authorization: Bearer
 * $CRON_SECRET`, o próprio Vercel Cron manda esse header sozinho).
 *
 * O `schedule` do cron (`0 20 * * 5` = sexta 20:00 UTC = sexta 17:00
 * `America/Sao_Paulo`, sem DST no Brasil desde 2019) já é quem decide
 * QUANDO isto roda — a checagem de dia da semana aqui dentro
 * (`isConfiguredWeekdayNow`) é só cinto-e-suspensório: se a configuração
 * administrativa do dia mudar no futuro e o `schedule` do Vercel ficar
 * desalinhado por algum tempo, o job não publica fora do dia configurado
 * em vez de publicar silenciosamente no dia errado.
 *
 * Nunca fica ativo sozinho: esta rota só passa a rodar de verdade quando
 * o projeto for implantado na Vercel com `CRON_SECRET` configurado e o
 * deploy publicado — nenhuma das duas coisas acontece durante esta
 * tarefa (pedido explícito: "não criar cron remoto durante esta tarefa").
 */
function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export const Route = createFileRoute("/api/cron/hypito-weekly-report")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const cronSecret = process.env.CRON_SECRET;
        if (!cronSecret) {
          console.error("[cron/hypito-weekly-report] CRON_SECRET não configurado");
          return new Response("Not configured", { status: 500 });
        }
        const auth = request.headers.get("authorization") ?? "";
        const provided = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
        if (!secretsMatch(provided, cronSecret)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { runWeeklyReport, getWeeklyReportSettings } =
          await import("@/lib/hypito-weekly-report.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { isConfiguredWeekdayNow } = await import("@/lib/hypito-window");
        const { DEFAULT_WORKSPACE_ID } = await import("@/lib/hypito");

        const settings = await getWeeklyReportSettings(supabaseAdmin, DEFAULT_WORKSPACE_ID);
        if (!isConfiguredWeekdayNow(settings.weekday)) {
          return new Response(
            JSON.stringify({ ok: true, skipped: true, reason: "fora do dia configurado" }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }

        const result = await runWeeklyReport({
          trigger: "schedule",
          workspaceId: DEFAULT_WORKSPACE_ID,
        });
        return new Response(JSON.stringify(result), {
          status: result.ok ? 200 : 500,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
