import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/SectionHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { useClientes } from "@/lib/clientes-store";
import { type BankInflu, loadBank, saveBank, onBankChange } from "@/lib/banco-influs-store";
import { getAllCampanhaInflus } from "@/lib/campanha-scoped-store";
import { BankInfluWizard } from "@/components/influenciadores/BankInfluWizard";
import { getAvaliacoesPorParticipacoes } from "@/lib/campanha-influenciador-avaliacao.functions";
import {
  mediaGeralAvaliacoes,
  type CampanhaInfluenciadorAvaliacao,
} from "@/lib/campanha-influenciador-avaliacao";
import {
  findParticipacoes,
  filterBankInflus,
  countAvaliacoesPendentes,
  DEFAULT_INFLUENCER_BANCO_FILTERS,
  type InfluencerBancoFiltersState,
  type InfluencerBancoEnrichment,
} from "@/lib/influencer-banco-v2";
import { InfluencerBancoFiltersBar } from "./InfluencerBancoFiltersBar";
import { InfluencerBancoCard } from "./InfluencerBancoCard";
import { InfluencerBancoDrawer } from "./InfluencerBancoDrawer";

const PAGE_SIZE = 30;

function usePersistedState<T>(key: string, initial: T): [T, (v: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw !== null ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  }, [key, value]);
  return [value, setValue];
}

/**
 * Página principal do Banco V2 — hierarquia nova (NPS/confiabilidade não
 * existem mais aqui): header com 4 números realmente úteis, filtros em
 * pills (mesmo padrão de `CampanhaFiltersBar.tsx`), grade OU lista (mesmo
 * card, `variant` diferente), perfil em drawer lateral.
 */
export function InfluencerBancoV2Page() {
  const clientes = useClientes();
  const fetchAvaliacoes = useServerFn(getAvaliacoesPorParticipacoes);

  const [list, setList] = useState<BankInflu[]>(() => loadBank());
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<InfluencerBancoFiltersState>(
    DEFAULT_INFLUENCER_BANCO_FILTERS,
  );
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = usePersistedState<"grade" | "lista">(
    "banco-influenciadores-v2:viewMode",
    "grade",
  );
  const [dialog, setDialog] = useState<{ mode: "new" | "edit"; data?: BankInflu } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [avaliacoesRows, setAvaliacoesRows] = useState<CampanhaInfluenciadorAvaliacao[]>([]);

  useEffect(() => onBankChange(() => setList(loadBank())), []);
  useEffect(() => setPage(1), [query, filters]);

  const persist = (next: BankInflu[]) => {
    setList(next);
    saveBank(next);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps -- `clientes` força recálculo quando o store sincroniza, mesmo `getAllCampanhaInflus()` não recebendo parâmetro
  const allCampanhaInflus = useMemo(() => getAllCampanhaInflus(), [clientes]);

  const participacoesById = useMemo(() => {
    const map = new Map<string, ReturnType<typeof findParticipacoes>>();
    for (const i of list) map.set(i.id, findParticipacoes(i.nome, clientes, allCampanhaInflus));
    return map;
  }, [list, clientes, allCampanhaInflus]);

  // Avaliações do time — busca em lote de TODAS as participações de TODOS
  // os influenciadores listados, uma única ida ao servidor (nunca N
  // requisições por card). Guarda as linhas cruas (não só o agregado) pra
  // também derivar pendências por participação, não só a média.
  useEffect(() => {
    const allIds = Array.from(participacoesById.values())
      .flat()
      .map((p) => p.campanhaInfluenciadorId);
    if (allIds.length === 0) {
      setAvaliacoesRows([]);
      return;
    }
    let cancelled = false;
    fetchAvaliacoes({ data: { campanhaInfluenciadorIds: allIds } })
      .then((rows) => {
        if (!cancelled) setAvaliacoesRows(rows);
      })
      .catch(() => {
        if (!cancelled) setAvaliacoesRows([]);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchAvaliacoes (useServerFn) não é estável entre renders
  }, [participacoesById]);

  const avaliadasIds = useMemo(
    () => new Set(avaliacoesRows.map((r) => r.campanhaInfluenciadorId)),
    [avaliacoesRows],
  );

  const enrichmentById = useMemo(() => {
    const avaliacaoByParticipacaoId = new Map(
      avaliacoesRows.map((r) => [r.campanhaInfluenciadorId, r]),
    );
    const map = new Map<string, InfluencerBancoEnrichment>();
    for (const i of list) {
      const participacoes = participacoesById.get(i.id) ?? [];
      const avals = participacoes
        .map((p) => avaliacaoByParticipacaoId.get(p.campanhaInfluenciadorId))
        .filter((a): a is NonNullable<typeof a> => !!a);
      map.set(i.id, {
        historicoCount: participacoes.length,
        mediaAvaliacao: avals.length > 0 ? mediaGeralAvaliacoes(avals) : null,
        avaliacoesCount: avals.length,
        pendentesCount: countAvaliacoesPendentes(participacoes, avaliadasIds),
      });
    }
    return map;
  }, [list, participacoesById, avaliacoesRows, avaliadasIds]);

  const comHistorico = list.filter((i) => (enrichmentById.get(i.id)?.historicoCount ?? 0) > 0);
  const avaliados = list.filter((i) => (enrichmentById.get(i.id)?.avaliacoesCount ?? 0) > 0);
  const ativos = list.filter((i) => !i.arquivado);

  const filtered = useMemo(
    () => filterBankInflus(list, query, filters, enrichmentById),
    [list, query, filters, enrichmentById],
  );

  const detail = detailId ? (list.find((i) => i.id === detailId) ?? null) : null;
  const openDetail = (id: string) => setDetailId(id);
  const closeDetail = () => setDetailId(null);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const temFiltrosAtivos =
    query.trim() !== "" ||
    JSON.stringify(filters) !== JSON.stringify(DEFAULT_INFLUENCER_BANCO_FILTERS);

  return (
    <PageContainer className="space-y-6">
      <SectionHeader
        title="Banco de influenciadores"
        subtitle="Todos os criadores cadastrados e o histórico de relacionamento com cada influenciador."
        kpis={[
          { label: "TOTAL", value: ativos.length },
          { label: "COM HISTÓRICO", value: comHistorico.length },
          { label: "SEM HISTÓRICO", value: ativos.length - comHistorico.length },
          { label: "AVALIADOS", value: avaliados.length },
        ]}
        action={
          <Button variant="primary" onClick={() => setDialog({ mode: "new" })}>
            <Plus className="h-3.5 w-3.5" /> Novo influenciador
          </Button>
        }
      />

      <InfluencerBancoFiltersBar
        query={query}
        onQueryChange={setQuery}
        filters={filters}
        onFiltersChange={setFilters}
        list={list}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-16 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted">
            <Users className="h-5 w-5 text-text-secondary" />
          </div>
          {list.length === 0 ? (
            <>
              <p className="text-sm font-medium text-foreground">Nenhum influenciador cadastrado</p>
              <Button variant="outline" size="sm" onClick={() => setDialog({ mode: "new" })}>
                <Plus className="h-3.5 w-3.5" /> Novo influenciador
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-foreground">Nenhum influenciador encontrado</p>
              <p className="max-w-xs text-sm text-text-secondary">
                Tente remover alguns filtros ou buscar por outro nome.
              </p>
              {temFiltrosAtivos && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setQuery("");
                    setFilters(DEFAULT_INFLUENCER_BANCO_FILTERS);
                  }}
                >
                  Limpar busca e filtros
                </Button>
              )}
            </>
          )}
        </div>
      ) : (
        <div
          className={
            viewMode === "grade"
              ? "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
              : "flex flex-col divide-y divide-border/60 rounded-xl border border-border/60"
          }
        >
          {pageItems.map((i) => (
            <InfluencerBancoCard
              key={i.id}
              influ={i}
              variant={viewMode}
              enrichment={enrichmentById.get(i.id)}
              onOpen={() => openDetail(i.id)}
              onEdit={() => setDialog({ mode: "edit", data: i })}
            />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <p className="text-xs text-muted-foreground">
            Página {page} de {totalPages} · {filtered.length} influenciadores
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
            >
              Anterior
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
            >
              Próxima
            </button>
          </div>
        </div>
      )}

      <BankInfluWizard
        open={!!dialog}
        initial={dialog?.data}
        allInflus={list}
        onClose={() => setDialog(null)}
        onSave={(i) => {
          if (dialog?.mode === "edit") {
            persist(list.map((x) => (x.id === i.id ? i : x)));
          } else {
            persist([...list, i]);
          }
          setDialog(null);
          openDetail(i.id);
        }}
      />

      <InfluencerBancoDrawer
        influ={detail}
        participacoes={detail ? (participacoesById.get(detail.id) ?? []) : []}
        onClose={closeDetail}
        onEdit={() => detail && setDialog({ mode: "edit", data: detail })}
        onRemove={() => {
          if (!detail) return;
          persist(list.filter((x) => x.id !== detail.id));
          closeDetail();
        }}
      />
    </PageContainer>
  );
}
