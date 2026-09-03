import { useMemo, useState } from "react";
import { X } from "lucide-react";
import {
  type ManualEntry,
  type Kind,
  fmtBRL,
  parseMoney,
  todayISO,
  formatIsoDate,
} from "@/lib/financeiro-entries";
import { parseCsv, parseFlexibleDate } from "@/lib/csv";
import { Field } from "./shared";

type ColRole = "ignore" | "description" | "amount" | "date" | "status";
const COL_ROLE_LABEL: Record<ColRole, string> = {
  ignore: "Ignorar",
  description: "Descrição",
  amount: "Valor",
  date: "Data",
  status: "Status",
};

export function ImportDialog({
  onClose,
  onImport,
}: {
  onClose: () => void;
  onImport: (entries: ManualEntry[]) => void;
}) {
  const [raw, setRaw] = useState("");
  const [rows, setRows] = useState<string[][] | null>(null);
  const [roles, setRoles] = useState<ColRole[]>([]);
  const [pendingFilter, setPendingFilter] = useState("a fazer");
  const [defaultKind, setDefaultKind] = useState<Kind>("despesa");
  const [defaultCategory, setDefaultCategory] = useState("Importado do ClickUp");
  const [importing, setImporting] = useState(false);

  const parse = () => {
    const parsed = parseCsv(raw);
    if (parsed.length === 0) return;
    setRows(parsed);
    const cols = parsed[0].length;
    setRoles(Array.from({ length: cols }, () => "ignore"));
  };

  const statusColIdx = roles.indexOf("status");
  const descColIdx = roles.indexOf("description");
  const amountColIdx = roles.indexOf("amount");
  const dateColIdx = roles.indexOf("date");

  const preview = useMemo(() => {
    if (!rows) return [];
    return rows
      .filter((r) => {
        if (statusColIdx === -1) return true;
        const s = (r[statusColIdx] ?? "").trim().toLowerCase();
        if (!pendingFilter.trim()) return true;
        return s.includes(pendingFilter.trim().toLowerCase());
      })
      .map((r) => {
        const description = descColIdx !== -1 ? (r[descColIdx] ?? "").trim() : r.join(" ").trim();
        const amount = amountColIdx !== -1 ? parseMoney(r[amountColIdx]) : 0;
        const date =
          dateColIdx !== -1 ? parseFlexibleDate(r[dateColIdx] ?? "") || todayISO() : todayISO();
        return { description, amount, date };
      })
      .filter((r) => r.description);
  }, [rows, roles, pendingFilter, statusColIdx, descColIdx, amountColIdx, dateColIdx]);

  const handleImport = () => {
    if (importing) return;
    setImporting(true);
    const entries: ManualEntry[] = preview.map((p) => ({
      id: crypto.randomUUID(),
      date: p.date,
      description: p.description,
      category: defaultCategory,
      amount: p.amount,
      kind: defaultKind,
    }));
    onImport(entries);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        onClick={(ev) => ev.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-background shadow-lg"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold">Importar lista (ClickUp ou outra planilha)</h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className="cursor-pointer">
            <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {!rows ? (
            <>
              <p className="text-xs text-muted-foreground">
                Selecione as linhas na sua lista (ClickUp, planilha, etc.) e copie — cole o conteúdo
                aqui. Se a origem tinha colunas, elas são preservadas.
              </p>
              <textarea
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                placeholder="Cole aqui..."
                rows={10}
                className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                type="button"
                disabled={!raw.trim()}
                onClick={parse}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Analisar
              </button>
            </>
          ) : (
            <>
              <div>
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  O que cada coluna representa
                </p>
                <div className="flex flex-wrap gap-2">
                  {roles.map((role, i) => (
                    <label key={i} className="flex flex-col gap-1">
                      <span className="truncate text-[10px] text-muted-foreground">
                        Coluna {i + 1}: "{(rows[0][i] ?? "").slice(0, 20) || "—"}"
                      </span>
                      <select
                        value={role}
                        onChange={(e) =>
                          setRoles((prev) =>
                            prev.map((r, idx) => (idx === i ? (e.target.value as ColRole) : r)),
                          )
                        }
                        className="h-8 cursor-pointer rounded-md border border-input bg-background px-1.5 text-xs outline-none focus:ring-2 focus:ring-ring"
                      >
                        {(Object.keys(COL_ROLE_LABEL) as ColRole[]).map((r) => (
                          <option key={r} value={r}>
                            {COL_ROLE_LABEL[r]}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              </div>

              {statusColIdx !== -1 && (
                <Field label="Só importar linhas cujo status contenha (deixe vazio pra trazer todas)">
                  <input
                    value={pendingFilter}
                    onChange={(e) => setPendingFilter(e.target.value)}
                    placeholder="a fazer"
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                </Field>
              )}

              <div className="grid grid-cols-2 gap-3">
                <Field label="Tipo padrão">
                  <select
                    value={defaultKind}
                    onChange={(e) => setDefaultKind(e.target.value as Kind)}
                    className="h-9 w-full cursor-pointer rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="despesa">Despesa</option>
                    <option value="receita">Receita</option>
                  </select>
                </Field>
                <Field label="Categoria padrão">
                  <input
                    value={defaultCategory}
                    onChange={(e) => setDefaultCategory(e.target.value)}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                </Field>
              </div>

              {amountColIdx === -1 && (
                <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                  Nenhuma coluna de valor selecionada — os lançamentos entrarão com R$ 0,00, pra
                  você preencher depois em cada um.
                </p>
              )}
              {dateColIdx === -1 && (
                <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  Nenhuma coluna de data selecionada — os lançamentos entrarão com a data de hoje.
                </p>
              )}

              <div>
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Prévia ({preview.length} {preview.length === 1 ? "lançamento" : "lançamentos"})
                </p>
                <div className="max-h-56 overflow-y-auto rounded-md border border-border">
                  <table className="w-full text-xs">
                    <tbody className="divide-y divide-border">
                      {preview.slice(0, 50).map((p, i) => (
                        <tr key={i}>
                          <td className="truncate px-2 py-1.5">{p.description}</td>
                          <td className="whitespace-nowrap px-2 py-1.5 text-muted-foreground">
                            {formatIsoDate(p.date)}
                          </td>
                          <td className="whitespace-nowrap px-2 py-1.5 text-right font-medium">
                            {fmtBRL(p.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {preview.length > 50 && (
                    <p className="px-2 py-1.5 text-[11px] text-muted-foreground">
                      + {preview.length - 50} outros...
                    </p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {rows && (
          <div className="flex items-center justify-between border-t border-border px-5 py-3">
            <button
              type="button"
              onClick={() => setRows(null)}
              className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Voltar
            </button>
            <button
              type="button"
              disabled={preview.length === 0 || importing}
              onClick={handleImport}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {importing
                ? "Importando..."
                : `Importar ${preview.length} ${preview.length === 1 ? "lançamento" : "lançamentos"}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
