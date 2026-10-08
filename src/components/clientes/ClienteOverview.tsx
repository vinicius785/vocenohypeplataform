import { useMemo } from "react";
import { ArrowRight, Mail, MessageCircle } from "lucide-react";
import type { Cliente } from "@/lib/clientes-store";
import { fmtBRL, useFinanceiroEntries } from "@/lib/financeiro-entries";
import { cn } from "@/lib/utils";
import { campanhasOverview, financeOverview } from "./cliente-overview";
import { mailtoLink, waLink } from "./cliente-ui";

const LABEL = "text-[11px] font-medium uppercase tracking-wide text-text-secondary";
const LINK =
  "inline-flex items-center gap-1 text-xs font-medium text-text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 space-y-1 py-4 first:pt-0 last:pb-0 md:px-6 md:py-0 md:first:pl-0 md:last:pr-0">
      <p className={LABEL}>{label}</p>
      {children}
    </div>
  );
}

/**
 * Faixa de overview da Central do Cliente: Campanhas | Contato | Financeiro. Três blocos de
 * informação separados por divisores (não três cards), todos com dados que já existem — nada de KPI
 * novo. No mobile viram uma sequência vertical com divisores horizontais.
 */
export function ClienteOverview({
  cliente,
  onVerCampanhas,
  onVerFinanceiro,
  onEditarContato,
}: {
  cliente: Cliente;
  onVerCampanhas: () => void;
  onVerFinanceiro: () => void;
  onEditarContato: () => void;
}) {
  const camp = useMemo(() => campanhasOverview(cliente.campanhas ?? []), [cliente.campanhas]);
  const all = useFinanceiroEntries();
  const fin = useMemo(
    () =>
      financeOverview(
        all.filter((e) => e.clienteId === cliente.id),
        undefined,
      ),
    [all, cliente.id],
  );
  const mail = cliente.email?.trim() ? mailtoLink(cliente.email) : null;
  const wa = cliente.whatsapp?.trim() ? waLink(cliente.whatsapp) : null;
  const hasContact = Boolean(
    cliente.responsavel?.trim() || cliente.email?.trim() || cliente.whatsapp?.trim(),
  );

  return (
    <div className="grid grid-cols-1 divide-y divide-border/60 md:grid-cols-3 md:divide-x md:divide-y-0">
      <Block label="Campanhas">
        <p className="text-2xl font-semibold tabular-nums leading-tight text-foreground">
          {camp.total}
          <span className="ml-1.5 text-sm font-normal text-text-secondary">
            {camp.total === 1 ? "campanha" : "campanhas"}
          </span>
        </p>
        <p className="text-sm text-text-secondary">
          {camp.total === 0
            ? "Nenhuma criada ainda"
            : `${camp.ativas} ${camp.ativas === 1 ? "ativa" : "ativas"}`}
        </p>
        {camp.total > 0 && (
          <button type="button" onClick={onVerCampanhas} className={LINK}>
            Ver campanhas <ArrowRight className="h-3 w-3" aria-hidden="true" />
          </button>
        )}
      </Block>

      <Block label="Contato">
        {hasContact ? (
          <>
            <p className="truncate text-base font-medium leading-tight text-foreground">
              {cliente.responsavel?.trim() || "Contato sem nome"}
            </p>
            {mail && (
              <a
                href={mail}
                className="flex items-center gap-1.5 truncate text-sm text-text-secondary hover:text-foreground hover:underline"
              >
                <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{cliente.email}</span>
              </a>
            )}
            {wa && (
              <a href={wa} target="_blank" rel="noopener noreferrer" className={cn(LINK, "mt-0.5")}>
                <MessageCircle className="h-3 w-3" aria-hidden="true" /> WhatsApp{" "}
                <ArrowRight className="h-3 w-3" aria-hidden="true" />
              </a>
            )}
          </>
        ) : (
          <>
            <p className="text-sm text-text-secondary">Contato não informado</p>
            <button type="button" onClick={onEditarContato} className={LINK}>
              Adicionar contato <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </button>
          </>
        )}
      </Block>

      <Block label="Financeiro">
        {fin.hasMovement ? (
          <>
            <p className="text-2xl font-semibold tabular-nums leading-tight text-foreground">
              {fmtBRL(fin.aReceber)}
              <span className="ml-1.5 text-sm font-normal text-text-secondary">a receber</span>
            </p>
            <p
              className={cn(
                "text-sm tabular-nums",
                fin.vencido > 0 ? "text-destructive" : "text-text-secondary",
              )}
            >
              {fin.vencido > 0 ? `${fmtBRL(fin.vencido)} vencido` : "Nada vencido"}
            </p>
          </>
        ) : (
          <p className="text-sm text-text-secondary">Sem lançamentos para este cliente</p>
        )}
        <button type="button" onClick={onVerFinanceiro} className={LINK}>
          Ver financeiro <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </button>
      </Block>
    </div>
  );
}
