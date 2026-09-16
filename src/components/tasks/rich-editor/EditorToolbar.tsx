import { forwardRef, useMemo, useState } from "react";
import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code,
  Link as LinkIcon,
  List,
  ListOrdered,
  ListTodo,
  MoreHorizontal,
  Highlighter,
  Palette,
  Quote,
  Code2,
  AlignLeft,
  AlignCenter,
  AlignRight,
  RemoveFormatting,
  Check,
} from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useElementWidth } from "@/hooks/use-element-width";
import { cn } from "@/lib/utils";

const TEXT_COLORS = ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7", "inherit"];

const BLOCK_OPTIONS = [
  { key: "paragraph", label: "Texto" },
  { key: "h1", label: "Título 1" },
  { key: "h2", label: "Título 2" },
  { key: "h3", label: "Título 3" },
  { key: "quote", label: "Citação" },
  { key: "code", label: "Bloco de código" },
] as const;
type BlockKey = (typeof BLOCK_OPTIONS)[number]["key"];

function applyBlock(editor: Editor, key: BlockKey) {
  const chain = editor.chain().focus();
  switch (key) {
    case "paragraph":
      chain.setParagraph().run();
      return;
    case "h1":
      chain.toggleHeading({ level: 1 }).run();
      return;
    case "h2":
      chain.toggleHeading({ level: 2 }).run();
      return;
    case "h3":
      chain.toggleHeading({ level: 3 }).run();
      return;
    case "quote":
      chain.toggleBlockquote().run();
      return;
    case "code":
      chain.toggleCodeBlock().run();
  }
}

function currentBlock(editor: Editor): BlockKey {
  if (editor.isActive("heading", { level: 1 })) return "h1";
  if (editor.isActive("heading", { level: 2 })) return "h2";
  if (editor.isActive("heading", { level: 3 })) return "h3";
  if (editor.isActive("blockquote")) return "quote";
  if (editor.isActive("codeBlock")) return "code";
  return "paragraph";
}

/** Cada item "demotável" da barra, em ordem de prioridade (1º = nunca sai,
 * último = 1º a ir pro menu "Mais" quando falta espaço) — mesma ordem do
 * pedido (tipo de texto > negrito > itálico > link > lista > resto), com
 * sublinhado/tachado logo depois de itálico (grupo "sempre visível no
 * desktop" do pedido). Larguras são estimativas em px (botão ~32px +
 * gap), só usadas pra decidir quantos itens cabem — nunca renderizadas. */
type ToolbarItemKey =
  | "underline"
  | "strike"
  | "link"
  | "bulletList"
  | "orderedList"
  | "taskList"
  | "code";
const DEMOTABLE_ORDER: { key: ToolbarItemKey; width: number }[] = [
  { key: "underline", width: 32 },
  { key: "strike", width: 32 },
  { key: "link", width: 32 },
  { key: "bulletList", width: 32 },
  { key: "orderedList", width: 32 },
  { key: "taskList", width: 32 },
  { key: "code", width: 32 },
];
const SELECT_WIDTH = 116;
const BOLD_ITALIC_WIDTH = 32 * 2;
const SEPARATOR_WIDTH = 9;
const MORE_BUTTON_WIDTH = 32;

/** Decide quantos itens demotáveis cabem, dado a largura medida do
 * container — sempre reserva espaço pro seletor, negrito, itálico e o
 * botão "Mais" (que existe sempre, já que highlight/cor/citação/bloco de
 * código/alinhamento/limpar formatação vivem permanentemente nele). */
function computeVisibleItems(containerWidth: number): Set<ToolbarItemKey> {
  const visible = new Set<ToolbarItemKey>();
  if (containerWidth <= 0) {
    // Ainda não medido (1º render) — assume tudo visível pra não piscar
    // um estado "colapsado" antes do ResizeObserver reportar a largura
    // real (evita FOUC de "só Texto/Negrito/Itálico" por um frame).
    DEMOTABLE_ORDER.forEach((i) => visible.add(i.key));
    return visible;
  }
  let used =
    SELECT_WIDTH + SEPARATOR_WIDTH + BOLD_ITALIC_WIDTH + SEPARATOR_WIDTH + MORE_BUTTON_WIDTH;
  if (used > containerWidth) return visible; // nem negrito/itálico cabem com folga — mantém mesmo assim (mínimo absoluto do pedido)
  for (const item of DEMOTABLE_ORDER) {
    if (used + item.width > containerWidth) break;
    used += item.width;
    visible.add(item.key);
  }
  return visible;
}

const ToolbarIconButton = forwardRef<
  HTMLButtonElement,
  {
    label: string;
    shortcut?: string;
    active?: boolean;
    disabled?: boolean;
    onClick: () => void;
    children: React.ReactNode;
  } & React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ label, shortcut, active, disabled, onClick, children, className, ...rest }, ref) => {
  return (
    <IconButton
      ref={ref}
      label={shortcut ? `${label} — ${shortcut}` : label}
      aria-pressed={active}
      disabled={disabled}
      tone={active ? "brand" : "neutral"}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "h-8 w-8 shrink-0",
        active && "bg-brand-subtle text-brand hover:bg-brand-subtle hover:text-brand",
        className,
      )}
      {...rest}
    >
      {children}
    </IconButton>
  );
});
ToolbarIconButton.displayName = "ToolbarIconButton";

function LinkPopover({ editor, active }: { editor: Editor; active: boolean }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");

  const openPopover = () => {
    setUrl(editor.getAttributes("link").href ?? "");
    setOpen(true);
  };

  // Adiciona protocolo quando falta (ex.: "site.com" → "https://site.com")
  // e nunca aplica um link vazio — critério explícito do pedido.
  const apply = () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    editor.chain().focus().extendMarkRange("link").setLink({ href: withProtocol }).run();
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) openPopover();
      }}
    >
      <PopoverTrigger asChild>
        <ToolbarIconButton label="Link" shortcut="⌘/Ctrl + K" active={active} onClick={openPopover}>
          <LinkIcon className="h-3.5 w-3.5" />
        </ToolbarIconButton>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-64 p-2"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <input
          autoFocus
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              apply();
            }
            if (e.key === "Escape") setOpen(false);
          }}
          placeholder="https://…"
          className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-brand"
        />
        <div className="mt-1.5 flex justify-end gap-1.5">
          {active && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                editor.chain().focus().extendMarkRange("link").unsetLink().run();
                setOpen(false);
              }}
            >
              Remover
            </Button>
          )}
          <Button type="button" size="sm" onClick={apply} disabled={!url.trim()}>
            Aplicar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Toolbar persistente do editor de descrição (substitui a antiga
 * `BubbleToolbar`, que só aparecia com o texto selecionado) — sempre
 * visível no topo do campo, responsiva à largura real do container via
 * `ResizeObserver` (`useElementWidth`), com um menu "Mais opções" que
 * absorve o que não couber. `useEditorState` é o padrão nativo do Tiptap
 * v3 pra re-renderizar só quando o estado observado muda (seleção/marcas
 * ativas), em vez de escutar `transaction` na mão.
 */
export function EditorToolbar({ editor }: { editor: Editor }) {
  const [containerRef, width] = useElementWidth<HTMLDivElement>();
  const visible = useMemo(() => computeVisibleItems(width), [width]);

  const state = useEditorState({
    editor,
    selector: (ctx) => ({
      block: currentBlock(ctx.editor),
      bold: ctx.editor.isActive("bold"),
      italic: ctx.editor.isActive("italic"),
      underline: ctx.editor.isActive("underline"),
      strike: ctx.editor.isActive("strike"),
      code: ctx.editor.isActive("code"),
      link: ctx.editor.isActive("link"),
      bulletList: ctx.editor.isActive("bulletList"),
      orderedList: ctx.editor.isActive("orderedList"),
      taskList: ctx.editor.isActive("taskList"),
      highlight: ctx.editor.isActive("highlight"),
      blockquote: ctx.editor.isActive("blockquote"),
      codeBlock: ctx.editor.isActive("codeBlock"),
      align: (["left", "center", "right"] as const).find((a) =>
        ctx.editor.isActive({ textAlign: a }),
      ),
      canBold: ctx.editor.can().toggleBold(),
      canItalic: ctx.editor.can().toggleItalic(),
    }),
  });

  const anyMoreItemActive = state.highlight || state.blockquote || state.codeBlock || !!state.align;

  return (
    <div
      ref={containerRef}
      role="toolbar"
      aria-label="Formatação de texto"
      className="sticky top-0 z-10 flex h-10 min-h-10 items-center gap-0.5 overflow-hidden rounded-t-lg border-b border-border bg-card px-1.5 motion-reduce:transition-none"
    >
      <Select value={state.block} onValueChange={(v) => applyBlock(editor, v as BlockKey)}>
        <SelectTrigger className="h-8 w-auto shrink-0 gap-1 border-0 bg-transparent px-2 text-xs font-medium shadow-none hover:bg-muted focus:ring-0 focus:ring-offset-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {BLOCK_OPTIONS.map((o) => (
            <SelectItem key={o.key} value={o.key} className="text-xs">
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="mx-1 h-4 w-px shrink-0 bg-border" />

      <ToolbarIconButton
        label="Negrito"
        shortcut="⌘/Ctrl + B"
        active={state.bold}
        disabled={!state.canBold}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold className="h-3.5 w-3.5" />
      </ToolbarIconButton>
      <ToolbarIconButton
        label="Itálico"
        shortcut="⌘/Ctrl + I"
        active={state.italic}
        disabled={!state.canItalic}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic className="h-3.5 w-3.5" />
      </ToolbarIconButton>

      {visible.has("underline") && (
        <ToolbarIconButton
          label="Sublinhado"
          shortcut="⌘/Ctrl + U"
          active={state.underline}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <Underline className="h-3.5 w-3.5" />
        </ToolbarIconButton>
      )}
      {visible.has("strike") && (
        <ToolbarIconButton
          label="Tachado"
          active={state.strike}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <Strikethrough className="h-3.5 w-3.5" />
        </ToolbarIconButton>
      )}

      {(visible.has("link") ||
        visible.has("bulletList") ||
        visible.has("orderedList") ||
        visible.has("taskList") ||
        visible.has("code")) && <div className="mx-1 h-4 w-px shrink-0 bg-border" />}

      {visible.has("link") && <LinkPopover editor={editor} active={state.link} />}
      {visible.has("bulletList") && (
        <ToolbarIconButton
          label="Lista com marcadores"
          active={state.bulletList}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className="h-3.5 w-3.5" />
        </ToolbarIconButton>
      )}
      {visible.has("orderedList") && (
        <ToolbarIconButton
          label="Lista numerada"
          active={state.orderedList}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </ToolbarIconButton>
      )}
      {visible.has("taskList") && (
        <ToolbarIconButton
          label="Checklist"
          active={state.taskList}
          onClick={() => editor.chain().focus().toggleTaskList().run()}
        >
          <ListTodo className="h-3.5 w-3.5" />
        </ToolbarIconButton>
      )}
      {visible.has("code") && (
        <ToolbarIconButton
          label="Código inline"
          active={state.code}
          onClick={() => editor.chain().focus().toggleCode().run()}
        >
          <Code className="h-3.5 w-3.5" />
        </ToolbarIconButton>
      )}

      <div className="ml-auto flex shrink-0 items-center gap-0.5 pl-1">
        {/* Itens demotados que não couberam entram aqui também, além dos
            que sempre moram no "Mais" (highlight/cor/citação/bloco de
            código/alinhamento/limpar formatação) — nunca escondemos tudo
            e deixamos só "Texto" sozinho (item explícito do pedido). */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <ToolbarIconButton label="Mais opções" active={anyMoreItemActive} onClick={() => {}}>
              <MoreHorizontal className="h-3.5 w-3.5" />
            </ToolbarIconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {!visible.has("underline") && (
              <DropdownMenuItem onSelect={() => editor.chain().focus().toggleUnderline().run()}>
                <Underline className="h-3.5 w-3.5" /> Sublinhado
                {state.underline && <Check className="ml-auto h-3.5 w-3.5 text-brand" />}
              </DropdownMenuItem>
            )}
            {!visible.has("strike") && (
              <DropdownMenuItem onSelect={() => editor.chain().focus().toggleStrike().run()}>
                <Strikethrough className="h-3.5 w-3.5" /> Tachado
                {state.strike && <Check className="ml-auto h-3.5 w-3.5 text-brand" />}
              </DropdownMenuItem>
            )}
            {!visible.has("link") && (
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  document.dispatchEvent(new CustomEvent("rte:open-link"));
                }}
              >
                <LinkIcon className="h-3.5 w-3.5" /> Link
                {state.link && <Check className="ml-auto h-3.5 w-3.5 text-brand" />}
              </DropdownMenuItem>
            )}
            {!visible.has("bulletList") && (
              <DropdownMenuItem onSelect={() => editor.chain().focus().toggleBulletList().run()}>
                <List className="h-3.5 w-3.5" /> Lista com marcadores
                {state.bulletList && <Check className="ml-auto h-3.5 w-3.5 text-brand" />}
              </DropdownMenuItem>
            )}
            {!visible.has("orderedList") && (
              <DropdownMenuItem onSelect={() => editor.chain().focus().toggleOrderedList().run()}>
                <ListOrdered className="h-3.5 w-3.5" /> Lista numerada
                {state.orderedList && <Check className="ml-auto h-3.5 w-3.5 text-brand" />}
              </DropdownMenuItem>
            )}
            {!visible.has("taskList") && (
              <DropdownMenuItem onSelect={() => editor.chain().focus().toggleTaskList().run()}>
                <ListTodo className="h-3.5 w-3.5" /> Checklist
                {state.taskList && <Check className="ml-auto h-3.5 w-3.5 text-brand" />}
              </DropdownMenuItem>
            )}
            {!visible.has("code") && (
              <DropdownMenuItem onSelect={() => editor.chain().focus().toggleCode().run()}>
                <Code className="h-3.5 w-3.5" /> Código inline
                {state.code && <Check className="ml-auto h-3.5 w-3.5 text-brand" />}
              </DropdownMenuItem>
            )}
            {!(
              visible.has("underline") &&
              visible.has("strike") &&
              visible.has("link") &&
              visible.has("bulletList") &&
              visible.has("orderedList") &&
              visible.has("taskList") &&
              visible.has("code")
            ) && <DropdownMenuSeparator />}

            <DropdownMenuItem onSelect={() => editor.chain().focus().toggleHighlight().run()}>
              <Highlighter className="h-3.5 w-3.5" /> Destacar
              {state.highlight && <Check className="ml-auto h-3.5 w-3.5 text-brand" />}
            </DropdownMenuItem>
            <div className="flex items-center gap-1 px-2 py-1.5">
              <Palette className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              {TEXT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  title={c === "inherit" ? "Cor padrão" : c}
                  onClick={() =>
                    c === "inherit"
                      ? editor.chain().focus().unsetColor().run()
                      : editor.chain().focus().setColor(c).run()
                  }
                  className="h-4 w-4 shrink-0 cursor-pointer rounded-full border border-border/60"
                  style={{ background: c === "inherit" ? "transparent" : c }}
                />
              ))}
            </div>
            <DropdownMenuItem onSelect={() => editor.chain().focus().toggleBlockquote().run()}>
              <Quote className="h-3.5 w-3.5" /> Citação
              {state.blockquote && <Check className="ml-auto h-3.5 w-3.5 text-brand" />}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => editor.chain().focus().toggleCodeBlock().run()}>
              <Code2 className="h-3.5 w-3.5" /> Bloco de código
              {state.codeBlock && <Check className="ml-auto h-3.5 w-3.5 text-brand" />}
            </DropdownMenuItem>
            <div className="flex items-center gap-0.5 px-2 py-1">
              {(
                [
                  { align: "left", Icon: AlignLeft, label: "Alinhar à esquerda" },
                  { align: "center", Icon: AlignCenter, label: "Centralizar" },
                  { align: "right", Icon: AlignRight, label: "Alinhar à direita" },
                ] as const
              ).map(({ align, Icon, label }) => (
                <button
                  key={align}
                  type="button"
                  title={label}
                  aria-pressed={state.align === align}
                  onClick={() => editor.chain().focus().setTextAlign(align).run()}
                  className={cn(
                    "flex h-7 w-7 cursor-pointer items-center justify-center rounded",
                    state.align === align
                      ? "bg-brand-subtle text-brand"
                      : "text-foreground/80 hover:bg-muted",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                </button>
              ))}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
            >
              <RemoveFormatting className="h-3.5 w-3.5" /> Limpar formatação
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
