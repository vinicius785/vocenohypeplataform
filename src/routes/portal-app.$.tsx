import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Único resquício do portal V1 (sessão), aposentado em 2026-09-24 e removido
 * em 2026-10: só leva links salvos e e-mails antigos (`/portal-app/**`) para o
 * equivalente no V2 (que faz a própria checagem de sessão/MFA/senha).
 */
export const Route = createFileRoute("/portal-app/$")({
  beforeLoad: ({ params }) => {
    const [section, campanhaId] = (params._splat ?? "").split("/").filter(Boolean);
    if (section === "campanhas" && campanhaId) {
      throw redirect({ to: "/portal-v2/campanhas/$campanhaId", params: { campanhaId } });
    }
    if (section === "campanhas") throw redirect({ to: "/portal-v2/campanhas" });
    throw redirect({ to: "/portal-v2/inicio" });
  },
});
