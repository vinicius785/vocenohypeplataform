import { Link } from "@tanstack/react-router";
import { ArrowLeft, Hash, Lock, Users } from "lucide-react";
import {
  STATUS_LABEL,
  type ChatChannel,
  type ChatMember,
  type MemberStatus,
} from "@/lib/chat-store";
import { Badge } from "@/components/ui/badge";
import { HYPITO_BADGE_LABEL, HYPITO_TAGLINE } from "@/lib/hypito";

type HeaderInfo =
  | { kind: "dm"; member: ChatMember; status: MemberStatus; isHypito: boolean }
  | { kind: "channel"; channel: ChatChannel; memberCount: number }
  | { kind: "campaign"; name: string; empresa: string };

export function ChatV2Header({ info, onBack }: { info: HeaderInfo | null; onBack?: () => void }) {
  return (
    <header className="sticky top-0 z-10 flex shrink-0 items-center gap-2 border-b border-border bg-background px-4 py-3">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          aria-label="Voltar pra lista de conversas"
          className="-ml-1.5 mr-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
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
          {info.isHypito ? (
            <Badge variant="brand" title={HYPITO_TAGLINE}>
              {HYPITO_BADGE_LABEL}
            </Badge>
          ) : (
            <span className="text-[11px] text-muted-foreground">{STATUS_LABEL[info.status]}</span>
          )}
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
            <Users className="h-3 w-3" /> {info.memberCount}
          </span>
        </>
      )}
      {info?.kind === "campaign" && (
        <>
          <Hash className="h-4 w-4 text-muted-foreground" />
          <p className="min-w-0 truncate text-sm font-semibold">{info.name}</p>
          <span className="text-[11px] text-muted-foreground">campanha · {info.empresa}</span>
        </>
      )}
      <div className="ml-auto">
        <Link
          to="/time"
          search={{ section: "chat" }}
          className="text-[11px] font-medium text-muted-foreground hover:text-foreground hover:underline"
        >
          Voltar ao Chat clássico
        </Link>
      </div>
    </header>
  );
}
