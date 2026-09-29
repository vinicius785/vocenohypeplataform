import { useEffect, useRef, useState } from "react";
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
import { linkifyText } from "@/lib/linkify";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
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
    // Reaproveita a mesma função de linkificação já usada no Chat V1
    // (`src/lib/linkify.tsx`, `ChatSection.tsx`) em vez de escrever uma nova
    // — mesma regex de URL, mesmo comportamento de link (nova aba, sem
    // vazar `rel`), texto normal e menções continuam intocados.
    if (typeof p === "string") return <span key={i}>{linkifyText(p, `msg-link-${i}`)}</span>;

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
  closeMenusSignal,
}: {
  message: ChatMessage;
  showHeader: boolean;
  meId: string;
  members: ChatMember[];
  onReply: (message: ChatMessage) => void;
  onDelete: (id: string) => void | Promise<void>;
  /** Quantidade de respostas em thread desta mensagem (só é passado na
   * timeline principal — dentro do próprio painel de thread não faz
   * sentido mostrar contagem recursiva). */
  replyCount?: number;
  /** Necessário pra Salvar/Fixar (tabelas ligam ao convo, não só à
   * mensagem) — cai de volta pro `message.convoId` quando não informado
   * (painel de thread não passa, mas a mensagem já carrega o convo certo). */
  convoId?: string;
  /** Incrementado pela Timeline a cada rolagem relevante — fecha qualquer
   * menu local (picker/mais ações/bottom sheet) desta mensagem, pra não
   * deixá-lo "flutuando" numa posição antiga depois que ela saiu de vista. */
  closeMenusSignal?: number;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(message.text);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMine = message.authorId === meId;
  const isSystem = message.authorId === "system";
  const { openMention, openTask, taskInfoById } = useMentionNavigation();
  const effectiveConvoId = convoId ?? message.convoId;
  const saved = isMessageSaved(message.id);
  const pinned = isMessagePinned(effectiveConvoId, message.id);

  // Fecha qualquer menu local desta mensagem quando a timeline rola.
  useEffect(() => {
    if (closeMenusSignal === undefined) return;
    setPickerOpen(false);
    setMoreOpen(false);
    setSheetOpen(false);
  }, [closeMenusSignal]);

  const saveEdit = async () => {
    const trimmed = editText.trim();
    if (trimmed && trimmed !== message.text) {
      await editMessage(message.id, trimmed, message.mentions ?? []);
    }
    setEditing(false);
  };

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await onDelete(message.id);
      setConfirmDeleteOpen(false);
    } finally {
      setDeleting(false);
    }
  };

  // Toque-e-segurar (~500ms) abre o bottom sheet de ações em mobile, onde o
  // hover (`group-hover`) não existe pra revelar a barra de ações.
  const startLongPress = () => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => setSheetOpen(true), 500);
  };
  const cancelLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  if (isSystem) {
    return (
      <div className="px-5 py-1 text-center text-xs text-muted-foreground md:px-6">
        {message.text}
      </div>
    );
  }

  return (
    <div
      className="group relative flex gap-3 rounded-md px-5 py-0.5 hover:bg-muted/40 md:px-6"
      onTouchStart={startLongPress}
      onTouchEnd={cancelLongPress}
      onTouchMove={cancelLongPress}
      onTouchCancel={cancelLongPress}
    >
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
        {/* Wrapper de CONTEÚDO real (não a linha inteira, que ocupa 100% da
         * timeline) — `w-fit` faz a caixa abraçar o conteúdo (mensagem curta
         * = caixa estreita), `max-w-[...]` limita mensagens longas a uma
         * largura de leitura confortável. Este é o ancestral `relative` da
         * barra de ações agora — antes ela era filha da linha inteira
         * (100% de largura), por isso `right-3` ancorava no extremo direito
         * da TIMELINE, não da mensagem, mesmo com o texto bem mais curto e
         * alinhado à esquerda. */}
        <div className="relative w-fit max-w-[min(960px,calc(100%-64px))]">
          {showHeader && (
            <div className="flex items-baseline gap-2 pr-16">
              <span className="text-sm font-semibold text-foreground">{message.authorName}</span>
              {isMine && <span className="text-[11px] text-muted-foreground">· você</span>}
              <span className="text-[11px] text-muted-foreground">
                {formatTime(message.createdAt)}
              </span>
              {message.editedAt && (
                <span className="text-[11px] text-muted-foreground">(editada)</span>
              )}
            </div>
          )}
          {editing ? (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Editando mensagem</p>
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
           * visível/mensurável enquanto seu próprio menu está montado.
           *
           * ANCORADA NESTE WRAPPER (largura real do conteúdo), não na linha
           * inteira da mensagem — é essa a correção do bug de "menu longe da
           * mensagem, preso no canto direito do chat": antes esta barra era
           * filha da linha inteira (100% da largura da timeline), então
           * `right-*` media a partir da borda direita da TIMELINE, não do
           * balão de texto, mesmo com mensagens curtas alinhadas à esquerda. */}
          <div
            className={`absolute -top-3 right-1 items-center gap-0.5 rounded-md border border-border bg-background p-0.5 shadow-sm ${
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
                    <DropdownMenuSeparator />
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
                      onClick={() => setConfirmDeleteOpen(true)}
                    >
                      Excluir
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Confirmação de exclusão — nunca some a mensagem otimisticamente
       * antes da mutation confirmar sucesso; se `onDelete` falhar, o diálogo
       * fica aberto (o `finally` só libera o botão, não fecha o diálogo). */}
      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir mensagem?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta mensagem será removida da conversa para todos. Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
            >
              {deleting ? "Excluindo…" : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bottom sheet mobile — mesmas ações do menu "Mais ações", abertas
       * via toque-e-segurar (hover não existe em touch pra revelar a barra
       * de ações). Botões com altura mínima de 44px pra área de toque. */}
      <Drawer open={sheetOpen} onOpenChange={setSheetOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle className="text-left">Ações da mensagem</DrawerTitle>
          </DrawerHeader>
          <div className="flex flex-col gap-1 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              className="flex min-h-11 items-center gap-3 rounded-md px-3 text-sm hover:bg-muted"
              onClick={() => {
                navigator.clipboard.writeText(message.text);
                setSheetOpen(false);
              }}
            >
              Copiar texto
            </button>
            <button
              type="button"
              className="flex min-h-11 items-center gap-3 rounded-md px-3 text-sm hover:bg-muted"
              onClick={() => {
                void toggleSavedMessage(message.id);
                setSheetOpen(false);
              }}
            >
              <Bookmark className="h-4 w-4" />
              {saved ? "Remover dos salvos" : "Salvar"}
            </button>
            <button
              type="button"
              className="flex min-h-11 items-center gap-3 rounded-md px-3 text-sm hover:bg-muted"
              onClick={() => {
                void togglePinnedMessage(effectiveConvoId, message.id);
                setSheetOpen(false);
              }}
            >
              {pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
              {pinned ? "Desafixar" : "Fixar"}
            </button>
            <button
              type="button"
              className="flex min-h-11 items-center gap-3 rounded-md px-3 text-sm hover:bg-muted"
              onClick={() => {
                onReply(message);
                setSheetOpen(false);
              }}
            >
              <Reply className="h-4 w-4" />
              Responder em thread
            </button>
            {isMine && (
              <>
                <div className="my-1 h-px bg-border" />
                <button
                  type="button"
                  className="flex min-h-11 items-center gap-3 rounded-md px-3 text-sm hover:bg-muted"
                  onClick={() => {
                    setEditText(message.text);
                    setEditing(true);
                    setSheetOpen(false);
                  }}
                >
                  Editar
                </button>
                <button
                  type="button"
                  className="flex min-h-11 items-center gap-3 rounded-md px-3 text-sm text-destructive hover:bg-muted"
                  onClick={() => {
                    setSheetOpen(false);
                    setConfirmDeleteOpen(true);
                  }}
                >
                  Excluir
                </button>
              </>
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
