import type { ReactNode } from "react";
import { PageHeader } from "@/components/shared/PageHeader";

export type SectionKpi = {
  label: string;
  value: number | string;
  tone?: string; // tailwind color classes
  /** Opcional — quando presente, o tile vira clicável (ex. aplicar um
   * filtro correspondente). Sem mudança pra quem já usa `kpis` sem isso. */
  onClick?: () => void;
};

export type SectionTab = { key: string; label: string; active: boolean; onClick: () => void };

/**
 * Etapa 3: delega título/descrição/ação pro `PageHeader` canônico (mesma
 * API externa — `title`/`subtitle`/`action` continuam funcionando
 * idênticos pros consumidores atuais, via o slot livre `actionsSlot`).
 * `tabs`/`kpis` continuam suportados (nenhum consumidor deixa de
 * compilar), mas nenhum módulo migrado nesta etapa ainda passa `tabs` —
 * Financeiro/Time/Metas usam os subitens da sidebar agora.
 */
export function SectionHeader({
  title,
  subtitle,
  tabs,
  kpis,
  action,
}: {
  title: string;
  subtitle?: string;
  /** Sub-abas dentro da seção — suportado só por compatibilidade, nenhum
   * consumidor atual passa isso (ver nota acima). */
  tabs?: SectionTab[];
  kpis?: SectionKpi[];
  action?: ReactNode;
}) {
  return (
    <div>
      <PageHeader title={title} description={subtitle} actionsSlot={action} />

      {tabs && tabs.length > 0 && (
        <div className="mt-3 inline-flex items-center gap-0.5 rounded-md border border-border p-0.5 text-xs">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={t.onClick}
              className={`rounded px-2.5 py-1 font-medium ${
                t.active
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {kpis && kpis.length > 0 && (
        <div className="mt-5 flex gap-x-6 overflow-x-auto whitespace-nowrap pb-1">
          {kpis.map((k, i) => {
            const content = (
              <>
                <span
                  className={`text-xl font-semibold tabular-nums ${k.tone ?? "text-foreground"}`}
                >
                  {k.value}
                </span>
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  {k.label}
                </span>
              </>
            );
            const className = `flex shrink-0 items-baseline gap-2 ${i > 0 ? "border-l border-border pl-6" : ""}`;
            return k.onClick ? (
              <button
                key={k.label}
                type="button"
                onClick={k.onClick}
                className={`${className} rounded-sm transition-opacity hover:opacity-70`}
              >
                {content}
              </button>
            ) : (
              <div key={k.label} className={className}>
                {content}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
