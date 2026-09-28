import { createFileRoute, Outlet, useMatches, useNavigate } from "@tanstack/react-router";
import { AppShell, type SectionKey } from "@/components/AppShell";
import { ChatV2Shell } from "@/components/chat-v2/ChatV2Shell";

/**
 * Layout da Chat V2 — reconstrução isolada do Chat (ver pedido do
 * usuário), acessível em `/chat-v2` SEM substituir a V1
 * (`/time?section=chat`, ainda intacta) e SEM sair do `AppShell` oficial:
 * sidebar global, barra superior, busca global, modo foco, tema e sino de
 * notificações continuam todos visíveis — só a área de conteúdo interna
 * é o Chat V2. "Chat" continua marcado como item ativo na sidebar global
 * enquanto o usuário está em qualquer rota `/chat-v2/*`.
 */
export const Route = createFileRoute("/_authenticated/chat-v2")({
  component: ChatV2Layout,
});

function ChatV2Layout() {
  const matches = useMatches();
  const navigate = useNavigate();
  const hasActiveConvo = matches.some((m) => m.routeId !== "/_authenticated/chat-v2/");

  // Clicar em outra seção da sidebar global sai do Chat V2 pra `/time`
  // (onde as outras 11 seções vivem); clicar em "Chat" de novo não faz
  // nada, já estamos aqui.
  const onSelect = (key: SectionKey) => {
    if (key === "chat") return;
    void navigate({ to: "/time", search: { section: key } });
  };

  return (
    <AppShell active="chat" onSelect={onSelect}>
      <ChatV2Shell hasActiveConvo={hasActiveConvo}>
        <Outlet />
      </ChatV2Shell>
    </AppShell>
  );
}
