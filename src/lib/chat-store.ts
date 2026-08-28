import { useSyncExternalStore } from "react";
import { loadProjetos, type Project } from "./projetos";
import { supabase } from "@/integrations/supabase/client";

export type ChatMember = {
  id: string;
  name: string;
  photo?: string;
  role?: string;
  email?: string;
  isAdmin?: boolean;
};

export type ChatChannel = {
  id: string; // "c:<uuid>"
  name: string;
  createdAt: number;
  private?: boolean;
  photo?: string;
  allowedMemberIds?: string[];
  sortOrder?: number;
};

export type MemberStatus = "online" | "away" | "offline";
export const STATUS_COLOR: Record<MemberStatus, string> = {
  online: "bg-emerald-500",
  away: "bg-amber-500",
  offline: "bg-muted-foreground/50",
};
export const STATUS_LABEL: Record<MemberStatus, string> = {
  online: "Disponível",
  away: "Ausente",
  offline: "Offline",
};

export type ChatMention = {
  kind: "task" | "user" | "project" | "campaign" | "client";
  id: string;
  label: string;
};

export type ChatAttachment = {
  path: string; // storage path in the chat-attachments bucket
  url: string; // signed URL for viewing/downloading
  name: string;
  size: number;
  type: string; // MIME type
};

export type ChatMessage = {
  id: string;
  convoId: string;
  authorId: string;
  authorName: string;
  authorPhoto?: string;
  text: string;
  createdAt: number;
  editedAt?: number;
  mentions?: ChatMention[];
  attachments?: ChatAttachment[];
  /** emoji -> user ids who reacted with it */
  reactions?: Record<string, string[]>;
  replyToId?: string;
};

export const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"] as const;

const MEMBERS_KEY = "time:membros";
const ME_KEY = "chat:me";
const ACTIVE_KEY = "chat:active";

// ---------- Subscription bus ----------
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
export function subscribeChat(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

// ---------- LocalStorage helpers (for members/me/active only) ----------
function read<T>(k: string, f: T): T {
  try {
    const raw = localStorage.getItem(k);
    return raw ? (JSON.parse(raw) as T) : f;
  } catch {
    return f;
  }
}
function write<T>(k: string, v: T) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}

export function loadMembers(): ChatMember[] {
  return read<ChatMember[]>(MEMBERS_KEY, []);
}
export function getMe(): ChatMember {
  const existing = read<ChatMember | null>(ME_KEY, null);
  if (existing) return existing;
  const me: ChatMember = { id: "me", name: "Você" };
  write(ME_KEY, me);
  return me;
}
export function saveMe(m: ChatMember) {
  write(ME_KEY, m);
  emit();
}

export function dmId(a: string, b: string) {
  return "dm:" + [a, b].sort().join("|");
}

export function getActive(): string {
  return read<string>(ACTIVE_KEY, "");
}
export function setActive(id: string) {
  write(ACTIVE_KEY, id);
  markRead(id);
  emit();
}

// ---------- Supabase-backed caches ----------
let channelsCache: ChatChannel[] = [];
let messagesCache: ChatMessage[] = [];
let lastReadCache: Record<string, number> = {};
let allReadsCache: Record<string, Record<string, number>> = {};
/** Marca de ENTREGA por (convo, usuário) — carimbada automaticamente
 * quando o cliente de alguém recebe uma mensagem nova via realtime, antes
 * mesmo de a pessoa abrir a conversa. Distinta de `allReadsCache`, que só
 * avança quando a pessoa efetivamente abre/olha a conversa. */
let allDeliveriesCache: Record<string, Record<string, number>> = {};
// Guarda o status "cru" (o que a pessoa escolheu, ou "online" por padrão) mais
// o horário do último heartbeat — `getStatus` deriva o status exibido a partir
// disso, então quem fecha a aba (ou perde conexão) automaticamente vira
// "offline" depois de `HEARTBEAT_STALE_MS`, em vez de ficar preso no último
// valor gravado pra sempre.
let statusCache: Record<string, { status: MemberStatus; updatedAt: number }> = {};
const HEARTBEAT_STALE_MS = 90_000; // hydrate() manda heartbeat a cada 30s

let initPromise: Promise<void> | null = null;
let currentUserId: string | null = null;
let realtimeStarted = false;

type ChannelRow = {
  id: string;
  name: string;
  is_private: boolean;
  photo: string | null;
  allowed_member_ids: string[] | null;
  sort_order: number;
  created_at: string;
};
type MessageRow = {
  id: string;
  convo_id: string;
  author_id: string | null;
  author_name: string;
  author_photo: string | null;
  text: string;
  mentions: unknown;
  attachments?: unknown;
  reactions?: unknown;
  reply_to_id?: string | null;
  created_at: string;
  edited_at: string | null;
};

const MESSAGE_COLUMNS =
  "id,convo_id,author_id,author_name,author_photo,text,mentions,attachments,reactions,reply_to_id,created_at,edited_at";
type ReadRow = { convo_id: string; last_read_at: string };
type StatusRow = { user_id: string; status: string; updated_at: string };

function mapChannel(r: ChannelRow): ChatChannel {
  return {
    id: "c:" + r.id,
    name: r.name,
    createdAt: new Date(r.created_at).getTime(),
    private: r.is_private,
    photo: r.photo ?? undefined,
    allowedMemberIds: r.allowed_member_ids ?? [],
    sortOrder: r.sort_order,
  };
}
function mapMessage(r: MessageRow): ChatMessage {
  const mentions = Array.isArray(r.mentions) ? (r.mentions as ChatMention[]) : [];
  const attachments = Array.isArray(r.attachments) ? (r.attachments as ChatAttachment[]) : [];
  const reactions =
    r.reactions && typeof r.reactions === "object" && !Array.isArray(r.reactions)
      ? (r.reactions as Record<string, string[]>)
      : {};
  return {
    id: r.id,
    convoId: r.convo_id,
    authorId: r.author_id ?? "system",
    authorName: r.author_name,
    authorPhoto: r.author_photo ?? undefined,
    text: r.text,
    createdAt: new Date(r.created_at).getTime(),
    editedAt: r.edited_at ? new Date(r.edited_at).getTime() : undefined,
    mentions,
    attachments,
    reactions,
    replyToId: r.reply_to_id ?? undefined,
  };
}

async function reloadChannels() {
  const { data } = await supabase
    .from("chat_channels")
    .select("id,name,is_private,photo,allowed_member_ids,sort_order,created_at")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  channelsCache = (data ?? []).map((r) => mapChannel(r as ChannelRow));
  emit();
}
async function reloadMessages() {
  const { data } = await supabase
    .from("chat_messages")
    .select(MESSAGE_COLUMNS)
    .order("created_at", { ascending: true })
    .limit(5000);
  messagesCache = (data ?? []).map((r) => mapMessage(r as MessageRow));
  emit();
}
async function reloadReads(uid: string) {
  const { data } = await supabase
    .from("chat_reads")
    .select("convo_id,last_read_at")
    .eq("user_id", uid);
  const next: Record<string, number> = {};
  for (const r of (data ?? []) as ReadRow[]) {
    next[r.convo_id] = new Date(r.last_read_at).getTime();
  }
  lastReadCache = next;
  emit();
}
/** All users' read markers (needed for per-message "seen" receipts in DMs). */
async function reloadAllReads() {
  const { data } = await supabase.from("chat_reads").select("convo_id,user_id,last_read_at");
  const next: Record<string, Record<string, number>> = {};
  for (const r of (data ?? []) as (ReadRow & { user_id: string })[]) {
    (next[r.convo_id] ??= {})[r.user_id] = new Date(r.last_read_at).getTime();
  }
  allReadsCache = next;
  emit();
}
/** All users' delivery markers (needed for per-message "entregue" receipts in DMs). */
async function reloadAllDeliveries() {
  const { data } = await supabase
    .from("chat_deliveries")
    .select("convo_id,user_id,last_delivered_at");
  const next: Record<string, Record<string, number>> = {};
  for (const r of (data ?? []) as {
    convo_id: string;
    user_id: string;
    last_delivered_at: string;
  }[]) {
    (next[r.convo_id] ??= {})[r.user_id] = new Date(r.last_delivered_at).getTime();
  }
  allDeliveriesCache = next;
  emit();
}
async function reloadStatuses() {
  const { data } = await supabase.from("chat_status").select("user_id,status,updated_at");
  const next: Record<string, { status: MemberStatus; updatedAt: number }> = {};
  for (const r of (data ?? []) as StatusRow[]) {
    const s = r.status as MemberStatus;
    if (s === "online" || s === "away" || s === "offline") {
      next[r.user_id] = { status: s, updatedAt: new Date(r.updated_at).getTime() };
    }
  }
  statusCache = next;
  emit();
}

export async function initChatSync(userId: string) {
  if (currentUserId === userId && initPromise) return initPromise;
  currentUserId = userId;
  initPromise = (async () => {
    await Promise.all([
      reloadChannels(),
      reloadMessages(),
      reloadReads(userId),
      reloadAllReads(),
      reloadAllDeliveries(),
      reloadStatuses(),
    ]);
    if (realtimeStarted) return;
    realtimeStarted = true;
    // `getStatus` deriva "offline" a partir do tempo decorrido desde o último
    // heartbeat — sem isso, o ponto de presença só re-renderiza quando chega
    // uma mudança real (mensagem, etc), então alguém que fechou a aba ficaria
    // "online" na tela até a próxima ação de qualquer pessoa no chat.
    window.setInterval(() => emit(), 20_000);
    supabase
      .channel("rt-chat-channels")
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_channels" }, () => {
        void reloadChannels();
      })
      .subscribe();
    supabase
      .channel("rt-chat-messages")
      // Patch the cache in place instead of re-fetching all 5000 rows on every
      // change — with a full reload here, sending or receiving a single
      // message paid for both the insert round-trip AND a full-table refetch,
      // which is what made the chat feel like it was "loading" every time.
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages" },
        (payload) => {
          const mapped = mapMessage(payload.new as MessageRow);
          if (messagesCache.some((m) => m.id === mapped.id)) return; // already applied optimistically
          messagesCache = [...messagesCache, mapped].sort((a, b) => a.createdAt - b.createdAt);
          emit();
          // "Entregue" = meu cliente recebeu a mensagem via realtime, mesmo
          // sem eu ter aberto a conversa ainda — dispara pra qualquer DM da
          // qual eu faço parte (nunca pra mensagem minha própria, nem pra
          // canais, que não têm recibo de entrega implementado).
          if (
            currentUserId &&
            mapped.authorId !== currentUserId &&
            mapped.convoId.startsWith("dm:") &&
            mapped.convoId.slice(3).split("|").includes(currentUserId)
          ) {
            void markDelivered(mapped.convoId);
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "chat_messages" },
        (payload) => {
          const mapped = mapMessage(payload.new as MessageRow);
          messagesCache = messagesCache.map((m) => (m.id === mapped.id ? mapped : m));
          emit();
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "chat_messages" },
        (payload) => {
          const oldRow = payload.old as { id?: string } | null;
          if (!oldRow?.id) return;
          messagesCache = messagesCache.filter((m) => m.id !== oldRow.id);
          emit();
        },
      )
      .subscribe();
    supabase
      .channel("rt-chat-status")
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_status" }, () => {
        void reloadStatuses();
      })
      .subscribe();
    supabase
      .channel("rt-chat-reads")
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_reads" }, () => {
        void reloadAllReads();
        if (currentUserId) void reloadReads(currentUserId);
      })
      .subscribe();
    supabase
      .channel("rt-chat-deliveries")
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_deliveries" }, () => {
        void reloadAllDeliveries();
      })
      .subscribe();
    ensureTypingChannel();
  })();
  return initPromise;
}

// ---------- Public sync getters ----------
export function loadChannels(): ChatChannel[] {
  return channelsCache;
}
export function loadMessages(): ChatMessage[] {
  return messagesCache;
}
export function loadStatuses(): Record<string, MemberStatus> {
  const out: Record<string, MemberStatus> = {};
  for (const id of Object.keys(statusCache)) out[id] = getStatus(id);
  return out;
}
export function getStatus(id: string): MemberStatus {
  const row = statusCache[id];
  if (!row) return "offline";
  if (Date.now() - row.updatedAt > HEARTBEAT_STALE_MS) return "offline";
  return row.status === "away" ? "away" : "online";
}

// ---------- Mutations ----------
export async function createChannel(input: {
  name: string;
  private?: boolean;
  photo?: string;
  allowedMemberIds?: string[];
}): Promise<ChatChannel | null> {
  const maxSort = channelsCache.reduce((m, c) => Math.max(m, c.sortOrder ?? 0), 0);
  const { data, error } = await supabase
    .from("chat_channels")
    .insert({
      name: input.name,
      is_private: !!input.private,
      photo: input.photo ?? null,
      allowed_member_ids: input.allowedMemberIds ?? [],
      sort_order: maxSort + 1,
    })
    .select("id,name,is_private,photo,allowed_member_ids,sort_order,created_at")
    .single();
  if (error || !data) return null;
  const mapped = mapChannel(data as ChannelRow);
  channelsCache = [...channelsCache, mapped].sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
  );
  emit();
  return mapped;
}

export async function updateChannel(
  id: string,
  patch: { name?: string; private?: boolean; photo?: string; allowedMemberIds?: string[] },
) {
  const uuid = id.startsWith("c:") ? id.slice(2) : id;
  const payload: {
    name?: string;
    is_private?: boolean;
    photo?: string | null;
    allowed_member_ids?: string[];
  } = {};
  if (patch.name !== undefined) payload.name = patch.name;
  if (patch.private !== undefined) payload.is_private = patch.private;
  if (patch.photo !== undefined) payload.photo = patch.photo ?? null;
  if (patch.allowedMemberIds !== undefined) payload.allowed_member_ids = patch.allowedMemberIds;
  await supabase.from("chat_channels").update(payload).eq("id", uuid);
  channelsCache = channelsCache.map((c) =>
    c.id === id
      ? {
          ...c,
          name: patch.name ?? c.name,
          private: patch.private ?? c.private,
          photo: patch.photo ?? c.photo,
          allowedMemberIds: patch.allowedMemberIds ?? c.allowedMemberIds,
        }
      : c,
  );
  emit();
}

export async function deleteChannel(id: string) {
  const uuid = id.startsWith("c:") ? id.slice(2) : id;
  await supabase.from("chat_messages").delete().eq("convo_id", id);
  await supabase.from("chat_channels").delete().eq("id", uuid);
  channelsCache = channelsCache.filter((c) => c.id !== id);
  messagesCache = messagesCache.filter((m) => m.convoId !== id);
  emit();
}

export async function reorderChannels(ids: string[]) {
  const updates = ids.map((id, i) => ({
    id: id.startsWith("c:") ? id.slice(2) : id,
    sort_order: i,
  }));
  // apply cache immediately
  const map = new Map(channelsCache.map((c) => [c.id, c]));
  const next: ChatChannel[] = [];
  ids.forEach((id, i) => {
    const c = map.get(id);
    if (c) next.push({ ...c, sortOrder: i });
  });
  channelsCache = next;

  emit();
  for (const u of updates) {
    await supabase.from("chat_channels").update({ sort_order: u.sort_order }).eq("id", u.id);
  }
}

export async function sendMessage(input: {
  convoId: string;
  text: string;
  mentions?: ChatMention[];
  attachments?: ChatAttachment[];
  system?: boolean;
  replyToId?: string;
}): Promise<ChatMessage | null> {
  const me = getMe();
  const authorId = input.system ? null : (currentUserId ?? (me.id === "me" ? null : me.id));
  if (!input.system && !authorId) return null;
  const authorName = input.system ? "Sistema" : me.name;
  const authorPhoto = input.system ? null : (me.photo ?? null);

  // Show the message immediately instead of waiting for the insert to round-trip.
  const tempId = `temp:${crypto.randomUUID()}`;
  const optimistic: ChatMessage = {
    id: tempId,
    convoId: input.convoId,
    authorId: authorId ?? "system",
    authorName,
    authorPhoto: authorPhoto ?? undefined,
    text: input.text,
    createdAt: Date.now(),
    mentions: input.mentions ?? [],
    attachments: input.attachments ?? [],
    reactions: {},
    replyToId: input.replyToId,
  };
  messagesCache = [...messagesCache, optimistic];
  emit();

  const { data, error } = await supabase
    .from("chat_messages")
    .insert({
      convo_id: input.convoId,
      author_id: authorId,
      author_name: authorName,
      author_photo: authorPhoto,
      text: input.text,
      mentions: (input.mentions ?? []) as unknown as never,
      attachments: (input.attachments ?? []) as unknown as never,
      reply_to_id: input.replyToId ?? null,
    })
    .select(MESSAGE_COLUMNS)
    .single();
  if (error || !data) {
    messagesCache = messagesCache.filter((m) => m.id !== tempId);
    emit();
    return null;
  }
  const mapped = mapMessage(data as MessageRow);
  messagesCache = messagesCache.map((m) => (m.id === tempId ? mapped : m));
  emit();
  if (!input.system) void triggerChatPush(mapped);
  return mapped;
}

/** Best-effort: dispara a notificação push (celular/desktop) de quem deveria
 * ser avisado desta mensagem. Nunca deve travar/quebrar o envio do chat, por
 * isso é sempre "void" no call site e engole qualquer erro aqui. */
async function triggerChatPush(message: ChatMessage) {
  try {
    const { sendChatPush } = await import("./push.functions");
    await sendChatPush({
      data: {
        convoId: message.convoId,
        text: message.text,
        authorName: message.authorName,
        mentionedUserIds: (message.mentions ?? [])
          .filter((m) => m.kind === "user")
          .map((m) => m.id),
      },
    });
  } catch (err) {
    console.warn("[chat] push notification failed", err);
  }
}

export async function editMessage(id: string, text: string, mentions: ChatMention[]) {
  const { data } = await supabase
    .from("chat_messages")
    .update({
      text,
      mentions: mentions as unknown as never,
      edited_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select(MESSAGE_COLUMNS)
    .single();
  if (data) {
    const mapped = mapMessage(data as MessageRow);
    messagesCache = messagesCache.map((m) => (m.id === id ? mapped : m));
    emit();
  }
}

/** Toggle the current user's reaction with `emoji` on message `id`. */
export async function toggleReaction(id: string, emoji: string) {
  const uid = currentUserId;
  if (!uid) return;
  const msg = messagesCache.find((m) => m.id === id);
  if (!msg) return;
  const reactions: Record<string, string[]> = { ...(msg.reactions ?? {}) };
  const current = reactions[emoji] ?? [];
  const has = current.includes(uid);
  const nextUsers = has ? current.filter((u) => u !== uid) : [...current, uid];
  if (nextUsers.length > 0) reactions[emoji] = nextUsers;
  else delete reactions[emoji];

  // optimistic update
  messagesCache = messagesCache.map((m) => (m.id === id ? { ...m, reactions } : m));
  emit();

  // Reagir a uma mensagem de outra pessoa não passa pela RLS de UPDATE comum
  // (restrita ao autor, para proteger edição de texto/anexos) — por isso usa
  // uma RPC dedicada que só mexe na coluna `reactions`. A confirmação real
  // chega pelo realtime (evento UPDATE), então não precisamos reconciliar o
  // retorno aqui; só revertemos o otimista se a chamada falhar de fato.
  const { error } = await supabase.rpc("toggle_message_reaction", {
    p_message_id: id,
    p_emoji: emoji,
  });
  if (error) {
    console.error("[chat] falha ao reagir", error);
    messagesCache = messagesCache.map((m) => (m.id === id ? msg : m));
    emit();
  }
}

export async function uploadChatAttachment(file: File): Promise<ChatAttachment | null> {
  const uid = currentUserId ?? (await supabase.auth.getUser()).data.user?.id;
  if (!uid) return null;
  const safeName = file.name.replace(/[^\w.-]+/g, "_");
  const path = `${uid}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;
  const { error } = await supabase.storage.from("chat-attachments").upload(path, file, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (error) {
    console.warn("[chat] upload failed", error);
    return null;
  }
  // signed URL valid for ~1 year
  const { data: signed } = await supabase.storage
    .from("chat-attachments")
    .createSignedUrl(path, 60 * 60 * 24 * 365);
  if (!signed?.signedUrl) return null;
  return {
    path,
    url: signed.signedUrl,
    name: file.name,
    size: file.size,
    type: file.type || "application/octet-stream",
  };
}

export async function deleteMessage(id: string) {
  await supabase.from("chat_messages").delete().eq("id", id);
  messagesCache = messagesCache.filter((m) => m.id !== id);
  emit();
}

// ---------- Read markers ----------
export function loadLastRead(): Record<string, number> {
  return lastReadCache;
}
/** When `userId` last read `convoId` (ms epoch), or 0 if never — powers per-message "visto" receipts. */
export function getOtherReadAt(convoId: string, userId: string): number {
  return allReadsCache[convoId]?.[userId] ?? 0;
}
export async function markRead(convoId: string) {
  if (!convoId || !currentUserId) return;
  const now = Date.now();
  lastReadCache = { ...lastReadCache, [convoId]: now };
  emit();
  await supabase
    .from("chat_reads")
    .upsert(
      { user_id: currentUserId, convo_id: convoId, last_read_at: new Date(now).toISOString() },
      { onConflict: "user_id,convo_id" },
    );
}
/** When `userId` last had `convoId` delivered to their client (ms epoch),
 * or 0 if never — powers the "entregue" (double gray check) receipt. */
export function getOtherDeliveredAt(convoId: string, userId: string): number {
  return allDeliveriesCache[convoId]?.[userId] ?? 0;
}
/** Carimba "entregue" pro usuário atual nessa conversa — chamado
 * automaticamente pelo handler de INSERT do realtime, nunca precisa ser
 * chamado manualmente pela UI. */
export async function markDelivered(convoId: string) {
  if (!convoId || !currentUserId) return;
  const now = Date.now();
  await supabase.from("chat_deliveries").upsert(
    {
      user_id: currentUserId,
      convo_id: convoId,
      last_delivered_at: new Date(now).toISOString(),
    },
    { onConflict: "user_id,convo_id" },
  );
}
export function getUnreadCount(convoId: string, messages: ChatMessage[], meId: string): number {
  const last = lastReadCache[convoId] ?? 0;
  let n = 0;
  for (const m of messages) {
    if (m.convoId === convoId && m.authorId !== meId && m.createdAt > last) n++;
  }
  return n;
}

/** Mensagem mais recente de cada conversa — pra prévia e ordenação por
 * recência da lista de conversas. */
export function getLastMessageByConvo(messages: ChatMessage[]): Map<string, ChatMessage> {
  const map = new Map<string, ChatMessage>();
  for (const m of messages) {
    const cur = map.get(m.convoId);
    if (!cur || m.createdAt > cur.createdAt) map.set(m.convoId, m);
  }
  return map;
}

export type ChatListItem = {
  id: string;
  name: string;
  photo?: string;
  kind: "channel" | "campanha" | "projeto" | "dm";
  private?: boolean;
  status?: MemberStatus;
  lastMessage?: ChatMessage;
  unread: number;
};

/** Monta a lista unificada de conversas (canais + campanhas + projetos +
 * DMs) com prévia da última mensagem e contagem de não-lidas — única fonte
 * dessa lógica, usada pela lista de conversas do Chat. Não ordena: quem
 * chama decide o agrupamento/ordenação (ex: diretas primeiro, canais
 * depois). */
export function buildChatList(args: {
  channels: ChatChannel[];
  campaignChannels: CampaignChannel[];
  projectChannels: { id: string; name: string }[];
  members: ChatMember[];
  messages: ChatMessage[];
  meId: string;
}): ChatListItem[] {
  const { channels, campaignChannels, projectChannels, members, messages, meId } = args;
  const lastMessageByConvo = getLastMessageByConvo(messages);
  const visibleChannels = channels.filter(
    (c) => !c.private || !c.allowedMemberIds || c.allowedMemberIds.includes(meId),
  );
  return [
    ...visibleChannels.map(
      (c): ChatListItem => ({
        id: c.id,
        name: c.name,
        photo: c.photo,
        kind: "channel",
        private: c.private,
        lastMessage: lastMessageByConvo.get(c.id),
        unread: getUnreadCount(c.id, messages, meId),
      }),
    ),
    ...campaignChannels.map(
      (c): ChatListItem => ({
        id: c.id,
        name: c.name,
        kind: "campanha",
        lastMessage: lastMessageByConvo.get(c.id),
        unread: getUnreadCount(c.id, messages, meId),
      }),
    ),
    ...projectChannels.map(
      (p): ChatListItem => ({
        id: p.id,
        name: p.name,
        kind: "projeto",
        lastMessage: lastMessageByConvo.get(p.id),
        unread: getUnreadCount(p.id, messages, meId),
      }),
    ),
    ...members
      .filter((m) => m.id !== meId)
      .map((m): ChatListItem => {
        const id = dmId(meId, m.id);
        return {
          id,
          name: m.name,
          photo: m.photo,
          kind: "dm",
          status: getStatus(m.id),
          lastMessage: lastMessageByConvo.get(id),
          unread: getUnreadCount(id, messages, meId),
        };
      }),
  ];
}

// ---------- Status ----------
/** Muda o status escolhido pela pessoa (online/away/offline manual). */
export async function setStatus(id: string, s: MemberStatus) {
  statusCache = { ...statusCache, [id]: { status: s, updatedAt: Date.now() } };
  emit();
  if (currentUserId && id === currentUserId) {
    await supabase
      .from("chat_status")
      .upsert(
        { user_id: id, status: s, updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
  }
}

/** Heartbeat de presença (chamado a cada 30s enquanto o app está aberto) —
 * só atualiza `updated_at`, nunca sobrescreve um status "away" escolhido
 * manualmente pela pessoa. Sem heartbeat recente, `getStatus` já deriva
 * "offline" sozinho (ver HEARTBEAT_STALE_MS). */
export async function heartbeat(id: string) {
  if (currentUserId !== id) return;
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("chat_status")
    .update({ updated_at: nowIso })
    .eq("user_id", id)
    .select("user_id");
  if (!error && (!data || data.length === 0)) {
    await supabase
      .from("chat_status")
      .insert({ user_id: id, status: "online", updated_at: nowIso });
  }
  const prevStatus = statusCache[id]?.status ?? "online";
  statusCache = { ...statusCache, [id]: { status: prevStatus, updatedAt: Date.now() } };
  emit();
}

// ---------- Notification sound ----------
const NOTIF_SOUND_URL = "/sounds/notification.mp3";
let notifAudio: HTMLAudioElement | null = null;

function getNotifAudio(): HTMLAudioElement {
  if (!notifAudio) {
    notifAudio = new Audio(NOTIF_SOUND_URL);
    notifAudio.volume = 0.6;
  }
  return notifAudio;
}

/** "Destrava" o áudio de notificação num gesto do usuário (play+pause
 * mudo, imediato) — Safari/iOS bloqueia `play()` programático sem isso
 * já ter acontecido antes numa interação real. Chamado uma vez só, no
 * mesmo gesto que já destravava o AudioContext do lembrete de reunião. */
export function primeNotifSound() {
  if (typeof window === "undefined") return;
  try {
    const audio = getNotifAudio();
    audio.muted = true;
    void audio
      .play()
      .then(() => {
        audio.pause();
        audio.currentTime = 0;
        audio.muted = false;
      })
      .catch(() => {});
  } catch {
    /* ignore */
  }
}

/** Toca o áudio gravado (ver `public/sounds/notification.mp3`) — mesma
 * instância reaproveitada a cada chamada (evita rebaixar/re-decodificar
 * o arquivo a cada notificação), reiniciada do início pra notificações
 * em sequência rápida nunca ficarem "engasgadas". */
export function playNotifSound() {
  if (typeof window === "undefined") return;
  try {
    const audio = getNotifAudio();
    audio.currentTime = 0;
    void audio.play().catch(() => {});
  } catch {
    /* ignore */
  }
}

/** Som distinto (3 notas ascendentes) pro lembrete de "reunião em 5 min" —
 * não pode ser confundido com o beep de mensagem nova. */
export function playMeetingReminderSound() {
  if (typeof window === "undefined") return;
  try {
    const AC: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    const notes = [523.25, 659.25, 783.99]; // Dó, Mi, Sol
    notes.forEach((freq, i) => {
      const start = ctx.currentTime + i * 0.16;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "triangle";
      o.frequency.setValueAtTime(freq, start);
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.2, start + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.3);
      o.connect(g).connect(ctx.destination);
      o.start(start);
      o.stop(start + 0.32);
    });
    setTimeout(() => ctx.close().catch(() => {}), notes.length * 160 + 400);
  } catch {
    /* ignore */
  }
}

// ---------- Derived channels ----------
export type CampaignChannel = { id: string; name: string; clienteId: string; empresa: string };
export function loadCampaignChannels(
  clientes: { id: string; empresa: string; campanhas?: { id: string; nome: string }[] }[],
): CampaignChannel[] {
  return clientes.flatMap((c) =>
    (c.campanhas ?? []).map((camp) => ({
      id: "camp:" + camp.id,
      name: camp.nome,
      clienteId: c.id,
      empresa: c.empresa,
    })),
  );
}
export function loadProjectChannels(): { id: string; name: string }[] {
  return loadProjetos().map((p: Project) => ({ id: "proj:" + p.id, name: p.name }));
}

// ---------- External event bridges ----------
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === MEMBERS_KEY || e.key === ME_KEY || e.key === ACTIVE_KEY) emit();
  });
  window.addEventListener("time:membros:changed", () => emit());
  window.addEventListener("projetos:changed", () => emit());
  window.addEventListener("clientes:changed", () => emit());
}

export function useActiveConvo() {
  return useSyncExternalStore(subscribeChat, getActive, () => "");
}

// ---------- Typing indicator ----------
type TypingEntry = { userId: string; userName: string; at: number };
const TYPING_TTL_MS = 4000;
let typingCache: Record<string, TypingEntry[]> = {};
let typingChannel: ReturnType<typeof supabase.channel> | null = null;

function pruneTyping(): boolean {
  const now = Date.now();
  let changed = false;
  const next: Record<string, TypingEntry[]> = {};
  for (const [convoId, entries] of Object.entries(typingCache)) {
    const fresh = entries.filter((e) => now - e.at < TYPING_TTL_MS);
    if (fresh.length !== entries.length) changed = true;
    if (fresh.length > 0) next[convoId] = fresh;
  }
  typingCache = next;
  return changed;
}

if (typeof window !== "undefined") {
  window.setInterval(() => {
    if (pruneTyping()) emit();
  }, 1500);
}

function ensureTypingChannel() {
  if (typingChannel) return typingChannel;
  typingChannel = supabase
    .channel("rt-chat-typing")
    .on("broadcast", { event: "typing" }, ({ payload }) => {
      const p = payload as TypingEntry & { convoId: string };
      if (!p?.convoId || !p.userId) return;
      const entries = (typingCache[p.convoId] ?? []).filter((e) => e.userId !== p.userId);
      typingCache = { ...typingCache, [p.convoId]: [...entries, p] };
      emit();
    })
    .subscribe();
  return typingChannel;
}

let lastTypingBroadcast = 0;
/** Call on every composer keystroke; throttled to avoid flooding the channel. */
export function broadcastTyping(convoId: string) {
  const me = getMe();
  if (!convoId || !currentUserId) return;
  const now = Date.now();
  if (now - lastTypingBroadcast < 1800) return;
  lastTypingBroadcast = now;
  ensureTypingChannel().send({
    type: "broadcast",
    event: "typing",
    payload: { convoId, userId: currentUserId, userName: me.name, at: now },
  });
}

export function getTypingUsers(convoId: string, meId: string): TypingEntry[] {
  pruneTyping();
  return (typingCache[convoId] ?? []).filter((e) => e.userId !== meId);
}
