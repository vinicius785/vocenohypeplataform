import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/chat-v2/")({
  component: ChatV2Empty,
});

function ChatV2Empty() {
  return (
    <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
      Selecione uma conversa para começar.
    </div>
  );
}
