import type { ReactNode } from "react";
import { Check, MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { FinanceNext, PaymentTone } from "@/lib/influencer-finance";
import { cn } from "@/lib/utils";
import { StateDot } from "./InfluencerFinanceiro";

/** Peças da V2 do Financeiro do influenciador (só apresentação; regras em `lib/influencer-finance.ts`). */

/** PRÓXIMA AÇÃO: a única ação prioritária — título, uma frase e um botão. */
export function FinanceNextCard({
  next,
  busy,
  onRun,
}: {
  next: FinanceNext;
  busy?: boolean;
  onRun: () => void;
}) {
  return (
    <section
      aria-label="Próxima ação"
      className="rounded-lg border border-border bg-card px-3.5 py-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2.5">
        <div className="min-w-0 flex-1 basis-52">
          <div className="flex items-center gap-1.5">
            <StateDot tone="pending" />
            <h3 className="text-[11px] font-semibold uppercase leading-4 tracking-wide text-text-secondary">
              Próxima ação
            </h3>
          </div>
          <p className="mt-0.5 text-sm font-semibold leading-snug text-foreground">{next.title}</p>
          <p className="mt-0.5 text-xs leading-snug text-text-secondary">{next.hint}</p>
        </div>
        <button
          type="button"
          onClick={onRun}
          disabled={busy}
          className="shrink-0 rounded-md bg-foreground px-3 py-1.5 text-xs font-semibold text-background hover:opacity-90 disabled:opacity-60"
        >
          {busy ? "Enviando..." : next.cta}
        </button>
      </div>
    </section>
  );
}

export type Requisito = { key: string; label: string; ok: boolean };

/** PAGAMENTO como fluxo: estado em destaque, requisitos em linha (✓/○) e ações secundárias no ⋯. */
export function PaymentFlow({
  label,
  tone,
  detail,
  hint,
  requisitos,
  menu,
  children,
}: {
  label: string;
  tone: PaymentTone;
  detail?: string;
  hint?: string;
  requisitos: Requisito[];
  /** Itens do menu ⋯ (ações secundárias); sem itens, sem menu. */
  menu: { label: string; onSelect: () => void; destructive?: boolean }[];
  children?: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-base font-semibold text-foreground">
            <StateDot tone={tone} />
            {label}
          </p>
          {detail && <p className="text-sm text-text-secondary">{detail}</p>}
        </div>
        {menu.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Mais ações do pagamento"
                className="-mr-1.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-secondary hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {menu.map((m) => (
                <DropdownMenuItem
                  key={m.label}
                  onSelect={m.onSelect}
                  className={cn(m.destructive && "text-destructive focus:text-destructive")}
                >
                  {m.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {requisitos.length > 0 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {requisitos.map((r) => (
            <li
              key={r.key}
              className={cn(
                "inline-flex items-center gap-1",
                r.ok ? "text-foreground" : "text-text-secondary",
              )}
            >
              {r.ok ? (
                <Check aria-hidden className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 rounded-full border border-muted-foreground/50"
                />
              )}
              {r.label}
            </li>
          ))}
        </ul>
      )}
      {hint && <p className="text-xs text-text-secondary">{hint}</p>}
      {children}
    </div>
  );
}
