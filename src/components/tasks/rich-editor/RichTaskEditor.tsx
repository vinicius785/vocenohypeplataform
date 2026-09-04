import { useEffect, useRef } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import Placeholder from "@tiptap/extension-placeholder";
import type { RichDoc } from "@/lib/rich-text";
import type { MentionOption } from "@/lib/mention-kinds";
import { DashDivider } from "./dashDividerExtension";
import { SlashCommand } from "./slashCommandExtension";
import { createMentionExtension } from "./mentionExtension";
import { sanitizePastedHtml } from "./pasteSanitize";
import { BubbleToolbar } from "./BubbleToolbar";
import "./richEditor.css";

export function RichTaskEditor({
  taskKey,
  content,
  onChange,
  onBlurFlush,
  onOpenTaskMention,
  getMentionOptions,
  onSaveShortcut,
}: {
  /** Identifica a "sessão" de edição (id da tarefa, ou "new") — o editor só
   * reseta seu conteúdo quando essa chave muda, nunca a cada render do pai
   * (mesmo espírito do `useEffect` de `initial?.id` que já existia no
   * textarea antigo). */
  taskKey: string;
  content: RichDoc;
  onChange: (doc: RichDoc, plainText: string) => void;
  /** Flush do autosave ao perder o foco (item 15 do pedido). */
  onBlurFlush?: () => void;
  onOpenTaskMention: (rawId: string) => void;
  getMentionOptions: () => MentionOption[];
  onSaveShortcut?: () => void;
}) {
  const forcePlainPaste = useRef(false);
  const mentionExtension = useRef(createMentionExtension(getMentionOptions)).current;

  // `useEditor` só recria a instância quando os `deps` (2º argumento) mudam
  // — passamos `[]` (a instância vive por toda a vida do diálogo, resetada
  // via `setContent` abaixo, nunca recriada). Por isso os callbacks vindos
  // de fora (que mudam de identidade a cada render do pai) precisam ser
  // lidos sempre por ref, nunca fechados direto no closure de `useEditor` —
  // senão um `onSaveShortcut`/`onChange` "congelado" do primeiro render
  // ficaria preso a valores antigos de estado do componente pai.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onBlurFlushRef = useRef(onBlurFlush);
  onBlurFlushRef.current = onBlurFlush;
  const onOpenTaskMentionRef = useRef(onOpenTaskMention);
  onOpenTaskMentionRef.current = onOpenTaskMention;
  const onSaveShortcutRef = useRef(onSaveShortcut);
  onSaveShortcutRef.current = onSaveShortcut;

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
          link: {
            openOnClick: false,
            autolink: true,
            HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
          },
        }),
        TaskList,
        TaskItem.configure({ nested: true }),
        TextAlign.configure({ types: ["heading", "paragraph"] }),
        TextStyle,
        Color,
        Highlight,
        Placeholder.configure({ placeholder: "Escreva uma descrição ou digite / para comandos…" }),
        DashDivider,
        SlashCommand,
        mentionExtension,
      ],
      content,
      editorProps: {
        attributes: { class: "rte-content" },
        transformPastedHTML: (html) => sanitizePastedHtml(html),
        handlePaste: (view, event) => {
          if (!forcePlainPaste.current) return false;
          forcePlainPaste.current = false;
          const text = event.clipboardData?.getData("text/plain");
          if (!text) return false;
          event.preventDefault();
          const { schema } = view.state;
          const nodes = text
            .split("\n")
            .map((line) => schema.nodes.paragraph.create({}, line ? schema.text(line) : undefined));
          const tr = view.state.tr.replaceSelectionWith(nodes[0], false);
          let pos = view.state.selection.from + 1;
          for (const node of nodes.slice(1)) {
            tr.insert(pos, node);
            pos += node.nodeSize;
          }
          view.dispatch(tr);
          return true;
        },
        handleClickOn: (_view, _pos, node) => {
          if (node.type.name === "mention" && node.attrs.kind === "task" && node.attrs.id) {
            onOpenTaskMentionRef.current(node.attrs.id as string);
            return true;
          }
          return false;
        },
        handleKeyDown: (_view, event) => {
          const mod = event.metaKey || event.ctrlKey;
          if (mod && event.shiftKey && event.key.toLowerCase() === "v") {
            forcePlainPaste.current = true;
            return false; // deixa o evento nativo de paste acontecer
          }
          if (mod && !event.shiftKey && event.key.toLowerCase() === "s") {
            event.preventDefault();
            onSaveShortcutRef.current?.();
            return true;
          }
          if (mod && !event.shiftKey && event.key.toLowerCase() === "k") {
            event.preventDefault();
            // Bold/Italic/Underline/Undo/Redo já vêm de graça dos atalhos
            // padrão das extensões (StarterKit) — só o Link não tem UI
            // própria de atalho, então avisa a `LinkPopover` por evento.
            document.dispatchEvent(new CustomEvent("rte:open-link"));
            return true;
          }
          return false;
        },
      },
      onUpdate: ({ editor: e }) => onChangeRef.current(e.getJSON(), e.getText()),
      onBlur: () => onBlurFlushRef.current?.(),
    },
    [],
  );

  // Reseta o conteúdo só quando a "sessão" muda (troca de tarefa/abertura do
  // diálogo) — nunca a cada render, senão o cursor/seleção do usuário some
  // a cada tecla (mesmo cuidado que já existia no textarea antigo).
  const lastKey = useRef(taskKey);
  useEffect(() => {
    if (!editor) return;
    if (lastKey.current === taskKey) return;
    lastKey.current = taskKey;
    editor.commands.setContent(content);
  }, [taskKey, content, editor]);

  return (
    <>
      {editor && <BubbleToolbar editor={editor} />}
      <EditorContent editor={editor} />
    </>
  );
}
