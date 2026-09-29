import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Hash,
  Send,
  Users,
  Info,
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
  Search,
  Smile,
  Reply,
  Check,
  CheckCheck,
  Mic,
  Plus,
  MoreHorizontal,
  MessageSquare,
  ArrowLeft,
  ExternalLink,
  FolderOpen,
  Youtube,
  Video,
  Link2,
  Copy,
  ChevronUp,
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
  loadOlderMessages,
  hasMoreOlderMessages,
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
import { messagePreviewLabel, isVoiceAttachment } from "@/lib/voice-messages";
import { VoiceRecorderBar } from "@/components/chat/VoiceRecorderBar";
import { AttachmentList } from "@/components/chat/AttachmentList";
import { MessageAvatar } from "@/components/chat/MessageAvatar";

import { Link, useNavigate } from "@tanstack/react-router";
import { loadProjetos, type ProjectStatus } from "@/lib/projetos";
import {
  OPEN_CAMPANHA_TASK_KEY,
  OPEN_CLIENTE_KEY,
  OPEN_MEMBER_KEY,
  type SectionKey,
} from "@/components/AppShell";
import {
  MENTION_KIND_CONFIG,
  EVERYONE_MENTION_ID,
  type MentionContext,
  type MentionOption,
} from "@/lib/mention-kinds";
import { linkifyText } from "@/lib/linkify";
import { extractUrls, recognizeLinkPreview, type LinkPreview } from "@/lib/link-preview";
import {
  isChatSidebarGroupCollapsed,
  toggleChatSidebarGroup,
  type ChatSidebarGroup,
} from "@/lib/chat-sidebar-prefs";
import { useConfirm } from "@/hooks/use-confirm";
import { CreateChannelModal } from "@/components/CreateChannelModal";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatIsoDate } from "@/lib/utils";
import { useTaskDirectory, type TaskDirectoryEntry } from "@/lib/task-directory";
import { TaskMentionCard } from "@/components/chat/TaskMentionCard";
import {
  useMentions,
  extractUsedMentions,
  expandEveryoneMention,
  MentionTextarea,
  type MentionSourceTask,
} from "@/components/chat/MentionTextarea";

/** Alias — a lógica de montagem desse array (antes um `useMemo` inline
 * aqui) foi extraída pra `useTaskDirectory()` (`src/lib/task-directory.ts`)
 * pra também ser reaproveitada pelo `TaskPicker` de dependências entre
 * tarefas, sem duplicar a busca nas 3 fontes (projetos/campanhas/
 * avulsas do Marketing). Mesmo shape de sempre, só o nome do tipo mudou. */
type ChatTaskInfo = TaskDirectoryEntry;

/** "Reivindica" o registro do card de "Chamada encerrada" pra um
 * `callId` — cobre o caso de o próprio host da chamada ter mais de uma
 * aba aberta (o sinal de fim de chamada é broadcast por usuário, não por
 * aba, então cada aba roda seu próprio `finish()`/"call:ended" local).
 * `localStorage` é compartilhado entre abas da mesma origem, então a
 * primeira aba a chegar aqui grava a reivindicação e as outras veem que
 * já foi feita. Não é atômico entre abas (não há trava de verdade), mas
 * pra um evento raro disparado por interação humana, a janela de corrida
 * é desprezível — o objetivo é eliminar o spam visto na prática, não
 * garantir exclusividade perfeita. Poda entradas com mais de 1h pra não
 * crescer pra sempre. */
const CALL_ENDED_CLAIM_KEY = "chat:call-ended-claims";
const CALL_ENDED_CLAIM_TTL_MS = 60 * 60_000;
function claimCallEndedMessage(callId: string): boolean {
  try {
    const raw = localStorage.getItem(CALL_ENDED_CLAIM_KEY);
    const now = Date.now();
    const claims: Record<string, number> = raw ? JSON.parse(raw) : {};
    for (const [id, ts] of Object.entries(claims)) {
      if (now - ts > CALL_ENDED_CLAIM_TTL_MS) delete claims[id];
    }
    if (claims[callId]) return false;
    claims[callId] = now;
    localStorage.setItem(CALL_ENDED_CLAIM_KEY, JSON.stringify(claims));
    return true;
  } catch {
    // Sem localStorage (modo privado, quota etc.) — melhor arriscar uma
    // duplicata rara do que nunca registrar a chamada encerrada.
    return true;
  }
}

/** Altura realmente visível no mobile, considerando o teclado virtual —
 * `100dvh` sozinho não é confiável no Safari/Chrome iOS/Android quando o
 * teclado abre (a viewport de LAYOUT nem sempre encolhe, só a VISUAL).
 * `window.visualViewport` reflete a área visível de verdade; sem ele (SSR,
 * navegador sem suporte), cai pro fallback via classe `h-dvh` no elemento —
 * por isso retorna `null` até o primeiro cálculo, nunca um valor errado.
 * rAF-throttled pra não gerar tremulação a cada pixel de resize. */
function useVisualViewportHeight(
  containerRef: React.RefObject<HTMLElement | null>,
  enabled: boolean,
): number | null {
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      setHeight(null);
      return;
    }
    const vv = window.visualViewport;
    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const container = containerRef.current;
        const main = container?.closest("main");
        if (!container || !main) return;
        // Baseado só no `clientHeight`/padding de `<main>` (layout puro),
        // nunca em `getBoundingClientRect()` — esse é afetado pelo próprio
        // `scrollTop` de `<main>` (que tem `overflow-auto`), o que criava
        // um ciclo: altura errada → `<main>` rola → nova medição errada de
        // novo. O Chat é sempre o único filho de `<main>`, logo após o
        // padding-top dele, então a altura disponível é só `clientHeight`
        // menos os dois paddings — nenhuma medição de posição envolvida.
        const mainStyle = getComputedStyle(main);
        const mainPaddingTop = parseFloat(mainStyle.paddingTop || "0");
        const mainPaddingBottom = parseFloat(mainStyle.paddingBottom || "0");
        const availableInMain = main.clientHeight - mainPaddingTop - mainPaddingBottom;
        const layoutViewportHeight = window.innerHeight;
        const visualViewportHeight = vv?.height ?? layoutViewportHeight;
        const keyboardOverlap = Math.max(0, layoutViewportHeight - visualViewportHeight);
        setHeight(Math.max(0, Math.round(availableInMain - keyboardOverlap)));
      });
    };
    update();
    // No primeiro mount o container pode ainda não estar no lugar final
    // (flexbox/paint em andamento) — uma segunda medição logo depois
    // corrige sem esperar por um resize real do usuário.
    const settleTimeout = window.setTimeout(update, 100);
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    window.addEventListener("orientationchange", update);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(settleTimeout);
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      window.removeEventListener("orientationchange", update);
    };
  }, [containerRef, enabled]);

  return height;
}

export function ChatSection() {
  const [, force] = useState(0);
  // Seed do composer pro "Comentar" do card de tarefa (pedido do upgrade
  // do Chat, seção 10) — pré-insere uma @menção real da tarefa (casada
  // por `extractUsedMentions` no envio, mesmo mecanismo de sempre) e foca
  // o campo, sem abrir nada novo.
  const [composerSeed, setComposerSeed] = useState<string | null>(null);
  useEffect(() => subscribeChat(() => force((n) => n + 1)), []);
  const callState = useCallState();
  const isMobile = useIsMobile();
  const rootRef = useRef<HTMLDivElement>(null);
  const visualViewportHeight = useVisualViewportHeight(rootRef, isMobile);

  const me = getMe();
  const members = loadMembers();
  const channels = loadChannels();
  const messages = loadMessages();
  const clientes = useClientes();
  const campaignChannels = useMemo(() => loadCampaignChannels(clientes), [clientes]);
  const projectChannels = useMemo(() => loadProjectChannels(), [clientes]);
  const activeId = useActiveConvo();

  const activeChannel = channels.find((c) => c.id === activeId);
  const mentionMembers = members;
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

  // Fase 9 (parcial): painel de "Informações" — participantes e arquivos
  // compartilhados na conversa aberta. Busca global/filtros por
  // autor-período-canal e as demais sub-abas do painel completo (mensagens
  // fixadas, notificações, permissões) ficam de fora desta fase por
  // exigirem schema/infra que ainda não existe (não há "fixar mensagem"
  // nem preferência de notificação por conversa hoje).
  const [showInfo, setShowInfo] = useState(false);
  useEffect(() => setShowInfo(false), [activeId]);
  const sharedFiles = useMemo(
    () =>
      convoMessages
        .flatMap((m) => (m.attachments ?? []).map((a) => ({ message: m, attachment: a })))
        .filter(({ attachment }) => !isVoiceAttachment(attachment))
        .reverse(),
    [convoMessages],
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
    if (m.kind === "user") {
      // "Todos" é um badge informativo (menciona todos os participantes),
      // não uma pessoa — não tenta abrir um perfil que não existe.
      if (m.id === EVERYONE_MENTION_ID) return;
      return openMemberProfile(m.id);
    }
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

  // Fase 5: agrupa respostas por mensagem-raiz (`reply_to_id`) pra alimentar
  // o resumo "N respostas" e o painel de thread — nunca conta uma resposta
  // que por sua vez tem suas próprias respostas como raiz duas vezes (uma
  // thread é sempre plana, 1 nível: ver resolução do `replyToId` no botão
  // "Responder em thread").
  const repliesByRoot = useMemo(() => {
    const map = new Map<string, ChatMessage[]>();
    for (const m of messages) {
      if (!m.replyToId) continue;
      const list = map.get(m.replyToId) ?? [];
      list.push(m);
      map.set(m.replyToId, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.createdAt - b.createdAt);
    return map;
  }, [messages]);
  const [threadRootId, setThreadRootId] = useState<string | null>(null);
  useEffect(() => setThreadRootId(null), [activeId]);

  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  useEffect(() => setReplyingTo(null), [activeId]);
  const { confirm, confirmDialog } = useConfirm();

  const typingUsers = getTypingUsers(activeId, me.id);

  // Quem "@Todos" expande pra — mesma regra prática já usada pra decidir
  // quem PODE participar de cada tipo de conversa hoje (não existe um
  // conceito de "membros do canal" além disso, ver `mention-kinds.ts`):
  // DM = a outra pessoa; canal privado = `allowedMemberIds`; canal
  // público/campanha/projeto = todo mundo (`members`). Sempre exclui quem
  // está enviando (não faz sentido notificar a própria pessoa).
  const currentParticipantIds = (): string[] => {
    if (isDm) return activeDmPartner ? [activeDmPartner.id] : [];
    if (activeChannel?.private && activeChannel.allowedMemberIds) {
      return activeChannel.allowedMemberIds.filter((id) => id !== me.id);
    }
    return members.map((m) => m.id).filter((id) => id !== me.id);
  };

  const sendMessage = (text: string, mentions: ChatMention[], attachments: ChatAttachment[]) => {
    const trimmed = text.trim();
    if ((!trimmed && attachments.length === 0) || isSelfDm || !activeId) return;
    void sendMessageDb({
      convoId: activeId,
      text: trimmed,
      mentions: expandEveryoneMention(mentions, currentParticipantIds()),
      attachments,
      replyToId: replyingTo?.id,
    });
    setReplyingTo(null);
  };

  const updateMessage = (id: string, text: string, mentions: ChatMention[]) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    void editMessageDb(id, trimmed, expandEveryoneMention(mentions, currentParticipantIds()));
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
          callId?: string;
          conversationId?: string;
          connected: boolean;
          reason: "answered" | "rejected" | "missed" | "cancelled";
          seconds: number;
          endedAt: number;
          isHost?: boolean;
        }>
      ).detail;
      if (!detail?.conversationId) return;
      // Os dois lados da chamada (e cada aba aberta do mesmo usuário,
      // já que o sinal é broadcast por usuário, não por aba) recebem seu
      // próprio "call:ended" local — sem isso, o card era postado uma
      // vez por lado × aba (visto na prática como o mesmo aviso
      // repetido várias vezes, sempre com a mesma duração). Só quem
      // iniciou a chamada registra o card no histórico; e mesmo essa
      // única postagem é "reivindicada" por `callId` em localStorage
      // (compartilhado entre abas da mesma origem) pra cobrir o caso de
      // o próprio host ter mais de uma aba aberta.
      if (!detail.isHost) return;
      if (detail.callId && !claimCallEndedMessage(detail.callId)) return;
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
    <div
      ref={rootRef}
      style={isMobile && visualViewportHeight ? { height: visualViewportHeight } : undefined}
      className="flex h-dvh w-full max-w-full overflow-hidden rounded-none border-0 bg-background md:h-[calc(100dvh-9rem)] md:w-full md:rounded-lg md:border md:border-border"
    >
      <div
        className={`w-full shrink-0 flex-col overflow-hidden border-r border-border md:flex md:w-[280px] lg:w-[320px] ${
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
        className={`min-h-0 min-w-0 flex-1 flex-col overflow-hidden md:flex ${activeId ? "flex" : "hidden"}`}
      >
        <header className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
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
              <p className="min-w-0 truncate text-sm font-semibold md:text-base">
                {activeChannel.name}
              </p>
              <span className="ml-2 flex items-center gap-1 text-[11px] text-muted-foreground">
                <Users className="h-3 w-3" /> {members.length}
              </span>
            </>
          ) : activeCampaign ? (
            <>
              <Hash className="h-4 w-4 text-muted-foreground" />
              <p className="min-w-0 truncate text-sm font-semibold md:text-base">
                {activeCampaign.name}
              </p>
              <span className="text-[11px] text-muted-foreground">
                campanha · {activeCampaign.empresa}
              </span>
            </>
          ) : activeProject ? (
            <>
              <Hash className="h-4 w-4 text-muted-foreground" />
              <p className="min-w-0 truncate text-sm font-semibold md:text-base">
                {activeProject.name}
              </p>
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
                  <p className="min-w-0 truncate text-sm font-semibold md:text-base">
                    {activeDmPartner.name}
                  </p>
                  <span className="text-[11px] text-muted-foreground">{STATUS_LABEL[status]}</span>
                </>
              );
            })()
          ) : (
            <p className="text-sm font-semibold text-muted-foreground">Selecione uma conversa</p>
          )}
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <Link
              to="/chat-v2"
              className="hidden shrink-0 whitespace-nowrap text-[11px] font-medium text-brand hover:underline md:inline"
            >
              Experimentar novo Chat (beta)
            </Link>
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
            {activeId && (
              <button
                onClick={() => setShowInfo(true)}
                aria-label="Ver informações da conversa"
                title="Informações"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-foreground hover:bg-muted"
              >
                <Info className="h-4 w-4" />
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
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 text-center">
            <MessageSquare className="h-10 w-10 text-muted-foreground/40" strokeWidth={1.5} />
            <p className="text-sm text-muted-foreground">
              Selecione uma conversa pra começar a conversar.
            </p>
          </div>
        ) : (
          <>
            {searchQuery && (
              <div className="shrink-0 border-b border-border bg-muted/30 px-4 py-1.5 text-[11px] text-muted-foreground">
                {visibleMessages.length} resultado(s) para "{search.trim()}"
              </div>
            )}

            {
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
                members={mentionMembers}
                tasks={tasks}
                projects={projects}
                campaigns={campaigns}
                clients={clientMentions}
                isDm={isDm}
                otherUserId={activeDmPartner?.id}
                typingUsers={typingUsers}
                onOpenTask={openTask}
                onOpenMention={openMention}
                onCommentTask={(task) => setComposerSeed(`@${task.label} `)}
                repliesByRoot={repliesByRoot}
                onOpenThread={setThreadRootId}
              />
            }

            {!isSelfDm && (
              <Composer
                key={activeId}
                convoId={activeId}
                onSend={sendMessage}
                allowUserMentions={!isDm}
                members={mentionMembers}
                tasks={tasks}
                projects={projects}
                campaigns={campaigns}
                clients={clientMentions}
                mentionContext={mentionContext}
                replyingTo={replyingTo}
                onCancelReply={() => setReplyingTo(null)}
                seed={composerSeed}
                onSeedConsumed={() => setComposerSeed(null)}
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
              className="flex max-h-[85dvh] w-full max-w-sm flex-col overflow-hidden rounded-lg border border-border bg-background pb-[env(safe-area-inset-bottom)] shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div>
                  <p className="text-sm font-semibold">Ligar para</p>
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
                  className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-brand-foreground hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
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
      <ThreadPanel
        root={threadRootId ? (messagesById.get(threadRootId) ?? null) : null}
        replies={threadRootId ? (repliesByRoot.get(threadRootId) ?? []) : []}
        meId={me.id}
        convoId={activeId}
        onOpenMention={openMention}
        onClose={() => setThreadRootId(null)}
      />
      <InfoPanel
        open={showInfo}
        onClose={() => setShowInfo(false)}
        participants={
          activeDmPartner
            ? [{ id: me.id, name: me.name, photo: me.photo }, activeDmPartner]
            : activeChannel?.private && activeChannel.allowedMemberIds
              ? members.filter((m) => activeChannel.allowedMemberIds!.includes(m.id))
              : members
        }
        sharedFiles={sharedFiles}
      />
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
        active ? "bg-brand-subtle" : "hover:bg-muted/60"
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
          <div className="flex items-center gap-1.5">
            <span
              className={`block truncate text-sm ${item.unread > 0 ? "font-semibold text-foreground" : "font-medium text-foreground"}`}
            >
              {item.name}
            </span>
          </div>
          <span className="block truncate text-xs text-muted-foreground">
            {item.lastMessage
              ? `${item.lastMessage.authorId === meId ? "Você: " : ""}${messagePreviewLabel(item.lastMessage)}`
              : item.kind === "campanha"
                ? "Campanha"
                : item.kind === "projeto"
                  ? "Projeto"
                  : "Nenhuma mensagem ainda"}
          </span>
        </span>
      </button>
      {item.unread > 0 && (
        <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-brand px-1.5 text-[10px] font-semibold text-brand-foreground">
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

/** Cabeçalho de grupo recolhível (pedido, seção 2) — estado persistido em
 * `localStorage` (`chat-sidebar-prefs.ts`), nunca sincronizado entre
 * dispositivos. Só controla visibilidade das linhas; busca/ordenação
 * continuam intocadas (o grupo recolhido ainda participa da busca —
 * expandir de novo mostra o resultado filtrado normalmente). */
function SidebarGroupSection({
  group,
  label,
  children,
  count,
  unread,
  onAdd,
  addLabel,
}: {
  group: ChatSidebarGroup;
  label: string;
  children: ReactNode;
  count: number;
  /** Quantidade não lida da seção — mostrada como badge só quando > 0,
   * mesmo com a seção recolhida (pedido: "Quantidade não lida" é um dos
   * elementos que cada seção pode ter). */
  unread?: number;
  /** "Botão de adicionar, quando permitido" — só as seções onde faz
   * sentido criar um item novo diretamente (hoje só Canais) recebem isso. */
  onAdd?: () => void;
  addLabel?: string;
}) {
  const [collapsed, setCollapsed] = useState(() => isChatSidebarGroupCollapsed(group));
  return (
    <div className="mb-2">
      <div className="flex items-center gap-1 px-2.5 py-1">
        <button
          type="button"
          onClick={() => setCollapsed(toggleChatSidebarGroup(group))}
          className="flex min-w-0 flex-1 items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
        >
          {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          <span className="truncate">{label}</span>
          {collapsed && <span className="normal-case tracking-normal">({count})</span>}
        </button>
        {!!unread && unread > 0 && (
          <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-brand px-1 text-[9px] font-semibold text-brand-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
        {onAdd && (
          <button
            type="button"
            onClick={onAdd}
            aria-label={addLabel ?? "Adicionar"}
            title={addLabel}
            className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Plus className="h-3 w-3" />
          </button>
        )}
      </div>
      {!collapsed && children}
    </div>
  );
}

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
  projectChannels: { id: string; name: string; status: ProjectStatus }[];
  members: ChatMember[];
  messages: ChatMessage[];
  meId: string;
  activeId: string;
  onSelectConvo: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<ChatChannel | null>(null);
  // Atalho "Não lidas" (pedido, seção "Atalhos") — filtro que reaproveita a
  // mesma lista/seções de sempre, só escondendo o que já foi lido. "Itens
  // salvos" não existe aqui de propósito: não há suporte no banco pra
  // mensagem salva/marcada (nenhuma tabela pra isso), e o pedido já previa
  // esse atalho como condicional ("caso exista suporte"). "Menções e
  // reações" fica pra Fase 9 (Busca), que é onde esse cruzamento entre
  // conversas já vai existir de qualquer forma.
  const [onlyUnread, setOnlyUnread] = useState(false);
  const { confirm, confirmDialog } = useConfirm();

  const items = useMemo(
    () => buildChatList({ channels, campaignChannels, projectChannels, members, messages, meId }),
    [channels, campaignChannels, projectChannels, members, messages, meId],
  );

  const q = search.trim().toLowerCase();
  const filtered = items.filter(
    (i) => (!q || i.name.toLowerCase().includes(q)) && (!onlyUnread || i.unread > 0),
  );
  const byRecency = (a: ChatListItem, b: ChatListItem) =>
    (b.lastMessage?.createdAt ?? 0) - (a.lastMessage?.createdAt ?? 0);
  const byName = (a: ChatListItem, b: ChatListItem) => a.name.localeCompare(b.name, "pt-BR");
  const diretas = filtered.filter((i) => i.kind === "dm").sort(byRecency);
  const canais = filtered.filter((i) => i.kind === "channel").sort(byName);
  const campanhas = filtered.filter((i) => i.kind === "campanha").sort(byName);
  const projetos = filtered.filter((i) => i.kind === "projeto").sort(byName);
  const totalUnread = items.reduce((sum, i) => sum + i.unread, 0);
  const canaisUnread = canais.reduce((sum, i) => sum + i.unread, 0);
  const diretasUnread = diretas.reduce((sum, i) => sum + i.unread, 0);
  const campanhasUnread = campanhas.reduce((sum, i) => sum + i.unread, 0);
  const projetosUnread = projetos.reduce((sum, i) => sum + i.unread, 0);

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
          <p className="text-base font-semibold tracking-tight text-foreground">Conversas</p>
          <p className="text-[11px] text-muted-foreground">
            {totalUnread > 0
              ? `${totalUnread} não lida${totalUnread > 1 ? "s" : ""}`
              : "Tudo em dia"}
          </p>
        </div>
      </header>
      <div className="border-b border-border px-3 py-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar conversas..."
            className="h-9 w-full rounded-md border border-border bg-background pl-8 pr-2 text-base outline-none focus:ring-2 focus:ring-ring md:h-8 md:text-xs"
          />
        </div>
        {/* Atalho "Não lidas" — o único item da seção "Atalhos" do pedido
         * que tem dado real por trás hoje sem inventar recurso novo (ver
         * comentário em `onlyUnread` acima pra "Itens salvos"/"Menções e
         * reações"). */}
        <button
          type="button"
          onClick={() => setOnlyUnread((v) => !v)}
          aria-pressed={onlyUnread}
          className={`mt-2 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
            onlyUnread
              ? "border-brand/50 bg-brand-subtle text-brand"
              : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          Não lidas
          {totalUnread > 0 && (
            <span className="tabular-nums">{totalUnread > 99 ? "99+" : totalUnread}</span>
          )}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {filtered.length === 0 && (q || onlyUnread) ? (
          <p className="p-8 text-center text-xs text-muted-foreground">
            {onlyUnread ? "Nenhuma conversa não lida." : "Nenhuma conversa encontrada."}
          </p>
        ) : (
          <>
            {diretas.length > 0 && (
              <SidebarGroupSection
                group="diretas"
                label="Diretas"
                count={diretas.length}
                unread={diretasUnread}
              >
                {diretas.map((item) => (
                  <ChatListRow
                    key={item.id}
                    item={item}
                    active={item.id === activeId}
                    meId={meId}
                    onSelect={() => onSelectConvo(item.id)}
                  />
                ))}
              </SidebarGroupSection>
            )}
            {/* Canais aparece mesmo vazio fora de uma busca — é o único
             * lugar onde dá pra criar o primeiro canal, agora que o "+"
             * saiu do cabeçalho global pra virar o botão da própria seção. */}
            {(canais.length > 0 || (!q && !onlyUnread)) && (
              <SidebarGroupSection
                group="canais"
                label="Canais"
                count={canais.length}
                unread={canaisUnread}
                addLabel="Novo canal"
                onAdd={() => {
                  setEditing(null);
                  setShowCreate(true);
                }}
              >
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
              </SidebarGroupSection>
            )}
            {campanhas.length > 0 && (
              <SidebarGroupSection
                group="campanhas"
                label="Campanhas"
                count={campanhas.length}
                unread={campanhasUnread}
              >
                {campanhas.map((item) => (
                  <ChatListRow
                    key={item.id}
                    item={item}
                    active={item.id === activeId}
                    meId={meId}
                    onSelect={() => onSelectConvo(item.id)}
                  />
                ))}
              </SidebarGroupSection>
            )}
            {projetos.length > 0 && (
              <SidebarGroupSection
                group="projetos"
                label="Projetos"
                count={projetos.length}
                unread={projetosUnread}
              >
                {projetos.map((item) => (
                  <ChatListRow
                    key={item.id}
                    item={item}
                    active={item.id === activeId}
                    meId={meId}
                    onSelect={() => onSelectConvo(item.id)}
                  />
                ))}
              </SidebarGroupSection>
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

/** Texto da mensagem com @menções inline (pessoa/tarefa/projeto/campanha/
 * cliente) — sempre um badge de texto simples, nunca um bloco maior aqui
 * dentro, pra não quebrar o fluxo do parágrafo. Cards de tarefa mencionada
 * aparecem à parte, como blocos abaixo do texto (ver `taskMentionsOf`).
 * Cada badge é clicável (`onOpenMention`) — antes só a tarefa tinha uma
 * forma de abrir (o card separado), a menção inline em si nunca abria nada. */
/** Ícone por tipo de preview reconhecido — nunca genérico demais pra não
 * dar a entender que sabemos mais do link do que sabemos de verdade
 * (reconhecimento por padrão de URL, nunca metadados reais). */
function linkPreviewIcon(kind: LinkPreview["kind"]) {
  const cls = "h-4 w-4 shrink-0 text-muted-foreground";
  if (kind === "drive") return <FolderOpen className={cls} />;
  if (kind === "youtube") return <Youtube className={cls} />;
  if (kind === "meet") return <Video className={cls} />;
  return <Link2 className={cls} />;
}

/** Card de preview por padrão de URL reconhecido (pedido, seção 8) —
 * aparece ABAIXO do texto da mensagem, o link inline continua clicável
 * como sempre (`linkifyText`). Nunca inventa título/descrição reais —
 * só o tipo já é honesto o bastante sem buscar metadados de terceiros. */
function LinkPreviewCard({ preview }: { preview: LinkPreview }) {
  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="flex max-w-[360px] items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-left hover:bg-muted/50"
    >
      {linkPreviewIcon(preview.kind)}
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-foreground">{preview.title}</p>
        <p className="truncate text-[11px] text-muted-foreground">{preview.domain}</p>
      </div>
      <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
    </a>
  );
}

/** Colapsa mensagens longas (pedido, seção 6) — nunca corta parágrafo/
 * link/menção no meio: só limita a ALTURA visível com um gradiente,
 * conteúdo continua inteiro no DOM, "Ver mensagem completa" só remove o
 * limite. Heurística simples (tamanho do texto/nº de linhas) em vez de
 * medir o DOM — sem custo de layout extra por mensagem. */
const LONG_MESSAGE_CHARS = 600;
const LONG_MESSAGE_LINES = 8;

function isLongMessage(text: string): boolean {
  if (text.length > LONG_MESSAGE_CHARS) return true;
  const lines = text.split("\n").length;
  return lines > LONG_MESSAGE_LINES;
}

function MessageBody({
  text,
  mentions,
  onOpenMention,
  editedAt,
}: {
  text: string;
  mentions: ChatMention[] | undefined;
  onOpenMention: (m: ChatMention) => void;
  editedAt?: number;
}) {
  const long = useMemo(() => isLongMessage(text), [text]);
  const [expanded, setExpanded] = useState(false);
  const previews = useMemo(
    () =>
      extractUrls(text)
        .map(recognizeLinkPreview)
        .filter((p): p is LinkPreview => p !== null),
    [text],
  );
  const collapsed = long && !expanded;
  return (
    <>
      <div className="relative">
        <p
          className={`whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground md:leading-normal ${
            collapsed ? "max-h-40 overflow-hidden" : ""
          }`}
        >
          {renderText(text, mentions, onOpenMention)}
          {editedAt && <span className="ml-1 text-[10px] text-muted-foreground">(editado)</span>}
        </p>
        {collapsed && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-background/95 to-transparent md:from-muted/70" />
        )}
      </div>
      {long && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-foreground underline underline-offset-2 hover:no-underline"
        >
          {expanded ? (
            <>
              <ChevronUp className="h-3 w-3" /> Recolher
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3" /> Ver mensagem completa
            </>
          )}
        </button>
      )}
      {previews.length > 0 && (
        <div className="mt-1.5 flex flex-col gap-1.5">
          {previews.map((p) => (
            <LinkPreviewCard key={p.url} preview={p} />
          ))}
        </div>
      )}
    </>
  );
}

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
  onCommentTask,
  repliesByRoot,
  onOpenThread,
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
  onCommentTask?: (task: ChatTaskInfo) => void;
  /** Respostas de cada mensagem-raiz (`reply_to_id`), pra mostrar o resumo
   * "N respostas" embaixo da mensagem original — nunca despejadas soltas
   * no fluxo principal (Fase 5: painel de thread). */
  repliesByRoot?: Map<string, ChatMessage[]>;
  onOpenThread?: (rootId: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // Posição de rolagem por conversa (o próprio `scrollRef` é reaproveitado
  // entre trocas de conversa — `MessageList` não remonta — então sem isso
  // toda troca "esquecia" onde a pessoa tinha parado de ler).
  const scrollPositions = useRef<Map<string, number>>(new Map());
  const isNearBottomRef = useRef(true);
  const [showNewMessagesPill, setShowNewMessagesPill] = useState(false);
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
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
  const prevLastMessageIdRef = useRef<string | undefined>(undefined);
  // Guarda a posição ao SAIR da conversa atual, não só ao entrar na nova —
  // sem isso, a última posição salva de uma conversa seria sempre a de
  // antes da penúltima troca, nunca a mais recente.
  useEffect(() => {
    const el = scrollRef.current;
    const positions = scrollPositions.current;
    return () => {
      if (el) positions.set(convoId, el.scrollTop);
    };
  }, [convoId]);
  useEffect(() => {
    const switchedConvo = prevConvoIdRef.current !== convoId;
    prevConvoIdRef.current = convoId;
    const el = scrollRef.current;
    if (!el) return;
    const lastMessage = messages[messages.length - 1];
    const isOwnNewMessage =
      !switchedConvo &&
      lastMessage &&
      lastMessage.id !== prevLastMessageIdRef.current &&
      lastMessage.authorId === meId;
    prevLastMessageIdRef.current = lastMessage?.id;

    if (switchedConvo) {
      setShowNewMessagesPill(false);
      const saved = scrollPositions.current.get(convoId);
      // Trocar de conversa precisa ir direto pro ponto certo, sem animação —
      // e mais de uma vez, porque avatares/anexos ainda carregando mudam a
      // altura do conteúdo depois desse primeiro scroll (senão parava "no
      // meio", antes do conteúdo terminar de renderizar).
      const scroll = () => {
        if (saved != null) el.scrollTop = saved;
        else el.scrollTo({ top: el.scrollHeight, behavior: "auto" });
      };
      scroll();
      isNearBottomRef.current = saved == null || el.scrollHeight - saved - el.clientHeight < 120;
      const raf = requestAnimationFrame(scroll);
      const timeout = window.setTimeout(scroll, 150);
      return () => {
        cancelAnimationFrame(raf);
        window.clearTimeout(timeout);
      };
    }

    // Mensagem nova na MESMA conversa: só acompanha automaticamente se a
    // pessoa já estava perto do fim, ou se a mensagem nova é dela mesma
    // (mandou agora) — se estiver lendo mensagens antigas, não arranca a
    // leitura de volta pro fim; só avisa com o botão "Novas mensagens".
    if (isNearBottomRef.current || isOwnNewMessage) {
      el.scrollTo({ top: el.scrollHeight, behavior: prefersReducedMotion ? "auto" : "smooth" });
      setShowNewMessagesPill(false);
    } else if (lastMessage?.authorId !== meId) {
      setShowNewMessagesPill(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, convoId]);

  // Paginação por cursor (Fase 2): ao chegar perto do topo do histórico já
  // carregado, busca a próxima página de mensagens mais antigas. Preserva a
  // posição de leitura ajustando `scrollTop` pela diferença de altura ANTES
  // de o React re-renderizar — sem isso, inserir conteúdo acima do que já
  // está na tela empurra tudo pra baixo e a pessoa perde o lugar onde
  // estava lendo (item explícito do pedido: "manter posição ao inserir
  // mensagens antigas").
  const loadingOlderRef = useRef(false);
  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isNearBottomRef.current = distanceFromBottom < 120;
    if (isNearBottomRef.current) setShowNewMessagesPill(false);
    scrollPositions.current.set(convoId, el.scrollTop);

    if (el.scrollTop < 200 && !loadingOlderRef.current && hasMoreOlderMessages(convoId)) {
      loadingOlderRef.current = true;
      const prevScrollHeight = el.scrollHeight;
      const prevScrollTop = el.scrollTop;
      void loadOlderMessages(convoId).finally(() => {
        requestAnimationFrame(() => {
          const grown = el.scrollHeight - prevScrollHeight;
          el.scrollTop = prevScrollTop + grown;
          loadingOlderRef.current = false;
        });
      });
    }
  };

  const scrollToBottom = () => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: prefersReducedMotion ? "auto" : "smooth" });
    setShowNewMessagesPill(false);
  };
  const jumpToMessage = (id: string) => {
    const el = document.getElementById(`msg-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "center" });
    setHighlightedId(id);
    window.setTimeout(() => setHighlightedId((cur) => (cur === id ? null : cur)), 1500);
  };
  const otherReadAt = isDm && otherUserId ? getOtherReadAt(convoId, otherUserId) : 0;
  const otherDeliveredAt = isDm && otherUserId ? getOtherDeliveredAt(convoId, otherUserId) : 0;

  if (messages.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-8">
        <p className="text-xs text-muted-foreground">Nenhuma mensagem ainda. Diga olá!</p>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 md:px-8"
      >
        <div className="mx-auto w-full max-w-full md:max-w-5xl">
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
                                <span className="text-[10px] opacity-60">
                                  {fmtTime(gm.createdAt)}
                                </span>
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
                          kind === "answered"
                            ? "cursor-pointer hover:bg-muted/30"
                            : "cursor-default"
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
                          <span
                            className="h-1 w-1 rounded-full bg-amber-500/70"
                            aria-hidden="true"
                          />
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
                  className={`message-row group relative grid w-full grid-cols-[40px_minmax(0,1fr)] gap-3 rounded-md px-5 py-1.5 transition-colors duration-500 hover:bg-muted/30 ${grouped ? "mt-0.5" : "mt-3"} ${highlightedId === m.id ? "bg-sky-500/10" : ""}`}
                >
                  <div className="w-10 shrink-0">
                    {!grouped && (
                      <MessageAvatar
                        photo={m.authorPhoto}
                        name={m.authorName}
                        className="h-10 w-10"
                      />
                    )}
                  </div>
                  {/* `message-main`: nunca alinha à direita, nunca troca de eixo
                   * pra mensagem própria — a diferença entre autores é
                   * comunicada só por avatar/nome/horário/cor do nome/estado de
                   * envio, nunca pela posição da linha (ver auditoria da Fase
                   * 1: antes disso, `mine ? "md:flex-row-reverse" : ""` +
                   * `mine ? "md:items-end" : ""` invertiam mensagens próprias
                   * pra direita a partir do breakpoint `md`, o padrão de
                   * mensageiro que este redesign elimina). */}
                  <div className="message-main flex min-w-0 flex-col items-start">
                    {!grouped && (
                      <div className="mb-1 flex items-baseline gap-2">
                        <span
                          className={`text-xs font-semibold ${mine ? "text-brand" : "text-foreground"}`}
                        >
                          {m.authorName}
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
                              <span className="line-clamp-1 break-words">
                                {messagePreviewLabel(original)}
                              </span>
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
                      <div className="message-content flex w-full max-w-[760px] flex-col items-start gap-1.5 break-words [overflow-wrap:anywhere]">
                        {m.text && (
                          <MessageBody
                            text={m.text}
                            mentions={m.mentions}
                            onOpenMention={onOpenMention}
                            editedAt={m.editedAt}
                          />
                        )}
                        {onOpenTask &&
                          taskMentionsOf(m.mentions, taskInfoById).map((task) => (
                            <TaskMentionCard
                              key={task.id}
                              task={task}
                              onOpen={onOpenTask}
                              onComment={onCommentTask}
                            />
                          ))}
                        {m.attachments && m.attachments.length > 0 && (
                          <AttachmentList message={m} attachments={m.attachments} />
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
                    {!editing &&
                      onOpenThread &&
                      (() => {
                        const replies = repliesByRoot?.get(m.id);
                        if (!replies || replies.length === 0) return null;
                        const lastReply = replies[replies.length - 1];
                        const repliers = Array.from(
                          new Map(replies.map((r) => [r.authorId, r])).values(),
                        ).slice(-3);
                        return (
                          <button
                            type="button"
                            onClick={() => onOpenThread(m.id)}
                            className="mt-1.5 flex items-center gap-2 rounded-md px-1.5 py-1 text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                          >
                            <span className="flex -space-x-1.5">
                              {repliers.map((r) => (
                                <MessageAvatar
                                  key={r.authorId}
                                  photo={r.authorPhoto}
                                  name={r.authorName}
                                  className="h-5 w-5 border border-background text-[9px]"
                                />
                              ))}
                            </span>
                            <span className="font-medium text-brand">
                              {replies.length} {replies.length === 1 ? "resposta" : "respostas"}
                            </span>
                            <span>
                              Última{" "}
                              {new Date(lastReply.createdAt).toLocaleTimeString("pt-BR", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </button>
                        );
                      })()}
                    {!editing && mine && isDm && lastOfGroup && (
                      <div className="mt-0.5 flex items-center gap-1">
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
                            <div
                              className="fixed inset-0 z-30"
                              onClick={() => setPickerFor(null)}
                            />
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
                        onClick={() =>
                          onOpenThread ? onOpenThread(m.replyToId ?? m.id) : onReply(m)
                        }
                        aria-label="Responder em thread"
                        title="Responder em thread"
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <Reply className="h-3 w-3" />
                      </button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            aria-label="Mais opções"
                            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            <MoreHorizontal className="h-3 w-3" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              const url = new URL(window.location.href);
                              url.searchParams.set("msg", m.id);
                              void navigator.clipboard.writeText(url.toString());
                            }}
                          >
                            <Copy className="h-3.5 w-3.5" /> Copiar link
                          </DropdownMenuItem>
                          {mine && (
                            <>
                              <DropdownMenuItem onClick={() => setEditingId(m.id)}>
                                <Pencil className="h-3.5 w-3.5" /> Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => onDelete(m.id)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="h-3.5 w-3.5" /> Excluir
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
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
      </div>
      {showNewMessagesPill && (
        <button
          type="button"
          onClick={scrollToBottom}
          className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-brand px-3 py-1.5 text-xs font-medium text-brand-foreground shadow-lg hover:bg-brand-hover"
        >
          Novas mensagens ↓
        </button>
      )}
    </div>
  );
}

/** Painel de thread (Fase 5) — abre à direita no desktop (`Sheet` já
 * usado em outros pontos da plataforma) e ocupa a tela inteira no mobile
 * (`w-full`, sem `sm:max-w-*`), com botão de voltar embutido no cabeçalho
 * do próprio `SheetContent`. Mostra a mensagem original fixa no topo e as
 * respostas abaixo, num compositor PRÓPRIO — nunca mistura com o
 * compositor do canal principal. Renderização das mensagens é
 * deliberadamente mais simples que `MessageList` (sem reações/edição
 * inline aqui) pra caber no tempo desta fase; anexos continuam
 * aparecendo, já que são comuns em resposta de thread. */
function ThreadPanel({
  root,
  replies,
  meId,
  convoId,
  onOpenMention,
  onClose,
}: {
  root: ChatMessage | null;
  replies: ChatMessage[];
  meId: string;
  convoId: string;
  onOpenMention: (m: ChatMention) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [replies.length]);

  if (!root) return null;

  const participantIds = Array.from(new Set(replies.map((r) => r.authorId)));

  const submit = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      await sendMessageDb({ convoId, text: trimmed, replyToId: root.id });
      setText("");
    } finally {
      setSending(false);
    }
  };

  const renderMini = (m: ChatMessage, isRoot: boolean) => (
    <div key={m.id} className={`flex gap-2.5 px-4 py-2 ${isRoot ? "" : "hover:bg-muted/30"}`}>
      <div className="h-8 w-8 shrink-0">
        <MessageAvatar photo={m.authorPhoto} name={m.authorName} className="h-8 w-8 text-xs" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span
            className={`text-xs font-semibold ${m.authorId === meId ? "text-brand" : "text-foreground"}`}
          >
            {m.authorName}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {new Date(m.createdAt).toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
        {m.text && (
          <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
            {renderText(m.text, m.mentions, onOpenMention)}
          </p>
        )}
        {m.attachments && m.attachments.length > 0 && (
          <div className="mt-1.5">
            <AttachmentList message={m} attachments={m.attachments} />
          </div>
        )}
      </div>
    </div>
  );

  return (
    <Sheet open={!!root} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
      >
        <SheetHeader className="shrink-0 border-b border-border px-4 py-3">
          <SheetTitle className="text-sm font-semibold">Thread</SheetTitle>
          <p className="text-xs text-muted-foreground">
            {participantIds.length > 0
              ? `${participantIds.length} participante${participantIds.length > 1 ? "s" : ""} · ${replies.length} ${replies.length === 1 ? "resposta" : "respostas"}`
              : "Nenhuma resposta ainda"}
          </p>
        </SheetHeader>
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
          {renderMini(root, true)}
          <div className="mx-4 my-1 border-t border-border/60" />
          {replies.map((r) => renderMini(r, false))}
        </div>
        <div className="shrink-0 border-t border-border p-3">
          <div className="flex items-end gap-2 rounded-lg border border-border bg-background px-2 py-1.5 focus-within:ring-2 focus-within:ring-ring">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void submit();
                }
              }}
              placeholder="Responder na thread..."
              rows={1}
              className="max-h-32 min-h-8 flex-1 resize-none bg-transparent text-sm outline-none"
            />
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!text.trim() || sending}
              className="shrink-0 rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-brand-foreground hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              Enviar
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Painel de informações (Fase 9, parcial) — participantes e arquivos
 * compartilhados na conversa aberta. Ver comentário em `showInfo` (no
 * componente principal) pro que ficou de fora desta fase. */
function InfoPanel({
  open,
  onClose,
  participants,
  sharedFiles,
}: {
  open: boolean;
  onClose: () => void;
  participants: { id: string; name: string; photo?: string }[];
  sharedFiles: { message: ChatMessage; attachment: ChatAttachment }[];
}) {
  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-sm"
      >
        <SheetHeader className="shrink-0 border-b border-border px-4 py-3">
          <SheetTitle className="text-sm font-semibold">Informações</SheetTitle>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Participantes · {participants.length}
            </p>
            <ul className="mt-2 space-y-1">
              {participants.map((p) => (
                <li key={p.id} className="flex items-center gap-2.5 rounded-md px-1.5 py-1.5">
                  {p.photo ? (
                    <img src={p.photo} alt="" className="h-7 w-7 rounded-full object-cover" />
                  ) : (
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
                      {p.name.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <span className="truncate text-sm text-foreground">{p.name}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="mt-5 border-t border-border/60 pt-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Arquivos compartilhados · {sharedFiles.length}
            </p>
            {sharedFiles.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">Nenhum arquivo nesta conversa.</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {sharedFiles.map(({ message, attachment }) => (
                  <li key={`${message.id}-${attachment.path}`}>
                    <a
                      href={attachment.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 rounded-md px-1.5 py-1.5 text-xs text-foreground hover:bg-muted/50"
                    >
                      <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{attachment.name}</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
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

/** Comandos de barra (pedido, seção 17). */
const SLASH_COMMANDS: { cmd: string; label: string; hint: string }[] = [
  { cmd: "/tarefa", label: "/tarefa", hint: "Criar uma tarefa" },
  { cmd: "/reuniao", label: "/reunião", hint: "Ver a agenda de reuniões" },
  { cmd: "/lembrete", label: "/lembrete", hint: "Criar um lembrete" },
];

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
  seed,
  onSeedConsumed,
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
  seed?: string | null;
  onSeedConsumed?: () => void;
}) {
  // Rascunho por conversa (pedido, seção "Comportamento") — `Composer` já
  // remonta a cada troca de conversa (`key={activeId}` no call site), então
  // basta ler o rascunho salvo na inicialização do estado; salvar em cada
  // troca é feito no `useEffect` abaixo, e o envio limpa a chave.
  const draftKey = `chat:draft:${convoId}`;
  const [value, setValue] = useState(() => {
    if (seed) return seed;
    try {
      return localStorage.getItem(draftKey) ?? "";
    } catch {
      return "";
    }
  });
  useEffect(() => {
    if (seed) {
      setValue((v) => v + seed);
      onSeedConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);
  useEffect(() => {
    try {
      if (value.trim()) localStorage.setItem(draftKey, value);
      else localStorage.removeItem(draftKey);
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const [pending, setPending] = useState<ChatAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  /** `true` quando conseguiu tratar como comando — quem chama nunca
   * envia o texto original como mensagem normal nesse caso. */
  const runSlashCommand = (text: string): boolean => {
    const match = /^\/(\w+)\s*(.*)$/s.exec(text);
    if (!match) return false;
    const [, cmd] = match;
    if (cmd === "tarefa") {
      return true;
    }
    if (cmd === "lembrete") {
      return true;
    }
    if (cmd === "reuniao" || cmd === "reunião") {
      navigate({ to: "/time", search: { section: "reunioes" satisfies SectionKey } });
      return true;
    }
    return false;
  };
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
    if (runSlashCommand(value.trim())) {
      setValue("");
      return;
    }
    onSend(value, extractUsedMentions(value, options), pending);
    setValue("");
    setPending([]);
  };

  const slashMatch = /^\/(\w*)$/.exec(value);
  const slashSuggestions = slashMatch
    ? SLASH_COMMANDS.filter((c) => c.cmd.slice(1).startsWith(slashMatch[1].toLowerCase()))
    : [];

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
    <div className="shrink-0 border-t border-border p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:px-8 md:py-4">
      <div className="mx-auto w-full max-w-full md:max-w-5xl">
        {replyingTo && (
          <div className="mb-2 flex items-start gap-2 rounded-md border border-border bg-muted/40 px-2 py-1.5 text-xs">
            <Reply className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <span className="font-medium">{replyingTo.authorName}</span>{" "}
              <span className="line-clamp-1 break-words text-muted-foreground">
                {messagePreviewLabel(replyingTo)}
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
            {pending.map((a) => (
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
            ))}
          </div>
        )}
        {voiceMode ? (
          <VoiceRecorderBar
            convoId={convoId}
            replyToId={replyingTo?.id}
            onDone={() => setVoiceMode(false)}
            onSent={() => {
              setVoiceMode(false);
              onCancelReply();
            }}
          />
        ) : (
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
            <div className="relative">
              <button
                type="button"
                onClick={() => setEmojiOpen((v) => !v)}
                disabled={uploading}
                aria-label="Inserir emoji"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
              >
                <Smile className="h-4 w-4" />
              </button>
              {emojiOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setEmojiOpen(false)} />
                  <div className="absolute bottom-full left-0 z-40 mb-1 flex max-w-56 flex-wrap gap-0.5 rounded-md border border-border bg-background p-1.5 shadow-lg">
                    {REACTION_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => {
                          setValue((v) => v + emoji);
                          setEmojiOpen(false);
                        }}
                        className="rounded p-1 text-base hover:bg-muted"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={() => setVoiceMode(true)}
              disabled={uploading}
              aria-label="Gravar mensagem de voz"
              className="inline-flex h-8 items-center justify-center gap-1 rounded-md px-2 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
            >
              <Mic className="h-4 w-4" />
            </button>
            <div className="relative min-w-0 flex-1">
              {slashSuggestions.length > 0 && (
                <div className="absolute bottom-full left-0 z-40 mb-1 w-56 rounded-md border border-border bg-background p-1 shadow-lg">
                  {slashSuggestions.map((c) => (
                    <button
                      key={c.cmd}
                      type="button"
                      onClick={() => {
                        if (c.cmd === "/reuniao") {
                          runSlashCommand(c.cmd.slice(1));
                          setValue("");
                        } else {
                          setValue(c.cmd + " ");
                        }
                      }}
                      className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                    >
                      <span className="font-medium text-foreground">{c.label}</span>
                      <span className="text-muted-foreground">{c.hint}</span>
                    </button>
                  ))}
                </div>
              )}
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
            </div>
            <button
              onClick={submit}
              disabled={(!value.trim() && pending.length === 0) || uploading}
              aria-label="Enviar"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand text-brand-foreground hover:bg-brand-hover disabled:opacity-40"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        {!voiceMode && (
          <p className="mt-1 flex items-center gap-1 px-1 text-[10px] text-muted-foreground">
            <AtSign className="h-3 w-3" /> mencione tarefas{allowUserMentions ? " e pessoas" : ""}{" "}
            com @ • Enter envia
            {uploading && <span className="ml-2">• enviando anexo...</span>}
          </p>
        )}
      </div>
    </div>
  );
}
