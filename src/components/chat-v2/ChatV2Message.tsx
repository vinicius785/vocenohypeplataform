import { useState } from "react";
import { MoreHorizontal, Reply, SmilePlus } from "lucide-react";
import {
  REACTION_EMOJIS,
  toggleReaction,
  type ChatMessage,
  type ChatMember,
} from "@/lib/chat-store";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/** Sanitização mínima do texto renderizado: nunca HTML arbitrário. O texto
 * chega como string simples do banco — quebra de linha é a única
 * "formatação" que precisamos preservar visualmente (markdown controlado
 * fica pra uma rodada futura de bold/itálico/código, ver limitações
 * conhecidas do relatório final). */
function MessageText({ text }: { text: string }) {
  if (!text) return null;
  return (
    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
      {text}
    </p>
  );
}

function ReactionBar({
  message,
  meId,
  members,
}: {
  message: ChatMessage;
  meId: string;
  members: ChatMember[];
}) {
  const reactions = message.reactions ?? {};
  const entries = Object.entries(reactions).filter(([, users]) => users.length > 0);
  if (entries.length === 0) return null;
  const nameOf = (id: string) =>
    members.find((m) => m.id === id)?.name ?? (id === meId ? "Você" : id);
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {entries.map(([emoji, users]) => {
        const mine = users.includes(meId);
        return (
          <Tooltip key={emoji}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => void toggleReaction(message.id, emoji)}
                className={`flex h-6 items-center gap-1 rounded-full border px-1.5 text-xs transition-colors ${
                  mine
                    ? "border-brand-border bg-brand-subtle text-brand-foreground"
                    : "border-border bg-muted/40 text-muted-foreground hover:bg-muted"
                }`}
              >
                <span>{emoji}</span>
                <span>{users.length}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent>{users.map(nameOf).join(", ")}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

export function ChatV2Message({
  message,
  showHeader,
  meId,
  members,
  onReply,
  onDelete,
}: {
  message: ChatMessage;
  showHeader: boolean;
  meId: string;
  members: ChatMember[];
  onReply: (message: ChatMessage) => void;
  onDelete: (id: string) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const isMine = message.authorId === meId;
  const isSystem = message.authorId === "system";

  if (isSystem) {
    return (
      <div className="px-4 py-1 text-center text-xs text-muted-foreground">{message.text}</div>
    );
  }

  return (
    <div className="group relative flex gap-3 rounded-md px-4 py-0.5 hover:bg-muted/40">
      <div className="w-9 shrink-0">
        {showHeader ? (
          message.authorPhoto ? (
            <img src={message.authorPhoto} alt="" className="h-9 w-9 rounded-md object-cover" />
          ) : (
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-muted text-sm font-semibold text-foreground">
              {message.authorName.slice(0, 1).toUpperCase()}
            </span>
          )
        ) : (
          <span className="block h-4 w-9 text-right text-[10px] leading-4 text-muted-foreground opacity-0 group-hover:opacity-100">
            {formatTime(message.createdAt)}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1 py-0.5">
        {showHeader && (
          <div className="flex items-baseline gap-2">
            <span className={`text-sm font-semibold ${isMine ? "text-brand" : "text-foreground"}`}>
              {message.authorName}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {formatTime(message.createdAt)}
            </span>
            {message.editedAt && (
              <span className="text-[11px] text-muted-foreground">(editada)</span>
            )}
          </div>
        )}
        <div className="max-w-[720px]">
          <MessageText text={message.text} />
          {(message.attachments ?? []).map((a, i) => (
            <a
              key={i}
              href={a.url}
              target="_blank"
              rel="noreferrer"
              className="mt-1 flex items-center gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-1.5 text-xs text-foreground hover:bg-muted/60"
            >
              {a.type.startsWith("image/") ? (
                <img src={a.url} alt={a.name} className="max-h-48 rounded object-contain" />
              ) : (
                <span className="truncate">{a.kind === "voice" ? "Mensagem de voz" : a.name}</span>
              )}
            </a>
          ))}
          <ReactionBar message={message} meId={meId} members={members} />
        </div>
      </div>
      <div className="absolute right-3 top-0 hidden items-center gap-0.5 rounded-md border border-border bg-background p-0.5 shadow-sm group-hover:flex">
        <DropdownMenu open={pickerOpen} onOpenChange={setPickerOpen}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Reagir">
              <SmilePlus className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="flex w-auto gap-0.5 p-1">
            {REACTION_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className="rounded p-1 text-lg hover:bg-muted"
                onClick={() => {
                  void toggleReaction(message.id, emoji);
                  setPickerOpen(false);
                }}
              >
                {emoji}
              </button>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label="Responder em thread"
          onClick={() => onReply(message)}
        >
          <Reply className="h-4 w-4" />
        </Button>
        {isMine && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Mais ações">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => navigator.clipboard.writeText(message.text)}>
                Copiar texto
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => onDelete(message.id)}
              >
                Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}
