import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Hash, Users } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { createChannel, type ChatChannel, type ChatMember } from "@/lib/chat-store";

/**
 * Busca de membros internos + canais permitidos pra iniciar uma conversa, ou
 * criar um grupo novo. Nunca cria uma DM vazia sozinha: DM só navega pra uma
 * conversa já existente (uma DM "existe" assim que há qualquer histórico ou
 * assim que a pessoa manda a primeira mensagem — o par é canônico via
 * `dmId`, não há tabela de conversa separada a criar). "Grupo" reaproveita
 * `chat_channels` como canal privado sem `linkedScope` — é exatamente o
 * mesmo modelo de "3+ pessoas, nome opcional, membros administráveis" que
 * um canal privado já implementa; criar uma tabela paralela só pra isso
 * duplicaria uma estrutura que já existe e já tem RLS madura. Clientes do
 * Portal do Cliente nunca aparecem aqui — `members` já vem filtrado na
 * origem (`loadMembers()`/`time:membros`, só time interno).
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
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const close = () => {
    onOpenChange(false);
    setCreatingGroup(false);
    setGroupName("");
    setSelected(new Set());
    setSaving(false);
  };

  const go = (to: string, params: Record<string, string>) => {
    close();
    void navigate({ to, params });
  };

  const toggleMember = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const canCreateGroup = groupName.trim().length > 0 && selected.size >= 2;

  const submitGroup = async () => {
    if (!canCreateGroup || saving) return;
    setSaving(true);
    const created = await createChannel({
      name: groupName.trim(),
      private: true,
      allowedMemberIds: [meId, ...selected],
    });
    setSaving(false);
    if (created) go("/chat-v2/channel/$id", { id: created.id.slice(2) });
  };

  if (creatingGroup) {
    return (
      <CommandDialog open={open} onOpenChange={(o) => (o ? onOpenChange(o) : close())}>
        <div className="flex flex-col gap-3 p-4">
          <p className="text-sm font-medium">Novo grupo</p>
          <Input
            autoFocus
            placeholder="Nome do grupo"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Selecione ao menos 2 pessoas ({selected.size} selecionada
            {selected.size === 1 ? "" : "s"})
          </p>
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {members
              .filter((m) => m.id !== meId)
              .map((m) => (
                <label
                  key={m.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted"
                >
                  <Checkbox
                    checked={selected.has(m.id)}
                    onCheckedChange={() => toggleMember(m.id)}
                  />
                  {m.photo ? (
                    <img src={m.photo} alt="" className="h-5 w-5 rounded-full object-cover" />
                  ) : (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[11px] font-semibold">
                      {m.name.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <span className="text-sm">{m.name}</span>
                </label>
              ))}
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setCreatingGroup(false)}>
              Voltar
            </Button>
            <Button disabled={!canCreateGroup || saving} onClick={() => void submitGroup()}>
              {saving ? "Criando…" : "Criar grupo"}
            </Button>
          </div>
        </div>
      </CommandDialog>
    );
  }

  return (
    <CommandDialog open={open} onOpenChange={(o) => (o ? onOpenChange(o) : close())}>
      <CommandInput placeholder="Buscar pessoa ou canal…" />
      <CommandList>
        <CommandEmpty>Nada encontrado.</CommandEmpty>
        <CommandGroup heading="Ações">
          <CommandItem value="Criar grupo" onSelect={() => setCreatingGroup(true)}>
            <Users className="h-4 w-4 text-muted-foreground" />
            Criar grupo
          </CommandItem>
        </CommandGroup>
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
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[11px] font-semibold">
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
