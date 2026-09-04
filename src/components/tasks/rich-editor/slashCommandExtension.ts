import { Extension } from "@tiptap/core";
import Suggestion, { type SuggestionOptions } from "@tiptap/suggestion";
import type { Editor, Range } from "@tiptap/core";
import {
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListChecks,
  Minus,
  Quote,
  Code2,
  Link as LinkIcon,
  AtSign,
  ListTodo,
  Type,
  type LucideIcon,
} from "lucide-react";
import { normalizeForSearch } from "@/lib/mention-kinds";
import { createSuggestionRender } from "./suggestionRenderer";
import { SlashMenu } from "./SlashMenu";

export type SlashCommandItem = {
  key: string;
  label: string;
  group: string;
  icon: LucideIcon;
  run: (editor: Editor, range: Range) => void;
};

/** Itens do menu "/" — na mesma ordem/rótulo do pedido (seção 7). "Link" e
 * "Menção"/"Tarefa" são atalhos simples: inserem o texto/gatilho e deixam a
 * toolbar flutuante ou o próprio menu "@" completarem o resto, em vez de
 * duplicar essa UI dentro do menu de blocos. */
export const SLASH_COMMAND_ITEMS: SlashCommandItem[] = [
  {
    key: "text",
    label: "Texto",
    group: "Texto",
    icon: Type,
    run: (editor, range) => editor.chain().focus().deleteRange(range).setParagraph().run(),
  },
  {
    key: "h1",
    label: "Título 1",
    group: "Texto",
    icon: Heading1,
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 1 }).run(),
  },
  {
    key: "h2",
    label: "Título 2",
    group: "Texto",
    icon: Heading2,
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 2 }).run(),
  },
  {
    key: "h3",
    label: "Título 3",
    group: "Texto",
    icon: Heading3,
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 3 }).run(),
  },
  {
    key: "bulletList",
    label: "Lista com bullets",
    group: "Listas",
    icon: List,
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    key: "orderedList",
    label: "Lista numerada",
    group: "Listas",
    icon: ListOrdered,
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    key: "taskList",
    label: "Checklist",
    group: "Listas",
    icon: ListChecks,
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleTaskList().run(),
  },
  {
    key: "hr",
    label: "Divisor",
    group: "Blocos",
    icon: Minus,
    run: (editor, range) => editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
  {
    key: "quote",
    label: "Citação",
    group: "Blocos",
    icon: Quote,
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
  },
  {
    key: "codeBlock",
    label: "Bloco de código",
    group: "Blocos",
    icon: Code2,
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
  },
  {
    key: "link",
    label: "Link",
    group: "Inserir",
    icon: LinkIcon,
    // Insere um texto placeholder já selecionado — o usuário aplica o link
    // de verdade pela toolbar flutuante que aparece com a seleção pronta.
    run: (editor, range) => {
      editor.chain().focus().deleteRange(range).insertContent("link").run();
      editor
        .chain()
        .focus()
        .setTextSelection({ from: range.from, to: range.from + 4 })
        .run();
    },
  },
  {
    key: "mention",
    label: "Menção",
    group: "Inserir",
    icon: AtSign,
    run: (editor, range) => editor.chain().focus().deleteRange(range).insertContent("@").run(),
  },
  {
    key: "task",
    label: "Tarefa",
    group: "Inserir",
    icon: ListTodo,
    run: (editor, range) => editor.chain().focus().deleteRange(range).insertContent("@").run(),
  },
];

const suggestion: Omit<SuggestionOptions<SlashCommandItem>, "editor"> = {
  char: "/",
  startOfLine: false,
  allowedPrefixes: null,
  items: ({ query }) => {
    const q = normalizeForSearch(query);
    if (!q) return SLASH_COMMAND_ITEMS;
    return SLASH_COMMAND_ITEMS.filter((item) => normalizeForSearch(item.label).includes(q));
  },
  command: ({ editor, range, props }) => {
    props.run(editor, range);
  },
  render: createSuggestionRender(SlashMenu),
};

/** Menu "/" de comandos — não insere um node persistente como a menção;
 * cada item roda um comando do TipTap direto (transforma o bloco atual). */
export const SlashCommand = Extension.create({
  name: "slashCommand",
  addProseMirrorPlugins() {
    return [Suggestion({ editor: this.editor, ...suggestion })];
  },
});
