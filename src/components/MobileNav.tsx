import { useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, LifeBuoy, Lock, Menu, Settings } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { SidebarProfile } from "@/components/ConfiguracoesSection";
import type { SectionKey } from "@/lib/section-nav";
import {
  MOBILE_PRIMARY_KEYS,
  isMoreActive,
  itemByKey,
  moreGroups,
  type NavItem,
} from "./app-shell-nav";

export type MobileNavState = {
  /** Seção atual (a mesma `active` que destaca a sidebar). */
  active: SectionKey;
  /** `true` se o usuário pode abrir a seção (mesma regra de permissão da sidebar). */
  allowed: (key: SectionKey) => boolean;
  onSelect: (key: SectionKey) => void;
  chatUnread: number;
  /** Bolinha de novidades por seção (leads novos, reunião pendente...). */
  dot: (key: SectionKey) => boolean;
  overdueDespesas: boolean;
};

/** Teclado virtual aberto = campo de texto em foco: a barra sai da frente para não sobrar uma
 * faixa fixa entre o teclado e o conteúdo (Android) nem cobrir o campo (iOS). */
function useEditableFocus(): boolean {
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    const isEditable = (el: EventTarget | null) =>
      el instanceof HTMLElement &&
      (el.isContentEditable ||
        (el instanceof HTMLTextAreaElement && !el.readOnly) ||
        (el instanceof HTMLInputElement &&
          !["checkbox", "radio", "button", "submit", "range", "file", "color"].includes(el.type)));
    const onIn = (e: FocusEvent) => setFocused(isEditable(e.target));
    const onOut = () => setFocused(false);
    document.addEventListener("focusin", onIn);
    document.addEventListener("focusout", onOut);
    return () => {
      document.removeEventListener("focusin", onIn);
      document.removeEventListener("focusout", onOut);
    };
  }, []);
  return focused;
}

const itemBase =
  "relative flex min-w-0 flex-col rounded-xl items-center justify-center gap-0.5 transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand";

/** Barra de navegação inferior (só mobile, < md). Os 4 destinos prioritários + "Mais". O estado
 * ativo vem de `active` (a rota real), nunca do último clique. */
export function MobileBottomNav(props: MobileNavState) {
  const { active, allowed, onSelect, chatUnread, dot, overdueDespesas } = props;
  const [moreOpen, setMoreOpen] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const keyboard = useEditableFocus();
  const moreActive = isMoreActive(active);
  const moreHasDot = moreGroups().some((g) =>
    g.items.some(
      (i) => allowed(i.key) && (dot(i.key) || (i.key === "financeiro" && overdueDespesas)),
    ),
  );

  return (
    <>
      <nav
        aria-label="Navegação principal"
        className={`fixed bottom-[calc(0.75rem+env(safe-area-inset-bottom))] left-[max(0.75rem,env(safe-area-inset-left))] right-[max(0.75rem,env(safe-area-inset-right))] z-40 rounded-2xl border border-border bg-background p-1 shadow-lg shadow-black/10 md:hidden ${
          keyboard ? "hidden" : ""
        }`}
      >
        <ul className="grid grid-cols-5 gap-1">
          {MOBILE_PRIMARY_KEYS.map((key) => {
            const item = itemByKey(key)!;
            const Icon = item.icon;
            const isActive = active === key;
            const ok = allowed(key);
            const unread = key === "chat" && ok ? chatUnread : 0;
            const showDot = ok && key !== "chat" && dot(key);
            return (
              <li key={key}>
                <button
                  type="button"
                  disabled={!ok}
                  onClick={() => ok && onSelect(key)}
                  aria-current={isActive ? "page" : undefined}
                  aria-label={
                    !ok
                      ? `${item.label}. Sem permissão para acessar esta seção`
                      : unread > 0
                        ? `${item.label}, ${unread} mensagens não lidas`
                        : showDot
                          ? `${item.label}, há novidades`
                          : undefined
                  }
                  className={`${itemBase} h-14 w-full ${
                    !ok
                      ? "cursor-not-allowed text-text-secondary"
                      : isActive
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground active:bg-muted/60"
                  }`}
                >
                  <span className="relative">
                    <Icon
                      className="h-[22px] w-[22px]"
                      strokeWidth={isActive ? 2.25 : 1.75}
                      aria-hidden="true"
                    />
                    {unread > 0 && (
                      <span
                        aria-hidden="true"
                        className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-semibold leading-none text-brand-foreground"
                      >
                        {unread > 99 ? "99+" : unread}
                      </span>
                    )}
                    {showDot && (
                      <span
                        aria-hidden="true"
                        className="absolute -right-1 -top-0.5 h-1.5 w-1.5 rounded-full bg-destructive"
                      />
                    )}
                    {!ok && (
                      <Lock
                        aria-hidden="true"
                        className="absolute -right-2 -top-1 h-2.5 w-2.5 text-text-secondary"
                      />
                    )}
                  </span>
                  <span
                    className={`text-[11px] leading-none ${isActive ? "font-semibold" : "font-medium"}`}
                  >
                    {item.label}
                  </span>
                </button>
              </li>
            );
          })}
          <li>
            <button
              ref={moreButtonRef}
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              aria-current={moreActive ? "page" : undefined}
              aria-label={moreHasDot ? "Mais, há novidades" : undefined}
              className={`${itemBase} h-14 w-full ${
                moreActive ? "bg-muted text-foreground" : "text-muted-foreground active:bg-muted/60"
              }`}
            >
              <span className="relative">
                <Menu
                  className="h-[22px] w-[22px]"
                  strokeWidth={moreActive ? 2.25 : 1.75}
                  aria-hidden="true"
                />
                {moreHasDot && (
                  <span
                    aria-hidden="true"
                    className="absolute -right-1 -top-0.5 h-1.5 w-1.5 rounded-full bg-destructive"
                  />
                )}
              </span>
              <span
                className={`text-[11px] leading-none ${moreActive ? "font-semibold" : "font-medium"}`}
              >
                Mais
              </span>
            </button>
          </li>
        </ul>
      </nav>

      <MoreSheet
        open={moreOpen}
        onOpenChange={setMoreOpen}
        returnFocusTo={moreButtonRef}
        {...props}
        onSelect={(key) => {
          setMoreOpen(false);
          props.onSelect(key);
        }}
      />
    </>
  );
}

function MoreSheet({
  open,
  onOpenChange,
  active,
  allowed,
  onSelect,
  dot,
  overdueDespesas,
  returnFocusTo,
}: MobileNavState & {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  returnFocusTo: React.RefObject<HTMLButtonElement | null>;
}) {
  const account: NavItem[] = [
    { key: "configuracoes", label: "Configurações", icon: Settings },
    { key: "problemas", label: "Problemas", icon: LifeBuoy },
  ];
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="flex max-h-[85dvh] flex-col gap-0 rounded-t-2xl p-0 md:hidden"
        onCloseAutoFocus={(e) => {
          // sheet controlado (sem Trigger): devolve o foco ao botão "Mais"
          e.preventDefault();
          returnFocusTo.current?.focus();
        }}
      >
        <SheetHeader className="shrink-0 px-5 pb-2 pt-5 text-left">
          <SheetTitle className="text-base">Mais</SheetTitle>
          <SheetDescription className="sr-only">
            Demais módulos e configurações do Portal do Time.
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-2">
          {[...moreGroups(), { title: "Conta", items: account }].map((group) => (
            <section key={group.title} aria-label={group.title} className="mb-2">
              <h3 className="px-2.5 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-text-secondary">
                {group.title}
              </h3>
              <ul>
                {group.items.map((item) => (
                  <MoreRow
                    key={item.key}
                    item={item}
                    active={active === item.key}
                    ok={
                      item.key === "configuracoes" || item.key === "problemas"
                        ? true
                        : allowed(item.key)
                    }
                    badge={
                      (dot(item.key) && (
                        <span
                          aria-label="Novidades"
                          className="h-1.5 w-1.5 shrink-0 rounded-full bg-destructive"
                        />
                      )) ||
                      (item.key === "financeiro" && overdueDespesas ? (
                        <AlertTriangle
                          aria-label="Despesas vencidas"
                          className="h-3.5 w-3.5 shrink-0 fill-amber-500 text-background"
                        />
                      ) : null)
                    }
                    onSelect={onSelect}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
        <div className="shrink-0 pb-[env(safe-area-inset-bottom)]">
          <SidebarProfile />
        </div>
      </SheetContent>
    </Sheet>
  );
}

function MoreRow({
  item,
  active,
  ok,
  badge,
  onSelect,
}: {
  item: NavItem;
  active: boolean;
  ok: boolean;
  badge: ReactNode;
  onSelect: (key: SectionKey) => void;
}) {
  const Icon = item.icon;
  return (
    <li>
      <button
        type="button"
        disabled={!ok}
        onClick={() => ok && onSelect(item.key)}
        aria-current={active ? "page" : undefined}
        title={ok ? undefined : "Sem permissão para acessar esta seção"}
        className={`relative flex h-12 w-full items-center gap-3 rounded-md px-2.5 text-left text-sm transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
          !ok
            ? "cursor-not-allowed text-text-secondary"
            : active
              ? "bg-muted font-medium text-foreground"
              : "text-muted-foreground active:bg-muted/60"
        }`}
      >
        {active && (
          <span
            aria-hidden="true"
            className="absolute inset-y-2.5 left-0 w-0.5 rounded-full bg-brand"
          />
        )}
        <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        {badge}
        {!ok && <Lock aria-hidden="true" className="h-3 w-3 shrink-0 text-text-secondary" />}
      </button>
    </li>
  );
}
