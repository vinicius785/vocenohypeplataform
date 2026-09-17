/**
 * Botão flutuante global do Hypito + painel compacto (pedido do upgrade
 * do Hypito, seção 4) — montado uma única vez em `AppShell.tsx`, mesmo
 * padrão sem props de `BugReportButton`/`MeetingReminderToast`, então
 * aparece em toda tela autenticada sem prop-drilling.
 *
 * Reaproveita 100% do motor existente: a conversa é a MESMA DM já usada
 * pela tela cheia do Chat (`dmId(userId, HYPITO_AUTHOR_ID)`, sincronizada
 * por `chat-store.ts`), as mesmas server functions de
 * `hypito-chat.functions.ts`, e os mesmos cards de
 * `HypitoMessageCards.tsx` — este componente é só uma segunda "casca"
 * visual, nunca um cliente/motor paralelo.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Send, Mic, Minus, X, Sparkles, ExternalLink } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import {
  HYPITO_AUTHOR_ID,
  HYPITO_NAME,
  HYPITO_AVATAR_URL,
  HYPITO_TAGLINE,
  HYPITO_BADGE_LABEL,
} from "@/lib/hypito";
import {
  getMe,
  dmId,
  loadMessages,
  subscribeChat,
  getUnreadCount,
  markRead,
  setActive as setActiveConvo,
  type ChatMessage,
} from "@/lib/chat-store";
import {
  sendHypitoMessage,
  confirmHypitoAction,
  cancelHypitoAction,
  pickHypitoField,
  completeHypitoTaskFromAlert,
} from "@/lib/hypito-chat.functions";
import { parseHypitoMessage, type HypitoEntityRef } from "@/lib/hypito-messages";
import { HypitoMessageCard, hasOwnCard, type HypitoCardHandlers } from "./HypitoMessageCards";
import {
  isHypitoWidgetOpen,
  isHypitoWidgetMinimized,
  subscribeHypitoWidget,
  toggleHypitoWidget,
  closeHypitoWidget,
  minimizeHypitoWidget,
} from "@/lib/hypito-widget-store";
import type { SectionKey } from "@/components/AppShell";

const SUGGESTIONS = [
  "Criar uma tarefa",
  "Minhas tarefas de hoje",
  "O que está atrasado?",
  "Próximas reuniões",
  "Tarefas bloqueadas",
  "Resumo da semana",
];

function useHypitoWidgetState() {
  const [, setTick] = useState(0);
  useEffect(() => subscribeHypitoWidget(() => setTick((n) => n + 1)), []);
  return { open: isHypitoWidgetOpen(), minimized: isHypitoWidgetMinimized() };
}

function useChatMessages() {
  const [, setTick] = useState(0);
  useEffect(() => subscribeChat(() => setTick((n) => n + 1)), []);
  return loadMessages();
}

export function HypitoFloatingWidget() {
  const me = getMe();
  const convoId = dmId(me.id, HYPITO_AUTHOR_ID);
  const { open, minimized } = useHypitoWidgetState();
  const allMessages = useChatMessages();
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const messages = useMemo(
    () =>
      allMessages.filter((m) => m.convoId === convoId).sort((a, b) => a.createdAt - b.createdAt),
    [allMessages, convoId],
  );
  const unread = getUnreadCount(convoId, allMessages, me.id);

  useEffect(() => {
    if (open && !minimized) void markRead(convoId);
  }, [open, minimized, convoId, messages.length]);

  useEffect(() => {
    if (open && !minimized) {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
    }
  }, [messages.length, open, minimized]);

  const onOpenEntity = (ref: HypitoEntityRef) => {
    if (ref.type === "task") {
      const scope = ref.meta?.scope as string | null | undefined;
      const scopeId = ref.meta?.scopeId as string | null | undefined;
      if (scope === "projeto" && scopeId) {
        navigate({ to: "/projeto/$id", params: { id: scopeId }, search: { taskId: ref.id } });
        return;
      }
      navigate({ to: "/time", search: { section: "projetos" satisfies SectionKey } });
      return;
    }
    if (ref.type === "campaign")
      navigate({ to: "/time", search: { section: "campanhas" satisfies SectionKey } });
    else if (ref.type === "project") navigate({ to: "/projeto/$id", params: { id: ref.id } });
    else if (ref.type === "meeting")
      navigate({ to: "/time", search: { section: "reunioes" satisfies SectionKey } });
    else if (ref.type === "client")
      navigate({ to: "/time", search: { section: "clientes" satisfies SectionKey } });
  };

  const handlers: HypitoCardHandlers = {
    onOpenEntity,
    onOpenFilter: () =>
      navigate({ to: "/time", search: { section: "projetos" satisfies SectionKey } }),
    onOpenAgenda: () =>
      navigate({ to: "/time", search: { section: "reunioes" satisfies SectionKey } }),
    onConfirmTask: async (pendingActionId) => {
      await confirmHypitoAction({ data: { pendingActionId } });
    },
    onCancelTask: async (pendingActionId) => {
      await cancelHypitoAction({ data: { pendingActionId, reason: "cancel" } });
    },
    onEditTask: async (pendingActionId) => {
      await cancelHypitoAction({ data: { pendingActionId, reason: "edit" } });
    },
    onSelectChoice: (name) => void send(name),
    onPickScope: (ref) =>
      void pickHypitoField({
        data: {
          field: "scope",
          scopeType: ref.type === "project" ? "project" : "campaign",
          id: ref.id,
          name: ref.name,
        },
      }),
    onPickAssignee: (ref) =>
      void pickHypitoField({ data: { field: "assignee", id: ref.id, name: ref.name } }),
    onPickDate: (iso) => void pickHypitoField({ data: { field: "date", iso } }),
    onConfirmInterpretedDate: (confirmed) =>
      void pickHypitoField({ data: { field: "date_confirm", confirmed } }),
    onOpenSourceMessage: () => {
      /* já estamos na conversa certa dentro do próprio widget */
    },
    onCompleteTaskFromAlert: async (ref) => {
      const scope = (ref.meta?.scope as "projeto" | "campanha" | "marketing" | null) ?? null;
      const scopeId = (ref.meta?.scopeId as string | null) ?? null;
      await completeHypitoTaskFromAlert({ data: { taskId: ref.id, scope, scopeId } });
    },
    onReplanTaskFromAlert: onOpenEntity,
    onBlockTaskFromAlert: onOpenEntity,
  };

  const send = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setText("");
    try {
      await sendHypitoMessage({ data: { text: trimmed } });
    } finally {
      setSending(false);
    }
  };

  if (!open) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={toggleHypitoWidget}
              aria-label="Falar com o Hypito"
              className="fixed bottom-20 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full border border-border bg-background shadow-lg transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <img src={HYPITO_AVATAR_URL} alt="" className="h-9 w-9 rounded-full object-cover" />
              {unread > 0 && (
                <span className="absolute right-0 top-0 h-2.5 w-2.5 rounded-full bg-brand ring-2 ring-background" />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="left">Falar com o Hypito</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (minimized) {
    return (
      <button
        type="button"
        onClick={toggleHypitoWidget}
        className="fixed bottom-20 right-4 z-40 flex h-12 items-center gap-2 rounded-full border border-border bg-background px-3 shadow-lg hover:bg-muted"
      >
        <img src={HYPITO_AVATAR_URL} alt="" className="h-7 w-7 rounded-full object-cover" />
        <span className="text-sm font-medium">{HYPITO_NAME}</span>
        {unread > 0 && (
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-brand text-[10px] text-brand-foreground">
            {unread}
          </span>
        )}
      </button>
    );
  }

  return (
    <TooltipProvider>
      <div className="fixed inset-0 z-40 flex items-end justify-end p-0 sm:inset-auto sm:bottom-4 sm:right-4 sm:p-0">
        <div className="flex h-full w-full flex-col border border-border bg-background shadow-2xl sm:h-[min(640px,calc(100vh-96px))] sm:w-[400px] sm:rounded-xl">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <img src={HYPITO_AVATAR_URL} alt="" className="h-8 w-8 rounded-full object-cover" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">{HYPITO_NAME}</p>
              <p className="truncate text-xs text-muted-foreground">{HYPITO_TAGLINE}</p>
            </div>
            <span className="shrink-0 rounded-full bg-brand-subtle px-2 py-0.5 text-[10px] font-medium text-brand">
              {HYPITO_BADGE_LABEL}
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => {
                    // Mesma conversa, só muda a "casca" visual — nunca
                    // duplica histórico (pedido do upgrade do Chat,
                    // seção 18). Minimiza o próprio painel pra nunca
                    // mostrar 2 Hypitos abertos ao mesmo tempo.
                    navigate({ to: "/time", search: { section: "chat" satisfies SectionKey } });
                    setActiveConvo(convoId);
                    minimizeHypitoWidget();
                  }}
                  aria-label="Abrir no Chat"
                  className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <ExternalLink className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Abrir no Chat</TooltipContent>
            </Tooltip>
            <button
              type="button"
              onClick={minimizeHypitoWidget}
              aria-label="Minimizar"
              className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Minus className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={closeHypitoWidget}
              aria-label="Fechar"
              className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {messages.length === 0 && (
              <div className="space-y-3 py-4">
                <p className="text-center text-sm text-muted-foreground">
                  Pergunte algo ou escolha uma sugestão.
                </p>
                <div className="flex flex-wrap justify-center gap-1.5">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => void send(s)}
                      className="rounded-full border border-border px-3 py-1.5 text-xs text-foreground hover:bg-muted"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m) => (
              <HypitoWidgetMessage key={m.id} message={m} meId={me.id} handlers={handlers} />
            ))}
            {sending && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 animate-pulse" /> Pensando...
              </div>
            )}
          </div>

          <div className="flex items-end gap-2 border-t border-border p-3">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send(text);
                }
              }}
              placeholder="Escreva para o Hypito..."
              className="min-h-9 flex-1 resize-none text-sm"
              rows={1}
              disabled={sending}
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button variant="outline" size="icon" disabled className="shrink-0">
                    <Mic className="h-4 w-4" />
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>Em breve</TooltipContent>
            </Tooltip>
            <Button
              size="icon"
              className="shrink-0"
              disabled={sending || !text.trim()}
              onClick={() => void send(text)}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

function HypitoWidgetMessage({
  message,
  meId,
  handlers,
}: {
  message: ChatMessage;
  meId: string;
  handlers: HypitoCardHandlers;
}) {
  const mine = message.authorId === meId;
  const payload = message.hypitoPayload ? parseHypitoMessage(message.hypitoPayload) : null;
  if (payload && hasOwnCard(payload)) {
    return <HypitoMessageCard payload={payload} handlers={handlers} />;
  }
  return (
    <div className={mine ? "flex justify-end" : "flex justify-start"}>
      <div
        className={
          mine
            ? "max-w-[80%] rounded-2xl rounded-br-sm bg-brand px-3 py-2 text-sm text-brand-foreground"
            : "max-w-[80%] rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-sm text-foreground"
        }
      >
        {payload ? payload.textFallback : message.text}
      </div>
    </div>
  );
}
