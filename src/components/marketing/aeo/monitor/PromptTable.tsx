import { useMemo, useState } from "react";
import { EmptyState } from "@/components/shared/EmptyState";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  FilterChips,
  FilterGroup,
  FilterPill,
  FilterPopover,
  FilterRow,
  FilterSearch,
  FilterToolbar,
} from "@/components/shared/FilterToolbar";
import {
  AEO_CATEGORIAS,
  AEO_CATEGORIA_LABEL,
  AEO_IAS,
  AEO_POSICAO_LABEL,
  type AeoCategoria,
  type AeoIa,
  type AeoPosicao,
  type AeoPrompt,
  type AeoResposta,
} from "@/lib/aeo-store";

export type PromptFiltro = "todos" | "preenchidos" | "nao_preenchidos" | "citada" | "nao_citada";
export type IaFiltro = "todos" | AeoIa;

const FILTROS: { value: PromptFiltro; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "preenchidos", label: "Preenchidos" },
  { value: "nao_preenchidos", label: "Não preenchidos" },
  { value: "citada", label: "Citadas" },
  { value: "nao_citada", label: "Não citadas" },
];

const POSICAO_ORDEM: AeoPosicao[] = ["1", "2", "3", "4", "5+"];

/** Melhor posição entre as respostas (1ª vence); ignora "não se aplica". */
function melhorPosicao(rs: AeoResposta[]): AeoPosicao | undefined {
  const posicoes = rs.map((r) => r.posicao).filter((p): p is AeoPosicao => !!p);
  return POSICAO_ORDEM.find((p) => posicoes.includes(p));
}

function Dot({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${on ? "bg-success" : "bg-muted-foreground/40"}`}
    />
  );
}

/** Detalhamento da rodada: prompts × respostas. Linha curta e escaneável (a resposta completa
 * vive no detalhe — `RespostaDrawer`, ao clicar). Com "Todos" as IAs, cada linha resume as
 * respostas do prompt nas IAs; com uma IA, mostra a resposta dela. Filtros no padrão da
 * plataforma: busca, popover de filtros e atalhos de presença. */
export function PromptTable({
  rodadaId,
  ia,
  onIaChange,
  filtro,
  onFiltroChange,
  ativos,
  respostas,
  onOpenPrompt,
}: {
  rodadaId: string;
  ia: IaFiltro;
  onIaChange: (ia: IaFiltro) => void;
  filtro: PromptFiltro;
  onFiltroChange: (f: PromptFiltro) => void;
  ativos: AeoPrompt[];
  respostas: AeoResposta[];
  onOpenPrompt: (prompt: AeoPrompt, ia: AeoIa) => void;
}) {
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState<AeoCategoria | "">("");

  // Respostas da rodada, indexadas por prompt — uma passada, sem busca linear por linha.
  const porPrompt = useMemo(() => {
    const m = new Map<string, AeoResposta[]>();
    for (const r of respostas) {
      if (r.rodadaId !== rodadaId) continue;
      const arr = m.get(r.promptId);
      if (arr) arr.push(r);
      else m.set(r.promptId, [r]);
    }
    return m;
  }, [respostas, rodadaId]);

  const linhas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return ativos
      .filter(
        (p) => !q || p.idCodigo.toLowerCase().includes(q) || p.texto.toLowerCase().includes(q),
      )
      .filter((p) => !categoria || p.categoria === categoria)
      .map((p) => {
        const todas = porPrompt.get(p.id) ?? [];
        const rs = ia === "todos" ? todas : todas.filter((r) => r.ia === ia);
        return { p, rs };
      })
      .filter(({ rs }) => {
        if (filtro === "preenchidos") return rs.length > 0;
        if (filtro === "nao_preenchidos") return rs.length === 0;
        if (filtro === "citada") return rs.some((r) => r.citada);
        if (filtro === "nao_citada") return rs.length > 0 && !rs.some((r) => r.citada);
        return true;
      })
      .sort((a, b) => a.p.idCodigo.localeCompare(b.p.idCodigo));
  }, [ativos, porPrompt, busca, categoria, ia, filtro]);

  const chips = categoria
    ? [{ id: "cat", label: AEO_CATEGORIA_LABEL[categoria], onRemove: () => setCategoria("") }]
    : [];

  const abrir = (p: AeoPrompt, rs: AeoResposta[]) => {
    if (ia !== "todos") return onOpenPrompt(p, ia);
    // "Todos": abre na primeira IA ainda sem resposta (ou na primeira); o detalhe troca de IA.
    const faltando = AEO_IAS.find((i) => !rs.some((r) => r.ia === i));
    onOpenPrompt(p, faltando ?? AEO_IAS[0]);
  };

  return (
    <div className="space-y-4">
      <FilterToolbar>
        <FilterRow>
          <FilterSearch value={busca} onChange={setBusca} placeholder="Buscar prompt" />
          <FilterPopover
            title="Filtrar prompts"
            activeCount={chips.length}
            onClear={() => setCategoria("")}
          >
            <FilterGroup label="Categoria">
              <FilterPill active={!categoria} onClick={() => setCategoria("")}>
                Todas
              </FilterPill>
              {AEO_CATEGORIAS.map((c) => (
                <FilterPill key={c} active={categoria === c} onClick={() => setCategoria(c)}>
                  {AEO_CATEGORIA_LABEL[c]}
                </FilterPill>
              ))}
            </FilterGroup>
          </FilterPopover>
        </FilterRow>
        <FilterChips chips={chips} onClear={() => setCategoria("")} />
      </FilterToolbar>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <SegmentedControl
            aria-label="IA"
            size="sm"
            value={ia}
            onChange={onIaChange}
            options={[
              { value: "todos" as IaFiltro, label: "Todas as IAs" },
              ...AEO_IAS.map((i) => ({ value: i as IaFiltro, label: i })),
            ]}
          />
        </div>
        <div className="max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <SegmentedControl
            aria-label="Situação das respostas"
            size="sm"
            value={filtro}
            onChange={onFiltroChange}
            options={FILTROS}
          />
        </div>
      </div>

      {linhas.length === 0 ? (
        <EmptyState compact title="Nenhum prompt encontrado." />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-text-secondary">
                <th className="px-4 py-2.5 font-medium">Prompt</th>
                <th className="px-4 py-2.5 font-medium">Presença</th>
                <th className="px-4 py-2.5 font-medium">Posição</th>
                <th className="px-4 py-2.5 font-medium">Concorrentes</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {linhas.map(({ p, rs }) => {
                const citadas = rs.filter((r) => r.citada).length;
                const posicao = melhorPosicao(rs);
                const concorrentes = [...new Set(rs.flatMap((r) => r.concorrentes))];
                const totalIas = ia === "todos" ? AEO_IAS.length : 1;
                return (
                  <tr
                    key={p.id}
                    onClick={() => abrir(p, rs)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        abrir(p, rs);
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-label={`Abrir ${p.idCodigo}`}
                    className="cursor-pointer align-middle hover:bg-muted/30 focus-visible:bg-muted/30 focus-visible:outline-none"
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">
                        {p.idCodigo}{" "}
                        <span className="font-normal text-text-secondary">· {p.idioma}</span>
                      </p>
                      <p className="mt-0.5 line-clamp-1 max-w-[420px] text-text-secondary">
                        {p.texto}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-foreground">
                      {rs.length === 0 ? (
                        <span className="text-text-secondary">—</span>
                      ) : ia === "todos" ? (
                        <span className={citadas > 0 ? "font-medium" : "text-text-secondary"}>
                          {citadas} de {rs.length} {rs.length === 1 ? "IA" : "IAs"}
                        </span>
                      ) : citadas > 0 ? (
                        <span className="font-medium">Citada</span>
                      ) : (
                        <span className="text-text-secondary">Não citada</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-foreground">
                      {posicao ? AEO_POSICAO_LABEL[posicao] : "—"}
                    </td>
                    <td className="max-w-[220px] px-4 py-3 text-text-secondary">
                      {concorrentes.length === 0 ? (
                        "—"
                      ) : (
                        <span className="block truncate" title={concorrentes.join(", ")}>
                          {concorrentes.slice(0, 2).join(", ")}
                          {concorrentes.length > 2 && ` +${concorrentes.length - 2}`}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      <Dot on={rs.length >= totalIas} />
                      {ia === "todos"
                        ? `${rs.length}/${totalIas} preenchidas`
                        : rs.length > 0
                          ? "Preenchido"
                          : "Pendente"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
