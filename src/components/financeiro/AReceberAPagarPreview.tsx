import {
  type Entry,
  type Kind,
  fmtBRL,
  formatIsoDate,
  sortByUrgency,
} from "@/lib/financeiro-entries";

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
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {titulo}
      </p>
      <p className="mt-0.5 text-xl font-semibold tabular-nums text-foreground">{fmtBRL(total)}</p>
      {vencidos > 0 && (
        <p className="text-[11px] text-rose-600">
          {vencidos} vencido{vencidos > 1 ? "s" : ""}
        </p>
      )}
      {itens.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">Nada pendente. 🎉</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {itens.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="min-w-0 flex-1 truncate text-foreground">{e.description}</span>
              <span
                className={`shrink-0 tabular-nums ${e.status === "vencido" ? "text-rose-600" : "text-muted-foreground"}`}
              >
                {formatIsoDate(e.vencimento)}
              </span>
              <span className="shrink-0 font-medium tabular-nums text-foreground">
                {fmtBRL(e.amount)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={onVerTodos}
        className="mt-2 cursor-pointer text-xs font-medium text-foreground underline underline-offset-4 hover:no-underline"
      >
        Ver {titulo.toLowerCase()} →
      </button>
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
    const itens = sortByUrgency(pending).slice(0, 3);
    return { total, vencidos, itens };
  };

  const aReceber = build("receita");
  const aPagar = build("despesa");

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
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
