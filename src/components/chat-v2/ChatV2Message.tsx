import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Bookmark,
  MessageSquare,
  MoreHorizontal,
  Pin,
  PinOff,
  Reply,
  SmilePlus,
} from "lucide-react";
import {
  REACTION_EMOJIS,
  editMessage,
  toggleReaction,
  isMessageSaved,
  toggleSavedMessage,
  isMessagePinned,
  togglePinnedMessage,
  getStatus,
  STATUS_LABEL,
  type ChatMessage,
  type ChatMember,
  type ChatMention,
} from "@/lib/chat-store";
import { MENTION_KIND_CONFIG } from "@/lib/mention-kinds";
import { splitMentionParts } from "@/lib/mention-render";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TaskMentionCard, type ChatTaskInfo } from "@/components/chat/TaskMentionCard";
import { AttachmentList } from "@/components/chat/AttachmentList";
import { MessageAvatar } from "@/components/chat/MessageAvatar";
import { useMentionNavigation } from "./use-mention-navigation";

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/** Popover compacto de pessoa mencionada — foto, nome, função, presença e
 * "Enviar mensagem". Deliberadamente NADA administrativo (sem score, sem
 * métricas de desempenho, sem dado de cliente) — é só o que o pedido de
 * design permite mostrar aqui. */
function PersonMentionPopover({
  member,
  meId,
  children,
}: {
  member: ChatMember;
  meId: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const status = getStatus(member.id);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align="start"
        collisionPadding={12}
        avoidCollisions
        className="w-64 p-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5">
          {member.photo ? (
            <img src={member.photo} alt="" className="h-10 w-10 rounded-full object-cover" />
          ) : (
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-sm font-semibold">
              {member.name.slice(0, 1).toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{member.name}</p>
            {member.role && <p className="truncate text-xs text-muted-foreground">{member.role}</p>}
            <p className="text-[11px] text-muted-foreground">{STATUS_LABEL[status]}</p>
          </div>
        </div>
        {member.id !== meId && (
          <Button
            size="sm"
            variant="outline"
            className="mt-3 w-full"
            onClick={() => {
              setOpen(false);
              void navigate({ to: "/chat-v2/dm/$id", params: { id: member.id } });
            }}
          >
            Enviar mensagem
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Menção de pessoa: texto simples na cor da marca, sem pílula/fundo — só
 * ganha um fundo sutil quando é o próprio usuário mencionado. Entidade
 * (tarefa/projeto/campanha/cliente): ícone + rótulo compacto num badge
 * neutro, deliberadamente MENOS chamativo que uma pessoa (a diferença
 * semântica pedida: pessoa é "parte da frase", entidade é "uma referência
 * a outra coisa"). Cards de tarefa mencionada continuam aparecendo à
 * parte, abaixo do texto — isso aqui é só a menção inline. */
function renderTextWithMentions(
  text: string,
  mentions: ChatMention[] | undefined,
  meId: string,
  members: ChatMember[],
  onOpenMention: (m: ChatMention) => void,
) {
  const parts = splitMentionParts(text, mentions);
  return parts.map((p, i) => {
    if (typeof p === "string") return <span key={i}>{p}</span>;

    if (p.kind === "user") {
      const isSelf = p.id === meId;
      const member = members.find((m) => m.id === p.id);
      const trigger = (
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={`rounded px-0.5 font-medium text-brand hover:underline ${
            isSelf ? "bg-brand/10" : ""
          }`}
        >
          @{p.label}
        </button>
      );
      if (!member) return <span key={i}>{trigger}</span>;
      return (
        <PersonMentionPopover key={i} member={member} meId={meId}>
          {trigger}
        </PersonMentionPopover>
      );
    }

    const { Icon } = MENTION_KIND_CONFIG[p.kind];
    return (
      <button
        key={i}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpenMention(p);
        }}
        className="mx-0.5 inline-flex items-center gap-1 rounded border border-border/80 bg-muted/60 px-1.5 py-px align-middle text-xs font-medium text-foreground hover:bg-muted"
      >
        <Icon className="h-3 w-3 text-muted-foreground" />
        {p.label}
      </button>
    );
  });
}

function taskMentionsOf(
  mentions: ChatMention[] | undefined,
  taskInfoById: Map<string, ChatTaskInfo>,
): ChatTaskInfo[] {
  if (!mentions || mentions.length === 0) return [];
  const seen = new Set<string>();
  const out: ChatTaskInfo[] = [];
  for (const m of mentions) {
    if (m.kind !== "task" || seen.has(m.id)) continue;
    const task = taskInfoById.get(m.id);
    if (!task) continue;
    seen.add(m.id);
    out.push(task);
  }
  return out;
}

/** Sanitização mínima do texto renderizado: nunca HTML arbitrário. O texto
 * chega como string simples do banco — quebra de linha é a única
 * "formatação" que precisamos preservar visualmente (markdown controlado
 * fica pra uma rodada futura de bold/itálico/código, ver limitações
 * conhecidas do relatório final). */
function MessageText({
  text,
  mentions,
  meId,
  members,
  onOpenMention,
}: {
  text: string;
  mentions: ChatMention[] | undefined;
  meId: string;
  members: ChatMember[];
  onOpenMention: (m: ChatMention) => void;
}) {
  if (!text) return null;
  return (
    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
      {renderTextWithMentions(text, mentions, meId, members, onOpenMention)}
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
  replyCount,
  convoId,
}: {
  message: ChatMessage;
  showHeader: boolean;
  meId: string;
  members: ChatMember[];
  onReply: (message: ChatMessage) => void;
  onDelete: (id: string) => void;
  /** Quantidade de respostas em thread desta mensagem (só é passado na
   * timeline principal — dentro do próprio painel de thread não faz
   * sentido mostrar contagem recursiva). */
  replyCount?: number;
  /** Necessário pra Salvar/Fixar (tabelas ligam ao convo, não só à
   * mensagem) — cai de volta pro `message.convoId` quando não informado
   * (painel de thread não passa, mas a mensagem já carrega o convo certo). */
  convoId?: string;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(message.text);
  const isMine = message.authorId === meId;
  const isSystem = message.authorId === "system";
  const { openMention, openTask, taskInfoById } = useMentionNavigation();
  const effectiveConvoId = convoId ?? message.convoId;
  const saved = isMessageSaved(message.id);
  const pinned = isMessagePinned(effectiveConvoId, message.id);

  const saveEdit = async () => {
    const trimmed = editText.trim();
    if (trimmed && trimmed !== message.text) {
      await editMessage(message.id, trimmed, message.mentions ?? []);
    }
    setEditing(false);
  };

  if (isSystem) {
    return (
      <div className="px-5 py-1 text-center text-xs text-muted-foreground md:px-6">
        {message.text}
      </div>
    );
  }

  return (
    <div className="group relative flex gap-3 rounded-md px-5 py-0.5 hover:bg-muted/40 md:px-6">
      <div className="w-9 shrink-0">
        {showHeader ? (
          <MessageAvatar
            photo={message.authorPhoto}
            name={message.authorName}
            shape="square"
            className="h-9 w-9 text-sm"
          />
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
          {editing ? (
            <div className="space-y-1.5">
              <Textarea
                autoFocus
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void saveEdit();
                  } else if (e.key === "Escape") {
                    setEditing(false);
                    setEditText(message.text);
                  }
                }}
                className="min-h-[60px] text-sm"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => void saveEdit()}>
                  Salvar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditing(false);
                    setEditText(message.text);
                  }}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <MessageText
              text={message.text}
              mentions={message.mentions}
              meId={meId}
              members={members}
              onOpenMention={openMention}
            />
          )}
          {taskMentionsOf(message.mentions, taskInfoById).map((task) => (
            <div key={task.id} className="mt-1.5">
              <TaskMentionCard task={task} onOpen={openTask} />
            </div>
          ))}
          {message.attachments && message.attachments.length > 0 && (
            <AttachmentList message={message} attachments={message.attachments} />
          )}
          <ReactionBar message={message} meId={meId} members={members} />
          {!!replyCount && replyCount > 0 && (
            <button
              type="button"
              onClick={() => onReply(message)}
              className="mt-1 flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs font-medium text-brand hover:bg-brand-subtle"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              {replyCount} resposta{replyCount === 1 ? "" : "s"}
            </button>
          )}
        </div>
      </div>
      {/* Visível no hover/foco do teclado (`group-hover`/`group-focus-within`,
       * CSS puro) — MAS também precisa ficar visível enquanto qualquer menu
       * dela está aberto (`pickerOpen`/`moreOpen`, estado React), senão um
       * clique que solta o `:hover` (teclado, toque, ou o próprio Radix
       * movendo o foco pro Portal ao abrir) faz este container colapsar pra
       * `display:none` ENQUANTO o Popover/DropdownMenu ainda está montado —
       * o Radix então mede `getBoundingClientRect()` do trigger escondido
       * (retorna 0,0,0,0) e ancora o menu no canto superior esquerdo da
       * página em vez de perto da mensagem. Forçar `flex` explícito quando
       * aberto é a correção real: nunca deixar o trigger existir sem estar
       * visível/mensurável enquanto seu próprio menu está montado. */}
      <div
        className={`absolute right-3 top-0 items-center gap-0.5 rounded-md border border-border bg-background p-0.5 shadow-sm ${
          pickerOpen || moreOpen ? "flex" : "hidden group-hover:flex group-focus-within:flex"
        }`}
      >
        <DropdownMenu open={pickerOpen} onOpenChange={setPickerOpen}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Reagir">
              <SmilePlus className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            collisionPadding={12}
            avoidCollisions
            className="flex w-auto gap-0.5 p-1"
          >
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
        <DropdownMenu open={moreOpen} onOpenChange={setMoreOpen}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Mais ações">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" collisionPadding={12} avoidCollisions>
            <DropdownMenuItem onClick={() => navigator.clipboard.writeText(message.text)}>
              Copiar texto
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void toggleSavedMessage(message.id)}>
              <Bookmark className="mr-2 h-3.5 w-3.5" />
              {saved ? "Remover dos salvos" : "Salvar"}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => void togglePinnedMessage(effectiveConvoId, message.id)}
            >
              {pinned ? (
                <PinOff className="mr-2 h-3.5 w-3.5" />
              ) : (
                <Pin className="mr-2 h-3.5 w-3.5" />
              )}
              {pinned ? "Desafixar" : "Fixar"}
            </DropdownMenuItem>
            {isMine && (
              <>
                <DropdownMenuItem
                  onClick={() => {
                    setEditText(message.text);
                    setEditing(true);
                  }}
                >
                  Editar
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => onDelete(message.id)}
                >
                  Excluir
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
