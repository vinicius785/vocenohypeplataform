import type { ReactNode } from "react";
import { KpiLead, KpiLeadItem, KpiLeadValue } from "./Kpi";

/* ============================================================
 * @deprecated — mantido só como alias dos consumidores ainda não migrados
 * (Campanhas, Projetos). Todo o visual vive em `Kpi.tsx` (KPI canônico,
 * variante Lead); novas telas usam `KpiLead`/`KpiLeadValue`/`KpiLeadItem`.
 * Remover quando Campanhas e Projetos forem migrados.
 * ============================================================ */

export function PageSummaryPanel({
  title,
  children,
}: {
  title: string;
  /** mantida só por compatibilidade com os consumidores atuais. */
  accent?: "brand";
  children: ReactNode;
}) {
  return (
    <KpiLead aria-label={title} className="border-b border-border/60 pb-5">
      {children}
    </KpiLead>
  );
}

export function SummaryPrimaryMetric({ value, label }: { value: string; label: string }) {
  return <KpiLeadValue value={value} label={label} />;
}

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
  if (typeof value === "string" || typeof value === "number") {
    return <KpiLeadItem label={label} value={value} onClick={onClick} active={active} />;
  }
  return (
    <span className="text-sm">
      <span className="text-text-secondary">{label}</span>{" "}
      <span className="font-semibold text-foreground">{value}</span>
    </span>
  );
}
