import { Users } from "lucide-react";
import { getStatus, STATUS_COLOR, type ChatMember } from "@/lib/chat-store";
import { highlightSegments } from "@/lib/chat-mentions";
import { cn } from "@/lib/utils";

/** Item do autocomplete: uma pessoa ou a opção semântica "Todos os participantes". */
export type MentionAutocompleteItem = { type: "person"; member: ChatMember } | { type: "everyone" };

export function Highlighted({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlightSegments(text, query).map((s, i) =>
        s.match ? (
          <mark
            key={i}
            className="rounded-sm bg-transparent font-semibold text-foreground underline decoration-brand decoration-2 underline-offset-2"
          >
            {s.text}
          </mark>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </>
  );
}

function PersonAvatar({ member }: { member: ChatMember }) {
  const status = getStatus(member.id);
  return (
    <span className="relative h-7 w-7 shrink-0">
      {member.photo ? (
        <img src={member.photo} alt="" className="h-7 w-7 rounded-full object-cover" />
      ) : (
        <span className="grid h-7 w-7 place-items-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
          {member.name.trim()[0]?.toUpperCase() ?? "?"}
        </span>
      )}
      <span
        className={cn(
          "absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ring-2 ring-background",
          STATUS_COLOR[status],
        )}
      />
    </span>
  );
}

/**
 * Autocomplete de MENÇÃO: só pessoas elegíveis da conversa (ver `chat-mentions.ts`), no máximo
 * poucas linhas, com avatar, nome (busca destacada) e cargo. A navegação por teclado é do textarea;
 * aqui só renderiza e aceita clique.
 */
export function MentionAutocomplete({
  items,
  query,
  highlighted,
  hasMore,
  onPick,
  onHover,
  onSwitchToReference,
  style,
}: {
  items: MentionAutocompleteItem[];
  query: string;
  highlighted: number;
  hasMore: boolean;
  onPick: (item: MentionAutocompleteItem) => void;
  onHover: (index: number) => void;
  /** Troca `@` por `#`: referências a tarefas, projetos, campanhas e clientes. */
  onSwitchToReference?: () => void;
  style?: React.CSSProperties;
}) {
  return (
    <div
      role="listbox"
      aria-label="Pessoas"
      style={style}
      className="absolute bottom-full z-20 mb-1 w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-border bg-popover shadow-lg"
    >
      <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
        Pessoas
      </p>
      <ul className="max-h-72 overflow-y-auto pb-1">
        {items.map((item, i) => {
          const active = i === highlighted;
          return (
            <li key={item.type === "everyone" ? "everyone" : item.member.id}>
              <button
                type="button"
                role="option"
                aria-selected={active}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => onHover(i)}
                onClick={() => onPick(item)}
                className={cn(
                  "flex w-full items-center gap-2.5 px-3 py-1.5 text-left",
                  active ? "bg-muted" : "hover:bg-muted/60",
                )}
              >
                {item.type === "everyone" ? (
                  <>
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                      <Users className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">
                        Todos os participantes
                      </span>
                      <span className="block truncate text-xs text-text-secondary">
                        Menciona quem está nesta conversa
                      </span>
                    </span>
                  </>
                ) : (
                  <>
                    <PersonAvatar member={item.member} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">
                        <Highlighted text={item.member.name} query={query} />
                      </span>
                      {item.member.role && (
                        <span className="block truncate text-xs text-text-secondary">
                          <Highlighted text={item.member.role} query={query} />
                        </span>
                      )}
                    </span>
                  </>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {onSwitchToReference && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onSwitchToReference}
          className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-left text-xs text-text-secondary hover:bg-muted/60 hover:text-foreground"
        >
          <span className="grid h-5 w-5 shrink-0 place-items-center rounded bg-muted text-[11px] font-semibold">
            #
          </span>
          Tarefas, projetos, campanhas e clientes
        </button>
      )}
      {hasMore && (
        <p className="border-t border-border px-3 py-1.5 text-[11px] text-text-secondary">
          Continue digitando para filtrar
        </p>
      )}
    </div>
  );
}
