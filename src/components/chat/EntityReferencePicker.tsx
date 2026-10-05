import { useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Highlighted } from "./MentionAutocomplete";
import { MENTION_KIND_CONFIG } from "@/lib/mention-kinds";
import {
  REFERENCE_KIND_LABEL,
  type ReferenceKind,
  type ReferenceRow,
  type ReferenceView,
} from "@/lib/reference-picker";
import { cn } from "@/lib/utils";

/** Contexto secundário só quando agrega ("Projeto: X"); "Projeto"/"Cliente" soltos já são o ícone. */
function secondary(hint?: string): string | null {
  return hint && /[:·]/.test(hint) ? hint : null;
}

/**
 * Seletor de REFERÊNCIA (`#`): compacto e neutro. Sem texto digitado mostra Recentes + Categorias;
 * ao digitar, resultados agrupados por categoria; ao escolher uma categoria, só os itens dela.
 * Navegação por teclado é do textarea (↑↓ Enter Esc); aqui só renderiza e aceita mouse/toque.
 * Nunca lista pessoas — `@` é outro seletor.
 */
export function EntityReferencePicker({
  view,
  query,
  kind,
  highlighted,
  onPick,
  onHover,
  onBack,
  style,
}: {
  view: ReferenceView;
  query: string;
  kind: ReferenceKind | null;
  highlighted: number;
  onPick: (row: ReferenceRow) => void;
  onHover: (index: number) => void;
  onBack: () => void;
  style?: React.CSSProperties;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-row="${highlighted}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [highlighted, view]);

  let index = -1;
  return (
    <div
      role="listbox"
      aria-label="Referências"
      style={style}
      className="absolute bottom-full z-20 mb-1 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-border bg-popover shadow-lg"
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-sm">
        {kind ? (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onBack}
            aria-label="Voltar às categorias"
            className="-ml-1 grid h-5 w-5 shrink-0 place-items-center rounded text-text-secondary hover:bg-muted hover:text-foreground"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
        ) : (
          <Search className="h-3.5 w-3.5 shrink-0 text-text-secondary" />
        )}
        <span className={cn("min-w-0 truncate", query ? "text-foreground" : "text-text-secondary")}>
          {query ||
            (kind
              ? `Buscar em ${REFERENCE_KIND_LABEL[kind].toLowerCase()}...`
              : "Buscar tarefa, projeto, campanha ou cliente...")}
        </span>
      </div>

      {view.rows.length === 0 ? (
        <p className="px-3 py-4 text-center text-sm text-text-secondary">Nada encontrado.</p>
      ) : (
        <ul
          ref={listRef}
          className="max-h-[min(18rem,45vh)] overflow-y-auto overscroll-contain pb-1"
        >
          {view.sections.map((sec) => (
            <li key={sec.key} role="presentation">
              <p className="px-3 pb-0.5 pt-2 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
                {sec.label}
              </p>
              <ul>
                {sec.rows.map((row) => {
                  index += 1;
                  const i = index;
                  const active = i === highlighted;
                  const base = cn(
                    "flex w-full items-center gap-2.5 px-3 py-1.5 text-left",
                    active ? "bg-muted" : "hover:bg-muted/60",
                  );
                  if (row.type === "category") {
                    const { Icon } = MENTION_KIND_CONFIG[row.kind];
                    return (
                      <li key={"cat:" + row.kind}>
                        <button
                          type="button"
                          role="option"
                          data-row={i}
                          aria-selected={active}
                          onMouseDown={(e) => e.preventDefault()}
                          onMouseEnter={() => onHover(i)}
                          onClick={() => onPick(row)}
                          className={base}
                        >
                          <Icon className="h-4 w-4 shrink-0 text-text-secondary" />
                          <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                            {REFERENCE_KIND_LABEL[row.kind]}
                          </span>
                          <span className="text-xs text-text-secondary">{row.count}</span>
                          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-text-secondary" />
                        </button>
                      </li>
                    );
                  }
                  const o = row.option;
                  const { Icon } = MENTION_KIND_CONFIG[o.kind];
                  const sub = secondary(o.hint);
                  return (
                    <li key={o.kind + ":" + o.id}>
                      <button
                        type="button"
                        role="option"
                        data-row={i}
                        aria-selected={active}
                        onMouseDown={(e) => e.preventDefault()}
                        onMouseEnter={() => onHover(i)}
                        onClick={() => onPick(row)}
                        className={base}
                      >
                        <Icon className="h-4 w-4 shrink-0 text-text-secondary" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-foreground">
                            <Highlighted text={o.label} query={query} />
                          </span>
                          {sub && (
                            <span className="block truncate text-xs text-text-secondary">
                              {sub}
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
