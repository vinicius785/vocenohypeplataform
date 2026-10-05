import type { ReactNode } from "react";
import { FileText } from "lucide-react";
import { QuietButton } from "./InfluencerCockpit";
import type { PaymentTone as FinTone } from "@/lib/influencer-finance";
import { cn } from "@/lib/utils";

/** Peças de apresentação do financeiro do influenciador (só layout; as regras estão em
 * `lib/influencer-finance.ts` e os dados continuam nos campos que já existiam). */

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
    <div className="flex items-center gap-3">
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

/** Eventos financeiros recentes: data/hora e texto, só uma lista (sem linha vertical nem cartões). */
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
    <ul className="space-y-2">
      {items.map((it) => (
        <li key={it.id}>
          <p className="text-[11px] tabular-nums text-text-secondary">{it.when}</p>
          <p className="text-sm text-foreground">{it.text}</p>
        </li>
      ))}
    </ul>
  );
}

const FIN_DOT: Record<FinTone, string> = {
  ok: "bg-emerald-500",
  pending: "bg-amber-500",
  alert: "bg-rose-500",
  info: "bg-sky-500",
  neutral: "bg-muted-foreground/40",
};

/** Uma linha do financeiro: ponto de estado + rótulo à esquerda, valor/estado ao centro e ações
 * discretas à direita; o detalhe (editor, lista) abre logo abaixo, alinhado ao conteúdo. */
export function FinLine({
  tone,
  label,
  children,
  actions,
  below,
}: {
  tone: FinTone;
  label: string;
  children: ReactNode;
  actions?: ReactNode;
  below?: ReactNode;
}) {
  return (
    <div className="py-3">
      <div className="flex flex-col gap-x-4 gap-y-1 sm:flex-row sm:items-baseline">
        <span className="flex shrink-0 items-center gap-2 text-sm text-text-secondary sm:w-36">
          <span aria-hidden className={cn("h-1.5 w-1.5 shrink-0 rounded-full", FIN_DOT[tone])} />
          {label}
        </span>
        <div className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5">
          <div className="min-w-0 text-sm text-foreground">{children}</div>
          {actions && (
            <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1">{actions}</div>
          )}
        </div>
      </div>
      {below && <div className="mt-2.5 sm:pl-40">{below}</div>}
    </div>
  );
}
