import { TooltipProvider } from "@/components/ui/tooltip";
import { useChatV2Data } from "./use-chat-v2-data";
import { ChatV2Navigation } from "./ChatV2Navigation";

/**
 * Shell do Chat V2 — renderizado DENTRO do `<main>` do `AppShell` oficial
 * (sidebar global + barra superior continuam visíveis; ver
 * `_authenticated/chat-v2.tsx`). Preenche a altura que o `AppShell` já
 * reserva pro conteúdo (`h-full`, sem `100dvh`/números mágicos) — divisores
 * discretos entre os painéis, sem card externo com cantos arredondados,
 * pra parecer uma área estrutural da plataforma (como o Slack), não um
 * app à parte.
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
      <div className="-m-4 flex h-[calc(100%+2rem)] w-[calc(100%+2rem)] overflow-hidden border-t border-border md:-m-8 md:h-[calc(100%+4rem)] md:w-[calc(100%+4rem)]">
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
