import type { Cliente } from "@/lib/clientes-store";
import { ClienteSection } from "./ClienteSection";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-text-secondary">
        {label}
      </dt>
      <dd className="mt-0.5 whitespace-pre-wrap break-words text-sm text-foreground">{value}</dd>
    </div>
  );
}

/** Contexto comercial de um cliente em Captação — só os campos preenchidos, sem moldura. */
export function ClienteComercialSection({ cliente }: { cliente: Cliente }) {
  return (
    <ClienteSection title="Comercial">
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {cliente.proximoPasso?.trim() && (
          <Field label="Próximo passo" value={cliente.proximoPasso} />
        )}
        {cliente.previsaoFechamento?.trim() && (
          <Field
            label="Previsão de fechamento"
            value={new Date(cliente.previsaoFechamento).toLocaleDateString("pt-BR")}
          />
        )}
        {cliente.observacaoNegociacao?.trim() && (
          <Field label="Observação" value={cliente.observacaoNegociacao} />
        )}
      </dl>
      <p className="mt-3 text-[11px] text-text-secondary">
        Estimativa comercial — nenhum valor aqui é receita confirmada.
      </p>
    </ClienteSection>
  );
}
