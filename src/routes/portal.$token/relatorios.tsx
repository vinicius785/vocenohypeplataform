import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * `/portal/$token/relatorios` — desde a correção visual/estrutural,
 * Relatórios deixou de ser destino global (nav só tem Início/Campanhas/
 * Solicitações). Relatórios recentes vivem na Início; a lista completa
 * vive dentro de cada campanha. Rota mantida só pra link antigo não
 * quebrar.
 */
export const Route = createFileRoute("/portal/$token/relatorios")({
  loader: ({ params }) => {
    throw redirect({
      to: "/portal/$token/inicio",
      params: { token: params.token },
      hash: "relatorios-recentes",
    });
  },
});
