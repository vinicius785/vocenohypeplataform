import { useEffect, useMemo, useRef, useState } from "react";
import {
  Hash,
  Send,
  Users,
  Lock,
  Phone,
  Pencil,
  Trash2,
  AtSign,
  Paperclip,
  X,
  FileText,
  Download,
  Search,
  Smile,
  Reply,
  Check,
  CheckCheck,
  Mic,
  Square,
  Play,
  Pause,
} from "lucide-react";
import { startCall, useCallState, MAX_GROUP_PARTICIPANTS } from "@/lib/call-controller";
import {
  getMe,
  loadMembers,
  loadChannels,
  loadMessages,
  sendMessage as sendMessageDb,
  editMessage as editMessageDb,
  deleteMessage as deleteMessageDb,
  uploadChatAttachment,
  dmId,
  useActiveConvo,
  subscribeChat,
  markRead,
  setActive as setActiveConvo,
  loadCampaignChannels,
  loadProjectChannels,
  getStatus,
  STATUS_COLOR,
  STATUS_LABEL,
  toggleReaction,
  broadcastTyping,
  getTypingUsers,
  getOtherReadAt,
  getUnreadCount,
  REACTION_EMOJIS,
  type ChatMember,
  type ChatMention,
  type ChatAttachment,
  type ChatChannel,
  type CampaignChannel,
} from "@/lib/chat-store";

import { useClientes } from "@/lib/clientes-store";
import type { ChatMessage } from "@/lib/chat-store";

import { useNavigate } from "@tanstack/react-router";
import { loadProjetos, getTaskAssignees } from "@/lib/projetos";
import { getAllCampanhaTarefas, onCampanhaTarefasChange } from "@/lib/campanha-scoped-store";
import { OPEN_CAMPANHA_TASK_KEY, type SectionKey } from "@/components/AppShell";
import { linkifyText } from "@/lib/linkify";
import { useConfirm } from "@/hooks/use-confirm";
import { formatIsoDate } from "@/lib/utils";

type ChatTaskInfo = {
  id: string;
  label: string;
  project?: string;
  projectId: string;
  campanhaId?: string;
  status: string;
  priority?: string;
  dueDate?: string;
  assignees: string[];
};

export function ChatSection() {
  const [, force] = useState(0);
  useEffect(() => subscribeChat(() => force((n) => n + 1)), []);
  const callState = useCallState();

  const me = getMe();
  const members = loadMembers();
  const channels = loadChannels();
  const messages = loadMessages();
  const clientes = useClientes();
  const campaignChannels = useMemo(() => loadCampaignChannels(clientes), [clientes]);
  const projectChannels = useMemo(() => loadProjectChannels(), [clientes]);
  const activeId = useActiveConvo();

  const activeChannel = channels.find((c) => c.id === activeId);
  const activeCampaign = campaignChannels.find((c) => c.id === activeId);
  const activeProject = projectChannels.find((c) => c.id === activeId);
  const isDm = activeId.startsWith("dm:");
  const isSelfDm =
    isDm &&
    activeId
      .slice(3)
      .split("|")
      .every((id) => id === me.id);
  const activeDmPartner = useMemo<ChatMember | null>(() => {
    if (!isDm) return null;
    const parts = activeId.slice(3).split("|");
    const otherId = parts.find((p) => p !== me.id) ?? parts[0];
    return members.find((m) => m.id === otherId) ?? { id: otherId, name: otherId };
  }, [activeId, isDm, members, me.id]);

  const convoMessages = useMemo(
    () => messages.filter((m) => m.convoId === activeId).sort((a, b) => a.createdAt - b.createdAt),
    [messages, activeId],
  );

  const [search, setSearch] = useState("");
  useEffect(() => setSearch(""), [activeId]);
  const searchQuery = search.trim().toLowerCase();
  const visibleMessages = useMemo(
    () =>
      searchQuery
        ? convoMessages.filter((m) => m.text.toLowerCase().includes(searchQuery))
        : convoMessages,
    [convoMessages, searchQuery],
  );

  const campanhaNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of clientes) {
      for (const camp of c.campanhas ?? []) map.set(camp.id, camp.nome);
    }
    return map;
  }, [clientes]);

  const [, forceTasks] = useState(0);
  useEffect(() => onCampanhaTarefasChange(() => forceTasks((n) => n + 1)), []);

  const tasks = useMemo<ChatTaskInfo[]>(() => {
    const projectTasks = loadProjetos().flatMap((p) =>
      (p.tasks ?? []).map((t) => ({
        id: t.id,
        label: t.title,
        project: p.name,
        projectId: p.id,
        status: t.status,
        priority: t.priority,
        dueDate: t.dueDate,
        assignees: getTaskAssignees(t),
      })),
    );
    const campanhaTasks: ChatTaskInfo[] = [];
    for (const [campanhaId, campTasks] of getAllCampanhaTarefas()) {
      for (const t of campTasks) {
        campanhaTasks.push({
          id: t.id,
          label: t.title,
          project: campanhaNameMap.get(campanhaId),
          projectId: "",
          campanhaId,
          status: t.status,
          priority: t.priority,
          dueDate: t.dueDate,
          assignees: getTaskAssignees(t),
        });
      }
    }
    return [...projectTasks, ...campanhaTasks];
  }, [campanhaNameMap]);
  const taskInfoById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const navigate = useNavigate();
  const openTask = (taskId: string) => {
    const t = taskInfoById.get(taskId);
    if (!t) return;
    if (t.campanhaId) {
      sessionStorage.setItem(
        OPEN_CAMPANHA_TASK_KEY,
        JSON.stringify({ campanhaId: t.campanhaId, taskId }),
      );
      navigate({ to: "/time", search: { section: "campanhas" satisfies SectionKey } });
      return;
    }
    navigate({ to: "/projeto/$id", params: { id: t.projectId }, search: { taskId } });
  };

  const messagesById = useMemo(() => {
    const map = new Map<string, ChatMessage>();
    for (const m of messages) map.set(m.id, m);
    return map;
  }, [messages]);

  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  useEffect(() => setReplyingTo(null), [activeId]);
  const { confirm, confirmDialog } = useConfirm();

  const typingUsers = getTypingUsers(activeId, me.id);

  const sendMessage = (text: string, mentions: ChatMention[], attachments: ChatAttachment[]) => {
    const trimmed = text.trim();
    if ((!trimmed && attachments.length === 0) || isSelfDm || !activeId) return;
    void sendMessageDb({
      convoId: activeId,
      text: trimmed,
      mentions,
      attachments,
      replyToId: replyingTo?.id,
    });
    setReplyingTo(null);
  };

  const updateMessage = (id: string, text: string, mentions: ChatMention[]) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    void editMessageDb(id, trimmed, mentions);
  };

  const deleteMessage = async (id: string) => {
    const ok = await confirm("Excluir esta mensagem?");
    if (!ok) return;
    void deleteMessageDb(id);
  };

  useEffect(() => {
    if (activeId) void markRead(activeId);
  }, [activeId, messages.length]);

  // Log system message when a call ends (for the initiator's active DM).
  useEffect(() => {
    const onEnded = (ev: Event) => {
      const detail = (ev as CustomEvent<{ peerId: string; connected: boolean; seconds: number }>)
        .detail;
      if (!detail || !activeDmPartner || detail.peerId !== activeDmPartner.id) return;
      const mm = String(Math.floor(detail.seconds / 60)).padStart(2, "0");
      const ss = String(detail.seconds % 60).padStart(2, "0");
      const text = detail.connected
        ? `📞 Chamada encerrada · duração ${mm}:${ss}`
        : `📞 Chamada perdida`;
      void sendMessageDb({ convoId: activeId, text, system: true });
    };
    window.addEventListener("call:ended", onEnded);
    return () => window.removeEventListener("call:ended", onEnded);
  }, [activeId, activeDmPartner]);

  const [callPickerOpen, setCallPickerOpen] = useState(false);
  const [callPickerSelected, setCallPickerSelected] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!callPickerOpen) setCallPickerSelected(new Set());
  }, [callPickerOpen]);
  const channelCallCandidates = useMemo<ChatMember[]>(() => {
    const others = members.filter((m) => m.id !== me.id);
    if (activeChannel) {
      const allowed = activeChannel.allowedMemberIds ?? [];
      if (allowed.length === 0) return others;
      return others.filter((m) => allowed.includes(m.id));
    }
    if (activeCampaign || activeProject) return others;
    return [];
  }, [members, me.id, activeChannel, activeCampaign, activeProject]);
  const canStartChannelCall = !isDm && (!!activeChannel || !!activeCampaign || !!activeProject);

  if (!activeId) {
    return (
      <ChatHub
        channels={channels}
        campaignChannels={campaignChannels}
        projectChannels={projectChannels}
        members={members}
        messages={messages}
        meId={me.id}
        onOpen={(id) => {
          setActiveConvo(id);
        }}
      />
    );
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-9rem)] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-border bg-background">
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        {activeChannel ? (
          <>
            {activeChannel.private ? (
              <Lock className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Hash className="h-4 w-4 text-muted-foreground" />
            )}
            <h2 className="text-sm font-semibold">{activeChannel.name}</h2>
            <span className="ml-2 flex items-center gap-1 text-[11px] text-muted-foreground">
              <Users className="h-3 w-3" /> {members.length}
            </span>
          </>
        ) : activeCampaign ? (
          <>
            <Hash className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">{activeCampaign.name}</h2>
            <span className="text-[11px] text-muted-foreground">
              campanha · {activeCampaign.empresa}
            </span>
          </>
        ) : activeProject ? (
          <>
            <Hash className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">{activeProject.name}</h2>
            <span className="text-[11px] text-muted-foreground">projeto</span>
          </>
        ) : activeDmPartner ? (
          (() => {
            const status = getStatus(activeDmPartner.id);
            return (
              <>
                <span className="relative h-7 w-7 shrink-0">
                  {activeDmPartner.photo ? (
                    <img
                      src={activeDmPartner.photo}
                      alt=""
                      className="h-7 w-7 rounded-full object-cover"
                    />
                  ) : (
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
                      {activeDmPartner.name.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <span
                    title={STATUS_LABEL[status]}
                    className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-background ${STATUS_COLOR[status]}`}
                  />
                </span>
                <h2 className="text-sm font-semibold">{activeDmPartner.name}</h2>
                <span className="text-[11px] text-muted-foreground">{STATUS_LABEL[status]}</span>
              </>
            );
          })()
        ) : (
          <h2 className="text-sm font-semibold text-muted-foreground">Selecione uma conversa</h2>
        )}
        <div className="ml-auto flex items-center gap-2">
          {activeId && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar no canal..."
                className="h-8 w-44 rounded-md border border-border bg-background pl-7 pr-2 text-xs outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          )}
          {activeDmPartner && !isSelfDm && (
            <button
              onClick={() => {
                if (callState.status !== "idle") return;
                void startCall([
                  {
                    id: activeDmPartner.id,
                    name: activeDmPartner.name,
                    photo: activeDmPartner.photo,
                  },
                ]);
              }}
              disabled={callState.status !== "idle"}
              aria-label="Iniciar chamada"
              title="Iniciar chamada"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-foreground hover:bg-muted disabled:opacity-50"
            >
              <Phone className="h-4 w-4" />
            </button>
          )}
          {canStartChannelCall && (
            <button
              onClick={() => {
                if (callState.status !== "idle") return;
                setCallPickerOpen(true);
              }}
              disabled={callState.status !== "idle" || channelCallCandidates.length === 0}
              aria-label="Ligar para membro do canal"
              title={
                channelCallCandidates.length === 0
                  ? "Nenhum membro disponível"
                  : "Ligar para alguém deste canal"
              }
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-foreground hover:bg-muted disabled:opacity-50"
            >
              <Phone className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>

      {searchQuery && (
        <div className="border-b border-border bg-muted/30 px-4 py-1.5 text-[11px] text-muted-foreground">
          {visibleMessages.length} resultado(s) para "{search.trim()}"
        </div>
      )}

      <MessageList
        convoId={activeId}
        messages={visibleMessages}
        messagesById={messagesById}
        meId={me.id}
        onEdit={updateMessage}
        onDelete={deleteMessage}
        onReply={setReplyingTo}
        onReact={(id, emoji) => void toggleReaction(id, emoji)}
        allowUserMentions={!isDm}
        members={members}
        tasks={tasks}
        isDm={isDm}
        otherUserId={activeDmPartner?.id}
        typingUsers={typingUsers}
        onOpenTask={openTask}
      />

      {!isSelfDm && (
        <Composer
          key={activeId}
          convoId={activeId}
          onSend={sendMessage}
          allowUserMentions={!isDm}
          members={members}
          tasks={tasks}
          replyingTo={replyingTo}
          onCancelReply={() => setReplyingTo(null)}
          placeholder={
            activeChannel
              ? `Mensagem em #${activeChannel.name}`
              : activeCampaign
                ? `Mensagem em #${activeCampaign.name}`
                : activeProject
                  ? `Mensagem em #${activeProject.name}`
                  : activeDmPartner
                    ? `Mensagem para ${activeDmPartner.name}`
                    : "Mensagem"
          }
        />
      )}
      {callPickerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setCallPickerOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-lg border border-border bg-background shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold">Ligar para</h3>
                <p className="text-[11px] text-muted-foreground">
                  Escolha até {MAX_GROUP_PARTICIPANTS} pessoas — mais de uma vira chamada em grupo.
                </p>
              </div>
              <button
                onClick={() => setCallPickerOpen(false)}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-80 overflow-auto p-2">
              {channelCallCandidates.length === 0 ? (
                <p className="p-3 text-center text-xs text-muted-foreground">
                  Nenhum membro disponível
                </p>
              ) : (
                <ul className="flex flex-col gap-0.5">
                  {channelCallCandidates.map((m) => {
                    const s = getStatus(m.id);
                    const checked = callPickerSelected.has(m.id);
                    const atLimit = callPickerSelected.size >= MAX_GROUP_PARTICIPANTS && !checked;
                    return (
                      <li key={m.id}>
                        <button
                          disabled={atLimit}
                          onClick={() => {
                            setCallPickerSelected((prev) => {
                              const next = new Set(prev);
                              if (next.has(m.id)) next.delete(m.id);
                              else next.add(m.id);
                              return next;
                            });
                          }}
                          className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            readOnly
                            className="h-4 w-4 rounded border-input"
                          />
                          <span className="relative h-8 w-8 shrink-0">
                            {m.photo ? (
                              <img
                                src={m.photo}
                                alt=""
                                className="h-8 w-8 rounded-full object-cover"
                              />
                            ) : (
                              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                                {m.name.slice(0, 1).toUpperCase()}
                              </span>
                            )}
                            <span
                              className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-background ${STATUS_COLOR[s]}`}
                            />
                          </span>
                          <span className="flex-1 truncate">{m.name}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {STATUS_LABEL[s]}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
              <button
                onClick={() => setCallPickerOpen(false)}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                disabled={callPickerSelected.size === 0}
                onClick={() => {
                  const chosen = channelCallCandidates.filter((m) => callPickerSelected.has(m.id));
                  setCallPickerOpen(false);
                  void startCall(chosen.map((m) => ({ id: m.id, name: m.name, photo: m.photo })));
                }}
                className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Phone className="h-3.5 w-3.5" />
                Ligar {callPickerSelected.size > 0 ? `(${callPickerSelected.size})` : ""}
              </button>
            </div>
          </div>
        </div>
      )}
      {confirmDialog}
    </div>
  );
}

type HubItem = {
  id: string;
  name: string;
  photo?: string;
  kind: "channel" | "campanha" | "projeto" | "dm";
  private?: boolean;
  status?: ReturnType<typeof getStatus>;
  lastMessage?: ChatMessage;
  unread: number;
};

/** Tela inicial do Chat: ao clicar em "Chat" no menu, a pessoa cai aqui —
 * não mais direto na última conversa aberta (que ficava presa
 * indefinidamente, ver `AppShell.tsx`). Mostra todas as conversas com foto
 * grande, prévia da última mensagem e bolha de não-lidas; clicar abre a
 * conversa de verdade (mesmo componente de sempre). */
function ChatHub({
  channels,
  campaignChannels,
  projectChannels,
  members,
  messages,
  meId,
  onOpen,
}: {
  channels: ChatChannel[];
  campaignChannels: CampaignChannel[];
  projectChannels: { id: string; name: string }[];
  members: ChatMember[];
  messages: ChatMessage[];
  meId: string;
  onOpen: (id: string) => void;
}) {
  const [search, setSearch] = useState("");

  const lastMessageByConvo = useMemo(() => {
    const map = new Map<string, ChatMessage>();
    for (const m of messages) {
      const cur = map.get(m.convoId);
      if (!cur || m.createdAt > cur.createdAt) map.set(m.convoId, m);
    }
    return map;
  }, [messages]);

  const items = useMemo<HubItem[]>(() => {
    const visibleChannels = channels.filter(
      (c) => !c.private || !c.allowedMemberIds || c.allowedMemberIds.includes(meId),
    );
    const list: HubItem[] = [
      ...visibleChannels.map((c) => ({
        id: c.id,
        name: c.name,
        photo: c.photo,
        kind: "channel" as const,
        private: c.private,
        lastMessage: lastMessageByConvo.get(c.id),
        unread: getUnreadCount(c.id, messages, meId),
      })),
      ...campaignChannels.map((c) => ({
        id: c.id,
        name: c.name,
        kind: "campanha" as const,
        lastMessage: lastMessageByConvo.get(c.id),
        unread: getUnreadCount(c.id, messages, meId),
      })),
      ...projectChannels.map((p) => ({
        id: p.id,
        name: p.name,
        kind: "projeto" as const,
        lastMessage: lastMessageByConvo.get(p.id),
        unread: getUnreadCount(p.id, messages, meId),
      })),
      ...members
        .filter((m) => m.id !== meId)
        .map((m) => {
          const id = dmId(meId, m.id);
          return {
            id,
            name: m.name,
            photo: m.photo,
            kind: "dm" as const,
            status: getStatus(m.id),
            lastMessage: lastMessageByConvo.get(id),
            unread: getUnreadCount(id, messages, meId),
          };
        }),
    ];
    const q = search.trim().toLowerCase();
    const filtered = q ? list.filter((i) => i.name.toLowerCase().includes(q)) : list;
    return filtered.sort(
      (a, b) => (b.lastMessage?.createdAt ?? 0) - (a.lastMessage?.createdAt ?? 0),
    );
  }, [
    channels,
    campaignChannels,
    projectChannels,
    members,
    messages,
    meId,
    search,
    lastMessageByConvo,
  ]);

  const totalUnread = items.reduce((sum, i) => sum + i.unread, 0);

  return (
    <div className="mx-auto flex h-[calc(100vh-9rem)] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-border bg-background">
      <header className="flex items-center gap-3 border-b border-border px-5 py-4">
        <div>
          <h1 className="text-2xl font-light tracking-tighter text-foreground">Conversas</h1>
          <p className="text-xs text-muted-foreground">
            {totalUnread > 0
              ? `${totalUnread} mensagem${totalUnread > 1 ? "ns" : ""} não lida${totalUnread > 1 ? "s" : ""}`
              : "Tudo em dia"}
          </p>
        </div>
        <div className="relative ml-auto w-56">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar conversas..."
            className="h-9 w-full rounded-full border border-border bg-background pl-8 pr-3 text-xs outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-5">
        {items.length === 0 ? (
          <p className="p-8 text-center text-xs text-muted-foreground">
            Nenhuma conversa encontrada.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onOpen(item.id)}
                className="group flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5 text-left transition-colors hover:border-foreground/30 hover:bg-muted/40"
              >
                <span className="relative h-12 w-12 shrink-0">
                  {item.photo ? (
                    <img src={item.photo} alt="" className="h-12 w-12 rounded-full object-cover" />
                  ) : item.kind === "dm" ? (
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-sm font-semibold text-foreground">
                      {item.name.slice(0, 1).toUpperCase()}
                    </span>
                  ) : (
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      {item.private ? <Lock className="h-4 w-4" /> : <Hash className="h-4 w-4" />}
                    </span>
                  )}
                  {item.kind === "dm" && item.status && (
                    <span
                      title={STATUS_LABEL[item.status]}
                      className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-card ${STATUS_COLOR[item.status]}`}
                    />
                  )}
                  {item.unread > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground px-1 text-[9px] font-semibold text-background">
                      {item.unread > 9 ? "9+" : item.unread}
                    </span>
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className={`truncate text-sm ${item.unread > 0 ? "font-semibold text-foreground" : "font-medium text-foreground"}`}
                  >
                    {item.name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {item.lastMessage
                      ? `${item.lastMessage.authorId === meId ? "Você: " : ""}${
                          item.lastMessage.text ||
                          (item.lastMessage.attachments?.length ? "Anexo" : "")
                        }`
                      : item.kind === "campanha"
                        ? "Campanha"
                        : item.kind === "projeto"
                          ? "Projeto"
                          : "Nenhuma mensagem ainda"}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

type MentionOption = {
  kind: "task" | "user";
  id: string;
  label: string;
  hint?: string;
  photo?: string;
};

const CHAT_TASK_STATUS_TONE: Record<string, string> = {
  Aberto: "bg-muted text-muted-foreground",
  "Em andamento": "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  "Em aprovação": "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  "Em ajustes": "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  Aprovado: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  Concluído: "bg-foreground text-background",
  Arquivado: "bg-muted/60 text-muted-foreground line-through",
};
const CHAT_TASK_PRIORITY_TONE: Record<string, string> = {
  Urgente: "text-red-600 dark:text-red-400",
  Alta: "text-amber-600 dark:text-amber-400",
  Normal: "text-sky-600 dark:text-sky-400",
  Baixa: "text-muted-foreground",
};

function TaskMentionCard({ task, onOpen }: { task: ChatTaskInfo; onOpen: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(task.id)}
      className="my-1 flex w-full max-w-xs flex-col gap-1 rounded-lg border border-border bg-muted/30 px-2.5 py-2 text-left text-xs hover:border-foreground/30 hover:bg-muted/50"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate font-medium text-foreground">{task.label}</span>
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
            CHAT_TASK_STATUS_TONE[task.status] ?? "bg-muted text-muted-foreground"
          }`}
        >
          {task.status}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
        {task.assignees.length > 0 && <span>{task.assignees.join(", ")}</span>}
        {task.dueDate && <span>Prazo: {formatIsoDate(task.dueDate)}</span>}
        {task.priority && (
          <span className={CHAT_TASK_PRIORITY_TONE[task.priority] ?? undefined}>
            {task.priority}
          </span>
        )}
      </div>
    </button>
  );
}

function renderText(
  text: string,
  mentions: ChatMention[] | undefined,
  taskInfoById?: Map<string, ChatTaskInfo>,
  onOpenTask?: (id: string) => void,
) {
  const parts: (string | ChatMention)[] = !mentions || mentions.length === 0 ? [text] : [text];
  if (mentions && mentions.length > 0) {
    for (const m of mentions) {
      const token = "@" + m.label;
      for (let i = 0; i < parts.length; i++) {
        const seg = parts[i];
        if (typeof seg !== "string") continue;
        const idx = seg.indexOf(token);
        if (idx < 0) continue;
        const before = seg.slice(0, idx);
        const after = seg.slice(idx + token.length);
        parts.splice(i, 1, before, m, after);
        i += 2;
      }
    }
  }
  return parts.map((p, i) => {
    if (typeof p === "string") return <span key={i}>{linkifyText(p, `msg-link-${i}`)}</span>;
    if (p.kind === "task") {
      const task = taskInfoById?.get(p.id);
      if (task && onOpenTask) {
        return <TaskMentionCard key={i} task={task} onOpen={onOpenTask} />;
      }
    }
    return (
      <span
        key={i}
        className={`rounded px-1 py-0.5 text-xs font-medium ${
          p.kind === "task"
            ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
            : "bg-sky-500/15 text-sky-700 dark:text-sky-300"
        }`}
      >
        @{p.label}
      </span>
    );
  });
}

function MessageList({
  convoId,
  messages,
  messagesById,
  meId,
  onEdit,
  onDelete,
  onReply,
  onReact,
  allowUserMentions,
  members,
  tasks,
  isDm,
  otherUserId,
  typingUsers,
  onOpenTask,
}: {
  convoId: string;
  messages: ChatMessage[];
  messagesById: Map<string, ChatMessage>;
  meId: string;
  onEdit: (id: string, text: string, mentions: ChatMention[]) => void;
  onDelete: (id: string) => void;
  onReply: (m: ChatMessage) => void;
  onReact: (id: string, emoji: string) => void;
  allowUserMentions: boolean;
  members: ChatMember[];
  tasks: ChatTaskInfo[];
  isDm: boolean;
  otherUserId?: string;
  typingUsers: { userId: string; userName: string }[];
  onOpenTask: (taskId: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const taskInfoById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);
  const jumpToMessage = (id: string) => {
    const el = document.getElementById(`msg-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedId(id);
    window.setTimeout(() => setHighlightedId((cur) => (cur === id ? null : cur)), 1500);
  };
  const otherReadAt = isDm && otherUserId ? getOtherReadAt(convoId, otherUserId) : 0;

  if (messages.length === 0) {
    return (
      <div ref={scrollRef} className="flex flex-1 items-center justify-center overflow-y-auto p-8">
        <p className="text-xs text-muted-foreground">Nenhuma mensagem ainda. Diga olá!</p>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
      {messages.map((m, i) => {
        const prev = messages[i - 1];
        const grouped =
          prev &&
          prev.authorId === m.authorId &&
          m.createdAt - prev.createdAt < 5 * 60 * 1000 &&
          isSameDay(prev.createdAt, m.createdAt);
        const mine = m.authorId === meId;
        const showDayDivider = !prev || !isSameDay(prev.createdAt, m.createdAt);
        const editing = editingId === m.id;
        if (m.authorId === "system") {
          return (
            <div key={m.id}>
              {showDayDivider && (
                <div className="my-4 flex items-center gap-3">
                  <div className="h-px flex-1 bg-border" />
                  <span className="rounded-full border border-border bg-background px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {formatDayLabel(m.createdAt)}
                  </span>
                  <div className="h-px flex-1 bg-border" />
                </div>
              )}
              <div className="my-2 flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
                <span className="rounded-full border border-border bg-muted/40 px-3 py-1">
                  {m.text}
                  <span className="ml-2 text-[10px] opacity-70">
                    {new Date(m.createdAt).toLocaleTimeString("pt-BR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </span>
              </div>
            </div>
          );
        }
        return (
          <div key={m.id}>
            {showDayDivider && (
              <div className="my-4 flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="rounded-full border border-border bg-background px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {formatDayLabel(m.createdAt)}
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>
            )}
            <div
              id={`msg-${m.id}`}
              className={`group relative flex gap-2.5 rounded-md transition-colors duration-500 ${mine ? "flex-row-reverse" : ""} ${grouped ? "mt-1" : "mt-3"} ${highlightedId === m.id ? "bg-sky-500/10" : ""}`}
            >
              <div className="w-8 shrink-0">
                {!grouped &&
                  (m.authorPhoto ? (
                    <img src={m.authorPhoto} alt="" className="h-8 w-8 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
                      {m.authorName.slice(0, 1).toUpperCase()}
                    </div>
                  ))}
              </div>
              <div className={`flex min-w-0 flex-1 flex-col ${mine ? "items-end" : "items-start"}`}>
                {!grouped && (
                  <div className={`flex items-baseline gap-2 ${mine ? "flex-row-reverse" : ""}`}>
                    <span className="text-xs font-semibold text-foreground">
                      {mine ? "Você" : m.authorName}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(m.createdAt).toLocaleTimeString("pt-BR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    {mine && isDm && (
                      <span title={otherReadAt >= m.createdAt ? "Visto" : "Enviado"}>
                        {otherReadAt >= m.createdAt ? (
                          <CheckCheck className="h-3 w-3 text-sky-500" />
                        ) : (
                          <Check className="h-3 w-3 text-muted-foreground" />
                        )}
                      </span>
                    )}
                  </div>
                )}
                {m.replyToId &&
                  (() => {
                    const original = messagesById.get(m.replyToId!);
                    if (!original) return null;
                    return (
                      <button
                        type="button"
                        onClick={() => jumpToMessage(original.id)}
                        className="mb-1 flex w-full max-w-[75%] items-start gap-1.5 rounded border-l-2 border-border pl-2 text-left text-xs text-muted-foreground hover:border-foreground hover:text-foreground"
                      >
                        <Reply className="mt-0.5 h-3 w-3 shrink-0" />
                        <div className="min-w-0">
                          <span className="font-medium">{original.authorName}</span>{" "}
                          <span className="line-clamp-1 break-words">{original.text}</span>
                        </div>
                      </button>
                    );
                  })()}
                {editing ? (
                  <InlineEditor
                    initialText={m.text}
                    allowUserMentions={allowUserMentions}
                    members={members}
                    tasks={tasks}
                    onCancel={() => setEditingId(null)}
                    onSave={(text, mentions) => {
                      onEdit(m.id, text, mentions);
                      setEditingId(null);
                    }}
                  />
                ) : (
                  <div className={`flex flex-col gap-1 ${mine ? "items-end" : "items-start"}`}>
                    {m.text && (
                      <div
                        className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm ${
                          mine
                            ? "rounded-tr-sm bg-foreground text-background"
                            : "rounded-tl-sm bg-muted text-foreground"
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">
                          {renderText(m.text, m.mentions, taskInfoById, onOpenTask)}
                          {m.editedAt && (
                            <span
                              className={`ml-1 text-[10px] ${mine ? "text-background/70" : "text-muted-foreground"}`}
                            >
                              (editado)
                            </span>
                          )}
                        </p>
                      </div>
                    )}
                    {m.attachments && m.attachments.length > 0 && (
                      <AttachmentList attachments={m.attachments} />
                    )}
                    {m.reactions && Object.keys(m.reactions).length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {Object.entries(m.reactions).map(([emoji, userIds]) =>
                          userIds.length === 0 ? null : (
                            <button
                              key={emoji}
                              onClick={() => onReact(m.id, emoji)}
                              className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] ${
                                userIds.includes(meId)
                                  ? "border-sky-500/50 bg-sky-500/10"
                                  : "border-border bg-muted/40 hover:bg-muted"
                              }`}
                            >
                              <span>{emoji}</span>
                              <span className="tabular-nums text-muted-foreground">
                                {userIds.length}
                              </span>
                            </button>
                          ),
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
              {!editing && (
                <div className="absolute right-0 top-0 hidden items-center gap-0.5 rounded-md border border-border bg-background p-0.5 shadow-sm group-hover:flex">
                  <div className="relative">
                    <button
                      onClick={() => setPickerFor(pickerFor === m.id ? null : m.id)}
                      aria-label="Reagir"
                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Smile className="h-3 w-3" />
                    </button>
                    {pickerFor === m.id && (
                      <>
                        <div className="fixed inset-0 z-30" onClick={() => setPickerFor(null)} />
                        <div className="absolute right-0 top-full z-40 mt-1 flex gap-0.5 rounded-md border border-border bg-background p-1 shadow-lg">
                          {REACTION_EMOJIS.map((emoji) => (
                            <button
                              key={emoji}
                              onClick={() => {
                                onReact(m.id, emoji);
                                setPickerFor(null);
                              }}
                              className="rounded p-1 text-sm hover:bg-muted"
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                  <button
                    onClick={() => onReply(m)}
                    aria-label="Responder"
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Reply className="h-3 w-3" />
                  </button>
                  {mine && (
                    <>
                      <button
                        onClick={() => setEditingId(m.id)}
                        aria-label="Editar"
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => onDelete(m.id)}
                        aria-label="Excluir"
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
      {typingUsers.length > 0 && (
        <p className="text-[11px] italic text-muted-foreground">
          {typingUsers.map((u) => u.userName).join(", ")}{" "}
          {typingUsers.length === 1 ? "está digitando..." : "estão digitando..."}
        </p>
      )}
    </div>
  );
}

function isSameDay(a: number, b: number) {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

function formatDayLabel(ts: number) {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (isSameDay(ts, today.getTime())) return "Hoje";
  if (isSameDay(ts, yesterday.getTime())) return "Ontem";
  const diffDays = Math.floor((today.getTime() - ts) / (1000 * 60 * 60 * 24));
  if (diffDays < 7) return d.toLocaleDateString("pt-BR", { weekday: "long" });
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: d.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}

/**
 * Reusable input with @ mention picker. Extracts mentions used in final text.
 */
function useMentions(
  members: ChatMember[],
  tasks: { id: string; label: string; project?: string }[],
  allowUserMentions: boolean,
) {
  const options = useMemo<MentionOption[]>(() => {
    const t: MentionOption[] = tasks.map((x) => ({
      kind: "task",
      id: x.id,
      label: x.label,
      hint: x.project,
    }));
    const u: MentionOption[] = allowUserMentions
      ? members.map((m) => ({ kind: "user", id: m.id, label: m.name, photo: m.photo }))
      : [];
    return [...t, ...u];
  }, [members, tasks, allowUserMentions]);
  return options;
}

function extractUsedMentions(text: string, options: MentionOption[]): ChatMention[] {
  const used: ChatMention[] = [];
  const seen = new Set<string>();
  for (const opt of options) {
    if (text.includes("@" + opt.label)) {
      const key = opt.kind + ":" + opt.id;
      if (!seen.has(key)) {
        seen.add(key);
        used.push({ kind: opt.kind, id: opt.id, label: opt.label });
      }
    }
  }
  return used;
}

function InlineEditor({
  initialText,
  allowUserMentions,
  members,
  tasks,
  onSave,
  onCancel,
}: {
  initialText: string;
  allowUserMentions: boolean;
  members: ChatMember[];
  tasks: { id: string; label: string; project?: string }[];
  onSave: (text: string, mentions: ChatMention[]) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialText);
  const options = useMentions(members, tasks, allowUserMentions);
  return (
    <div className="mt-1">
      <MentionTextarea value={value} onChange={setValue} options={options} autoFocus rows={2} />
      <div className="mt-1 flex gap-2">
        <button
          onClick={() => onSave(value, extractUsedMentions(value, options))}
          className="rounded bg-foreground px-2 py-1 text-[11px] font-medium text-background hover:opacity-90"
        >
          Salvar
        </button>
        <button
          onClick={onCancel}
          className="rounded border border-border px-2 py-1 text-[11px] text-foreground hover:bg-muted"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

function MentionTextarea({
  value,
  onChange,
  options,
  autoFocus,
  rows = 1,
  onEnterSubmit,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: MentionOption[];
  autoFocus?: boolean;
  rows?: number;
  onEnterSubmit?: () => void;
  placeholder?: string;
}) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [triggerAt, setTriggerAt] = useState(-1);
  const [highlight, setHighlight] = useState(0);
  const [tab, setTab] = useState<"user" | "task">("user");

  const hasUsers = useMemo(() => options.some((o) => o.kind === "user"), [options]);
  const hasTasks = useMemo(() => options.some((o) => o.kind === "task"), [options]);
  const showTabs = hasUsers && hasTasks;

  useEffect(() => {
    if (autoFocus) taRef.current?.focus();
  }, [autoFocus]);

  // Cresce junto com o texto (até o teto de max-h-40) em vez de ficar com
  // altura fixa e depender só da barra de rolagem interna pra textos longos.
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  // A busca digitada na caixinha do menu tem prioridade sobre o texto após
  // o "@" na mensagem — deixa procurar uma tarefa/pessoa sem precisar
  // digitar o nome dela dentro da própria mensagem.
  const effectiveQuery = search || query || "";

  const filtered = useMemo(() => {
    if (query === null) return [];
    const q = effectiveQuery.toLowerCase();
    return options
      .filter((o) => o.kind === tab)
      .filter((o) => o.label.toLowerCase().includes(q))
      .slice(0, 8);
  }, [query, effectiveQuery, options, tab]);

  const switchTab = (t: "user" | "task") => {
    setTab(t);
    setSearch("");
    setHighlight(0);
  };

  const updateQuery = (text: string, caret: number) => {
    const before = text.slice(0, caret);
    const at = before.lastIndexOf("@");
    if (at < 0) return setQuery(null);
    const prev = at === 0 ? " " : before[at - 1];
    if (prev !== " " && prev !== "\n") return setQuery(null);
    const q = before.slice(at + 1);
    if (/\s/.test(q)) return setQuery(null);
    const justOpened = query === null;
    setTriggerAt(at);
    setQuery(q);
    setHighlight(0);
    // Só define a aba padrão quando o menu está abrindo (não a cada tecla
    // digitada) — abre em "Pessoas" quando disponível, senão "Tarefas".
    if (justOpened) {
      setTab(hasUsers ? "user" : "task");
      setSearch("");
    }
  };

  const pick = (opt: MentionOption) => {
    if (triggerAt < 0) return;
    const caret = taRef.current?.selectionStart ?? value.length;
    const next = value.slice(0, triggerAt) + "@" + opt.label + " " + value.slice(caret);
    onChange(next);
    setQuery(null);
    setSearch("");
    setTriggerAt(-1);
    requestAnimationFrame(() => {
      taRef.current?.focus();
      const pos = triggerAt + opt.label.length + 2;
      taRef.current?.setSelectionRange(pos, pos);
    });
  };

  const pickerKeyDown = (e: React.KeyboardEvent) => {
    if (query === null || filtered.length === 0) return false;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (h + 1) % filtered.length);
      return true;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => (h - 1 + filtered.length) % filtered.length);
      return true;
    }
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      pick(filtered[highlight]);
      return true;
    }
    if (e.key === "Escape") {
      setQuery(null);
      setSearch("");
      return true;
    }
    return false;
  };

  return (
    <div className="relative flex-1">
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          updateQuery(e.target.value, e.target.selectionStart);
        }}
        onKeyDown={(e) => {
          if (pickerKeyDown(e)) return;
          if (e.key === "Enter" && !e.shiftKey && onEnterSubmit) {
            e.preventDefault();
            onEnterSubmit();
          }
        }}
        rows={rows}
        placeholder={placeholder}
        className="max-h-40 min-h-[28px] w-full resize-none overflow-y-auto rounded border border-border bg-background px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-ring"
      />
      {query !== null && (showTabs || filtered.length > 0) && (
        <div className="absolute bottom-full left-0 z-20 mb-1 w-64 overflow-hidden rounded-md border border-border bg-background shadow-lg">
          {showTabs && (
            <div className="flex border-b border-border">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => switchTab("user")}
                className={`flex-1 px-2 py-1.5 text-[11px] font-medium ${
                  tab === "user"
                    ? "border-b-2 border-foreground text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Pessoas
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => switchTab("task")}
                className={`flex-1 px-2 py-1.5 text-[11px] font-medium ${
                  tab === "task"
                    ? "border-b-2 border-foreground text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Tarefas
              </button>
            </div>
          )}
          <div className="border-b border-border p-1.5">
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setHighlight(0);
              }}
              onKeyDown={(e) => {
                pickerKeyDown(e);
              }}
              placeholder={tab === "task" ? "Buscar tarefa..." : "Buscar pessoa..."}
              className="w-full rounded border border-border bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <ul className="max-h-56 overflow-auto">
            {filtered.length === 0 ? (
              <li className="px-2 py-3 text-center text-[11px] text-muted-foreground">
                Nada encontrado
              </li>
            ) : (
              filtered.map((o, i) => (
                <li key={o.kind + ":" + o.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      pick(o);
                    }}
                    className={`flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs ${
                      i === highlight ? "bg-muted" : "hover:bg-muted/60"
                    }`}
                  >
                    {o.kind === "user" ? (
                      o.photo ? (
                        <img
                          src={o.photo}
                          alt=""
                          className="h-5 w-5 shrink-0 rounded-full object-cover"
                        />
                      ) : (
                        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-sky-500/20 text-[9px] font-semibold text-sky-700 dark:text-sky-300">
                          {o.label.trim()[0]?.toUpperCase() ?? "?"}
                        </span>
                      )
                    ) : (
                      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded bg-amber-500/20 text-[9px] font-bold text-amber-700 dark:text-amber-300">
                        T
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate">{o.label}</span>
                    {o.hint && (
                      <span className="shrink-0 text-[10px] text-muted-foreground">{o.hint}</span>
                    )}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtAudioTime(s: number) {
  if (!isFinite(s) || s < 0) return "0:00";
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

/** Decodifica o áudio uma vez para extrair a amplitude por trecho — vira a "forma de onda" visual do player. */
function useAudioWaveform(url: string, bars: number): number[] {
  const [levels, setLevels] = useState<number[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const AC =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const res = await fetch(url);
        const buf = await res.arrayBuffer();
        const ctx = new AC();
        const audioBuf = await ctx.decodeAudioData(buf);
        const raw = audioBuf.getChannelData(0);
        const blockSize = Math.max(1, Math.floor(raw.length / bars));
        const out: number[] = [];
        for (let i = 0; i < bars; i++) {
          let sum = 0;
          for (let j = 0; j < blockSize; j++) sum += Math.abs(raw[i * blockSize + j] ?? 0);
          out.push(sum / blockSize);
        }
        const max = Math.max(...out, 0.0001);
        void ctx.close();
        if (!cancelled) setLevels(out.map((v) => v / max));
      } catch {
        if (!cancelled) setLevels(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url, bars]);
  return levels ?? Array.from({ length: bars }, (_, i) => 0.25 + 0.5 * Math.abs(Math.sin(i * 1.7)));
}

/** Player de áudio custom (onda + play/pause), no lugar do `<audio controls>` nativo do navegador. */
function AudioMessagePlayer({ src, compact }: { src: string; compact?: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const bars = compact ? 22 : 34;
  const levels = useAudioWaveform(src, bars);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onTime = () => setCurrent(el.currentTime);
    const onLoaded = () => setDuration(el.duration || 0);
    const onEnd = () => {
      setPlaying(false);
      setCurrent(0);
    };
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("loadedmetadata", onLoaded);
    el.addEventListener("ended", onEnd);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("loadedmetadata", onLoaded);
      el.removeEventListener("ended", onEnd);
    };
  }, []);

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) el.pause();
    else void el.play();
    setPlaying(!playing);
  };

  const seekTo = (ratio: number) => {
    const el = audioRef.current;
    if (!el || !duration) return;
    el.currentTime = Math.min(duration, Math.max(0, ratio * duration));
    setCurrent(el.currentTime);
  };

  const progress = duration > 0 ? current / duration : 0;

  return (
    <div
      className={`flex items-center gap-2 rounded-full border border-border bg-muted/40 py-1.5 pl-1.5 pr-3 ${compact ? "max-w-[190px]" : "max-w-xs"}`}
    >
      <audio ref={audioRef} src={src} preload="metadata" className="hidden" />
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Pausar áudio" : "Tocar áudio"}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-transform active:scale-95"
      >
        {playing ? (
          <Pause className="h-3 w-3 fill-current" />
        ) : (
          <Play className="ml-0.5 h-3 w-3 fill-current" />
        )}
      </button>
      <button
        type="button"
        aria-label="Buscar posição no áudio"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          seekTo((e.clientX - rect.left) / rect.width);
        }}
        className="flex h-6 flex-1 items-center gap-[2px]"
      >
        {levels.map((lvl, i) => {
          const played = levels.length > 0 && i / levels.length < progress;
          return (
            <span
              key={i}
              className={`w-[2.5px] shrink-0 rounded-full transition-colors ${
                played ? "bg-foreground" : "bg-muted-foreground/40"
              }`}
              style={{ height: `${Math.max(20, lvl * 100)}%` }}
            />
          );
        })}
      </button>
      <span className="w-8 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">
        {fmtAudioTime(playing || current > 0 ? current : duration)}
      </span>
    </div>
  );
}

function AttachmentList({ attachments }: { attachments: ChatAttachment[] }) {
  return (
    <div className="mt-1.5 flex flex-col gap-1.5">
      {attachments.map((a) => {
        const isImage = a.type.startsWith("image/");
        if (isImage) {
          return (
            <a
              key={a.path}
              href={a.url}
              target="_blank"
              rel="noreferrer"
              className="block max-w-xs overflow-hidden rounded-md border border-border"
            >
              <img src={a.url} alt={a.name} className="max-h-64 w-auto object-cover" />
            </a>
          );
        }
        if (a.type.startsWith("audio/")) {
          return <AudioMessagePlayer key={a.path} src={a.url} />;
        }
        return (
          <a
            key={a.path}
            href={a.url}
            target="_blank"
            rel="noreferrer"
            download={a.name}
            className="inline-flex max-w-sm items-center gap-2 rounded-md border border-border bg-muted/40 px-2 py-1.5 text-xs hover:bg-muted"
          >
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="flex-1 truncate">{a.name}</span>
            <span className="text-[10px] text-muted-foreground">{formatBytes(a.size)}</span>
            <Download className="h-3 w-3 text-muted-foreground" />
          </a>
        );
      })}
    </div>
  );
}

function Composer({
  convoId,
  onSend,
  placeholder,
  allowUserMentions,
  members,
  tasks,
  replyingTo,
  onCancelReply,
}: {
  convoId: string;
  onSend: (text: string, mentions: ChatMention[], attachments: ChatAttachment[]) => void;
  placeholder: string;
  allowUserMentions: boolean;
  members: ChatMember[];
  tasks: { id: string; label: string; project?: string }[];
  replyingTo: ChatMessage | null;
  onCancelReply: () => void;
}) {
  const [value, setValue] = useState("");
  const [pending, setPending] = useState<ChatAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordSecs, setRecordSecs] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const options = useMentions(members, tasks, allowUserMentions);

  const submit = () => {
    if (!value.trim() && pending.length === 0) return;
    onSend(value, extractUsedMentions(value, options), pending);
    setValue("");
    setPending([]);
  };

  useEffect(() => {
    return () => {
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      mediaRecorderRef.current?.stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      recordChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordChunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (recordTimerRef.current) {
          clearInterval(recordTimerRef.current);
          recordTimerRef.current = null;
        }
        const blob = new Blob(recordChunksRef.current, { type: mime });
        if (blob.size > 0) {
          setUploading(true);
          try {
            const ext = mime === "audio/webm" ? "webm" : "m4a";
            const file = new File([blob], `audio-${Date.now()}.${ext}`, { type: mime });
            const att = await uploadChatAttachment(file);
            if (att) setPending((p) => [...p, att]);
          } finally {
            setUploading(false);
          }
        }
        setRecordSecs(0);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      recordTimerRef.current = setInterval(() => setRecordSecs((s) => s + 1), 1000);
    } catch (err) {
      console.warn("[chat] mic access failed", err);
      alert("Não foi possível acessar o microfone.");
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const uploaded: ChatAttachment[] = [];
      for (const f of Array.from(files)) {
        if (f.size > 25 * 1024 * 1024) {
          alert(`Arquivo "${f.name}" excede 25MB`);
          continue;
        }
        const att = await uploadChatAttachment(f);
        if (att) uploaded.push(att);
      }
      if (uploaded.length) setPending((p) => [...p, ...uploaded]);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="border-t border-border p-3">
      {replyingTo && (
        <div className="mb-2 flex items-start gap-2 rounded-md border border-border bg-muted/40 px-2 py-1.5 text-xs">
          <Reply className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <span className="font-medium">{replyingTo.authorName}</span>{" "}
            <span className="line-clamp-1 break-words text-muted-foreground">
              {replyingTo.text}
            </span>
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            aria-label="Cancelar resposta"
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      {pending.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {pending.map((a) =>
            a.type.startsWith("audio/") ? (
              <div key={a.path} className="flex items-center gap-1">
                <AudioMessagePlayer src={a.url} compact />
                <button
                  type="button"
                  onClick={() => setPending((p) => p.filter((x) => x.path !== a.path))}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Remover anexo"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <div
                key={a.path}
                className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs"
              >
                {a.type.startsWith("image/") ? (
                  <img src={a.url} alt="" className="h-8 w-8 rounded object-cover" />
                ) : (
                  <FileText className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="max-w-[140px] truncate">{a.name}</span>
                <button
                  type="button"
                  onClick={() => setPending((p) => p.filter((x) => x.path !== a.path))}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Remover anexo"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ),
          )}
        </div>
      )}
      <div className="flex items-end gap-2 rounded-lg border border-border bg-background px-2 py-1.5 focus-within:ring-2 focus-within:ring-ring">
        <input
          ref={fileRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => void handleFiles(e.target.files)}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          aria-label="Anexar arquivo"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
        >
          <Paperclip className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={recording ? stopRecording : () => void startRecording()}
          disabled={uploading}
          aria-label={recording ? "Parar gravação" : "Gravar áudio"}
          className={`inline-flex h-8 items-center justify-center gap-1 rounded-md px-2 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 ${recording ? "bg-destructive/10 text-destructive hover:bg-destructive/10 hover:text-destructive" : ""}`}
        >
          {recording ? (
            <>
              <Square className="h-3.5 w-3.5 fill-current" />
              <span className="text-[11px] tabular-nums">
                {String(Math.floor(recordSecs / 60)).padStart(2, "0")}:
                {String(recordSecs % 60).padStart(2, "0")}
              </span>
            </>
          ) : (
            <Mic className="h-4 w-4" />
          )}
        </button>
        <MentionTextarea
          value={value}
          onChange={(v) => {
            setValue(v);
            if (v.trim()) broadcastTyping(convoId);
          }}
          options={options}
          autoFocus
          onEnterSubmit={submit}
          placeholder={placeholder}
        />
        <button
          onClick={submit}
          disabled={(!value.trim() && pending.length === 0) || uploading}
          aria-label="Enviar"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-foreground text-background hover:opacity-90 disabled:opacity-40"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </div>
      <p className="mt-1 flex items-center gap-1 px-1 text-[10px] text-muted-foreground">
        <AtSign className="h-3 w-3" /> mencione tarefas{allowUserMentions ? " e pessoas" : ""} com @
        • Enter envia
        {uploading && <span className="ml-2">• enviando anexo...</span>}
      </p>
    </div>
  );
}
