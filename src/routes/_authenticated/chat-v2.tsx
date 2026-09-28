import { createFileRoute, Outlet, useMatches } from "@tanstack/react-router";
import { ChatV2Shell } from "@/components/chat-v2/ChatV2Shell";

/**
 * Layout da Chat V2 — reconstrução isolada do Chat (ver pedido do
 * usuário), acessível em `/chat-v2` sem substituir a V1
 * (`/time?section=chat`, ainda intacta). A V1 tem um link "Experimentar
 * novo Chat (beta)" apontando pra cá; esta rota tem um link de volta no
 * cabeçalho ("Voltar ao Chat clássico").
 */
export const Route = createFileRoute("/_authenticated/chat-v2")({
  component: ChatV2Layout,
});

function ChatV2Layout() {
  const matches = useMatches();
  const hasActiveConvo = matches.some((m) => m.routeId !== "/_authenticated/chat-v2/");
  return (
    <ChatV2Shell hasActiveConvo={hasActiveConvo}>
      <Outlet />
    </ChatV2Shell>
  );
}
