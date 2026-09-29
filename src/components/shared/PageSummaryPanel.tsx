import type { ReactNode } from "react";

/* ============================================================
 * Painel de resumo neutro reutilizável — extraído da linguagem visual
 * aprovada em Reuniões (`AgendaView.tsx`, faixa "Hoje N · Esta semana N ·
 * Pendentes N" e o card "Próxima reunião" com marcador lateral azul de
 * 2-3px). Substitui os painéis `bg-brand` grandes de Clientes e Campanhas
 * (rodada de migração visual) — mesma superfície neutra do resto da
 * página (`bg-card`), acento azul só como borda lateral fina, nunca
 * preenchimento. Não usar `bg-brand`/cor azul sólida em área grande aqui.
 * ============================================================ */

export function PageSummaryPanel({
  title,
  children,
}: {
  title: string;
  /** só há acento "brand" por enquanto — prop mantida simples de propósito,
   * sem variantes de cor que incentivem reintroduzir preenchimento azul. */
  accent?: "brand";
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border/60 border-l-[3px] border-l-brand bg-card px-5 py-4 dark:shadow-none md:px-6">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
        {title}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-x-7 gap-y-3">{children}</div>
    </div>
  );
}

/** Métrica principal — número dominante, mesma escala usada em Reuniões
 * para "Hoje N" (grande, mas não do tamanho do antigo card azul). */
export function SummaryPrimaryMetric({ value, label }: { value: string; label: string }) {
  return (
    <div className="shrink-0">
      <span className="flex items-baseline gap-2">
        <span className="text-[32px] font-bold leading-none tracking-tight text-foreground md:text-[36px]">
          {value}
        </span>
        <span className="text-sm text-text-secondary">{label}</span>
      </span>
    </div>
  );
}

/** Métrica secundária compacta — texto simples por padrão; vira um botão
 * discreto (estado ativo = texto azul + `bg-brand-subtle`, nunca
 * preenchimento sólido) quando `onClick` é passado. */
export function SummaryMetric({
  label,
  value,
  onClick,
  active,
}: {
  label: string;
  value: string | number | ReactNode;
  onClick?: () => void;
  active?: boolean;
}) {
  const content = (
    <>
      <span className="text-text-secondary">{label}</span>{" "}
      <span className="font-semibold text-foreground">{value}</span>
    </>
  );

  if (!onClick) {
    return <span className="text-sm">{content}</span>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-2.5 py-1 text-sm transition-colors ${
        active ? "bg-brand-subtle text-brand" : "hover:bg-muted"
      }`}
    >
      {active ? (
        <>
          <span className={active ? "text-brand" : "text-text-secondary"}>{label}</span>{" "}
          <span className="font-semibold">{value}</span>
        </>
      ) : (
        content
      )}
    </button>
  );
}
