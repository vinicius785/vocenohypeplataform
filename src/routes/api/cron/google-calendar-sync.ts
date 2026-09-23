import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";

/**
 * Fase A da reconstrução da integração Google Calendar — mecanismo de
 * execução no SERVIDOR (antes não existia nenhum: sincronização só
 * acontecia via `setInterval` de 3min no navegador, então sem nenhuma aba
 * aberta a plataforma simplesmente não sincronizava, em nenhum sentido).
 *
 * O plano Vercel deste projeto é o gratuito (Hobby), que só permite UMA
 * execução de cron por dia — mais que isso derruba o deploy inteiro (ver
 * mesmo comentário em `api/cron/hypito-alerts.ts`). Por isso este endpoint
 * é registrado no `vercel.json` só uma vez por dia, como rede de
 * segurança — a cadência real (5-10min) deve vir de um cron EXTERNO
 * gratuito (ex.: cron-job.org) batendo aqui com o mesmo `CRON_SECRET`
 * como Bearer token. O endpoint não distingue quem chamou, contanto que
 * o segredo bata.
 *
 * Mesmo padrão de autenticação dos outros crons (`timingSafeEqual` contra
 * timing attack). A trava de concorrência (`google_calendar_sync_state`)
 * garante que chamadas simultâneas (cron externo + cron diário + disparo
 * imediato de alguém editando uma reunião ao mesmo tempo) nunca rodem em
 * paralelo.
 */
function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export const Route = createFileRoute("/api/cron/google-calendar-sync")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const cronSecret = process.env.CRON_SECRET;
        if (!cronSecret) {
          console.error("[cron/google-calendar-sync] CRON_SECRET não configurado");
          return new Response("Not configured", { status: 500 });
        }
        const auth = request.headers.get("authorization") ?? "";
        const provided = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
        if (!secretsMatch(provided, cronSecret)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { runGoogleCalendarSyncCycle } = await import("@/lib/google-calendar.functions");
        try {
          const result = await runGoogleCalendarSyncCycle();
          return new Response(JSON.stringify({ ok: true, result }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("[cron/google-calendar-sync] falhou", message);
          return new Response(JSON.stringify({ ok: false, error: message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
