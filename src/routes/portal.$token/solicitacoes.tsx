import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * `/portal/$token/solicitacoes` — a funcionalidade de Solicitações foi
 * removida por completo do portal (nav, página, botão "Nova solicitação",
 * formulário). `submitClientDemand` (`cliente-link.functions.ts`) foi
 * mantida no backend porque seu efeito (tarefa tag `"Cliente"` em
 * `campanha_tarefas`) ainda é consumido pelo sino de notificação interno
 * (`useClientDemandNotifier`, `AppShell.tsx`) — só a UI que a chamava foi
 * removida. Rota mantida só pra link antigo não quebrar.
 */
export const Route = createFileRoute("/portal/$token/solicitacoes")({
  loader: ({ params }) => {
    throw redirect({ to: "/portal/$token/inicio", params: { token: params.token } });
  },
});
