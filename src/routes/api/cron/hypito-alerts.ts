import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";

/**
 * Alvo do Vercel Cron pros alertas operacionais preventivos — mesmo
 * padrão de autenticação dos outros crons do Hypito. `schedule` em
 * `vercel.json`: `0 12 * * 1-5` = 09h America/Sao_Paulo, dias úteis —
 * uma vez por dia (o plano Hobby da Vercel só permite cron diário; um
 * schedule com mais de uma execução por dia derruba o deploy inteiro
 * com "deploy_failed", achado ao vivo nesta sessão). Frequência baixa o
 * bastante pra nunca virar spam, mesmo sem o cooldown por tipo
 * (`hypito-alerts.server.ts`) já cuidar disso.
 */
function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export const Route = createFileRoute("/api/cron/hypito-alerts")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const cronSecret = process.env.CRON_SECRET;
        if (!cronSecret) {
          console.error("[cron/hypito-alerts] CRON_SECRET não configurado");
          return new Response("Not configured", { status: 500 });
        }
        const auth = request.headers.get("authorization") ?? "";
        const provided = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
        if (!secretsMatch(provided, cronSecret)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { runPreventiveAlerts } = await import("@/lib/hypito-alerts.server");
        const result = await runPreventiveAlerts();
        return new Response(JSON.stringify({ ok: true, result }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
