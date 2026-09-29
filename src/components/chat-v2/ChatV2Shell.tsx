import { TooltipProvider } from "@/components/ui/tooltip";
import { useChatV2Data } from "./use-chat-v2-data";
import { ChatV2Navigation } from "./ChatV2Navigation";

/**
 * Shell do Chat V2 — renderizado DENTRO do `<main>` do `AppShell` oficial,
 * que no modo Chat (`active === "chat"`) fica sem padding e com
 * `overflow-hidden` (ver `AppShell.tsx`), então este componente pode
 * preencher `h-full w-full` puro, sem o hack de margem negativa que existia
 * antes pra "escapar" do padding fixo do `<main>`. A sidebar global já
 * aparece compacta (faixa de 68px) nesse modo — este shell só monta as duas
 * colunas próprias do Chat: lista de conversas + conversa ativa (que, por
 * sua vez, adiciona uma 3ª coluna de thread quando aberta — ver
 * `ChatV2ConversationPane.tsx`).
 */
export function ChatV2Shell({
  hasActiveConvo,
  children,
}: {
  hasActiveConvo: boolean;
  children: React.ReactNode;
}) {
  const { members, channels, messages, me, clientes } = useChatV2Data();

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-full w-full overflow-hidden">
        <div
          className={`h-full shrink-0 md:flex ${hasActiveConvo ? "hidden" : "flex"} w-full md:w-auto`}
        >
          <ChatV2Navigation
            channels={channels}
            members={members}
            messages={messages}
            meId={me.id}
            clientes={clientes}
          />
        </div>
        <div className={`h-full min-w-0 flex-1 md:flex ${hasActiveConvo ? "flex" : "hidden"}`}>
          {children}
        </div>
      </div>
    </TooltipProvider>
  );
}
