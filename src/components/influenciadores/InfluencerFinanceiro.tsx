import type { ReactNode } from "react";
import { FileText } from "lucide-react";
import { CockpitTitle, QuietButton } from "./InfluencerCockpit";
import type { PaymentTone as FinTone } from "@/lib/influencer-finance";
import { cn } from "@/lib/utils";

/** Peças de apresentação de Recursos → Financeiro (só layout; as regras estão em
 * `lib/influencer-finance.ts` e os dados continuam nos campos que já existiam). Linguagem do Início:
 * faixa de indicadores com divisores sutis, títulos em caixa-alta pequena, listas e ações discretas —
 * sem um cartão por informação. */

const FIN_DOT: Record<FinTone, string> = {
  ok: "bg-emerald-500",
  pending: "bg-amber-500",
  alert: "bg-red-500",
  info: "bg-sky-500",
  neutral: "bg-muted-foreground/40",
};

/** Ponto de estado — a cor só comunica estado (verde ok, âmbar pendente, vermelho problema, azul em curso). */
export function StateDot({ tone, className }: { tone: FinTone; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("h-1.5 w-1.5 shrink-0 rounded-full", FIN_DOT[tone], className)}
    />
  );
}

export type SummaryCell = {
  key: string;
  label: string;
  value: string;
  /** Linha pequena abaixo do valor (ex.: "Valor fechado", "Não definida"). */
  caption?: string;
  tone: FinTone;
  /** O número que importa: maior e mais pesado. */
  emphasis?: boolean;
};

/** RESUMO: uma faixa horizontal (2×2 no celular) com divisores verticais sutis, como os indicadores
 * do Início — rótulo pequeno em caixa-alta e o valor logo abaixo. A remuneração pesa mais. */
export function FinanceSummary({ cells }: { cells: SummaryCell[] }) {
  return (
    <div
      className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-flow-col sm:auto-cols-fr sm:gap-x-0 sm:divide-x sm:divide-border/60"
      role="group"
      aria-label="Resumo financeiro"
    >
      {cells.map((c) => (
        <div key={c.key} className="min-w-0 sm:px-4 sm:first:pl-0 sm:last:pr-0">
          <p className="truncate text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {c.label}
          </p>
          <p
            className={cn(
              "mt-1 flex items-center gap-1.5 font-semibold tabular-nums text-foreground",
              c.emphasis ? "text-xl" : "text-base",
            )}
          >
            <StateDot tone={c.tone} />
            <span className="truncate">{c.value}</span>
          </p>
          {c.caption && <p className="mt-0.5 truncate text-xs text-text-secondary">{c.caption}</p>}
        </div>
      ))}
    </div>
  );
}

export type PendencyItem = { key: string; text: string; tone: FinTone; actions?: ReactNode };

/** PENDÊNCIAS: lista simples — descrição e a ação logo ao lado, só quando há algo a fazer. */
export function FinancePendencies({ items }: { items: PendencyItem[] }) {
  return (
    <section aria-label="Pendências" className="space-y-1.5">
      <CockpitTitle>Pendências</CockpitTitle>
      {items.length === 0 ? (
        <p className="text-sm text-text-secondary">Nada pendente.</p>
      ) : (
        <ul className="space-y-1">
          {items.map((it) => (
            <li
              key={it.key}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 py-1 text-sm"
            >
              <span className="flex min-w-0 items-center gap-2 text-foreground">
                <StateDot tone={it.tone} />
                {it.text}
              </span>
              {it.actions && (
                <span className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1">
                  {it.actions}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Bloco de detalhe (Remuneração, Pagamento, Dados bancários, Contrato): título pequeno, ação
 * contextual ao lado do título e o conteúdo logo abaixo — sem moldura. */
export function FinanceSection({
  title,
  action,
  className,
  children,
}: {
  title: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className={cn("min-w-0 space-y-2", className)}>
      <CockpitTitle action={action}>{title}</CockpitTitle>
      {children}
    </section>
  );
}

/** ATIVIDADE FINANCEIRA: só os eventos financeiros, uma linha cada ("05/10 · texto"). */
export function FinanceActivity({
  items,
  showAll,
  onToggleAll,
  limit = 3,
}: {
  items: { id: string; day: string; text: string }[];
  showAll: boolean;
  onToggleAll: () => void;
  limit?: number;
}) {
  if (items.length === 0) return null;
  const visible = showAll ? items : items.slice(0, limit);
  return (
    <FinanceSection
      title="Atividade financeira"
      action={
        items.length > limit ? (
          <QuietButton onClick={onToggleAll}>{showAll ? "Ver menos" : "Ver tudo"}</QuietButton>
        ) : undefined
      }
    >
      <ul className="space-y-1.5 text-sm">
        {visible.map((it) => (
          <li key={it.id} className="text-foreground">
            <span className="tabular-nums text-text-secondary">{it.day}</span>
            <span className="text-text-secondary"> · </span>
            {it.text}
          </li>
        ))}
      </ul>
    </FinanceSection>
  );
}

/** Arquivo compacto (comprovante): nome, dica e ações Visualizar / Substituir / Remover. */
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
    <div className="flex items-center gap-3">
      <FileText className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{name}</p>
        {hint && <p className="text-xs text-text-secondary">{hint}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <QuietButton onClick={onOpen}>Visualizar</QuietButton>
        {onReplace && <QuietButton onClick={onReplace}>Substituir</QuietButton>}
        {onRemove && <QuietButton onClick={onRemove}>Remover</QuietButton>}
      </div>
    </div>
  );
}
