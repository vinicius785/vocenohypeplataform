import { useEffect, useMemo, useState } from "react";
import { Plus, Search, X, MapPin, MoreVertical, Pencil, FileBadge2, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useClientes } from "@/lib/clientes-store";
import { formatSeguidores } from "@/lib/format";
import { SectionHeader } from "./SectionHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import {
  PlatformIcon,
  NICHOS,
  computeReliability,
  type ReliabilityStats,
} from "@/components/influenciadores/InfluencerBoard";
import { useConfirm } from "@/hooks/use-confirm";
import { type BankInflu, loadBank, saveBank, onBankChange } from "@/lib/banco-influs-store";
import { getAllCampanhaInflus } from "@/lib/campanha-scoped-store";
import { BankInfluWizard } from "@/components/influenciadores/BankInfluWizard";
import {
  BankInfluWorkspace,
  type HistoryItem,
} from "@/components/influenciadores/BankInfluWorkspace";

const REDES_OPTS = ["Instagram", "TikTok", "YouTube", "X", "LinkedIn", "Facebook"];

function totalSeguidores(redes: BankInflu["redes"]): number {
  return redes.reduce((sum, r) => sum + (Number(r.seguidores?.replace(/\D/g, "")) || 0), 0);
}

const SEGUIDORES_BUCKETS = [
  { value: "10000", label: "10 mil+" },
  { value: "50000", label: "50 mil+" },
  { value: "100000", label: "100 mil+" },
  { value: "500000", label: "500 mil+" },
  { value: "1000000", label: "1 milhão+" },
];

type SortKey = "nome" | "seguidores" | "confiabilidade" | "campanhas" | "recentes";
const SORT_OPTS: { value: SortKey; label: string }[] = [
  { value: "recentes", label: "Atualização mais recente" },
  { value: "nome", label: "Nome (A–Z)" },
  { value: "seguidores", label: "Mais seguidores" },
  { value: "confiabilidade", label: "Mais confiáveis" },
  { value: "campanhas", label: "Mais campanhas" },
];

function reliabilityBadge(r?: ReliabilityStats): { text: string; cls: string } | null {
  if (!r) return null;
  if (r.total === 0) return { text: "Sem histórico", cls: "bg-muted text-muted-foreground" };
  if (r.total < 3) return { text: "Amostra insuficiente", cls: "bg-muted text-muted-foreground" };
  const cls =
    r.score >= 80
      ? "bg-success-soft text-success-soft-foreground"
      : r.score >= 50
        ? "bg-warning-soft text-warning-soft-foreground"
        : "bg-danger-soft text-danger-soft-foreground";
  return { text: `${r.score}% confiável`, cls };
}

export function InfluenciadoresSection() {
  const clientes = useClientes();
  const [list, setList] = useState<BankInflu[]>(() => loadBank());
  const [query, setQuery] = useState("");
  const [nichoFilter, setNichoFilter] = useState("");
  const [tierFilter, setTierFilter] = useState("");
  const [cidadeFilter, setCidadeFilter] = useState("");
  const [redeFilter, setRedeFilter] = useState("");
  const [seguidoresMin, setSeguidoresMin] = useState("");
  const [confiabilidadeMin, setConfiabilidadeMin] = useState("");
  const [sort, setSort] = useState<SortKey>("recentes");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 30;
  const [dialog, setDialog] = useState<{ mode: "new" | "edit"; data?: BankInflu } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const { confirm, confirmDialog } = useConfirm();

  const persist = (next: BankInflu[]) => {
    setList(next);
    saveBank(next);
  };
  useEffect(() => onBankChange(() => setList(loadBank())), []);
  useEffect(
    () => setPage(1),
    [query, nichoFilter, tierFilter, cidadeFilter, redeFilter, seguidoresMin, confiabilidadeMin],
  );

  const historyFor = (nome: string): HistoryItem[] => {
    const norm = nome.trim().toLowerCase();
    if (!norm) return [];
    const out: HistoryItem[] = [];
    const allInflus = getAllCampanhaInflus();
    for (const c of clientes) {
      for (const camp of c.campanhas ?? []) {
        const arr = allInflus.get(camp.id) ?? [];
        for (const inf of arr) {
          if (inf.nome?.trim().toLowerCase() === norm) {
            out.push({
              clienteId: c.id,
              clienteEmpresa: c.empresa,
              campanhaId: camp.id,
              campanhaNome: camp.nome,
              campDataInicio: camp.dataInicio,
              campPrazo: camp.prazo,
              status: inf.status,
              influ: inf,
            });
          }
        }
      }
    }
    return out;
  };

  // Calculada uma vez por influ (não a cada render de card) — reusada pro
  // filtro "Confiabilidade", pro badge do card e pro workspace de detalhe.
  const reliabilityById = useMemo(() => {
    const map = new Map<string, ReliabilityStats>();
    for (const i of list) {
      map.set(i.id, computeReliability(historyFor(i.nome).map((h) => h.influ)));
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, clientes]);

  const historyCountById = useMemo(() => {
    const map = new Map<string, number>();
    for (const i of list) map.set(i.id, historyFor(i.nome).length);
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, clientes]);

  const comCampanha = useMemo(
    () => list.filter((i) => (historyCountById.get(i.id) ?? 0) > 0).length,
    [list, historyCountById],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const min = seguidoresMin ? Number(seguidoresMin) : 0;
    const confMin = confiabilidadeMin ? Number(confiabilidadeMin) : 0;
    let out = list.filter((i) => {
      if (i.arquivado) return false;
      if (nichoFilter && i.nicho !== nichoFilter) return false;
      if (tierFilter && i.tier !== tierFilter) return false;
      if (cidadeFilter && i.endereco?.cidade !== cidadeFilter) return false;
      if (redeFilter && !i.redes.some((r) => r.plataforma === redeFilter)) return false;
      if (min && totalSeguidores(i.redes) < min) return false;
      if (confMin && (reliabilityById.get(i.id)?.score ?? 0) < confMin) return false;
      if (!q) return true;
      return (
        i.nome.toLowerCase().includes(q) || i.redes.some((r) => r.handle.toLowerCase().includes(q))
      );
    });
    out = [...out].sort((a, b) => {
      switch (sort) {
        case "nome":
          return a.nome.localeCompare(b.nome, "pt-BR");
        case "seguidores":
          return totalSeguidores(b.redes) - totalSeguidores(a.redes);
        case "confiabilidade":
          return (reliabilityById.get(b.id)?.score ?? 0) - (reliabilityById.get(a.id)?.score ?? 0);
        case "campanhas":
          return (historyCountById.get(b.id) ?? 0) - (historyCountById.get(a.id) ?? 0);
        case "recentes":
        default:
          return (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");
      }
    });
    return out;
  }, [
    list,
    query,
    nichoFilter,
    tierFilter,
    cidadeFilter,
    redeFilter,
    seguidoresMin,
    confiabilidadeMin,
    sort,
    reliabilityById,
    historyCountById,
  ]);

  const activeFilterCount = [
    nichoFilter,
    tierFilter,
    cidadeFilter,
    redeFilter,
    seguidoresMin,
    confiabilidadeMin,
  ].filter(Boolean).length;
  const hasAnyFilter = activeFilterCount > 0 || !!query;

  const clearFilters = () => {
    setQuery("");
    setNichoFilter("");
    setTierFilter("");
    setCidadeFilter("");
    setRedeFilter("");
    setSeguidoresMin("");
    setConfiabilidadeMin("");
  };

  const nichosEmUso = useMemo(() => NICHOS.filter((n) => list.some((i) => i.nicho === n)), [list]);
  const cidadesEmUso = useMemo(
    () =>
      Array.from(new Set(list.map((i) => i.endereco?.cidade).filter((c): c is string => !!c))).sort(
        (a, b) => a.localeCompare(b, "pt-BR"),
      ),
    [list],
  );
  const redesEmUso = useMemo(
    () => REDES_OPTS.filter((r) => list.some((i) => i.redes.some((rede) => rede.plataforma === r))),
    [list],
  );
  const tiersEmUso = useMemo(
    () =>
      Array.from(new Set(list.map((i) => i.tier).filter((t): t is NonNullable<typeof t> => !!t))),
    [list],
  );

  const openMediaKit = (b: BankInflu, history: HistoryItem[]) => {
    const metrics = { views: 0, likes: 0, comments: 0, shares: 0, saves: 0, reach: 0 };
    let publicadas = 0;
    for (const h of history) {
      for (const e of h.influ.entregas) {
        if (e.status !== "publicado") continue;
        publicadas += 1;
        const m = e.metrics ?? {};
        metrics.views += m.views ?? 0;
        metrics.likes += m.likes ?? 0;
        metrics.comments += m.comments ?? 0;
        metrics.shares += m.shares ?? 0;
        metrics.saves += m.saves ?? 0;
        metrics.reach += m.reach ?? 0;
      }
    }
    const fmt = (n: number) => (n > 0 ? n.toLocaleString("pt-BR") : "—");
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const escAttr = (s: string) => esc(s).replace(/"/g, "&quot;");
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!doctype html>
<html><head><meta charset="utf-8"><title>Media Kit — ${esc(b.nome)}</title>
<style>
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #111; padding: 40px; max-width: 720px; margin: 0 auto; }
  .header { display: flex; align-items: center; gap: 20px; border-bottom: 2px solid #111; padding-bottom: 20px; }
  .photo { width: 96px; height: 96px; border-radius: 16px; object-fit: cover; background: #eee; }
  .photo-fallback { width: 96px; height: 96px; border-radius: 16px; background: #eee; display: flex; align-items: center; justify-content: center; font-size: 32px; font-weight: 600; color: #999; }
  h1 { margin: 0; font-size: 28px; }
  .nicho { display: inline-block; background: #f2f2f2; border-radius: 999px; padding: 3px 10px; font-size: 12px; margin-top: 6px; }
  .redes { margin-top: 8px; font-size: 13px; color: #555; }
  .section { margin-top: 28px; }
  .section h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; color: #777; margin-bottom: 10px; }
  .metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
  .metric { border: 1px solid #e5e5e5; border-radius: 8px; padding: 12px; text-align: center; }
  .metric .value { font-size: 22px; font-weight: 700; }
  .metric .label { font-size: 11px; color: #777; text-transform: uppercase; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 8px 6px; border-bottom: 1px solid #eee; }
  th { color: #777; font-weight: 600; text-transform: uppercase; font-size: 11px; }
  .footer { margin-top: 40px; font-size: 11px; color: #999; text-align: center; }
  @media print { body { padding: 0; } }
</style></head>
<body>
  <div class="header">
    ${b.foto ? `<img class="photo" src="${escAttr(b.foto)}" alt="" />` : `<div class="photo-fallback">${esc(b.nome.charAt(0).toUpperCase() || "?")}</div>`}
    <div>
      <h1>${esc(b.nome)}</h1>
      ${b.nicho ? `<span class="nicho">${esc(b.nicho)}</span>` : ""}
      <div class="redes">${
        b.redes.length
          ? b.redes
              .map((r) => `${esc(r.plataforma)}${r.handle ? ` · ${esc(r.handle)}` : ""}`)
              .join(" &nbsp;/&nbsp; ")
          : "Sem redes cadastradas"
      }</div>
    </div>
  </div>

  <div class="section">
    <h2>Desempenho agregado (${publicadas} publicações)</h2>
    <div class="metrics">
      <div class="metric"><div class="value">${fmt(metrics.views)}</div><div class="label">Views</div></div>
      <div class="metric"><div class="value">${fmt(metrics.reach)}</div><div class="label">Alcance</div></div>
      <div class="metric"><div class="value">${fmt(metrics.likes)}</div><div class="label">Curtidas</div></div>
      <div class="metric"><div class="value">${fmt(metrics.comments)}</div><div class="label">Comentários</div></div>
      <div class="metric"><div class="value">${fmt(metrics.shares)}</div><div class="label">Compartilhamentos</div></div>
      <div class="metric"><div class="value">${fmt(metrics.saves)}</div><div class="label">Salvamentos</div></div>
    </div>
  </div>

  <div class="section">
    <h2>Histórico de campanhas (${history.length})</h2>
    ${
      history.length === 0
        ? "<p>Nenhuma campanha registrada ainda.</p>"
        : `<table><thead><tr><th>Campanha</th><th>Cliente</th><th>Status</th></tr></thead><tbody>
      ${history.map((h) => `<tr><td>${esc(h.campanhaNome)}</td><td>${esc(h.clienteEmpresa)}</td><td>${esc(h.status)}</td></tr>`).join("")}
      </tbody></table>`
    }
  </div>

  <p class="footer">Media kit gerado automaticamente em ${new Date().toLocaleDateString("pt-BR")} · Você no Hype</p>
</body></html>`);
    win.document.close();
    win.focus();
  };

  const detail = detailId ? (list.find((i) => i.id === detailId) ?? null) : null;
  const detailHistory = detail ? historyFor(detail.nome) : [];

  return (
    <PageContainer>
      <SectionHeader
        title="Banco de influenciadores"
        subtitle="Cadastro global de criadores — identidade, redes e histórico agregado de campanhas."
        kpis={[
          { label: "TOTAL", value: list.filter((i) => !i.arquivado).length },
          { label: "COM CAMPANHA", value: comCampanha },
          {
            label: "SEM CAMPANHA",
            value: list.filter((i) => !i.arquivado).length - comCampanha,
          },
          { label: "EXIBIDOS", value: filtered.length },
        ]}
        action={
          <Button variant="primary" onClick={() => setDialog({ mode: "new" })}>
            <Plus className="h-3.5 w-3.5" /> Novo influenciador
          </Button>
        }
      />

      <div className="sticky top-0 z-10 -mx-1 mt-6 space-y-2 bg-background/95 px-1 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nome ou @handle"
              className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <select
            value={nichoFilter}
            onChange={(e) => setNichoFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">Todos os nichos</option>
            {nichosEmUso.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <select
            value={redeFilter}
            onChange={(e) => setRedeFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">Todas as redes</option>
            {redesEmUso.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <select
            value={seguidoresMin}
            onChange={(e) => setSeguidoresMin(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">Qualquer nº de seguidores</option>
            {SEGUIDORES_BUCKETS.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </select>
          <select
            value={confiabilidadeMin}
            onChange={(e) => setConfiabilidadeMin(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">Qualquer confiabilidade</option>
            <option value="80">80%+ confiável</option>
            <option value="50">50%+ confiável</option>
          </select>
          {tiersEmUso.length > 0 && (
            <select
              value={tierFilter}
              onChange={(e) => setTierFilter(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">Todos os tiers</option>
              {tiersEmUso.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          )}
          {cidadesEmUso.length > 0 && (
            <select
              value={cidadeFilter}
              onChange={(e) => setCidadeFilter(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">Todas as cidades</option>
              {cidadesEmUso.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="h-9 rounded-md border border-input bg-background px-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {SORT_OPTS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {hasAnyFilter && (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" /> Limpar filtros
              {activeFilterCount > 0 && (
                <span className="ml-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-foreground">
                  {activeFilterCount}
                </span>
              )}
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-border p-10 text-center">
          <p className="text-sm text-muted-foreground">
            {list.length === 0
              ? "Nenhum influenciador cadastrado ainda."
              : hasAnyFilter
                ? "Nenhum influenciador corresponde aos filtros aplicados. Tente ajustar ou limpar os filtros."
                : "Nenhum resultado."}
          </p>
          {list.length === 0 ? (
            <button
              type="button"
              onClick={() => setDialog({ mode: "new" })}
              className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
            >
              <Plus className="h-4 w-4" /> Adicionar o primeiro
            </button>
          ) : (
            hasAnyFilter && (
              <button
                type="button"
                onClick={clearFilters}
                className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
              >
                <X className="h-4 w-4" /> Limpar filtros
              </button>
            )
          )}
        </div>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((i) => {
            const count = historyCountById.get(i.id) ?? 0;
            const reliability = reliabilityById.get(i.id);
            const badge = reliabilityBadge(reliability);
            const seguidores = totalSeguidores(i.redes);
            const redePrincipal = i.redes.find((r) => r.id === i.redePrincipalId) ?? i.redes[0];
            return (
              <div
                key={i.id}
                className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-foreground/20 hover:bg-muted/40"
              >
                <button
                  type="button"
                  onClick={() => setDetailId(i.id)}
                  className="flex flex-1 flex-col items-start p-3 text-left"
                >
                  <div className="flex w-full items-center gap-3">
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-muted ring-1 ring-border">
                      {i.foto ? (
                        <img
                          src={i.foto}
                          alt=""
                          className="h-full w-full object-cover object-center"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-muted-foreground">
                          {i.nome.charAt(0).toUpperCase() || "?"}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-foreground">
                        {i.nome || "Sem nome"}
                      </div>
                      {redePrincipal && (
                        <div className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                          <PlatformIcon
                            plataforma={redePrincipal.plataforma}
                            className="h-3 w-3 shrink-0"
                          />
                          <span className="truncate">
                            {redePrincipal.handle || redePrincipal.plataforma}
                          </span>
                        </div>
                      )}
                      {i.endereco?.cidade && (
                        <div className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                          <MapPin className="h-3 w-3 shrink-0" /> {i.endereco.cidade}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    {i.nicho && (
                      <span className="max-w-[110px] truncate rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {i.nicho}
                      </span>
                    )}
                    {seguidores > 0 && (
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {formatSeguidores(String(seguidores))} seg.
                      </span>
                    )}
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {count} {count === 1 ? "campanha" : "campanhas"}
                    </span>
                    {badge && (
                      <span
                        className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${badge.cls}`}
                      >
                        {badge.text}
                      </span>
                    )}
                  </div>
                </button>
                <div className="absolute right-1.5 top-1.5 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label={`Mais opções de ${i.nome}`}
                        className="rounded-md bg-background/80 p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <MoreVertical className="h-3.5 w-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setDetailId(i.id)}>Abrir</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setDialog({ mode: "edit", data: i })}>
                        <Pencil className="h-3.5 w-3.5" /> Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => openMediaKit(i, historyFor(i.nome))}>
                        <FileBadge2 className="h-3.5 w-3.5" /> Media kit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onSelect={async () => {
                          const ok = await confirm(`Apagar "${i.nome}" do banco?`);
                          if (ok) persist(list.filter((x) => x.id !== i.id));
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Remover
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {filtered.length > PAGE_SIZE &&
        (() => {
          const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
          return (
            <div className="mt-6 flex items-center justify-between text-sm">
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
          );
        })()}

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
          setDetailId(i.id);
        }}
      />

      <BankInfluWorkspace
        influ={detail}
        history={detailHistory}
        onClose={() => setDetailId(null)}
        onEdit={() => detail && setDialog({ mode: "edit", data: detail })}
        onMediaKit={() => detail && openMediaKit(detail, detailHistory)}
        onRemove={async () => {
          if (!detail) return;
          persist(list.filter((x) => x.id !== detail.id));
          setDetailId(null);
        }}
      />

      {confirmDialog}
    </PageContainer>
  );
}
