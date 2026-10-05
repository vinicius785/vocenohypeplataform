import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/** Peças de apresentação do "cockpit" do influenciador (detalhe dentro da campanha). Só layout e
 * tipografia — nenhum dado ou regra de negócio mora aqui. Variação controlada: títulos em
 * caixa-alta pequena, faixa única de indicadores, superfícies suaves só onde agrupam informação
 * relacionada, o resto aberto e separado por divisores. */

export function CockpitTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2
        role="heading"
        aria-level={2}
        className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary"
      >
        {children}
      </h2>
      {action}
    </div>
  );
}

/** Link-botão discreto ("Ver entrega →", "Editar", "Adicionar motivo"). */
export function QuietButton({
  children,
  onClick,
  className,
}: {
  children: ReactNode;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 text-xs font-medium text-text-secondary underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Faixa única de indicadores (uma superfície, divisores sutis) — não são cards independentes. */
export function SummaryStrip({
  items,
}: {
  items: { label: string; value: string; emphasis?: boolean }[];
}) {
  return (
    <div className="grid grid-cols-4 divide-x divide-border/60 rounded-lg bg-muted/25 py-2.5">
      {items.map((s) => (
        <div key={s.label} className="min-w-0 px-2.5 sm:px-3.5">
          <p className="truncate text-[10px] font-medium uppercase tracking-wide text-text-secondary sm:text-[11px]">
            {s.label}
          </p>
          <p
            className={cn(
              "mt-0.5 truncate text-base font-semibold tabular-nums sm:text-lg",
              s.emphasis ? "text-foreground" : "text-foreground/90",
            )}
          >
            {s.value}
          </p>
        </div>
      ))}
    </div>
  );
}

/** Pares rótulo/valor em grade (resumos de perfil e de financeiro). */
export function KeyStats({
  items,
}: {
  items: { label: string; value: ReactNode; muted?: boolean }[];
}) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
      {items.map((s) => (
        <div key={s.label} className="min-w-0">
          <dt className="text-[11px] text-text-secondary">{s.label}</dt>
          <dd
            className={cn(
              "mt-0.5 truncate text-sm font-medium",
              s.muted ? "text-text-secondary" : "text-foreground",
            )}
          >
            {s.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** "Ver audiência ⌄" / "Editar detalhes ⌄": abre/fecha uma área logo abaixo. */
export function Disclosure({
  label,
  open,
  onToggle,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="inline-flex items-center gap-1 text-xs font-medium text-text-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      {label}
      <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
    </button>
  );
}

/** Texto editorial editável SEM parecer formulário: leitura por padrão; "Editar"/"Adicionar" abre um
 * campo, que salva ao sair (ou Ctrl/Cmd+Enter) e fecha. `surface` = pequena superfície suave. */
export function InlineNote({
  label,
  hint,
  value,
  placeholder,
  emptyText = "Nada registrado.",
  addLabel = "Adicionar",
  surface = true,
  quote = false,
  onSave,
  footer,
}: {
  label: string;
  hint?: string;
  value: string;
  /** Dica dentro do campo de edição. */
  placeholder?: string;
  /** Texto da leitura quando está vazio. */
  emptyText?: string;
  addLabel?: string;
  surface?: boolean;
  /** Apresenta o texto como citação editorial (linha lateral). */
  quote?: boolean;
  onSave: (next: string) => void;
  footer?: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);
  const commit = () => {
    const next = draft.trim();
    if (next !== value.trim()) onSave(next);
    setEditing(false);
  };
  return (
    <section
      aria-label={label}
      className={cn("min-w-0 space-y-1.5", surface && "rounded-lg bg-muted/25 p-3")}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-medium text-text-secondary" title={hint}>
          {label}
        </h3>
        {!editing && (
          <QuietButton onClick={() => setEditing(true)}>{value ? "Editar" : addLabel}</QuietButton>
        )}
      </div>
      {editing ? (
        <textarea
          autoFocus
          value={draft}
          rows={4}
          placeholder={placeholder}
          aria-label={label}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setDraft(value);
              setEditing(false);
            }
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) commit();
          }}
          className="w-full resize-y rounded-md border border-border bg-background px-2.5 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
        />
      ) : null}
      {editing ? (
        <div className="flex justify-end gap-3">
          <QuietButton
            onClick={() => {
              setDraft(value);
              setEditing(false);
            }}
          >
            Cancelar
          </QuietButton>
          <button
            type="button"
            onClick={commit}
            className="rounded-md bg-foreground px-2.5 py-1 text-xs font-medium text-background hover:opacity-90"
          >
            Salvar
          </button>
        </div>
      ) : value ? (
        <p
          className={cn(
            "whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground",
            quote && "border-l-2 border-border pl-3",
          )}
        >
          {value}
        </p>
      ) : (
        <p className="text-sm text-text-secondary">{emptyText}</p>
      )}
      {footer}
    </section>
  );
}
