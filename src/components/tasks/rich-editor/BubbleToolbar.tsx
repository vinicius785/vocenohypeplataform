import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import { BubbleMenu } from "@tiptap/react/menus";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code,
  Link as LinkIcon,
  List,
  MoreHorizontal,
  ChevronDown,
  Highlighter,
  Palette,
  Quote,
  Code2,
  AlignLeft,
  AlignCenter,
  AlignRight,
  RemoveFormatting,
} from "lucide-react";

const TEXT_COLORS = ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7", "inherit"];

function ToolbarButton({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded ${
        active ? "bg-muted text-foreground" : "text-foreground/80 hover:bg-muted/60"
      }`}
    >
      {children}
    </button>
  );
}

const STYLE_OPTIONS: {
  key: string;
  label: string;
  apply: (e: Editor) => void;
  isActive: (e: Editor) => boolean;
}[] = [
  {
    key: "paragraph",
    label: "Texto",
    apply: (e) => e.chain().focus().setParagraph().run(),
    isActive: (e) => e.isActive("paragraph"),
  },
  {
    key: "h1",
    label: "Título 1",
    apply: (e) => e.chain().focus().toggleHeading({ level: 1 }).run(),
    isActive: (e) => e.isActive("heading", { level: 1 }),
  },
  {
    key: "h2",
    label: "Título 2",
    apply: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
    isActive: (e) => e.isActive("heading", { level: 2 }),
  },
  {
    key: "h3",
    label: "Título 3",
    apply: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
    isActive: (e) => e.isActive("heading", { level: 3 }),
  },
  {
    key: "quote",
    label: "Citação",
    apply: (e) => e.chain().focus().toggleBlockquote().run(),
    isActive: (e) => e.isActive("blockquote"),
  },
  {
    key: "code",
    label: "Código",
    apply: (e) => e.chain().focus().toggleCodeBlock().run(),
    isActive: (e) => e.isActive("codeBlock"),
  },
];

function StyleDropdown({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);
  const current = STYLE_OPTIONS.find((o) => o.isActive(editor)) ?? STYLE_OPTIONS[0];
  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((o) => !o)}
        className="flex h-7 cursor-pointer items-center gap-1 rounded px-1.5 text-xs text-foreground/80 hover:bg-muted/60"
      >
        {current.label}
        <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-10 mt-1 w-32 overflow-hidden rounded-md border border-border bg-popover py-1 shadow-md">
          {STYLE_OPTIONS.map((o) => (
            <button
              key={o.key}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                o.apply(editor);
                setOpen(false);
              }}
              className={`flex w-full cursor-pointer items-center px-2.5 py-1.5 text-left text-xs hover:bg-muted ${
                o.isActive(editor) ? "text-foreground" : "text-foreground/80"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function LinkPopover({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    setUrl(editor.getAttributes("link").href ?? "");
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open, editor]);
  // Cmd/Ctrl+K (item 28 do pedido) — atalho de teclado despachado pelo
  // editor (`RichTaskEditor`'s `handleKeyDown`), já que o atalho não tem
  // outro jeito de "chegar" nesta popup sem levantar estado pra cima.
  useEffect(() => {
    const onShortcut = () => setOpen(true);
    document.addEventListener("rte:open-link", onShortcut);
    return () => document.removeEventListener("rte:open-link", onShortcut);
  }, []);
  return (
    <div ref={ref} className="relative shrink-0">
      <ToolbarButton
        title="Link"
        active={editor.isActive("link")}
        onClick={() => setOpen((o) => !o)}
      >
        <LinkIcon className="h-3.5 w-3.5" />
      </ToolbarButton>
      {open && (
        <div
          className="absolute left-0 top-full z-10 mt-1 w-64 rounded-md border border-border bg-popover p-2 shadow-md"
          onMouseDown={(e) => e.preventDefault()}
        >
          <input
            autoFocus
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
                setOpen(false);
              }
            }}
            placeholder="https://…"
            className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-ring"
          />
          <div className="mt-1.5 flex justify-end gap-1.5">
            {editor.isActive("link") && (
              <button
                type="button"
                onClick={() => {
                  editor.chain().focus().extendMarkRange("link").unsetLink().run();
                  setOpen(false);
                }}
                className="cursor-pointer rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
              >
                Remover
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
                setOpen(false);
              }}
              className="cursor-pointer rounded-md bg-foreground px-2.5 py-1 text-xs font-medium text-background hover:opacity-90"
            >
              Aplicar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MoreMenu({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);
  return (
    <div ref={ref} className="relative shrink-0">
      <ToolbarButton title="Mais opções" onClick={() => setOpen((o) => !o)}>
        <MoreHorizontal className="h-3.5 w-3.5" />
      </ToolbarButton>
      {open && (
        <div className="absolute right-0 top-full z-10 mt-1 w-48 rounded-md border border-border bg-popover p-1.5 shadow-md">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().toggleHighlight().run()}
            className={`flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted ${editor.isActive("highlight") ? "text-foreground" : "text-foreground/80"}`}
          >
            <Highlighter className="h-3.5 w-3.5" /> Highlight
          </button>
          <div className="flex items-center gap-1 px-2 py-1.5">
            <Palette className="h-3.5 w-3.5 shrink-0 text-foreground/80" />
            {TEXT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                title={c}
                onMouseDown={(e) => e.preventDefault()}
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
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            className={`flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted ${editor.isActive("blockquote") ? "text-foreground" : "text-foreground/80"}`}
          >
            <Quote className="h-3.5 w-3.5" /> Quote
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            className={`flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted ${editor.isActive("codeBlock") ? "text-foreground" : "text-foreground/80"}`}
          >
            <Code2 className="h-3.5 w-3.5" /> Code block
          </button>
          <div className="flex items-center gap-0.5 px-1 py-1">
            {[
              { align: "left", Icon: AlignLeft },
              { align: "center", Icon: AlignCenter },
              { align: "right", Icon: AlignRight },
            ].map(({ align, Icon }) => (
              <button
                key={align}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => editor.chain().focus().setTextAlign(align).run()}
                className={`flex h-6 w-6 cursor-pointer items-center justify-center rounded ${editor.isActive({ textAlign: align }) ? "bg-muted text-foreground" : "text-foreground/80 hover:bg-muted/60"}`}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            ))}
          </div>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
            className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-foreground/80 hover:bg-muted"
          >
            <RemoveFormatting className="h-3.5 w-3.5" /> Limpar formatação
          </button>
        </div>
      )}
      {/* Extensão futura: opções de IA (Melhorar escrita/Corrigir texto/
          Resumir/Expandir) entrariam aqui, condicionadas a uma integração
          real — não existe hoje, então nada é mostrado (item 27). */}
    </div>
  );
}

/** Toolbar flutuante por seleção (item 3 do pedido) — sem nenhuma opção de
 * IA (nenhuma integração existe ainda). Mobile: mesmos botões, "•••" absorve
 * o resto; a barra nunca estoura a largura da tela (`max-w-[calc(100vw-2rem)]`,
 * `overflow-x-auto` de segurança). */
export function BubbleToolbar({ editor }: { editor: Editor }) {
  return (
    <BubbleMenu editor={editor} updateDelay={100}>
      <div className="flex max-w-[calc(100vw-2rem)] items-center gap-0.5 overflow-x-auto rounded-md border border-border bg-popover px-1 py-1 shadow-md">
        <StyleDropdown editor={editor} />
        <div className="mx-0.5 h-4 w-px shrink-0 bg-border" />
        <ToolbarButton
          title="Negrito (Cmd/Ctrl+B)"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Itálico (Cmd/Ctrl+I)"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Sublinhado (Cmd/Ctrl+U)"
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <Underline className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Tachado"
          active={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <Strikethrough className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Código"
          active={editor.isActive("code")}
          onClick={() => editor.chain().focus().toggleCode().run()}
        >
          <Code className="h-3.5 w-3.5" />
        </ToolbarButton>
        <LinkPopover editor={editor} />
        <ToolbarButton
          title="Lista com bullets"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className="h-3.5 w-3.5" />
        </ToolbarButton>
        <div className="mx-0.5 h-4 w-px shrink-0 bg-border" />
        <MoreMenu editor={editor} />
      </div>
    </BubbleMenu>
  );
}
