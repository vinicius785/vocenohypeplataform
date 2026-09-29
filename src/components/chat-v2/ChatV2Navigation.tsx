import { useMemo, useState } from "react";
import { useParams } from "@tanstack/react-router";
import { Hash, Briefcase, Megaphone } from "lucide-react";
import type { CampanhaStatus } from "@/components/VincularCampanhaDialog";
import {
  buildChatList,
  getStatus,
  loadCampaignChannels,
  loadLastRead,
  loadProjectChannels,
  STATUS_COLOR,
  type ChatChannel,
  type ChatListItem,
  type ChatMember,
  type ChatMessage,
} from "@/lib/chat-store";
import { countUnreadMentions } from "./chat-v2-utils";
import { ChatV2NavigationHeader } from "./ChatV2NavigationHeader";
import { ChatV2Search } from "./ChatV2Search";
import { ChatV2Shortcuts } from "./ChatV2Shortcuts";
import { ChatV2Section } from "./ChatV2Section";
import { ChatV2ConversationItem } from "./ChatV2ConversationItem";
import { ChatV2NewConversationDialog } from "./ChatV2NewConversationDialog";

/**
 * Navegação do Chat V2 — 280–320px, ordem fixa: Diretas → Canais → Projetos
 * → Campanhas (não há sistema de favoritos implementado ainda — quando
 * existir, entra antes de Diretas). Cada seção só aparece se tiver ao menos
 * 1 item; todas rolam naturalmente dentro do scroll da coluna, sem
 * paginação artificial. Projetos/Campanhas encerrados ficam ocultos por
 * padrão (toggle local "Ver encerrados"/"Ver arquivados").
 */
export function ChatV2Navigation({
  channels,
  members,
  messages,
  meId,
  clientes,
}: {
  channels: ChatChannel[];
  members: ChatMember[];
  messages: ChatMessage[];
  meId: string;
  clientes: {
    id: string;
    empresa: string;
    campanhas?: { id: string; nome: string; status?: CampanhaStatus }[];
  }[];
}) {
  const [search, setSearch] = useState("");
  const [newConvoOpen, setNewConvoOpen] = useState(false);
  const [showArchivedCampaigns, setShowArchivedCampaigns] = useState(false);
  const [showArchivedProjects, setShowArchivedProjects] = useState(false);
  const params = useParams({ strict: false }) as { kind?: string; id?: string };
  const activeConvoId =
    params.kind === "dm"
      ? `dm:${[meId, params.id].sort().join("|")}`
      : params.kind === "channel"
        ? `c:${params.id}`
        : params.kind === "campaign"
          ? `camp:${params.id}`
          : "";

  const campaignChannels = useMemo(() => loadCampaignChannels(clientes), [clientes]);
  const projectChannels = useMemo(() => loadProjectChannels(), []);
  const list = useMemo(
    () => buildChatList({ channels, campaignChannels, projectChannels, members, messages, meId }),
    [channels, campaignChannels, projectChannels, members, messages, meId],
  );
  const totalUnread = useMemo(() => list.reduce((sum, i) => sum + i.unread, 0), [list]);
  const mentionCount = useMemo(
    () => countUnreadMentions(messages, meId, loadLastRead()),
    [messages, meId],
  );

  const q = search.trim().toLowerCase();
  const filtered = q ? list.filter((i) => i.name.toLowerCase().includes(q)) : list;
  const byKind = (kind: ChatListItem["kind"]) =>
    filtered
      .filter((i) => i.kind === kind)
      .sort((a, b) => (b.lastMessage?.createdAt ?? 0) - (a.lastMessage?.createdAt ?? 0));

  const dms = byKind("dm");
  const canais = byKind("channel");

  const projetosTodos = byKind("projeto");
  const projetosEncerrados = projetosTodos.filter(
    (p) => p.projetoStatus === "concluido" || p.projetoStatus === "arquivado",
  );
  const projetosAtivos = projetosTodos.filter(
    (p) => p.projetoStatus !== "concluido" && p.projetoStatus !== "arquivado",
  );
  const projetosVisiveis = showArchivedProjects ? projetosTodos : projetosAtivos;

  const campanhasTodas = byKind("campanha");
  const campanhasEncerradas = campanhasTodas.filter(
    (c) => c.campanhaStatus === "completed" || c.campanhaStatus === "archived",
  );
  const campanhasAtivas = campanhasTodas.filter(
    (c) => c.campanhaStatus !== "completed" && c.campanhaStatus !== "archived",
  );
  const campanhasVisiveis = showArchivedCampaigns ? campanhasTodas : campanhasAtivas;

  const routeFor = (item: ChatListItem): { to: string; params: Record<string, string> } => {
    if (item.kind === "dm") {
      const otherId =
        item.id
          .slice(3)
          .split("|")
          .find((id) => id !== meId) ?? item.id;
      return { to: "/chat-v2/dm/$id", params: { id: otherId } };
    }
    if (item.kind === "campanha")
      return { to: "/chat-v2/campaign/$id", params: { id: item.id.slice(5) } };
    if (item.kind === "projeto") return { to: "/chat-v2/channel/$id", params: { id: item.id } };
    return { to: "/chat-v2/channel/$id", params: { id: item.id.slice(2) } };
  };

  const hasMention = (item: ChatListItem) =>
    !!item.lastMessage?.mentions?.some((m) => m.kind === "user" && m.id === meId) &&
    item.unread > 0;

  return (
    <div className="flex h-full w-full flex-col border-r border-border bg-muted/20 md:w-[280px] lg:w-[300px]">
      <ChatV2NavigationHeader onNewConversation={() => setNewConvoOpen(true)} meId={meId} />
      <ChatV2Search value={search} onChange={setSearch} meId={meId} />
      <ChatV2Shortcuts unreadCount={totalUnread} mentionCount={mentionCount} />
      <div className="flex-1 overflow-y-auto pb-3">
        <ChatV2Section
          id="diretas"
          title="Diretas"
          items={dms.map((item) => {
            const r = routeFor(item);
            const status =
              item.status ??
              getStatus(
                item.id
                  .slice(3)
                  .split("|")
                  .find((id) => id !== meId) ?? "",
              );
            return {
              key: item.id,
              el: (
                <ChatV2ConversationItem
                  to={r.to}
                  params={r.params}
                  active={activeConvoId === item.id}
                  hasMention={hasMention(item)}
                  icon={
                    <span className="relative">
                      {item.photo ? (
                        <img
                          src={item.photo}
                          alt=""
                          className="h-8 w-8 rounded-full object-cover"
                        />
                      ) : (
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                          {item.name.slice(0, 1).toUpperCase()}
                        </span>
                      )}
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-background ${STATUS_COLOR[status]}`}
                      />
                    </span>
                  }
                  name={item.name}
                  unread={item.unread}
                  preview={item.lastMessage?.text}
                />
              ),
            };
          })}
        />
        <ChatV2Section
          id="canais"
          title="Canais"
          items={canais.map((item) => {
            const r = routeFor(item);
            return {
              key: item.id,
              el: (
                <ChatV2ConversationItem
                  to={r.to}
                  params={r.params}
                  active={activeConvoId === item.id}
                  hasMention={hasMention(item)}
                  icon={
                    <span className="flex h-8 w-8 items-center justify-center text-base text-muted-foreground">
                      <Hash className="h-4 w-4" />
                    </span>
                  }
                  name={item.name}
                  unread={item.unread}
                  preview={item.lastMessage?.text}
                />
              ),
            };
          })}
        />
        <ChatV2Section
          id="projetos"
          title="Projetos"
          items={projetosVisiveis.map((item) => {
            const r = routeFor(item);
            return {
              key: item.id,
              el: (
                <ChatV2ConversationItem
                  to={r.to}
                  params={r.params}
                  active={activeConvoId === item.id}
                  hasMention={hasMention(item)}
                  icon={
                    <span className="flex h-8 w-8 items-center justify-center text-muted-foreground">
                      <Briefcase className="h-4 w-4" />
                    </span>
                  }
                  name={item.name}
                  unread={item.unread}
                  preview={item.lastMessage?.text}
                />
              ),
            };
          })}
          action={
            projetosEncerrados.length > 0
              ? {
                  label: showArchivedProjects ? "Ocultar encerrados" : "Ver projetos encerrados",
                  onClick: () => setShowArchivedProjects((v) => !v),
                }
              : undefined
          }
        />
        <ChatV2Section
          id="campanhas"
          title="Campanhas"
          items={campanhasVisiveis.map((item) => {
            const r = routeFor(item);
            return {
              key: item.id,
              el: (
                <ChatV2ConversationItem
                  to={r.to}
                  params={r.params}
                  active={activeConvoId === item.id}
                  hasMention={hasMention(item)}
                  icon={
                    <span className="flex h-8 w-8 items-center justify-center text-muted-foreground">
                      <Megaphone className="h-4 w-4" />
                    </span>
                  }
                  name={item.name}
                  unread={item.unread}
                  preview={item.lastMessage?.text}
                  subtitle={item.empresa ? `Campanha · ${item.empresa}` : undefined}
                />
              ),
            };
          })}
          action={
            campanhasEncerradas.length > 0
              ? {
                  label: showArchivedCampaigns ? "Ocultar encerradas" : "Ver campanhas encerradas",
                  onClick: () => setShowArchivedCampaigns((v) => !v),
                }
              : undefined
          }
        />
      </div>
      <ChatV2NewConversationDialog
        open={newConvoOpen}
        onOpenChange={setNewConvoOpen}
        members={members}
        channels={channels}
        meId={meId}
      />
    </div>
  );
}
