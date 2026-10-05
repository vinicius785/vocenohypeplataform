import type { ReactNode } from "react";
import { FileText } from "lucide-react";
import { CockpitTitle, QuietButton } from "./InfluencerCockpit";
import type { PaymentStateKey } from "@/lib/influencer-finance";
import { cn } from "@/lib/utils";

/** Peças de apresentação do financeiro do influenciador (só layout; as regras estão em
 * `lib/influencer-finance.ts` e os dados continuam nos campos que já existiam). */

/** Sub-seção do financeiro: título pequeno, ação discreta à direita, conteúdo aberto. */
export function FinanceBlock({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section aria-label={title} className={cn("space-y-2.5", className)}>
      <CockpitTitle action={action}>{title}</CockpitTitle>
      {children}
    </section>
  );
}

const STATE_STYLE: Record<PaymentStateKey, { badge: string; dot: string }> = {
  nao_iniciado: {
    badge: "border-border bg-muted/60 text-text-secondary",
    dot: "bg-muted-foreground/50",
  },
  pendente: {
    badge: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    dot: "bg-amber-500",
  },
  agendado: { badge: "border-border bg-muted/60 text-foreground", dot: "bg-sky-500" },
  vencido: {
    badge: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
    dot: "bg-rose-500",
  },
  pago: {
    badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
  recusado: {
    badge: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
    dot: "bg-rose-500",
  },
  cancelado: {
    badge: "border-border bg-muted/60 text-text-secondary",
    dot: "bg-muted-foreground/50",
  },
};

/** Estado do pagamento: um único badge, com tom só quando significa algo (pendente, vencido, pago). */
export function PaymentStateBadge({ state, label }: { state: PaymentStateKey; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        STATE_STYLE[state].badge,
      )}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", STATE_STYLE[state].dot)} />
      {label}
    </span>
  );
}

/** Arquivo compacto (contrato, comprovante): nome, tipo e ações Abrir / Substituir / Remover. */
export function FileLine({
  name,
  hint,
  onOpen,
  onReplace,
  onRemove,
}: {
  name: string;
  hint?: string;
  onOpen: () => void;
  onReplace?: () => void;
  onRemove?: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-muted/25 px-3 py-2">
      <FileText className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{name}</p>
        {hint && <p className="text-xs text-text-secondary">{hint}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <QuietButton onClick={onOpen}>Abrir</QuietButton>
        {onReplace && <QuietButton onClick={onReplace}>Substituir</QuietButton>}
        {onRemove && <QuietButton onClick={onRemove}>Remover</QuietButton>}
      </div>
    </div>
  );
}

/** Linha do tempo financeira: data/hora, texto; sem cards. */
export function FinanceTimeline({
  items,
}: {
  items: { id: string; when: string; text: string }[];
}) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-text-secondary">Nenhum evento financeiro registrado ainda.</p>
    );
  }
  return (
    <ul className="space-y-3 border-l border-border/60 pl-4">
      {items.map((it) => (
        <li key={it.id} className="relative">
          <span className="absolute -left-[19.5px] top-1.5 h-1.5 w-1.5 rounded-full bg-border" />
          <p className="text-[11px] tabular-nums text-text-secondary">{it.when}</p>
          <p className="text-sm text-foreground">{it.text}</p>
        </li>
      ))}
    </ul>
  );
}
