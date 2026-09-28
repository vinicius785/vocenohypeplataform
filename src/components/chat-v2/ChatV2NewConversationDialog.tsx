import { useNavigate } from "@tanstack/react-router";
import { Hash } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type { ChatChannel, ChatMember } from "@/lib/chat-store";

/**
 * Busca de membros internos + canais permitidos pra iniciar uma conversa —
 * nunca cria uma conversa vazia sozinha: só navega pra uma DM/canal já
 * existente (uma DM "existe" assim que há qualquer histórico ou assim que
 * a pessoa manda a primeira mensagem; não há uma tabela de "conversa"
 * separada a criar). Clientes do Portal do Cliente nunca aparecem aqui —
 * `members` já vem filtrado na origem (`loadMembers()`/`time:membros`, só
 * time interno).
 */
export function ChatV2NewConversationDialog({
  open,
  onOpenChange,
  members,
  channels,
  meId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: ChatMember[];
  channels: ChatChannel[];
  meId: string;
}) {
  const navigate = useNavigate();

  const go = (to: string, params: Record<string, string>) => {
    onOpenChange(false);
    void navigate({ to, params });
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Buscar pessoa ou canal…" />
      <CommandList>
        <CommandEmpty>Nada encontrado.</CommandEmpty>
        <CommandGroup heading="Pessoas">
          {members
            .filter((m) => m.id !== meId)
            .map((m) => (
              <CommandItem
                key={m.id}
                value={m.name}
                onSelect={() => go("/chat-v2/dm/$id", { id: m.id })}
              >
                {m.photo ? (
                  <img src={m.photo} alt="" className="h-5 w-5 rounded-full object-cover" />
                ) : (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
                    {m.name.slice(0, 1).toUpperCase()}
                  </span>
                )}
                {m.name}
              </CommandItem>
            ))}
        </CommandGroup>
        <CommandGroup heading="Canais">
          {channels.map((c) => (
            <CommandItem
              key={c.id}
              value={c.name}
              onSelect={() => go("/chat-v2/channel/$id", { id: c.id.slice(2) })}
            >
              <Hash className="h-4 w-4 text-muted-foreground" />
              {c.name}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
