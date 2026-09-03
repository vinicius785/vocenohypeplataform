import { useEffect, useMemo, useRef, useState } from "react";
import {
  Hash,
  Send,
  Users,
  Lock,
  Phone,
  PhoneMissed,
  ChevronDown,
  ChevronRight,
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
  Plus,
  MoreHorizontal,
  MessageSquare,
  ArrowLeft,
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
  getOtherDeliveredAt,
  buildChatList,
  createChannel,
  updateChannel,
  deleteChannel as deleteChannelDb,
  REACTION_EMOJIS,
  type ChatMember,
  type ChatMention,
  type ChatAttachment,
  type ChatChannel,
  type CampaignChannel,
  type ChatListItem,
} from "@/lib/chat-store";

import { useClientes } from "@/lib/clientes-store";
import type { ChatMessage } from "@/lib/chat-store";

import { useNavigate } from "@tanstack/react-router";
import { loadProjetos } from "@/lib/projetos";
import {
  OPEN_CAMPANHA_TASK_KEY,
  OPEN_CLIENTE_KEY,
  OPEN_MEMBER_KEY,
  type SectionKey,
} from "@/components/AppShell";
import {
  MENTION_KIND_CONFIG,
  MENTION_KIND_ORDER,
  contextBoost,
  matchScore,
  type MentionContext,
  type MentionKind,
  type MentionOption,
} from "@/lib/mention-kinds";
import { linkifyText } from "@/lib/linkify";
import { useConfirm } from "@/hooks/use-confirm";
import { CreateChannelModal } from "@/components/CreateChannelModal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatIsoDate } from "@/lib/utils";
import { useTaskDirectory, type TaskDirectoryEntry } from "@/lib/task-directory";

/** Alias — a lógica de montagem desse array (antes um `useMemo` inline
 * aqui) foi extraída pra `useTaskDirectory()` (`src/lib/task-directory.ts`)
 * pra também ser reaproveitada pelo `TaskPicker` de dependências entre
 * tarefas, sem duplicar a busca nas 3 fontes (projetos/campanhas/
 * avulsas do Marketing). Mesmo shape de sempre, só o nome do tipo mudou. */
type ChatTaskInfo = TaskDirectoryEntry;

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

  const tasks = useTaskDirectory();
  const projects = useMemo<MentionOption[]>(
    () =>
      loadProjetos().map((p) => ({
        kind: "project",
        id: p.id,
        label: p.name,
        hint: "Projeto",
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks],
  );
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
  const openMemberProfile = (memberId: string) => {
    sessionStorage.setItem(OPEN_MEMBER_KEY, JSON.stringify({ memberId }));
    navigate({ to: "/time", search: { section: "time" satisfies SectionKey } });
  };
  const openCliente = (clienteId: string) => {
    sessionStorage.setItem(OPEN_CLIENTE_KEY, JSON.stringify({ clienteId }));
    navigate({ to: "/time", search: { section: "clientes" satisfies SectionKey } });
  };
  const openCampanha = (campanhaId: string) => {
    sessionStorage.setItem(OPEN_CAMPANHA_TASK_KEY, JSON.stringify({ campanhaId }));
    navigate({ to: "/time", search: { section: "campanhas" satisfies SectionKey } });
  };
  /** Dispatch único de clique em qualquer @menção inline (generaliza o
   * `openTask` de hoje, que era o único tipo clicável) — cada kind decide
   * pra onde navegar, sem se preocupar com o resto. */
  const openMention = (m: ChatMention) => {
    if (m.kind === "task") return openTask(m.id);
    if (m.kind === "user") return openMemberProfile(m.id);
    if (m.kind === "project") {
      navigate({ to: "/projeto/$id", params: { id: m.id } });
      return;
    }
    if (m.kind === "campaign") return openCampanha(m.id);
    if (m.kind === "client") return openCliente(m.id);
  };

  const campaigns = useMemo<MentionOption[]>(() => {
    const out: MentionOption[] = [];
    for (const c of clientes) {
      for (const camp of c.campanhas ?? []) {
        out.push({
          kind: "campaign",
          id: camp.id,
          label: camp.nome,
          photo: c.photo,
          hint: `Campanha · ${c.empresa}`,
          clienteId: c.id,
        });
      }
    }
    return out;
  }, [clientes]);

  const clientMentions = useMemo<MentionOption[]>(
    () =>
      clientes.map((c) => ({
        kind: "client",
        id: c.id,
        label: c.empresa,
        photo: c.photo,
        hint: "Cliente",
      })),
    [clientes],
  );

  // Contexto do canal ativo, só pra RANKING (nunca limita disponibilidade —
  // toda entidade continua pesquisável em qualquer canal). Aproximação
  // honesta de "pessoas envolvidas": responsáveis das tarefas do
  // canal/campanha atual, já que não existe um conceito real de "membros do
  // canal" no chat.
  const mentionContext = useMemo<MentionContext>(() => {
    const recentUserIds: string[] = [];
    const seenRecent = new Set<string>();
    for (let i = convoMessages.length - 1; i >= 0 && recentUserIds.length < 5; i--) {
      for (const m of convoMessages[i].mentions ?? []) {
        if (m.kind === "user" && !seenRecent.has(m.id)) {
          seenRecent.add(m.id);
          recentUserIds.push(m.id);
        }
      }
    }
    const contextAssigneeIds: string[] = [];
    if (activeCampaign || activeProject) {
      const relevantNames = new Set<string>();
      for (const t of tasks) {
        const inCampaign = activeCampaign && t.campanhaId === activeCampaign.id;
        const inProject = activeProject && t.projectId === activeProject.id && !t.campanhaId;
        if (inCampaign || inProject) for (const name of t.assignees) relevantNames.add(name);
      }
      for (const mem of members) if (relevantNames.has(mem.name)) contextAssigneeIds.push(mem.id);
    }
    return {
      dmPartnerId: activeDmPartner?.id,
      campanhaId: activeCampaign?.id,
      projetoId: activeProject?.id,
      clienteId: activeCampaign?.clienteId,
      recentUserIds,
      contextAssigneeIds,
    };
  }, [convoMessages, activeCampaign, activeProject, activeDmPartner, tasks, members]);

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

  // Registra o card de chamada no histórico do Chat quando a ligação termina.
  // Usa `detail.conversationId` (carregado pela chamada desde o convite,
  // ver call-controller.ts) em vez de depender de qual conversa está aberta
  // na tela — antes disso, só chamadas 1:1 registravam, e só se a pessoa
  // não tivesse navegado pra outro lugar antes do fim; agora funciona pra
  // DM, canal, campanha ou projeto, mesmo com o Chat fechado ou noutra tela.
  useEffect(() => {
    const onEnded = (ev: Event) => {
      const detail = (
        ev as CustomEvent<{
          conversationId?: string;
          connected: boolean;
          reason: "answered" | "rejected" | "missed" | "cancelled";
          seconds: number;
          endedAt: number;
        }>
      ).detail;
      if (!detail?.conversationId) return;
      let text: string;
      if (detail.reason === "answered") {
        const mm = String(Math.floor(detail.seconds / 60)).padStart(2, "0");
        const ss = String(detail.seconds % 60).padStart(2, "0");
        text = `📞 Chamada encerrada · duração ${mm}:${ss}`;
      } else if (detail.reason === "cancelled") {
        text = "📞 Chamada não atendida";
      } else {
        text = "📞 Chamada perdida";
      }
      void sendMessageDb({ convoId: detail.conversationId, text, system: true });
    };
    window.addEventListener("call:ended", onEnded);
    return () => window.removeEventListener("call:ended", onEnded);
  }, []);

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

  return (
    <div className="flex h-[calc(100vh-9rem)] w-full overflow-hidden rounded-lg border border-border bg-background">
      <div
        className={`w-full shrink-0 flex-col overflow-hidden border-r border-border md:flex md:w-[320px] ${
          activeId ? "hidden" : "flex"
        }`}
      >
        <ChatConversationList
          channels={channels}
          campaignChannels={campaignChannels}
          projectChannels={projectChannels}
          members={members}
          messages={messages}
          meId={me.id}
          activeId={activeId}
          onSelectConvo={(id) => setActiveConvo(id)}
        />
      </div>
      <div
        className={`min-w-0 flex-1 flex-col overflow-hidden md:flex ${activeId ? "flex" : "hidden"}`}
      >
        <header className="flex items-center gap-2 border-b border-border px-4 py-3">
          {activeId && (
            <button
              type="button"
              onClick={() => setActiveConvo("")}
              aria-label="Voltar pra lista de conversas"
              className="-ml-1.5 mr-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          {activeChannel ? (
            <>
              {activeChannel.private ? (
                <Lock className="h-4 w-4 text-muted-foreground" />
              ) : (
                <Hash className="h-4 w-4 text-muted-foreground" />
              )}
              <h2 className="min-w-0 truncate text-sm font-semibold">{activeChannel.name}</h2>
              <span className="ml-2 flex items-center gap-1 text-[11px] text-muted-foreground">
                <Users className="h-3 w-3" /> {members.length}
              </span>
            </>
          ) : activeCampaign ? (
            <>
              <Hash className="h-4 w-4 text-muted-foreground" />
              <h2 className="min-w-0 truncate text-sm font-semibold">{activeCampaign.name}</h2>
              <span className="text-[11px] text-muted-foreground">
                campanha · {activeCampaign.empresa}
              </span>
            </>
          ) : activeProject ? (
            <>
              <Hash className="h-4 w-4 text-muted-foreground" />
              <h2 className="min-w-0 truncate text-sm font-semibold">{activeProject.name}</h2>
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
                  <h2 className="min-w-0 truncate text-sm font-semibold">{activeDmPartner.name}</h2>
                  <span className="text-[11px] text-muted-foreground">{STATUS_LABEL[status]}</span>
                </>
              );
            })()
          ) : (
            <h2 className="text-sm font-semibold text-muted-foreground">Selecione uma conversa</h2>
          )}
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {activeId && (
              <div className="relative hidden md:block">
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
                  void startCall(
                    [
                      {
                        id: activeDmPartner.id,
                        name: activeDmPartner.name,
                        photo: activeDmPartner.photo,
                      },
                    ],
                    activeId,
                  );
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

        {!activeId ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
            <MessageSquare className="h-10 w-10 text-muted-foreground/40" strokeWidth={1.5} />
            <p className="text-sm text-muted-foreground">
              Selecione uma conversa pra começar a conversar.
            </p>
          </div>
        ) : (
          <>
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
              projects={projects}
              campaigns={campaigns}
              clients={clientMentions}
              isDm={isDm}
              otherUserId={activeDmPartner?.id}
              typingUsers={typingUsers}
              onOpenTask={openTask}
              onOpenMention={openMention}
            />

            {!isSelfDm && (
              <Composer
                key={activeId}
                convoId={activeId}
                onSend={sendMessage}
                allowUserMentions={!isDm}
                members={members}
                tasks={tasks}
                projects={projects}
                campaigns={campaigns}
                clients={clientMentions}
                mentionContext={mentionContext}
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
          </>
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
                    Escolha até {MAX_GROUP_PARTICIPANTS} pessoas — mais de uma vira chamada em
                    grupo.
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
                    const chosen = channelCallCandidates.filter((m) =>
                      callPickerSelected.has(m.id),
                    );
                    setCallPickerOpen(false);
                    void startCall(
                      chosen.map((m) => ({ id: m.id, name: m.name, photo: m.photo })),
                      activeId,
                    );
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
    </div>
  );
}

/** Uma linha da lista de conversas — usada tanto pras diretas quanto pros
 * canais/campanhas/projetos, só muda o avatar (foto/inicial vs ícone) e se
 * tem menu de editar/excluir (só canais). */
function ChatListRow({
  item,
  active,
  meId,
  onSelect,
  onEdit,
  onDelete,
}: {
  item: ChatListItem;
  active: boolean;
  meId: string;
  onSelect: () => void;
  onEdit?: (e: React.MouseEvent) => void;
  onDelete?: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      className={`group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${
        active ? "bg-foreground/10" : "hover:bg-muted/60"
      }`}
    >
      <button type="button" onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-2.5">
        <span className="relative h-10 w-10 shrink-0">
          {item.photo ? (
            <img src={item.photo} alt="" className="h-10 w-10 rounded-full object-cover" />
          ) : item.kind === "dm" ? (
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-sm font-semibold text-foreground">
              {item.name.slice(0, 1).toUpperCase()}
            </span>
          ) : (
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
              {item.private ? <Lock className="h-4 w-4" /> : <Hash className="h-4 w-4" />}
            </span>
          )}
          {item.kind === "dm" && item.status && (
            <span
              title={STATUS_LABEL[item.status]}
              className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-background ${STATUS_COLOR[item.status]}`}
            />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={`block truncate text-sm ${item.unread > 0 ? "font-semibold text-foreground" : "font-medium text-foreground"}`}
          >
            {item.name}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {item.lastMessage
              ? `${item.lastMessage.authorId === meId ? "Você: " : ""}${
                  item.lastMessage.text || (item.lastMessage.attachments?.length ? "Anexo" : "")
                }`
              : item.kind === "campanha"
                ? "Campanha"
                : item.kind === "projeto"
                  ? "Projeto"
                  : "Nenhuma mensagem ainda"}
          </span>
        </span>
      </button>
      {item.unread > 0 && (
        <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-foreground px-1.5 text-[10px] font-semibold text-background">
          {item.unread > 9 ? "9+" : item.unread}
        </span>
      )}
      {onEdit && onDelete && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              onClick={(e) => e.stopPropagation()}
              aria-label="Mais opções do canal"
              className="shrink-0 rounded p-1 text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100 data-[state=open]:opacity-100"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-36">
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" /> Editar canal
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={onDelete}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" /> Excluir canal
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

/** Lista de conversas do Chat — substitui a antiga central em grade e o
 * menu lateral separado (canais/campanhas/projetos/DMs) por uma lista só,
 * dentro da própria aba, estilo WhatsApp Web: diretas por mais recente
 * primeiro, canais/campanhas/projetos numa seção fixa embaixo (também por
 * recência). Clicar abre a conversa ao lado, sem sair da tela. */
function ChatConversationList({
  channels,
  campaignChannels,
  projectChannels,
  members,
  messages,
  meId,
  activeId,
  onSelectConvo,
}: {
  channels: ChatChannel[];
  campaignChannels: CampaignChannel[];
  projectChannels: { id: string; name: string }[];
  members: ChatMember[];
  messages: ChatMessage[];
  meId: string;
  activeId: string;
  onSelectConvo: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<ChatChannel | null>(null);
  const { confirm, confirmDialog } = useConfirm();

  const items = useMemo(
    () => buildChatList({ channels, campaignChannels, projectChannels, members, messages, meId }),
    [channels, campaignChannels, projectChannels, members, messages, meId],
  );

  const q = search.trim().toLowerCase();
  const filtered = q ? items.filter((i) => i.name.toLowerCase().includes(q)) : items;
  const byRecency = (a: ChatListItem, b: ChatListItem) =>
    (b.lastMessage?.createdAt ?? 0) - (a.lastMessage?.createdAt ?? 0);
  const byName = (a: ChatListItem, b: ChatListItem) => a.name.localeCompare(b.name, "pt-BR");
  const diretas = filtered.filter((i) => i.kind === "dm").sort(byRecency);
  const canais = filtered.filter((i) => i.kind === "channel").sort(byName);
  const campanhas = filtered.filter((i) => i.kind === "campanha").sort(byName);
  const projetos = filtered.filter((i) => i.kind === "projeto").sort(byName);
  const totalUnread = items.reduce((sum, i) => sum + i.unread, 0);

  const handleCreateChannel = async (payload: {
    name: string;
    photo?: string;
    private: boolean;
    allowedMemberIds?: string[];
  }) => {
    if (editing) {
      await updateChannel(editing.id, {
        name: payload.name,
        photo: payload.photo,
        private: payload.private,
        allowedMemberIds: payload.allowedMemberIds,
      });
      setEditing(null);
      setShowCreate(false);
      return;
    }
    if (channels.some((c) => c.name === payload.name)) return;
    const ch = await createChannel({
      name: payload.name,
      private: payload.private,
      photo: payload.photo,
      allowedMemberIds: payload.allowedMemberIds,
    });
    setShowCreate(false);
    if (ch) onSelectConvo(ch.id);
  };

  const editChannel = (c: ChatChannel, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditing(c);
    setShowCreate(true);
  };

  const deleteChannelRow = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await confirm("Excluir este canal e todas as suas mensagens?");
    if (!ok) return;
    await deleteChannelDb(id);
    if (activeId === id) {
      const remaining = channels.filter((c) => c.id !== id);
      onSelectConvo(remaining[0]?.id ?? "");
    }
  };

  return (
    <>
      <header className="flex items-center gap-2 border-b border-border px-4 py-3.5">
        <div>
          <h1 className="text-lg font-light tracking-tighter text-foreground">Conversas</h1>
          <p className="text-[11px] text-muted-foreground">
            {totalUnread > 0
              ? `${totalUnread} não lida${totalUnread > 1 ? "s" : ""}`
              : "Tudo em dia"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setShowCreate(true);
          }}
          aria-label="Novo canal"
          className="ml-auto rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
        </button>
      </header>
      <div className="border-b border-border px-3 py-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar conversas..."
            className="h-8 w-full rounded-md border border-border bg-background pl-8 pr-2 text-xs outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {filtered.length === 0 ? (
          <p className="p-8 text-center text-xs text-muted-foreground">
            Nenhuma conversa encontrada.
          </p>
        ) : (
          <>
            {diretas.length > 0 && (
              <div className="mb-2">
                <p className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Diretas
                </p>
                {diretas.map((item) => (
                  <ChatListRow
                    key={item.id}
                    item={item}
                    active={item.id === activeId}
                    meId={meId}
                    onSelect={() => onSelectConvo(item.id)}
                  />
                ))}
              </div>
            )}
            {canais.length > 0 && (
              <div className="mb-2">
                <p className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Canais
                </p>
                {canais.map((item) => (
                  <ChatListRow
                    key={item.id}
                    item={item}
                    active={item.id === activeId}
                    meId={meId}
                    onSelect={() => onSelectConvo(item.id)}
                    onEdit={(e) => {
                      const c = channels.find((x) => x.id === item.id);
                      if (c) editChannel(c, e);
                    }}
                    onDelete={(e) => deleteChannelRow(item.id, e)}
                  />
                ))}
              </div>
            )}
            {campanhas.length > 0 && (
              <div className="mb-2">
                <p className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Campanhas
                </p>
                {campanhas.map((item) => (
                  <ChatListRow
                    key={item.id}
                    item={item}
                    active={item.id === activeId}
                    meId={meId}
                    onSelect={() => onSelectConvo(item.id)}
                  />
                ))}
              </div>
            )}
            {projetos.length > 0 && (
              <div>
                <p className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Projetos
                </p>
                {projetos.map((item) => (
                  <ChatListRow
                    key={item.id}
                    item={item}
                    active={item.id === activeId}
                    meId={meId}
                    onSelect={() => onSelectConvo(item.id)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
      {showCreate && (
        <CreateChannelModal
          members={members}
          meId={meId}
          existingNames={channels.map((c) => c.name)}
          initial={editing}
          onCreate={handleCreateChannel}
          onClose={() => {
            setShowCreate(false);
            setEditing(null);
          }}
        />
      )}
      {confirmDialog}
    </>
  );
}

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
      className="flex w-full max-w-[420px] flex-col gap-1 rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-left text-xs hover:border-foreground/30 hover:bg-muted/50"
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

/** Texto da mensagem com @menções inline (pessoa/tarefa/projeto/campanha/
 * cliente) — sempre um badge de texto simples, nunca um bloco maior aqui
 * dentro, pra não quebrar o fluxo do parágrafo. Cards de tarefa mencionada
 * aparecem à parte, como blocos abaixo do texto (ver `taskMentionsOf`).
 * Cada badge é clicável (`onOpenMention`) — antes só a tarefa tinha uma
 * forma de abrir (o card separado), a menção inline em si nunca abria nada. */
function renderText(
  text: string,
  mentions: ChatMention[] | undefined,
  onOpenMention: (m: ChatMention) => void,
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
    return (
      <button
        key={i}
        type="button"
        onClick={() => onOpenMention(p)}
        className={`rounded px-1 py-0.5 text-xs font-medium hover:underline ${MENTION_KIND_CONFIG[p.kind].badgeClass}`}
      >
        @{p.label}
      </button>
    );
  });
}

/** Tarefas mencionadas numa mensagem, sem repetir a mesma tarefa duas vezes
 * (@menção pode aparecer mais de uma vez no texto). */
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
  projects,
  campaigns,
  clients,
  isDm,
  otherUserId,
  typingUsers,
  onOpenTask,
  onOpenMention,
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
  projects: MentionOption[];
  campaigns: MentionOption[];
  clients: MentionOption[];
  isDm: boolean;
  otherUserId?: string;
  typingUsers: { userId: string; userName: string }[];
  onOpenTask: (taskId: string) => void;
  onOpenMention: (m: ChatMention) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [expandedCallGroups, setExpandedCallGroups] = useState<Set<string>>(new Set());
  const [expandedCallDetails, setExpandedCallDetails] = useState<Set<string>>(new Set());
  const taskInfoById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  // Registros de chamada (📞) que nunca conectaram (recusada/perdida/não
  // atendida — nunca uma que de fato aconteceu, essa fica sempre individual)
  // ficam poluindo o histórico quando alguém liga várias vezes seguidas —
  // agrupa tentativas consecutivas (sem mensagem de verdade no meio) dentro
  // de uma janela de 10 minutos, no mesmo dia, num único item recolhível.
  const callGroups = useMemo(() => {
    const groups = new Map<string, ChatMessage[]>();
    const hidden = new Set<string>();
    let buffer: ChatMessage[] = [];
    const flush = () => {
      if (buffer.length >= 2) {
        groups.set(buffer[0].id, buffer);
        for (const b of buffer.slice(1)) hidden.add(b.id);
      }
      buffer = [];
    };
    for (const m of messages) {
      const isGroupableCall =
        m.authorId === "system" && m.text.startsWith("📞") && !m.text.includes("duração");
      if (isGroupableCall) {
        const last = buffer[buffer.length - 1];
        if (
          last &&
          m.createdAt - last.createdAt <= 10 * 60 * 1000 &&
          isSameDay(last.createdAt, m.createdAt)
        ) {
          buffer.push(m);
        } else {
          flush();
          buffer = [m];
        }
      } else {
        flush();
      }
    }
    flush();
    return { groups, hidden };
  }, [messages]);
  const prevConvoIdRef = useRef(convoId);
  useEffect(() => {
    const switchedConvo = prevConvoIdRef.current !== convoId;
    prevConvoIdRef.current = convoId;
    const el = scrollRef.current;
    if (!el) return;
    // Trocar de conversa precisa ir direto pro fim, sem animação — e mais
    // de uma vez, porque avatares/anexos ainda carregando mudam a altura
    // do conteúdo depois desse primeiro scroll (senão parava "no meio",
    // antes do conteúdo terminar de renderizar). Mensagem nova na MESMA
    // conversa continua com scroll suave, de onde já estava.
    const scroll = () =>
      el.scrollTo({ top: el.scrollHeight, behavior: switchedConvo ? "auto" : "smooth" });
    scroll();
    if (switchedConvo) {
      const raf = requestAnimationFrame(scroll);
      const timeout = window.setTimeout(scroll, 150);
      return () => {
        cancelAnimationFrame(raf);
        window.clearTimeout(timeout);
      };
    }
  }, [messages.length, convoId]);
  const jumpToMessage = (id: string) => {
    const el = document.getElementById(`msg-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedId(id);
    window.setTimeout(() => setHighlightedId((cur) => (cur === id ? null : cur)), 1500);
  };
  const otherReadAt = isDm && otherUserId ? getOtherReadAt(convoId, otherUserId) : 0;
  const otherDeliveredAt = isDm && otherUserId ? getOtherDeliveredAt(convoId, otherUserId) : 0;

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
        // Absorvido num grupo de tentativas de chamada representado por um
        // item anterior (ver `callGroups` acima) — nunca renderiza sozinho.
        if (callGroups.hidden.has(m.id)) return null;
        const prev = messages[i - 1];
        const next = messages[i + 1];
        const grouped =
          prev &&
          prev.authorId === m.authorId &&
          m.createdAt - prev.createdAt < 5 * 60 * 1000 &&
          isSameDay(prev.createdAt, m.createdAt);
        // Última mensagem de uma sequência do mesmo remetente — é onde o
        // recibo (enviado/entregue/visto) aparece, nunca na primeira: é a
        // mensagem mais recente que reflete o estado de verdade da
        // conversa, e enquanto a sequência continua o recibo da anterior
        // ficaria "preso" num estado que a próxima mensagem já superou.
        const lastOfGroup =
          !next ||
          next.authorId !== m.authorId ||
          next.createdAt - m.createdAt >= 5 * 60 * 1000 ||
          !isSameDay(m.createdAt, next.createdAt);
        const mine = m.authorId === meId;
        const showDayDivider = !prev || !isSameDay(prev.createdAt, m.createdAt);
        const editing = editingId === m.id;
        if (m.authorId === "system") {
          const isCallRecord = m.text.startsWith("📞");
          const dayDividerEl = showDayDivider && (
            <div className="my-4 flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="rounded-full border border-border bg-background px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {formatDayLabel(m.createdAt)}
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>
          );
          // Registro de chamada é metadado do histórico (nível "Hoje"/"Lucas
          // entrou na sala"), nunca deve competir visualmente com mensagens
          // de verdade — monocromático, pequeno, sem pill colorida. Cor fica
          // reservada só pro pontinho sutil de "perdida" (item 5 do pedido).
          if (isCallRecord) {
            const groupMsgs = callGroups.groups.get(m.id);
            const fmtTime = (t: number) =>
              new Date(t).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
            if (groupMsgs) {
              const expanded = expandedCallGroups.has(m.id);
              const range = `${fmtTime(groupMsgs[0].createdAt)}–${fmtTime(groupMsgs[groupMsgs.length - 1].createdAt)}`;
              return (
                <div key={m.id}>
                  {dayDividerEl}
                  <div className="my-1.5 flex flex-col items-center gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedCallGroups((prevSet) => {
                          const next = new Set(prevSet);
                          if (next.has(m.id)) next.delete(m.id);
                          else next.add(m.id);
                          return next;
                        })
                      }
                      className="flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted/30"
                    >
                      {expanded ? (
                        <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
                      ) : (
                        <ChevronRight className="h-3 w-3 shrink-0 opacity-60" />
                      )}
                      <PhoneMissed className="h-3 w-3 shrink-0 opacity-70" />
                      <span>{groupMsgs.length} tentativas de chamada</span>
                      <span className="text-[10px] opacity-60">{range}</span>
                    </button>
                    {expanded && (
                      <div className="flex flex-col gap-0.5 rounded-md border border-border/60 bg-card/50 px-3 py-2 text-[11px] text-muted-foreground">
                        {groupMsgs.map((gm) => (
                          <div key={gm.id} className="flex items-center gap-1.5">
                            <span className="text-[10px] opacity-60">{fmtTime(gm.createdAt)}</span>
                            <span>·</span>
                            <span>{formatCallRecordLabel(gm.text).label}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            }
            const { label, kind } = formatCallRecordLabel(m.text);
            const detailsOpen = expandedCallDetails.has(m.id);
            const otherName = isDm
              ? members.find((mem) => mem.id === otherUserId)?.name
              : undefined;
            return (
              <div key={m.id}>
                {dayDividerEl}
                <div className="my-1.5 flex flex-col items-center gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      kind === "answered" &&
                      setExpandedCallDetails((prevSet) => {
                        const next = new Set(prevSet);
                        if (next.has(m.id)) next.delete(m.id);
                        else next.add(m.id);
                        return next;
                      })
                    }
                    className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-muted-foreground ${
                      kind === "answered" ? "cursor-pointer hover:bg-muted/30" : "cursor-default"
                    }`}
                  >
                    {kind === "missed" ? (
                      <PhoneMissed className="h-3 w-3 shrink-0 opacity-70" />
                    ) : (
                      <Phone className="h-3 w-3 shrink-0 opacity-70" />
                    )}
                    <span>{label}</span>
                    {/* Único toque de cor do redesign, de propósito: só pra
                        "perdida" ter alguma diferenciação além do texto, e
                        mesmo assim é só um pontinho, nunca card/ícone colorido. */}
                    {kind === "missed" && (
                      <span className="h-1 w-1 rounded-full bg-amber-500/70" aria-hidden="true" />
                    )}
                    <span className="text-[10px] opacity-60">{fmtTime(m.createdAt)}</span>
                  </button>
                  {detailsOpen && kind === "answered" && (
                    <div className="rounded-md border border-border/60 bg-card/50 px-3 py-2 text-[11px] text-muted-foreground">
                      <p className="font-medium text-foreground">
                        Chamada{otherName ? ` com ${otherName}` : ""}
                      </p>
                      <p>{formatIsoDate(new Date(m.createdAt).toISOString().slice(0, 10))}</p>
                      <p>
                        {fmtTime(m.createdAt - parseCallDurationMs(m.text))} –{" "}
                        {fmtTime(m.createdAt)}
                      </p>
                      <p>Duração: {label.split("· ")[1]}</p>
                    </div>
                  )}
                </div>
              </div>
            );
          }
          return (
            <div key={m.id}>
              {dayDividerEl}
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
              className={`group relative flex gap-2.5 rounded-md px-2 py-0.5 transition-colors duration-500 hover:bg-muted/30 ${grouped ? "mt-0.5" : "mt-3"} ${highlightedId === m.id ? "bg-sky-500/10" : ""}`}
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
              <div className="flex min-w-0 flex-1 flex-col items-start">
                {!grouped && (
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-semibold text-foreground">
                      {mine ? "Você" : m.authorName}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(m.createdAt).toLocaleTimeString("pt-BR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
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
                        className="mb-1 flex w-full max-w-[420px] items-start gap-1.5 rounded border-l-2 border-border pl-2 text-left text-xs text-muted-foreground hover:border-foreground hover:text-foreground"
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
                    projects={projects}
                    campaigns={campaigns}
                    clients={clients}
                    onCancel={() => setEditingId(null)}
                    onSave={(text, mentions) => {
                      onEdit(m.id, text, mentions);
                      setEditingId(null);
                    }}
                  />
                ) : (
                  <div className="flex w-full flex-col items-start gap-1.5">
                    {m.text && (
                      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
                        {renderText(m.text, m.mentions, onOpenMention)}
                        {m.editedAt && (
                          <span className="ml-1 text-[10px] text-muted-foreground">(editado)</span>
                        )}
                      </p>
                    )}
                    {onOpenTask &&
                      taskMentionsOf(m.mentions, taskInfoById).map((task) => (
                        <TaskMentionCard key={task.id} task={task} onOpen={onOpenTask} />
                      ))}
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
                {!editing && mine && isDm && lastOfGroup && (
                  <div className="mt-0.5 flex items-center gap-1 self-end">
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(m.createdAt).toLocaleTimeString("pt-BR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <span
                      title={
                        otherReadAt >= m.createdAt
                          ? "Visto"
                          : otherDeliveredAt >= m.createdAt
                            ? "Entregue"
                            : "Enviado"
                      }
                    >
                      {otherReadAt >= m.createdAt ? (
                        <CheckCheck className="h-3 w-3 text-sky-500" />
                      ) : otherDeliveredAt >= m.createdAt ? (
                        <CheckCheck className="h-3 w-3 text-muted-foreground" />
                      ) : (
                        <Check className="h-3 w-3 text-muted-foreground" />
                      )}
                    </span>
                  </div>
                )}
              </div>
              {!editing && (
                <div className="absolute right-2 top-0 hidden items-center gap-0.5 rounded-md border border-border bg-background p-0.5 shadow-sm group-hover:flex">
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

/** Só reformata pra exibição — o texto gravado no banco (gerado no handler
 * de `call:ended`, ver mais acima) continua exatamente igual, de propósito:
 * essa tarefa é só de apresentação, não pode mexer em como o registro é
 * criado/armazenado. */
function formatCallRecordLabel(rawText: string): {
  label: string;
  kind: "answered" | "missed" | "notAnswered";
} {
  const body = rawText.replace("📞 ", "");
  const match = body.match(/duração (\d{2}):(\d{2})/);
  if (match) {
    const mm = Number(match[1]);
    const ss = Number(match[2]);
    const parts = [mm > 0 ? `${mm} min` : null, ss > 0 || mm === 0 ? `${ss} s` : null].filter(
      Boolean,
    );
    return { label: `Chamada encerrada · ${parts.join(" ")}`, kind: "answered" };
  }
  if (body === "Chamada perdida") return { label: body, kind: "missed" };
  return { label: body, kind: "notAnswered" };
}
function parseCallDurationMs(rawText: string): number {
  const match = rawText.match(/duração (\d{2}):(\d{2})/);
  if (!match) return 0;
  return (Number(match[1]) * 60 + Number(match[2])) * 1000;
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

type MentionSourceTask = {
  id: string;
  label: string;
  project?: string;
  campanhaId?: string;
  projectId?: string;
};

/**
 * Reusable input with @ mention picker. Extracts mentions used in final text.
 * Junta os 5 tipos mencionáveis num só array de opções, já com o boost de
 * contexto (`context`) calculado por opção — sem context, fica sem boost
 * (usado em edição de mensagem antiga, onde o ranking contextual não é
 * essencial).
 */
function useMentions(
  members: ChatMember[],
  tasks: MentionSourceTask[],
  projects: MentionOption[],
  campaigns: MentionOption[],
  clients: MentionOption[],
  allowUserMentions: boolean,
  context?: MentionContext,
) {
  const options = useMemo<MentionOption[]>(() => {
    const t: MentionOption[] = tasks.map((x) => ({
      kind: "task",
      id: x.id,
      label: x.label,
      hint: x.project ? `Projeto: ${x.project}` : undefined,
      campanhaId: x.campanhaId,
      projectId: x.projectId,
    }));
    const u: MentionOption[] = allowUserMentions
      ? members.map((m) => ({
          kind: "user",
          id: m.id,
          label: m.name,
          photo: m.photo,
          hint: m.role,
        }))
      : [];
    const all = [...u, ...t, ...projects, ...campaigns, ...clients];
    if (!context) return all;
    return all.map((o) => ({ ...o, boost: contextBoost(o, context) }));
  }, [members, tasks, projects, campaigns, clients, allowUserMentions, context]);
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
  projects,
  campaigns,
  clients,
  onSave,
  onCancel,
}: {
  initialText: string;
  allowUserMentions: boolean;
  members: ChatMember[];
  tasks: MentionSourceTask[];
  projects: MentionOption[];
  campaigns: MentionOption[];
  clients: MentionOption[];
  onSave: (text: string, mentions: ChatMention[]) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialText);
  const options = useMentions(members, tasks, projects, campaigns, clients, allowUserMentions);
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

/** Círculo com foto/inicial (+ bolinha de presença) pra pessoa; ícone lucide
 * num quadrado colorido (`MENTION_KIND_CONFIG`) pra tudo mais — mesma
 * convenção "círculo pra pessoa, quadrado pro resto" que a lista já usava,
 * só trocando a letra "T" solta por um ícone de verdade por kind. */
export function MentionResultIcon({ opt }: { opt: MentionOption }) {
  if (opt.kind === "user") {
    const status = getStatus(opt.id);
    return (
      <span className="relative h-5 w-5 shrink-0">
        {opt.photo ? (
          <img src={opt.photo} alt="" className="h-5 w-5 rounded-full object-cover" />
        ) : (
          <span className="grid h-5 w-5 place-items-center rounded-full bg-sky-500/20 text-[9px] font-semibold text-sky-700 dark:text-sky-300">
            {opt.label.trim()[0]?.toUpperCase() ?? "?"}
          </span>
        )}
        <span
          className={`absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 rounded-full ring-1 ring-background ${STATUS_COLOR[status]}`}
        />
      </span>
    );
  }
  if (opt.photo) {
    return <img src={opt.photo} alt="" className="h-5 w-5 shrink-0 rounded object-cover" />;
  }
  const { Icon, badgeClass } = MENTION_KIND_CONFIG[opt.kind];
  return (
    <span
      className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded ${badgeClass}`}
    >
      <Icon className="h-3 w-3" />
    </span>
  );
}

export function MentionResultRow({
  opt,
  highlighted,
  onPick,
}: {
  opt: MentionOption;
  highlighted: boolean;
  onPick: (opt: MentionOption) => void;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault();
        onPick(opt);
      }}
      className={`flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs ${
        highlighted ? "bg-muted" : "hover:bg-muted/60"
      }`}
    >
      <MentionResultIcon opt={opt} />
      <span className="min-w-0 flex-1 truncate">{opt.label}</span>
      {opt.hint && (
        <span className="shrink-0 truncate text-[10px] text-muted-foreground">{opt.hint}</span>
      )}
    </button>
  );
}

const MENTION_ALL_TAB_CAP = 5;
const MENTION_KIND_TAB_CAP = 20;

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
  const [tab, setTab] = useState<MentionKind | "all">("all");

  const kindsWithOptions = useMemo(
    () => MENTION_KIND_ORDER.filter((k) => options.some((o) => o.kind === k)),
    [options],
  );
  const showTabs = kindsWithOptions.length > 1;

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
  const trimmedQuery = effectiveQuery.trim();

  // Sem busca (menu recém-aberto com só "@"): ordena só por `boost` de
  // contexto — é literalmente a seção "Recentes" (pessoas do canal/DM,
  // tarefas/campanha do canal ativo etc.), sem tabela nova nenhuma. Com
  // busca: `matchScore` decide primeiro, `boost` só desempata.
  const scored = useMemo(() => {
    if (query === null) return [];
    return options
      .map((o) => ({ o, score: trimmedQuery ? matchScore(o.label, trimmedQuery) : 0 }))
      .filter(({ score }) => !trimmedQuery || score > 0)
      .sort((a, b) => {
        if (trimmedQuery && a.score !== b.score) return b.score - a.score;
        return (b.o.boost ?? 0) - (a.o.boost ?? 0);
      })
      .map(({ o }) => o);
  }, [query, options, trimmedQuery]);

  // Aba "Todos": agrupado por tipo, até MENTION_ALL_TAB_CAP por grupo, com
  // "Ver todos" quando há mais — cada item já carrega o índice plano (`idx`)
  // usado pra navegação por teclado bater com a ordem visual.
  const groupedForAll = useMemo(() => {
    if (tab !== "all") return [];
    let idx = 0;
    return MENTION_KIND_ORDER.map((k) => {
      const inKind = scored.filter((o) => o.kind === k);
      const items = inKind.slice(0, MENTION_ALL_TAB_CAP).map((o) => ({ o, idx: idx++ }));
      return { kind: k, items, total: inKind.length };
    }).filter((g) => g.items.length > 0);
  }, [scored, tab]);

  const singleKindItems = useMemo(() => {
    if (tab === "all") return [];
    return scored.filter((o) => o.kind === tab).slice(0, MENTION_KIND_TAB_CAP);
  }, [scored, tab]);

  const filtered = useMemo(
    () => (tab === "all" ? groupedForAll.flatMap((g) => g.items.map((x) => x.o)) : singleKindItems),
    [tab, groupedForAll, singleKindItems],
  );

  const goToKind = (k: MentionKind | "all") => {
    setTab(k);
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
    // Só reseta a aba quando o menu está abrindo (não a cada tecla digitada)
    // — sempre abre em "Todos", que já mostra tudo agrupado por tipo.
    if (justOpened) {
      setTab("all");
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
      {query !== null && options.length > 0 && (
        <div className="absolute bottom-full left-0 z-20 mb-1 flex max-h-[28rem] w-96 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-md border border-border bg-background shadow-lg">
          {showTabs && (
            <div className="flex shrink-0 overflow-x-auto border-b border-border">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => goToKind("all")}
                className={`shrink-0 px-2.5 py-1.5 text-[11px] font-medium ${
                  tab === "all"
                    ? "border-b-2 border-foreground text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Todos
              </button>
              {kindsWithOptions.map((k) => (
                <button
                  key={k}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => goToKind(k)}
                  className={`shrink-0 px-2.5 py-1.5 text-[11px] font-medium ${
                    tab === k
                      ? "border-b-2 border-foreground text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {MENTION_KIND_CONFIG[k].label}
                </button>
              ))}
            </div>
          )}
          <div className="shrink-0 border-b border-border p-1.5">
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
              placeholder={
                tab === "all"
                  ? "Buscar..."
                  : `Buscar ${MENTION_KIND_CONFIG[tab].label.toLowerCase()}...`
              }
              className="w-full rounded border border-border bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <ul className="min-h-0 flex-1 overflow-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-2 py-3 text-center text-[11px] text-muted-foreground">
                {trimmedQuery ? `Nenhum resultado para "${trimmedQuery}"` : "Nada encontrado"}
              </li>
            ) : tab === "all" ? (
              <>
                {!trimmedQuery && (
                  <li className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Recentes
                  </li>
                )}
                {groupedForAll.map((g) => (
                  <li key={g.kind} className="mb-1 last:mb-0">
                    <p className="px-2 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {MENTION_KIND_CONFIG[g.kind].label}
                    </p>
                    <ul>
                      {g.items.map(({ o, idx }) => (
                        <li key={o.kind + ":" + o.id}>
                          <MentionResultRow opt={o} highlighted={idx === highlight} onPick={pick} />
                        </li>
                      ))}
                    </ul>
                    {g.total > g.items.length && (
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => goToKind(g.kind)}
                        className="w-full px-2 py-1 text-left text-[10px] font-medium text-muted-foreground hover:text-foreground"
                      >
                        Ver todos ({g.total})
                      </button>
                    )}
                  </li>
                ))}
              </>
            ) : (
              singleKindItems.map((o, i) => (
                <li key={o.kind + ":" + o.id}>
                  <MentionResultRow opt={o} highlighted={i === highlight} onPick={pick} />
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
const AUDIO_RATES = [1, 1.5, 2] as const;

function AudioMessagePlayer({ src, compact }: { src: string; compact?: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [rate, setRate] = useState<(typeof AUDIO_RATES)[number]>(1);
  const bars = compact ? 22 : 34;
  const levels = useAudioWaveform(src, bars);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = rate;
  }, [rate]);

  const cycleRate = () => {
    const next = AUDIO_RATES[(AUDIO_RATES.indexOf(rate) + 1) % AUDIO_RATES.length];
    setRate(next);
  };

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
      className={`flex items-center gap-1.5 rounded-full border border-border bg-muted/40 py-1.5 pl-1.5 pr-2.5 ${compact ? "max-w-[220px]" : "max-w-xs"}`}
    >
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        className="hidden"
        onLoadedMetadata={(e) => {
          e.currentTarget.playbackRate = rate;
        }}
      />
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
      <button
        type="button"
        onClick={cycleRate}
        aria-label="Velocidade de reprodução"
        className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold tabular-nums transition-colors ${
          rate !== 1
            ? "border-foreground bg-foreground text-background"
            : "border-border text-muted-foreground hover:text-foreground"
        }`}
      >
        {rate}x
      </button>
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
  projects,
  campaigns,
  clients,
  mentionContext,
  replyingTo,
  onCancelReply,
}: {
  convoId: string;
  onSend: (text: string, mentions: ChatMention[], attachments: ChatAttachment[]) => void;
  placeholder: string;
  allowUserMentions: boolean;
  members: ChatMember[];
  tasks: MentionSourceTask[];
  projects: MentionOption[];
  campaigns: MentionOption[];
  clients: MentionOption[];
  mentionContext: MentionContext;
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
  const options = useMentions(
    members,
    tasks,
    projects,
    campaigns,
    clients,
    allowUserMentions,
    mentionContext,
  );

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
