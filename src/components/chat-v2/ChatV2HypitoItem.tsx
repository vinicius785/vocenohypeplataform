import { Link, useParams } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { HYPITO_AUTHOR_ID, HYPITO_AVATAR_URL, HYPITO_BADGE_LABEL, HYPITO_NAME } from "@/lib/hypito";

export function ChatV2HypitoItem({ unread, preview }: { unread: number; preview?: string }) {
  const params = useParams({ strict: false }) as { kind?: string; id?: string };
  const active = params.kind === "dm" && params.id === HYPITO_AUTHOR_ID;
  return (
    <div className="px-3 pb-1 pt-2">
      <Link
        to="/chat-v2/dm/$id"
        params={{ id: HYPITO_AUTHOR_ID }}
        className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 transition-colors ${
          active ? "bg-brand-subtle" : "hover:bg-muted/60"
        }`}
      >
        <img
          src={HYPITO_AVATAR_URL}
          alt=""
          className="h-8 w-8 shrink-0 rounded-full object-cover"
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span
              className={`text-sm ${active ? "font-semibold text-brand-foreground" : "font-semibold text-foreground"}`}
            >
              {HYPITO_NAME}
            </span>
            <Badge variant="brand" className="h-4 px-1.5 text-[9px] leading-none">
              {HYPITO_BADGE_LABEL}
            </Badge>
          </span>
          {preview && (
            <span className="block truncate text-xs text-muted-foreground">{preview}</span>
          )}
        </span>
        {unread > 0 && (
          <Badge className="h-5 min-w-5 shrink-0 justify-center bg-brand px-1 text-[11px] text-brand-foreground">
            {unread}
          </Badge>
        )}
      </Link>
    </div>
  );
}
