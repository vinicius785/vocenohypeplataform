import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Briefcase, Hash, Lock, Megaphone, Pin } from "lucide-react";
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
          className="ml-auto h-7 gap-1 px-2 text-[11px] text-muted-foreground hover:text-text-brand"
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

  // Ícone/avatar da linha 1 — mesmo elemento pros 4 tipos de conversa,
  // calculado uma vez em vez de repetir o `<img>`/fallback em cada branch.
  let leadingIcon: React.ReactNode = null;
  let title = "";
  // Linha 2 (referência ClickUp: "Canal · descrição/contexto") — só dados
  // REAIS já disponíveis nas props/tipos existentes, nunca inventados (ex.
  // nenhuma contagem de membros pra DM/projeto/campanha, que não existe
  // como fonte de dados hoje).
  let subtitle = "";
  if (info?.kind === "dm") {
    leadingIcon = info.member.photo ? (
      <img src={info.member.photo} alt="" className="h-9 w-9 rounded-full object-cover" />
    ) : (
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-sm font-semibold">
        {info.member.name.slice(0, 1).toUpperCase()}
      </span>
    );
    title = info.member.name;
    subtitle = STATUS_LABEL[info.status];
  } else if (info?.kind === "channel") {
    leadingIcon = (
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {info.channel.private ? <Lock className="h-4 w-4" /> : <Hash className="h-4 w-4" />}
      </span>
    );
    title = info.channel.name;
    subtitle = `${info.memberCount} membro${info.memberCount === 1 ? "" : "s"}${
      onlineCount > 0 ? ` · ${onlineCount} online` : ""
    }${info.channel.linkedScope ? ` · ${info.channel.linkedScope.name}` : ""}`;
  } else if (info?.kind === "projeto") {
    leadingIcon = (
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Briefcase className="h-4 w-4" />
      </span>
    );
    title = info.name;
    subtitle = "Projeto interno";
  } else if (info?.kind === "campaign") {
    leadingIcon = (
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Megaphone className="h-4 w-4" />
      </span>
    );
    title = info.name;
    subtitle = `Campanha · ${info.empresa}`;
  }

  return (
    // Duas linhas fixas (referência ClickUp): linha 1 = identidade + ações,
    // linha 2 = contexto (status/membros/tipo) — nunca uma faixa com só
    // "avatar + nome + Offline" e espaço vazio embaixo. `min-h` garante que
    // a segunda linha sempre reserva espaço (mesmo vazia em "Selecione uma
    // conversa"), pra não pular de altura ao trocar de conversa.
    <header className="sticky top-0 z-10 flex min-w-0 shrink-0 flex-col justify-center gap-0.5 border-b border-border bg-background px-4 py-2 md:px-6 md:py-3">
      <div className="flex items-center gap-2.5">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Voltar pra lista de conversas"
            className="-ml-1.5 mr-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-text-brand md:hidden"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
        {!info && (
          <p className="text-sm font-semibold text-muted-foreground">Selecione uma conversa</p>
        )}
        {info && leadingIcon}
        {info && (
          <p className="min-w-0 truncate text-[15px] font-semibold text-foreground">{title}</p>
        )}
        {convoId && <PinnedPopover convoId={convoId} />}
      </div>
      {info && (
        <p className="truncate pl-[46px] text-[12px] text-muted-foreground">
          {typingLabel ?? subtitle}
        </p>
      )}
    </header>
  );
}
