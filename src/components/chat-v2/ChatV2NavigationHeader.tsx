import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Bookmark, SquarePen } from "lucide-react";
import { loadSavedMessagesList, type SavedMessage } from "@/lib/chat-store";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { routeForConvoId } from "./chat-v2-utils";

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Dialog simples com as mensagens que o usuário salvou (`chat_saved_messages`,
 * via "Salvar" no menu de ações de `ChatV2Message.tsx`). Busca sob demanda
 * (só ao abrir) — é uma lista de conveniência, não precisa de cache/realtime
 * dedicado. */
function SavedMessagesDialog({
  open,
  onOpenChange,
  meId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meId: string;
}) {
  const [items, setItems] = useState<SavedMessage[] | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    setItems(null);
    void loadSavedMessagesList().then(setItems);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[70vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mensagens salvas</DialogTitle>
        </DialogHeader>
        {items === null && (
          <p className="py-6 text-center text-sm text-muted-foreground">Carregando…</p>
        )}
        {items?.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nenhuma mensagem salva ainda.
          </p>
        )}
        <div className="space-y-1">
          {items?.map(({ savedId, message }) => (
            <button
              key={savedId}
              type="button"
              onClick={() => {
                const r = routeForConvoId(message.convoId, meId);
                onOpenChange(false);
                void navigate({
                  to: r.to,
                  params: r.params,
                  search: { highlight: message.id },
                } as unknown as Parameters<typeof navigate>[0]);
              }}
              className="block w-full rounded-md px-2.5 py-2 text-left hover:bg-muted"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium">{message.authorName}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {formatDate(message.createdAt)}
                </span>
              </div>
              <p className="line-clamp-2 text-xs text-muted-foreground">{message.text}</p>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ChatV2NavigationHeader({
  onNewConversation,
  meId,
}: {
  onNewConversation: () => void;
  meId: string;
}) {
  const [savedOpen, setSavedOpen] = useState(false);
  return (
    <div className="flex shrink-0 items-center justify-between px-3.5 py-3.5">
      <p className="text-base font-semibold text-foreground">Conversas</p>
      <div className="flex items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label="Mensagens salvas"
              onClick={() => setSavedOpen(true)}
            >
              <Bookmark className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Mensagens salvas</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label="Nova conversa"
              onClick={onNewConversation}
            >
              <SquarePen className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Nova conversa</TooltipContent>
        </Tooltip>
      </div>
      <SavedMessagesDialog open={savedOpen} onOpenChange={setSavedOpen} meId={meId} />
    </div>
  );
}
