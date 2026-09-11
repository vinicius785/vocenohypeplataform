import {
  type Entry,
  type Kind,
  fmtBRL,
  formatIsoDate,
  sortByUrgency,
} from "@/lib/financeiro-entries";
import { ListRow } from "@/components/shared/ListRow";
import { Button } from "@/components/ui/button";
import { SECONDARY_SURFACE } from "./PosicaoFinanceira";

function Coluna({
  titulo,
  total,
  vencidos,
  itens,
  onVerTodos,
}: {
  titulo: string;
  total: number;
  vencidos: number;
  itens: Entry[];
  onVerTodos: () => void;
}) {
  return (
    <div className={`rounded-[22px] ${SECONDARY_SURFACE} p-5`}>
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
            {titulo}
          </p>
          <p className="mt-1 whitespace-nowrap text-[22px] font-bold tabular-nums leading-none text-foreground">
            {fmtBRL(total)}
          </p>
        </div>
        {vencidos > 0 && (
          <span className="rounded-full bg-danger-soft px-2 py-0.5 text-xs font-medium text-danger">
            {vencidos} vencido{vencidos > 1 ? "s" : ""}
          </span>
        )}
      </div>
      <p className="mt-1 text-[11px] text-text-secondary">
        toda a carteira, não só o período selecionado
      </p>

      {itens.length === 0 ? (
        <p className="mt-3 text-sm text-text-secondary">Nada pendente por aqui.</p>
      ) : (
        <div className="-mx-2 mt-2 divide-y divide-border">
          {itens.map((e) => (
            <ListRow
              key={e.id}
              title={e.description}
              meta={formatIsoDate(e.vencimento)}
              value={fmtBRL(e.amount)}
              status={e.status === "vencido" ? { label: "Vencido", tone: "danger" } : undefined}
            />
          ))}
        </div>
      )}
      <Button variant="link" size="sm" className="mt-2 h-auto p-0" onClick={onVerTodos}>
        Ver {titulo.toLowerCase()} →
      </Button>
    </div>
  );
}

/** Substitui o antigo "Próximos vencimentos" (uma terceira lista
 * genérica no fim da página) — duas colunas direto do que já é
 * pendente, cada uma levando pra sua aba dedicada. */
export function AReceberAPagarPreview({
  all,
  onVerAReceber,
  onVerAPagar,
}: {
  all: Entry[];
  onVerAReceber: () => void;
  onVerAPagar: () => void;
}) {
  const build = (kind: Kind) => {
    const pending = all.filter(
      (e) =>
        e.kind === kind &&
        (e.status === "a_receber" || e.status === "a_pagar" || e.status === "vencido"),
    );
    const total = pending.reduce((s, e) => s + e.amount, 0);
    const vencidos = pending.filter((e) => e.status === "vencido").length;
    const itens = sortByUrgency(pending).slice(0, 2);
    return { total, vencidos, itens };
  };

  const aReceber = build("receita");
  const aPagar = build("despesa");

  return (
    <div className="flex flex-col gap-5">
      <Coluna
        titulo="A receber"
        total={aReceber.total}
        vencidos={aReceber.vencidos}
        itens={aReceber.itens}
        onVerTodos={onVerAReceber}
      />
      <Coluna
        titulo="A pagar"
        total={aPagar.total}
        vencidos={aPagar.vencidos}
        itens={aPagar.itens}
        onVerTodos={onVerAPagar}
      />
    </div>
  );
}
