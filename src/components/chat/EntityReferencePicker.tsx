import { Highlighted } from "./MentionAutocomplete";
import { MENTION_KIND_CONFIG, type MentionOption } from "@/lib/mention-kinds";
import { cn } from "@/lib/utils";

const KIND_SINGULAR: Record<MentionOption["kind"], string> = {
  user: "Pessoa",
  task: "Tarefa",
  project: "Projeto",
  campaign: "Campanha",
  client: "Cliente",
};

/**
 * Picker de REFERÊNCIA a entidades (tarefa, projeto, campanha, cliente), acionado por `#` — nunca
 * por `@`. Funciona em qualquer conversa (inclusive direta): referenciar uma tarefa não é mencionar
 * ninguém e não gera notificação de menção.
 */
export function EntityReferencePicker({
  items,
  query,
  highlighted,
  onPick,
  onHover,
  style,
}: {
  items: MentionOption[];
  query: string;
  highlighted: number;
  onPick: (opt: MentionOption) => void;
  onHover: (index: number) => void;
  style?: React.CSSProperties;
}) {
  return (
    <div
      role="listbox"
      aria-label="Referências"
      style={style}
      className="absolute bottom-full z-20 mb-1 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-border bg-popover shadow-lg"
    >
      <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
        Referenciar
      </p>
      <ul className="max-h-72 overflow-y-auto pb-1">
        {items.map((o, i) => {
          const { Icon, badgeClass } = MENTION_KIND_CONFIG[o.kind];
          return (
            <li key={o.kind + ":" + o.id}>
              <button
                type="button"
                role="option"
                aria-selected={i === highlighted}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => onHover(i)}
                onClick={() => onPick(o)}
                className={cn(
                  "flex w-full items-center gap-2.5 px-3 py-1.5 text-left",
                  i === highlighted ? "bg-muted" : "hover:bg-muted/60",
                )}
              >
                <span
                  className={cn(
                    "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded",
                    badgeClass,
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-foreground">
                    <Highlighted text={o.label} query={query} />
                  </span>
                  {o.hint && (
                    <span className="block truncate text-xs text-text-secondary">{o.hint}</span>
                  )}
                </span>
                <span className="shrink-0 text-[11px] text-text-secondary">
                  {KIND_SINGULAR[o.kind]}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
