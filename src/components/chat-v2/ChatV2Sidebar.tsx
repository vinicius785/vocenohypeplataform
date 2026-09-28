import { useMemo, useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { ChevronDown, Search } from "lucide-react";
import {
  buildChatList,
  dmId,
  getStatus,
  loadCampaignChannels,
  loadProjectChannels,
  STATUS_COLOR,
  type ChatChannel,
  type ChatListItem,
  type ChatMember,
  type ChatMessage,
} from "@/lib/chat-store";
import { HYPITO_AUTHOR_ID, HYPITO_AVATAR_URL, HYPITO_NAME } from "@/lib/hypito";
import { Badge } from "@/components/ui/badge";
import { isSidebarSectionCollapsed, setSidebarSectionCollapsed } from "./chat-v2-utils";

const MAX_ITEMS_BEFORE_COLLAPSE = 8;

function Section({
  id,
  title,
  items,
}: {
  id: string;
  title: string;
  items: { key: string; el: React.ReactNode }[];
}) {
  const [collapsed, setCollapsed] = useState(() => isSidebarSectionCollapsed(id));
  const [showAll, setShowAll] = useState(false);
  if (items.length === 0) return null;
  const visible = showAll ? items : items.slice(0, MAX_ITEMS_BEFORE_COLLAPSE);
  return (
    <div className="px-2 py-1">
      <button
        type="button"
        onClick={() => {
          setCollapsed((c) => {
            const next = !c;
            setSidebarSectionCollapsed(id, next);
            return next;
          });
        }}
        className="flex w-full items-center gap-1 px-1 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
      >
        <ChevronDown className={`h-3 w-3 transition-transform ${collapsed ? "-rotate-90" : ""}`} />
        {title}
      </button>
      {!collapsed && (
        <div className="space-y-0.5">
          {visible.map((it) => (
            <div key={it.key}>{it.el}</div>
          ))}
          {!showAll && items.length > MAX_ITEMS_BEFORE_COLLAPSE && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="w-full rounded-md px-2.5 py-1 text-left text-xs font-medium text-brand hover:underline"
            >
              Mostrar mais ({items.length - MAX_ITEMS_BEFORE_COLLAPSE})
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ConvoRow({
  to,
  params,
  active,
  icon,
  name,
  unread,
  preview,
}: {
  to: string;
  params: Record<string, string>;
  active: boolean;
  icon: React.ReactNode;
  name: string;
  unread: number;
  preview?: string;
}) {
  return (
    <Link
      to={to}
      params={params}
      className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
        active ? "bg-brand-subtle text-brand-foreground" : "text-foreground hover:bg-muted/60"
      }`}
    >
      <span className="flex h-6 w-6 shrink-0 items-center justify-center">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{name}</span>
        {preview && (
          <span className="block truncate text-[11px] text-muted-foreground">{preview}</span>
        )}
      </span>
      {unread > 0 && (
        <Badge className="h-5 min-w-5 justify-center bg-brand px-1 text-brand-foreground">
          {unread}
        </Badge>
      )}
    </Link>
  );
}

export function ChatV2Sidebar({
  channels,
  members,
  messages,
  meId,
  clientes,
  search,
  onSearchChange,
}: {
  channels: ChatChannel[];
  members: ChatMember[];
  messages: ChatMessage[];
  meId: string;
  clientes: { id: string; empresa: string; campanhas?: { id: string; nome: string }[] }[];
  search: string;
  onSearchChange: (v: string) => void;
}) {
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

  const q = search.trim().toLowerCase();
  const filtered = q ? list.filter((i) => i.name.toLowerCase().includes(q)) : list;
  const byKind = (kind: ChatListItem["kind"]) =>
    filtered
      .filter((i) => i.kind === kind)
      .sort((a, b) => (b.lastMessage?.createdAt ?? 0) - (a.lastMessage?.createdAt ?? 0));

  const dms = byKind("dm").filter((i) => i.id !== dmId(meId, HYPITO_AUTHOR_ID));
  const hypito = list.find((i) => i.id === dmId(meId, HYPITO_AUTHOR_ID));
  const canais = byKind("channel");
  const campanhas = [...byKind("campanha"), ...byKind("projeto")];

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

  return (
    <div className="flex h-full w-full flex-col border-r border-border md:w-[300px]">
      <div className="flex shrink-0 items-center justify-between px-3 py-3">
        <p className="text-sm font-semibold">Conversas</p>
      </div>
      <div className="px-3 pb-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar conversas…"
            className="h-8 w-full rounded-md border border-border bg-background pl-7 pr-2 text-xs outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto pb-3">
        {hypito && !q && (
          <div className="px-2 py-1">
            <ConvoRow
              to="/chat-v2/dm/$id"
              params={{ id: HYPITO_AUTHOR_ID }}
              active={activeConvoId === hypito.id}
              icon={
                <span className="relative">
                  <img
                    src={HYPITO_AVATAR_URL}
                    alt=""
                    className="h-6 w-6 rounded-full object-cover"
                  />
                </span>
              }
              name={HYPITO_NAME}
              unread={hypito.unread}
              preview={hypito.lastMessage?.text}
            />
          </div>
        )}
        <Section
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
                <ConvoRow
                  to={r.to}
                  params={r.params}
                  active={activeConvoId === item.id}
                  icon={
                    <span className="relative">
                      {item.photo ? (
                        <img
                          src={item.photo}
                          alt=""
                          className="h-6 w-6 rounded-full object-cover"
                        />
                      ) : (
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
                          {item.name.slice(0, 1).toUpperCase()}
                        </span>
                      )}
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ring-2 ring-background ${STATUS_COLOR[status]}`}
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
        <Section
          id="canais"
          title="Canais"
          items={canais.map((item) => {
            const r = routeFor(item);
            return {
              key: item.id,
              el: (
                <ConvoRow
                  to={r.to}
                  params={r.params}
                  active={activeConvoId === item.id}
                  icon={<span className="text-sm text-muted-foreground">#</span>}
                  name={item.name}
                  unread={item.unread}
                  preview={item.lastMessage?.text}
                />
              ),
            };
          })}
        />
        <Section
          id="campanhas"
          title="Campanhas"
          items={campanhas.map((item) => {
            const r = routeFor(item);
            return {
              key: item.id,
              el: (
                <ConvoRow
                  to={r.to}
                  params={r.params}
                  active={activeConvoId === item.id}
                  icon={<span className="text-sm text-muted-foreground">#</span>}
                  name={item.name}
                  unread={item.unread}
                  preview={item.lastMessage?.text}
                />
              ),
            };
          })}
        />
      </div>
    </div>
  );
}
