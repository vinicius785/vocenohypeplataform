import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";

/**
 * Alvo do Vercel Cron pro resumo diário pessoal — mesmo padrão de
 * `email-flows.ts`/`hypito-weekly-report.ts`. `schedule` em `vercel.json`:
 * `30 11 * * 1-5` = 08:30 America/Sao_Paulo, segunda a sexta (sem DST no
 * Brasil desde 2019).
 */
function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export const Route = createFileRoute("/api/cron/hypito-daily-briefing")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const cronSecret = process.env.CRON_SECRET;
        if (!cronSecret) {
          console.error("[cron/hypito-daily-briefing] CRON_SECRET não configurado");
          return new Response("Not configured", { status: 500 });
        }
        const auth = request.headers.get("authorization") ?? "";
        const provided = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
        if (!secretsMatch(provided, cronSecret)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { isBriefingWeekday, runDailyBriefings } =
          await import("@/lib/hypito-daily-briefing.server");
        if (!isBriefingWeekday()) {
          return new Response(
            JSON.stringify({ ok: true, skipped: true, reason: "fim de semana" }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }

        const outcomes = await runDailyBriefings();
        return new Response(JSON.stringify({ ok: true, outcomes }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
