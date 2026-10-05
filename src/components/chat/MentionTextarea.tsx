import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import type { ChatMember, ChatMention } from "@/lib/chat-store";
import {
  EVERYONE_MENTION_ID,
  EVERYONE_MENTION_LABEL,
  normalizeForSearch,
  type MentionOption,
} from "@/lib/mention-kinds";
import { detectMentionTrigger, rankPeople, type MentionTrigger } from "@/lib/chat-mentions";
import {
  buildReferenceView,
  loadRecents,
  rememberRecent,
  type RecentRef,
} from "@/lib/reference-picker";
import { EntityReferencePicker } from "./EntityReferencePicker";
import { MentionAutocomplete, type MentionAutocompleteItem } from "./MentionAutocomplete";

/**
 * Textarea do composer com DOIS gatilhos independentes:
 *  - `@` → MENÇÃO de pessoa (autocomplete leve, só pessoas elegíveis da conversa). Em conversa
 *    direta (`mentionsEnabled=false`) o `@` é texto comum: nada abre, nada é selecionável.
 *  - `#` → REFERÊNCIA a uma TAREFA (seletor de tarefas à parte), em qualquer conversa.
 * A lógica de gatilho é pura e testada em `chat-mentions.ts` (`detectMentionTrigger`).
 */
const PEOPLE_LIMIT = 6;

/** Registra as menções realmente usadas no texto: pessoas por `@Nome`, referências por `#Rótulo`. */
export function extractUsedMentions(
  text: string,
  people: readonly ChatMember[],
  references: readonly MentionOption[],
  opts: { includeEveryone?: boolean } = {},
): ChatMention[] {
  const used: ChatMention[] = [];
  const seen = new Set<string>();
  const push = (m: ChatMention) => {
    const key = m.kind + ":" + m.id;
    if (!seen.has(key)) {
      seen.add(key);
      used.push(m);
    }
  };
  if (opts.includeEveryone && text.includes("@" + EVERYONE_MENTION_LABEL)) {
    push({ kind: "user", id: EVERYONE_MENTION_ID, label: EVERYONE_MENTION_LABEL });
  }
  for (const p of people) {
    if (text.includes("@" + p.name)) push({ kind: "user", id: p.id, label: p.name });
  }
  for (const r of references) {
    if (text.includes("#" + r.label)) push({ kind: r.kind, id: r.id, label: r.label });
  }
  return used;
}

/** Posição horizontal aproximada do gatilho dentro do textarea (largura do texto da linha até ele). */
function caretLeft(ta: HTMLTextAreaElement, start: number): number {
  const style = window.getComputedStyle(ta);
  const line = ta.value.slice(0, start).split("\n").pop() ?? "";
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return 0;
  ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  return (parseFloat(style.paddingLeft) || 0) + ctx.measureText(line).width;
}

export const MentionTextarea = forwardRef<
  HTMLTextAreaElement,
  {
    value: string;
    onChange: (v: string) => void;
    /** Pessoas elegíveis nesta conversa (vazio em conversa direta). */
    people: ChatMember[];
    /** `false` em conversa direta: o `@` não faz nada. */
    mentionsEnabled: boolean;
    /** Tarefas, projetos, campanhas e clientes (gatilho `#`). */
    references: MentionOption[];
    /** Pessoas que participaram/foram mencionadas há pouco, mais recente primeiro. */
    recentUserIds?: string[];
    autoFocus?: boolean;
    rows?: number;
    onEnterSubmit?: () => void;
    placeholder?: string;
    className?: string;
  }
>(function MentionTextarea(
  {
    value,
    onChange,
    people,
    mentionsEnabled,
    references,
    recentUserIds,
    autoFocus,
    rows = 1,
    onEnterSubmit,
    placeholder,
    className,
  },
  forwardedRef,
) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(forwardedRef, () => taRef.current as HTMLTextAreaElement);
  const [trigger, setTrigger] = useState<MentionTrigger | null>(null);
  const [highlight, setHighlight] = useState(0);
  const [left, setLeft] = useState(0);
  const [recents, setRecents] = useState<RecentRef[]>([]);

  useEffect(() => {
    if (autoFocus) taRef.current?.focus();
  }, [autoFocus]);

  // Cresce junto com o texto (até o teto de max-h-40).
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  // Em conversa direta qualquer gatilho `@` pendente é descartado (ex.: ao trocar de conversa).
  useEffect(() => {
    if (!mentionsEnabled) setTrigger((t) => (t?.char === "@" ? null : t));
  }, [mentionsEnabled]);

  const peopleItems = useMemo<{ items: MentionAutocompleteItem[]; hasMore: boolean }>(() => {
    if (trigger?.char !== "@") return { items: [], hasMore: false };
    const ranked = rankPeople(people, trigger.query, {
      recentIds: recentUserIds,
      limit: PEOPLE_LIMIT + 1,
    });
    const q = normalizeForSearch(trigger.query);
    const items: MentionAutocompleteItem[] = ranked
      .slice(0, PEOPLE_LIMIT)
      .map((r) => ({ type: "person", member: r.member }));
    if (people.length > 1 && (!q || normalizeForSearch("todos participantes").includes(q))) {
      items.unshift({ type: "everyone" });
    }
    return { items, hasMore: ranked.length > PEOPLE_LIMIT };
  }, [trigger, people, recentUserIds]);

  const referenceView = useMemo(
    () =>
      trigger?.char === "#"
        ? buildReferenceView({ references, query: trigger.query, recents })
        : null,
    [trigger, references, recents],
  );

  const activeCount =
    trigger?.char === "@" ? peopleItems.items.length : (referenceView?.items.length ?? 0);
  // `#` fica aberto mesmo sem resultado ("Nada encontrado"), para a busca ser sempre explicável.
  const open = trigger !== null && (trigger.char === "#" || activeCount > 0);

  useEffect(() => {
    if (trigger?.char === "#") setRecents(loadRecents());
  }, [trigger?.char]);
  // A cada letra a lista muda: volta o destaque para o primeiro resultado.
  useEffect(() => setHighlight(0), [trigger?.query]);

  const syncTrigger = (text: string, caret: number) => {
    const next = detectMentionTrigger(text, caret, mentionsEnabled);
    setTrigger((prev) => {
      if (!next) return null;
      if (!prev || prev.start !== next.start || prev.char !== next.char) setHighlight(0);
      return next;
    });
    if (next && taRef.current) {
      const ta = taRef.current;
      const menuWidth = next.char === "@" ? 288 : 320;
      const max = Math.max(0, ta.clientWidth - Math.min(menuWidth, window.innerWidth - 32));
      setLeft(Math.min(caretLeft(ta, next.start), max));
    }
  };

  const insert = (token: string) => {
    if (!trigger) return;
    const ta = taRef.current;
    const caret = ta?.selectionStart ?? value.length;
    const next = value.slice(0, trigger.start) + token + " " + value.slice(caret);
    onChange(next);
    setTrigger(null);
    requestAnimationFrame(() => {
      ta?.focus();
      const pos = trigger.start + token.length + 1;
      ta?.setSelectionRange(pos, pos);
    });
  };

  const switchToReference = () => {
    if (!trigger) return;
    const ta = taRef.current;
    const caret = ta?.selectionStart ?? value.length;
    onChange(value.slice(0, trigger.start) + "#" + value.slice(caret));
    setTrigger({ ...trigger, char: "#", query: "" });
    setHighlight(0);
    requestAnimationFrame(() => {
      ta?.focus();
      ta?.setSelectionRange(trigger.start + 1, trigger.start + 1);
    });
  };

  const pickPerson = (item: MentionAutocompleteItem) =>
    insert("@" + (item.type === "everyone" ? EVERYONE_MENTION_LABEL : item.member.name));
  const pickReference = (opt: MentionOption | undefined) => {
    if (!opt) return;
    rememberRecent({ kind: "task", id: opt.id });
    insert("#" + opt.label);
  };

  const handlePickerKey = (e: KeyboardEvent): boolean => {
    if (!open) return false;
    // Sem resultado, Enter/setas voltam a ser do composer (Enter envia a mensagem).
    if (activeCount === 0 && e.key !== "Escape") return false;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (h + 1) % activeCount);
      return true;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => (h - 1 + activeCount) % activeCount);
      return true;
    }
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      if (trigger?.char === "@") pickPerson(peopleItems.items[highlight] ?? peopleItems.items[0]);
      else pickReference(referenceView?.items[highlight] ?? referenceView?.items[0]);
      return true;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setTrigger(null);
      return true;
    }
    return false;
  };

  return (
    <div className="relative flex-1">
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          syncTrigger(e.target.value, e.target.selectionStart);
        }}
        onKeyUp={(e) => {
          // Setas ←/→ e cliques movem o cursor sem mudar o texto: reavalia o gatilho.
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            syncTrigger(e.currentTarget.value, e.currentTarget.selectionStart);
          }
        }}
        onClick={(e) => syncTrigger(e.currentTarget.value, e.currentTarget.selectionStart)}
        onBlur={() => setTrigger(null)}
        onKeyDown={(e) => {
          if (handlePickerKey(e)) return;
          if (e.key === "Enter" && !e.shiftKey && onEnterSubmit) {
            e.preventDefault();
            onEnterSubmit();
          }
        }}
        rows={rows}
        placeholder={placeholder}
        aria-autocomplete={open ? "list" : undefined}
        className={
          // `w-full block`: o wrapper é `display:block`; sem isso o textarea cai na largura padrão
          // do navegador (~20 colunas). Ver histórico do Chat V2.
          className ??
          "block max-h-40 min-h-[28px] w-full resize-none overflow-y-auto rounded border border-border bg-background px-2 py-1 text-base outline-none focus:ring-1 focus:ring-ring md:text-sm"
        }
      />
      {open && trigger?.char === "@" && (
        <MentionAutocomplete
          items={peopleItems.items}
          query={trigger.query}
          highlighted={highlight}
          hasMore={peopleItems.hasMore}
          onPick={pickPerson}
          onHover={setHighlight}
          onSwitchToReference={switchToReference}
          style={{ left }}
        />
      )}
      {open && trigger?.char === "#" && referenceView && (
        <EntityReferencePicker
          view={referenceView}
          query={trigger.query}
          highlighted={highlight}
          onPick={pickReference}
          onHover={setHighlight}
          style={{ left }}
        />
      )}
    </div>
  );
});
