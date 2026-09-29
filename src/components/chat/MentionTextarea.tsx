import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { getStatus, STATUS_COLOR, type ChatMember, type ChatMention } from "@/lib/chat-store";
import {
  MENTION_KIND_CONFIG,
  MENTION_KIND_ORDER,
  EVERYONE_MENTION_ID,
  EVERYONE_MENTION_LABEL,
  contextBoost,
  matchScore,
  type MentionContext,
  type MentionKind,
  type MentionOption,
} from "@/lib/mention-kinds";

/** Extraído de `ChatSection.tsx` (Chat V1) pra ser reaproveitado pelo Chat V2
 * sem duplicar a lógica de @menção — mesmo comportamento (trigger "@", tabs
 * por tipo, busca, navegação por teclado, ranking por contexto). */

export type MentionSourceTask = {
  id: string;
  label: string;
  project?: string;
  campanhaId?: string;
  projectId?: string;
};

/**
 * Reusable input with @ mention picker. Extracts mentions used in final text.
 * Junta os 5 tipos mencionáveis num só array de opções, já com o boost de
 * contexto (`context`) calculado por opção — sem context, fica sem boost
 * (usado em edição de mensagem antiga, onde o ranking contextual não é
 * essencial).
 */
export function useMentions(
  members: ChatMember[],
  tasks: MentionSourceTask[],
  projects: MentionOption[],
  campaigns: MentionOption[],
  clients: MentionOption[],
  allowUserMentions: boolean,
  context?: MentionContext,
) {
  const options = useMemo<MentionOption[]>(() => {
    const t: MentionOption[] = tasks.map((x) => ({
      kind: "task",
      id: x.id,
      label: x.label,
      hint: x.project ? `Projeto: ${x.project}` : undefined,
      campanhaId: x.campanhaId,
      projectId: x.projectId,
    }));
    const u: MentionOption[] = allowUserMentions
      ? [
          {
            kind: "user",
            id: EVERYONE_MENTION_ID,
            label: EVERYONE_MENTION_LABEL,
            hint: "Menciona todos os participantes",
          },
          ...members.map((m) => ({
            kind: "user" as const,
            id: m.id,
            label: m.name,
            photo: m.photo,
            hint: m.role,
          })),
        ]
      : [];
    const all = [...u, ...t, ...projects, ...campaigns, ...clients];
    if (!context) return all;
    return all.map((o) => ({ ...o, boost: contextBoost(o, context) }));
  }, [members, tasks, projects, campaigns, clients, allowUserMentions, context]);
  return options;
}

export function extractUsedMentions(text: string, options: MentionOption[]): ChatMention[] {
  const used: ChatMention[] = [];
  const seen = new Set<string>();
  for (const opt of options) {
    if (text.includes("@" + opt.label)) {
      const key = opt.kind + ":" + opt.id;
      if (!seen.has(key)) {
        seen.add(key);
        used.push({ kind: opt.kind, id: opt.id, label: opt.label });
      }
    }
  }
  return used;
}

/** "@Todos" nunca é uma pessoa real — expande a menção sentinela numa
 * menção individual de verdade por participante (excluindo quem enviou),
 * reaproveitando 100% a notificação/badge que já existe por menção
 * individual (contador do sino em `AppShell.tsx`, push em
 * `triggerChatPush`) sem precisar mudar nenhuma delas. */
export function expandEveryoneMention(
  mentions: ChatMention[],
  participantIds: string[],
): ChatMention[] {
  if (!mentions.some((m) => m.kind === "user" && m.id === EVERYONE_MENTION_ID)) return mentions;
  const already = new Set(mentions.filter((m) => m.kind === "user").map((m) => m.id));
  const extra: ChatMention[] = participantIds
    .filter((id) => !already.has(id))
    .map((id) => ({ kind: "user", id, label: EVERYONE_MENTION_LABEL }));
  return [...mentions, ...extra];
}

/** Círculo com foto/inicial (+ bolinha de presença) pra pessoa; ícone lucide
 * num quadrado colorido (`MENTION_KIND_CONFIG`) pra tudo mais — "círculo pra
 * pessoa, quadrado pro resto". */
export function MentionResultIcon({ opt }: { opt: MentionOption }) {
  if (opt.kind === "user") {
    const status = getStatus(opt.id);
    return (
      <span className="relative h-5 w-5 shrink-0">
        {opt.photo ? (
          <img src={opt.photo} alt="" className="h-5 w-5 rounded-full object-cover" />
        ) : (
          <span className="grid h-5 w-5 place-items-center rounded-full bg-sky-500/20 text-[9px] font-semibold text-sky-700 dark:text-sky-300">
            {opt.label.trim()[0]?.toUpperCase() ?? "?"}
          </span>
        )}
        <span
          className={`absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 rounded-full ring-1 ring-background ${STATUS_COLOR[status]}`}
        />
      </span>
    );
  }
  if (opt.photo) {
    return <img src={opt.photo} alt="" className="h-5 w-5 shrink-0 rounded object-cover" />;
  }
  const { Icon, badgeClass } = MENTION_KIND_CONFIG[opt.kind];
  return (
    <span
      className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded ${badgeClass}`}
    >
      <Icon className="h-3 w-3" />
    </span>
  );
}

export function MentionResultRow({
  opt,
  highlighted,
  onPick,
}: {
  opt: MentionOption;
  highlighted: boolean;
  onPick: (opt: MentionOption) => void;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault();
        onPick(opt);
      }}
      className={`flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs ${
        highlighted ? "bg-muted" : "hover:bg-muted/60"
      }`}
    >
      <MentionResultIcon opt={opt} />
      <span className="min-w-0 flex-1 truncate">{opt.label}</span>
      {opt.hint && (
        <span className="shrink-0 truncate text-[10px] text-muted-foreground">{opt.hint}</span>
      )}
    </button>
  );
}

const MENTION_ALL_TAB_CAP = 5;
const MENTION_KIND_TAB_CAP = 20;

export const MentionTextarea = forwardRef<
  HTMLTextAreaElement,
  {
    value: string;
    onChange: (v: string) => void;
    options: MentionOption[];
    autoFocus?: boolean;
    rows?: number;
    onEnterSubmit?: () => void;
    placeholder?: string;
    className?: string;
  }
>(function MentionTextarea(
  { value, onChange, options, autoFocus, rows = 1, onEnterSubmit, placeholder, className },
  forwardedRef,
) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(forwardedRef, () => taRef.current as HTMLTextAreaElement);
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [triggerAt, setTriggerAt] = useState(-1);
  const [highlight, setHighlight] = useState(0);
  const [tab, setTab] = useState<MentionKind | "all">("all");

  const kindsWithOptions = useMemo(
    () => MENTION_KIND_ORDER.filter((k) => options.some((o) => o.kind === k)),
    [options],
  );
  const showTabs = kindsWithOptions.length > 1;

  useEffect(() => {
    if (autoFocus) taRef.current?.focus();
  }, [autoFocus]);

  // Cresce junto com o texto (até o teto de max-h-40) em vez de ficar com
  // altura fixa e depender só da barra de rolagem interna pra textos longos.
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  // A busca digitada na caixinha do menu tem prioridade sobre o texto após
  // o "@" na mensagem — deixa procurar uma tarefa/pessoa sem precisar
  // digitar o nome dela dentro da própria mensagem.
  const effectiveQuery = search || query || "";
  const trimmedQuery = effectiveQuery.trim();

  // Sem busca (menu recém-aberto com só "@"): ordena só por `boost` de
  // contexto — é literalmente a seção "Recentes" (pessoas do canal/DM,
  // tarefas/campanha do canal ativo etc.), sem tabela nova nenhuma. Com
  // busca: `matchScore` decide primeiro, `boost` só desempata.
  const scored = useMemo(() => {
    if (query === null) return [];
    return options
      .map((o) => ({ o, score: trimmedQuery ? matchScore(o.label, trimmedQuery) : 0 }))
      .filter(({ score }) => !trimmedQuery || score > 0)
      .sort((a, b) => {
        if (trimmedQuery && a.score !== b.score) return b.score - a.score;
        return (b.o.boost ?? 0) - (a.o.boost ?? 0);
      })
      .map(({ o }) => o);
  }, [query, options, trimmedQuery]);

  // Aba "Todos": agrupado por tipo, até MENTION_ALL_TAB_CAP por grupo, com
  // "Ver todos" quando há mais — cada item já carrega o índice plano (`idx`)
  // usado pra navegação por teclado bater com a ordem visual.
  const groupedForAll = useMemo(() => {
    if (tab !== "all") return [];
    let idx = 0;
    return MENTION_KIND_ORDER.map((k) => {
      const inKind = scored.filter((o) => o.kind === k);
      const items = inKind.slice(0, MENTION_ALL_TAB_CAP).map((o) => ({ o, idx: idx++ }));
      return { kind: k, items, total: inKind.length };
    }).filter((g) => g.items.length > 0);
  }, [scored, tab]);

  const singleKindItems = useMemo(() => {
    if (tab === "all") return [];
    return scored.filter((o) => o.kind === tab).slice(0, MENTION_KIND_TAB_CAP);
  }, [scored, tab]);

  const filtered = useMemo(
    () => (tab === "all" ? groupedForAll.flatMap((g) => g.items.map((x) => x.o)) : singleKindItems),
    [tab, groupedForAll, singleKindItems],
  );

  const goToKind = (k: MentionKind | "all") => {
    setTab(k);
    setSearch("");
    setHighlight(0);
  };

  const updateQuery = (text: string, caret: number) => {
    const before = text.slice(0, caret);
    const at = before.lastIndexOf("@");
    if (at < 0) return setQuery(null);
    const prev = at === 0 ? " " : before[at - 1];
    if (prev !== " " && prev !== "\n") return setQuery(null);
    const q = before.slice(at + 1);
    if (/\s/.test(q)) return setQuery(null);
    const justOpened = query === null;
    setTriggerAt(at);
    setQuery(q);
    setHighlight(0);
    // Só reseta a aba quando o menu está abrindo (não a cada tecla digitada)
    // — sempre abre em "Todos", que já mostra tudo agrupado por tipo.
    if (justOpened) {
      setTab("all");
      setSearch("");
    }
  };

  const pick = (opt: MentionOption) => {
    if (triggerAt < 0) return;
    const caret = taRef.current?.selectionStart ?? value.length;
    const next = value.slice(0, triggerAt) + "@" + opt.label + " " + value.slice(caret);
    onChange(next);
    setQuery(null);
    setSearch("");
    setTriggerAt(-1);
    requestAnimationFrame(() => {
      taRef.current?.focus();
      const pos = triggerAt + opt.label.length + 2;
      taRef.current?.setSelectionRange(pos, pos);
    });
  };

  const pickerKeyDown = (e: KeyboardEvent) => {
    if (query === null || filtered.length === 0) return false;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (h + 1) % filtered.length);
      return true;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => (h - 1 + filtered.length) % filtered.length);
      return true;
    }
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      pick(filtered[highlight]);
      return true;
    }
    if (e.key === "Escape") {
      setQuery(null);
      setSearch("");
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
          updateQuery(e.target.value, e.target.selectionStart);
        }}
        onKeyDown={(e) => {
          if (pickerKeyDown(e)) return;
          if (e.key === "Enter" && !e.shiftKey && onEnterSubmit) {
            e.preventDefault();
            onEnterSubmit();
          }
        }}
        rows={rows}
        placeholder={placeholder}
        className={
          className ??
          "max-h-40 min-h-[28px] w-full resize-none overflow-y-auto rounded border border-border bg-background px-2 py-1 text-base outline-none focus:ring-1 focus:ring-ring md:text-sm"
        }
      />
      {query !== null && options.length > 0 && (
        <div className="absolute bottom-full left-0 z-20 mb-1 flex max-h-[28rem] w-96 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-md border border-border bg-background shadow-lg">
          {showTabs && (
            <div className="flex shrink-0 overflow-x-auto border-b border-border">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => goToKind("all")}
                className={`shrink-0 px-2.5 py-1.5 text-[11px] font-medium ${
                  tab === "all"
                    ? "border-b-2 border-foreground text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Todos
              </button>
              {kindsWithOptions.map((k) => (
                <button
                  key={k}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => goToKind(k)}
                  className={`shrink-0 px-2.5 py-1.5 text-[11px] font-medium ${
                    tab === k
                      ? "border-b-2 border-foreground text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {MENTION_KIND_CONFIG[k].label}
                </button>
              ))}
            </div>
          )}
          <div className="shrink-0 border-b border-border p-1.5">
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setHighlight(0);
              }}
              onKeyDown={(e) => {
                pickerKeyDown(e);
              }}
              placeholder={
                tab === "all"
                  ? "Buscar..."
                  : `Buscar ${MENTION_KIND_CONFIG[tab].label.toLowerCase()}...`
              }
              className="w-full rounded border border-border bg-background px-2 py-1 text-base outline-none focus:ring-1 focus:ring-ring md:text-xs"
            />
          </div>
          <ul className="min-h-0 flex-1 overflow-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-2 py-3 text-center text-[11px] text-muted-foreground">
                {trimmedQuery ? `Nenhum resultado para "${trimmedQuery}"` : "Nada encontrado"}
              </li>
            ) : tab === "all" ? (
              <>
                {!trimmedQuery && (
                  <li className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Recentes
                  </li>
                )}
                {groupedForAll.map((g) => (
                  <li key={g.kind} className="mb-1 last:mb-0">
                    <p className="px-2 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {MENTION_KIND_CONFIG[g.kind].label}
                    </p>
                    <ul>
                      {g.items.map(({ o, idx }) => (
                        <li key={o.kind + ":" + o.id}>
                          <MentionResultRow opt={o} highlighted={idx === highlight} onPick={pick} />
                        </li>
                      ))}
                    </ul>
                    {g.total > g.items.length && (
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => goToKind(g.kind)}
                        className="w-full px-2 py-1 text-left text-[10px] font-medium text-muted-foreground hover:text-foreground"
                      >
                        Ver todos ({g.total})
                      </button>
                    )}
                  </li>
                ))}
              </>
            ) : (
              singleKindItems.map((o, i) => (
                <li key={o.kind + ":" + o.id}>
                  <MentionResultRow opt={o} highlighted={i === highlight} onPick={pick} />
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
});
