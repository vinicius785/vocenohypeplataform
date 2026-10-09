import { createFileRoute } from "@tanstack/react-router";
import { secretsMatch } from "@/lib/secrets.server";

/** Renova os tokens do Instagram que vencem em até 14 dias. Chamar 1x/dia por cron EXTERNO (mesmo
 * Bearer CRON_SECRET dos outros crons). Não está no vercel.json: o plano atual já usa as vagas de cron. */
export const Route = createFileRoute("/api/cron/instagram-refresh")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const cronSecret = process.env.CRON_SECRET;
        if (!cronSecret) return new Response("Not configured", { status: 500 });
        const auth = request.headers.get("authorization") ?? "";
        const provided = auth.startsWith("Bearer ") ? auth.slice(7) : "";
        if (!secretsMatch(provided, cronSecret))
          return new Response("Unauthorized", { status: 401 });
        try {
          const { refreshExpiringTokens } = await import("@/lib/instagram/instagram-service");
          const { buildInstagramDeps } = await import("@/lib/instagram/instagram-deps.server");
          return Response.json(await refreshExpiringTokens(await buildInstagramDeps()));
        } catch {
          return new Response("Failed", { status: 500 });
        }
      },
    },
  },
});
