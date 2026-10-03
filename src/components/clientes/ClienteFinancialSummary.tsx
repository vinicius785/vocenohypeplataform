import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { SURFACE } from "@/lib/design-tokens";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useFinanceiroEntries,
  kpiTotals,
  upcomingDue,
  dueBucket,
  fmtBRL,
  todayISO,
} from "@/lib/financeiro-entries";

/**
 * Resumo financeiro do cliente (item 16 da reconstrução do domínio
 * Comercial/Clientes/Campanhas/Contratos/Financeiro) — mostra e linka pro
 * módulo Financeiro completo, NUNCA duplica ele por inteiro aqui ("Não
 * duplicar o módulo Financeiro inteiro dentro do cliente. Mostrar resumo e
 * itens relacionados, com link para visão completa"). Filtra
 * `useFinanceiroEntries()` (fonte única já usada pelo Financeiro) por
 * `clienteId` — nenhum cálculo novo, só um recorte + agregação do que já
 * existe.
 */
export function ClienteFinancialSummary({ clienteId }: { clienteId: string }) {
  const navigate = useNavigate();
  const allEntries = useFinanceiroEntries();
  const clienteEntries = useMemo(
    () => allEntries.filter((e) => e.clienteId === clienteId),
    [allEntries, clienteId],
  );
  const totals = useMemo(() => kpiTotals(clienteEntries), [clienteEntries]);
  const hoje = todayISO();
  const vencido = useMemo(
    () =>
      clienteEntries
        .filter(
          (e) =>
            (e.status === "a_receber" || e.status === "a_pagar") &&
            dueBucket(e.vencimento, hoje) === "vencido",
        )
        .reduce((s, e) => s + e.amount, 0),
    [clienteEntries, hoje],
  );
  const proximoVencimento = useMemo(() => upcomingDue(clienteEntries, 1)[0], [clienteEntries]);

  const openFinanceiro = () => {
    window.dispatchEvent(new CustomEvent("nav:section", { detail: "financeiro" }));
    void navigate({ to: "/time", search: { section: "financeiro" } });
  };

  const hasAnyMovement = clienteEntries.length > 0;

  return (
    <section className={cn(SURFACE.card, "p-5 md:p-6")}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Financeiro</h2>
        <Button variant="ghost" size="sm" onClick={openFinanceiro}>
          Ver Financeiro completo <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </div>

      {!hasAnyMovement ? (
        <div className="flex items-center gap-2.5 rounded-xl border border-border/60 bg-background p-3 text-sm text-text-secondary">
          <Wallet className="h-4 w-4 shrink-0" />
          Financeiro não configurado. Nenhum lançamento vinculado a este cliente ainda.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-border/60 bg-background p-3">
            <p className="text-xs text-text-secondary">A receber</p>
            <p className="mt-0.5 text-lg font-semibold text-foreground">
              {fmtBRL(totals.aReceber)}
            </p>
          </div>
          <div className="rounded-xl border border-border/60 bg-background p-3">
            <p className="text-xs text-text-secondary">Vencido</p>
            <p
              className={`mt-0.5 text-lg font-semibold ${vencido > 0 ? "text-destructive" : "text-foreground"}`}
            >
              {fmtBRL(vencido)}
            </p>
          </div>
          <div className="rounded-xl border border-border/60 bg-background p-3">
            <p className="text-xs text-text-secondary">Recebido</p>
            <p className="mt-0.5 text-lg font-semibold text-foreground">
              {fmtBRL(totals.receitaRealizada)}
            </p>
          </div>
          <div className="rounded-xl border border-border/60 bg-background p-3">
            <p className="text-xs text-text-secondary">Custos (a pagar)</p>
            <p className="mt-0.5 text-lg font-semibold text-foreground">{fmtBRL(totals.aPagar)}</p>
          </div>
        </div>
      )}

      {proximoVencimento && (
        <p className="mt-3 text-xs text-text-secondary">
          Próximo vencimento: <strong>{proximoVencimento.description}</strong> em{" "}
          {new Date(proximoVencimento.vencimento + "T00:00:00").toLocaleDateString("pt-BR")} (
          {fmtBRL(proximoVencimento.amount)})
        </p>
      )}
    </section>
  );
}
