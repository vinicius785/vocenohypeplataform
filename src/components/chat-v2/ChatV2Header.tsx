import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Briefcase, Hash, Lock, Megaphone, Pin, Users } from "lucide-react";
import {
  STATUS_LABEL,
  ensurePinnedLoaded,
  getPinnedMessages,
  getStatus,
  getTypingUsers,
  type ChatChannel,
  type ChatMember,
  type MemberStatus,
} from "@/lib/chat-store";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type HeaderInfo =
  | { kind: "dm"; member: ChatMember; status: MemberStatus }
  | { kind: "channel"; channel: ChatChannel; memberCount: number }
  | { kind: "projeto"; name: string }
  | { kind: "campaign"; name: string; empresa: string };

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Popover com os fixados desta conversa (`chat_pinned_messages`) — clicar
 * navega/destaca, mesmo padrão de `ChatV2Search`/mensagens salvas. */
function PinnedPopover({ convoId }: { convoId: string }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const pinned = getPinnedMessages(convoId);
  if (pinned.length === 0) return null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-7 gap-1 px-2 text-[11px] text-muted-foreground hover:text-brand"
          aria-label="Mensagens fixadas"
        >
          <Pin className="h-3.5 w-3.5" /> {pinned.length}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-1">
        <p className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Fixadas</p>
        <div className="max-h-72 space-y-0.5 overflow-y-auto">
          {pinned.map(({ pinId, message, pinnedAt }) => (
            <button
              key={pinId}
              type="button"
              onClick={() => {
                setOpen(false);
                void navigate({
                  to: ".",
                  search: (prev: Record<string, unknown>) => ({ ...prev, highlight: message.id }),
                } as unknown as Parameters<typeof navigate>[0]);
              }}
              className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-muted"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium">{message.authorName}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {formatDate(pinnedAt)}
                </span>
              </div>
              <p className="line-clamp-1 text-xs text-muted-foreground">{message.text}</p>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function ChatV2Header({
  info,
  onBack,
  convoId,
  meId,
  members,
}: {
  info: HeaderInfo | null;
  onBack?: () => void;
  /** Necessários pro indicador "digitando…", presença de canal e o popover
   * de fixados — opcionais só pra não quebrar quem ainda não os passa. */
  convoId?: string;
  meId?: string;
  members?: ChatMember[];
}) {
  useEffect(() => {
    if (convoId) void ensurePinnedLoaded(convoId);
  }, [convoId]);

  const typingUsers = convoId && meId ? getTypingUsers(convoId, meId) : [];
  const typingLabel =
    typingUsers.length === 0
      ? null
      : typingUsers.length === 1
        ? `${typingUsers[0].userName} está digitando…`
        : `${typingUsers.length} pessoas estão digitando…`;

  const onlineCount =
    info?.kind === "channel" && members
      ? members.filter((m) => {
          const allowed = info.channel.allowedMemberIds;
          if (allowed && allowed.length > 0 && !allowed.includes(m.id)) return false;
          return getStatus(m.id) === "online";
        }).length
      : 0;

  return (
    <header className="sticky top-0 z-10 flex shrink-0 flex-col gap-0.5 border-b border-border bg-background px-4 py-4">
      <div className="flex items-center gap-2">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Voltar pra lista de conversas"
            className="-ml-1.5 mr-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-brand md:hidden"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
        {!info && (
          <p className="text-sm font-semibold text-muted-foreground">Selecione uma conversa</p>
        )}
        {info?.kind === "dm" && (
          <>
            {info.member.photo ? (
              <img src={info.member.photo} alt="" className="h-7 w-7 rounded-full object-cover" />
            ) : (
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                {info.member.name.slice(0, 1).toUpperCase()}
              </span>
            )}
            <p className="min-w-0 truncate text-sm font-semibold">{info.member.name}</p>
            <span className="text-[11px] text-muted-foreground">{STATUS_LABEL[info.status]}</span>
          </>
        )}
        {info?.kind === "channel" && (
          <>
            {info.channel.private ? (
              <Lock className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Hash className="h-4 w-4 text-muted-foreground" />
            )}
            <p className="min-w-0 truncate text-sm font-semibold">{info.channel.name}</p>
            <span className="ml-1 flex items-center gap-1 text-[11px] text-muted-foreground">
              <Users className="h-3 w-3" /> {info.memberCount} membros
              {onlineCount > 0 ? ` · ${onlineCount} online` : ""}
            </span>
          </>
        )}
        {info?.kind === "projeto" && (
          <>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
            <p className="min-w-0 truncate text-sm font-semibold">{info.name}</p>
            <span className="text-[11px] text-muted-foreground">Projeto interno</span>
          </>
        )}
        {info?.kind === "campaign" && (
          <>
            <Megaphone className="h-4 w-4 text-muted-foreground" />
            <p className="min-w-0 truncate text-sm font-semibold">{info.name}</p>
            <span className="text-[11px] text-muted-foreground">Campanha · {info.empresa}</span>
          </>
        )}
        {convoId && <PinnedPopover convoId={convoId} />}
      </div>
      {typingLabel && (
        <p className="pl-9 text-[11px] italic text-muted-foreground">{typingLabel}</p>
      )}
    </header>
  );
}
