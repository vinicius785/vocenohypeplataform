import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { AEO_POSICAO_LABEL, type AeoIa, type AeoPrompt, type AeoResposta } from "@/lib/aeo-store";
import { inputCls } from "../aeo-ui-utils";

type Filtro = "todos" | "preenchidos" | "nao_preenchidos" | "citada" | "nao_citada";

const FILTROS: { key: Filtro; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "preenchidos", label: "Preenchidos" },
  { key: "nao_preenchidos", label: "Não preenchidos" },
  { key: "citada", label: "Citada" },
  { key: "nao_citada", label: "Não citada" },
];

export function PromptTable({
  rodadaId,
  ia,
  ativos,
  respostas,
  onOpenPrompt,
}: {
  rodadaId: string;
  ia: AeoIa;
  ativos: AeoPrompt[];
  respostas: AeoResposta[];
  onOpenPrompt: (prompt: AeoPrompt) => void;
}) {
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busca, setBusca] = useState("");

  const respostaFor = (promptId: string) =>
    respostas.find((r) => r.rodadaId === rodadaId && r.promptId === promptId && r.ia === ia);

  const linhas = useMemo(() => {
    return ativos
      .filter(
        (p) =>
          !busca.trim() ||
          p.idCodigo.toLowerCase().includes(busca.toLowerCase()) ||
          p.texto.toLowerCase().includes(busca.toLowerCase()),
      )
      .filter((p) => {
        const r = respostaFor(p.id);
        if (filtro === "preenchidos") return !!r;
        if (filtro === "nao_preenchidos") return !r;
        if (filtro === "citada") return !!r?.citada;
        if (filtro === "nao_citada") return !!r && !r.citada;
        return true;
      })
      .sort((a, b) => a.idCodigo.localeCompare(b.idCodigo));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativos, respostas, filtro, busca, rodadaId, ia]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar prompt..."
            className={`${inputCls} w-56 pl-7`}
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {FILTROS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFiltro(f.key)}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                filtro === f.key
                  ? "bg-foreground text-background"
                  : "bg-muted/40 text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[720px] text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 font-medium">Prompt</th>
              <th className="px-3 py-2 font-medium">Presença</th>
              <th className="px-3 py-2 font-medium">Posição</th>
              <th className="px-3 py-2 font-medium">Concorrentes</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {linhas.map((p) => {
              const r = respostaFor(p.id);
              return (
                <tr
                  key={p.id}
                  onClick={() => onOpenPrompt(p)}
                  className="cursor-pointer align-top hover:bg-muted/20"
                >
                  <td className="px-3 py-2">
                    <p className="font-medium text-foreground">
                      {p.idCodigo} <span className="text-muted-foreground">· {p.idioma}</span>
                    </p>
                    <p className="mt-0.5 max-w-[320px] truncate text-muted-foreground">{p.texto}</p>
                  </td>
                  <td className="px-3 py-2">
                    {!r ? (
                      <span className="text-muted-foreground">—</span>
                    ) : r.citada ? (
                      <span className="text-emerald-600 dark:text-emerald-400">Citada</span>
                    ) : (
                      <span className="text-muted-foreground">Não citada</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-foreground">
                    {r?.posicao ? AEO_POSICAO_LABEL[r.posicao] : "—"}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {r && r.concorrentes.length > 0 ? r.concorrentes.join(", ") : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        r
                          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {r ? "Preenchido" : "Não preenchido"}
                    </span>
                  </td>
                </tr>
              );
            })}
            {linhas.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                  Nenhum prompt encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
