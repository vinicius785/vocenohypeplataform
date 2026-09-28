import { useState } from "react";
import { useChatV2Data } from "./use-chat-v2-data";
import { ChatV2Sidebar } from "./ChatV2Sidebar";

/**
 * Shell do Chat V2 (Fase 2 do pedido): sidebar de conversas + área de
 * conteúdo (a rota filha renderiza header/timeline/composer/thread). Layout
 * inspirado no Slack — sidebar fixa em desktop, tela cheia alternando entre
 * lista/conversa no mobile (a visibilidade de cada painel em telas
 * pequenas é decidida por quem chama, via `hasActiveConvo`).
 */
export function ChatV2Shell({
  hasActiveConvo,
  children,
}: {
  hasActiveConvo: boolean;
  children: React.ReactNode;
}) {
  const { members, channels, messages, me, clientes } = useChatV2Data();
  const [search, setSearch] = useState("");

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background md:h-[calc(100dvh-9rem)] md:rounded-lg md:border md:border-border">
      <div
        className={`h-full shrink-0 md:flex ${hasActiveConvo ? "hidden" : "flex"} w-full md:w-auto`}
      >
        <ChatV2Sidebar
          channels={channels}
          members={members}
          messages={messages}
          meId={me.id}
          clientes={clientes}
          search={search}
          onSearchChange={setSearch}
        />
      </div>
      <div className={`h-full min-w-0 flex-1 md:flex ${hasActiveConvo ? "flex" : "hidden"}`}>
        {children}
      </div>
    </div>
  );
}
