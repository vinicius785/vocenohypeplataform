import {
  Bold,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Heading1,
  Heading2,
  Heading3,
} from "lucide-react";

type Action =
  | { type: "wrap"; marker: string }
  | { type: "line-prefix"; prefix: string }
  | { type: "link" };

const BUTTONS: { icon: typeof Bold; label: string; action: Action }[] = [
  { icon: Heading1, label: "Título 1", action: { type: "line-prefix", prefix: "# " } },
  { icon: Heading2, label: "Título 2", action: { type: "line-prefix", prefix: "## " } },
  { icon: Heading3, label: "Título 3", action: { type: "line-prefix", prefix: "### " } },
  { icon: Bold, label: "Negrito", action: { type: "wrap", marker: "**" } },
  { icon: Italic, label: "Itálico", action: { type: "wrap", marker: "*" } },
  { icon: Link2, label: "Link", action: { type: "link" } },
  { icon: List, label: "Lista", action: { type: "line-prefix", prefix: "- " } },
  { icon: ListOrdered, label: "Lista numerada", action: { type: "line-prefix", prefix: "1. " } },
  { icon: Quote, label: "Citação", action: { type: "line-prefix", prefix: "> " } },
];

/** Aplica a ação numa string de conteúdo + seleção (start/end), sem
 * depender do DOM — facilita testar e manter a lógica isolada de refs. */
function applyAction(
  content: string,
  start: number,
  end: number,
  action: Action,
): { content: string; selectionStart: number; selectionEnd: number } {
  const selected = content.slice(start, end);

  if (action.type === "wrap") {
    const { marker } = action;
    const text = selected || "texto";
    const next = `${content.slice(0, start)}${marker}${text}${marker}${content.slice(end)}`;
    const from = start + marker.length;
    return { content: next, selectionStart: from, selectionEnd: from + text.length };
  }

  if (action.type === "link") {
    const label = selected || "link";
    const insert = `[${label}](url)`;
    const next = `${content.slice(0, start)}${insert}${content.slice(end)}`;
    const from = start + label.length + 3; // posição logo após "[label]("
    const to = from + 3; // seleciona "url" pra já sobrescrever
    return { content: next, selectionStart: from, selectionEnd: to };
  }

  // line-prefix: aplica a cada linha tocada pela seleção (ou pela linha do
  // cursor, se não houver seleção).
  const lineStart = content.lastIndexOf("\n", start - 1) + 1;
  const lineEndIdx = content.indexOf("\n", end);
  const lineEnd = lineEndIdx === -1 ? content.length : lineEndIdx;
  const block = content.slice(lineStart, lineEnd);
  const prefixed = block
    .split("\n")
    .map((l) => (l.startsWith(action.prefix) ? l : `${action.prefix}${l}`))
    .join("\n");
  const next = `${content.slice(0, lineStart)}${prefixed}${content.slice(lineEnd)}`;
  const delta = prefixed.length - block.length;
  return { content: next, selectionStart: start + action.prefix.length, selectionEnd: end + delta };
}

/** Barra compacta de formatação markdown — opera sobre a seleção do
 * textarea via `selectionStart`/`selectionEnd` nativos do DOM, sem trocar
 * o motor de edição (continua sendo texto puro, mesma sintaxe suportada
 * por `renderMarkdownLite`). */
export function BlogToolbar({
  textareaRef,
  value,
  onChange,
}: {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (next: string) => void;
}) {
  const run = (action: Action) => {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const result = applyAction(value, start, end, action);
    onChange(result.content);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(result.selectionStart, result.selectionEnd);
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-0.5 rounded-t-md border border-b-0 border-border bg-muted/30 p-1">
      {BUTTONS.map(({ icon: Icon, label, action }) => (
        <button
          key={label}
          type="button"
          title={label}
          aria-label={label}
          onClick={() => run(action)}
          className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Icon className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  );
}
