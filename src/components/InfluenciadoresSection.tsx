import { useEffect, useMemo, useState } from "react";
import {
  Camera,
  Plus,
  Search,
  Trash2,
  X,
  ArrowLeft,
  MapPin,
  History,
  FileBadge2,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useClientes } from "@/lib/clientes-store";
import { SectionHeader } from "./SectionHeader";
import {
  PlatformIcon,
  NICHOS,
  computeReliability,
  type Rede,
  type Influ,
} from "@/components/influenciadores/InfluencerBoard";
import { useConfirm } from "@/hooks/use-confirm";
import {
  type BankInflu,
  type Endereco,
  loadBank,
  saveBank,
  onBankChange,
} from "@/lib/banco-influs-store";
import { getAllCampanhaInflus } from "@/lib/campanha-scoped-store";
import DriftWall from "@/components/DriftWall";

const REDES_OPTS = ["Instagram", "TikTok", "YouTube", "X", "LinkedIn", "Facebook"];

function initialsAvatarInflu(name: string): string {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="#27272a"/><text x="50%" y="50%" dy=".1em" font-family="sans-serif" font-size="150" font-weight="600" fill="#a1a1aa" text-anchor="middle" dominant-baseline="middle">${initials || "?"}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

type HistoryItem = {
  clienteId: string;
  clienteEmpresa: string;
  campanhaId: string;
  campanhaNome: string;
  status: string;
  influ: Influ;
};

export function InfluenciadoresSection() {
  const clientes = useClientes();
  const [list, setList] = useState<BankInflu[]>(() => loadBank());
  const [query, setQuery] = useState("");
  const [nichoFilter, setNichoFilter] = useState("");
  const [dialog, setDialog] = useState<{ mode: "new" | "edit"; data?: BankInflu } | null>(null);
  const [detail, setDetail] = useState<BankInflu | null>(null);
  const { confirm, confirmDialog } = useConfirm();

  const persist = (next: BankInflu[]) => {
    setList(next);
    saveBank(next);
  };
  useEffect(() => onBankChange(() => setList(loadBank())), []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list.filter((i) => {
      if (nichoFilter && i.nicho !== nichoFilter) return false;
      if (!q) return true;
      return (
        i.nome.toLowerCase().includes(q) || i.redes.some((r) => r.handle.toLowerCase().includes(q))
      );
    });
  }, [list, query, nichoFilter]);

  const nichosEmUso = useMemo(() => NICHOS.filter((n) => list.some((i) => i.nicho === n)), [list]);

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
              status: inf.status,
              influ: inf,
            });
          }
        }
      }
    }
    return out;
  };

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
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!doctype html>
<html><head><meta charset="utf-8"><title>Media Kit — ${esc(b.nome)}</title>
<style>
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #111; padding: 40px; max-width: 720px; margin: 0 auto; }
  .header { display: flex; align-items: center; gap: 20px; border-bottom: 2px solid #111; padding-bottom: 20px; }
  .photo { width: 96px; height: 96px; border-radius: 50%; object-fit: cover; background: #eee; }
  .photo-fallback { width: 96px; height: 96px; border-radius: 50%; background: #eee; display: flex; align-items: center; justify-content: center; font-size: 32px; font-weight: 600; color: #999; }
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
    ${b.foto ? `<img class="photo" src="${b.foto}" alt="" />` : `<div class="photo-fallback">${esc(b.nome.charAt(0).toUpperCase() || "?")}</div>`}
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

  if (detail) {
    const history = historyFor(detail.nome);
    return (
      <div>
        <button
          type="button"
          onClick={() => setDetail(null)}
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar
        </button>

        <div className="flex items-start gap-5">
          <div className="h-24 w-24 shrink-0 overflow-hidden rounded-full bg-muted">
            {detail.foto ? (
              <img src={detail.foto} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-2xl font-semibold text-muted-foreground">
                {detail.nome.charAt(0).toUpperCase() || "?"}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold tracking-tight">{detail.nome}</h1>
            {detail.nicho && (
              <span className="mt-1 inline-block rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                {detail.nicho}
              </span>
            )}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {detail.redes.length === 0 ? (
                <span className="text-xs text-muted-foreground">Sem redes cadastradas</span>
              ) : (
                detail.redes.map((r) => (
                  <span
                    key={r.id}
                    className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-foreground"
                  >
                    <PlatformIcon plataforma={r.plataforma} className="h-3 w-3" />
                    {r.plataforma}
                    {r.handle ? ` · ${r.handle}` : ""}
                    {r.seguidores ? ` · ${r.seguidores} seg.` : ""}
                  </span>
                ))
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => openMediaKit(detail, history)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-foreground hover:bg-muted"
            >
              <FileBadge2 className="h-3.5 w-3.5" /> Media kit
            </button>
            <button
              type="button"
              onClick={() => setDialog({ mode: "edit", data: detail })}
              className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground hover:bg-muted"
            >
              Editar
            </button>
            <button
              type="button"
              onClick={async () => {
                const ok = await confirm(`Remover "${detail.nome}" do banco de influenciadores?`);
                if (!ok) return;
                persist(list.filter((i) => i.id !== detail.id));
                setDetail(null);
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-3.5 w-3.5" /> Remover
            </button>
          </div>
        </div>

        <div className="mt-8">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <MapPin className="h-3.5 w-3.5" /> Endereço
          </h2>
          {(() => {
            const e = detail.endereco;
            const hasAny =
              e &&
              (e.rua ||
                e.numero ||
                e.bairro ||
                e.cep ||
                e.cidade ||
                e.estado ||
                e.pais ||
                e.complemento);
            if (!hasAny) {
              return (
                <p className="mt-2 text-sm text-muted-foreground">
                  Nenhum endereço cadastrado. Clique em “Editar” para adicionar.
                </p>
              );
            }
            const linha1 = [e!.rua, e!.numero].filter(Boolean).join(", ");
            const linha2 = [e!.bairro, e!.complemento].filter(Boolean).join(" · ");
            const linha3 = [[e!.cidade, e!.estado].filter(Boolean).join(" / "), e!.cep, e!.pais]
              .filter(Boolean)
              .join(" · ");
            return (
              <div className="mt-2 space-y-0.5 text-sm text-foreground">
                {linha1 && <div>{linha1}</div>}
                {linha2 && <div className="text-muted-foreground">{linha2}</div>}
                {linha3 && <div className="text-muted-foreground">{linha3}</div>}
              </div>
            );
          })()}
        </div>

        {(() => {
          const reliability = computeReliability(history.flatMap((h) => h.influ.entregas));
          if (reliability.total === 0) return null;
          const tone =
            reliability.score >= 80
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : reliability.score >= 50
                ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                : "bg-rose-500/10 text-rose-700 dark:text-rose-400";
          return (
            <div className="mt-8 rounded-lg border border-border p-4">
              <h2 className="text-sm font-semibold text-foreground">Confiabilidade</h2>
              <div className="mt-2 flex items-center gap-3">
                <span className={`rounded-full px-2.5 py-1 text-sm font-semibold ${tone}`}>
                  {reliability.score}%
                </span>
                <p className="text-xs text-muted-foreground">
                  {reliability.onTime} no prazo · {reliability.late} atrasada
                  {reliability.late === 1 ? "" : "s"} · {reliability.overdue} vencida
                  {reliability.overdue === 1 ? "" : "s"} (de {reliability.total} entregas
                  combinadas)
                </p>
              </div>
            </div>
          );
        })()}

        <div className="mt-8">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <History className="h-3.5 w-3.5" /> Histórico de campanhas
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Campanhas em que {detail.nome || "este influenciador"} participou com a gente.
          </p>

          {history.length === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Nenhuma campanha registrada ainda.
            </div>
          ) : (
            <ul className="mt-4 divide-y divide-border rounded-lg border border-border">
              {history.map((h, idx) => (
                <li
                  key={`${h.campanhaId}-${idx}`}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">
                      {h.campanhaNome}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{h.clienteEmpresa}</div>
                  </div>
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-foreground">
                    {h.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {confirmDialog}

        <BankInfluDialog
          open={!!dialog}
          initial={dialog?.data}
          onClose={() => setDialog(null)}
          onSave={(i) => {
            if (dialog?.mode === "edit") {
              const next = list.map((x) => (x.id === i.id ? i : x));
              persist(next);
              setDetail(i);
            } else {
              persist([...list, i]);
            }
            setDialog(null);
          }}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <SectionHeader
        title="Banco de influenciadores"
        subtitle="Cadastre criadores e veja o histórico de campanhas com cada um."
        kpis={[
          { label: "TOTAL", value: list.length },
          {
            label: "COM CAMPANHA",
            value: list.filter((i) => historyFor(i.nome).length > 0).length,
            tone: "text-emerald-600 dark:text-emerald-400",
          },
          {
            label: "RESULTADOS",
            value: filtered.length,
            tone: "text-sky-600 dark:text-sky-400",
          },
        ]}
        action={
          <button
            type="button"
            onClick={() => setDialog({ mode: "new" })}
            className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" /> Novo influenciador
          </button>
        }
      />

      {filtered.length > 0 && (
        <div
          className="mt-6 overflow-hidden rounded-2xl border border-border bg-gradient-to-b from-muted/40 to-background"
          style={{ height: "380px" }}
        >
          <DriftWall
            items={filtered.map((i) => ({
              image: i.foto || initialsAvatarInflu(i.nome),
              title: i.nome || "Sem nome",
              onClick: () => setDetail(i),
            }))}
            columns={Math.max(6, filtered.length)}
            tileWidth={160}
            tileHeight={160}
            speed={30}
            tilt={8}
            turn={0}
            overlayColor="var(--muted)"
          />
        </div>
      )}

      <>
        <div className="mt-6 flex max-w-lg gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nome ou @"
              className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <select
            value={nichoFilter}
            onChange={(e) => setNichoFilter(e.target.value)}
            className="h-10 rounded-md border border-input bg-background px-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">Todos os nichos</option>
            {nichosEmUso.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>

        {filtered.length === 0 ? (
          <div className="mt-8 rounded-lg border border-dashed border-border p-10 text-center">
            <p className="text-sm text-muted-foreground">
              {list.length === 0
                ? "Nenhum influenciador cadastrado ainda."
                : "Nenhum resultado para essa busca."}
            </p>
            {list.length === 0 && (
              <button
                type="button"
                onClick={() => setDialog({ mode: "new" })}
                className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
              >
                <Plus className="h-4 w-4" /> Adicionar o primeiro
              </button>
            )}
          </div>
        ) : (
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((i) => {
              const history = historyFor(i.nome);
              const count = history.length;
              const reliability = computeReliability(history.flatMap((h) => h.influ.entregas));
              return (
                <div
                  key={i.id}
                  className="group relative flex items-center gap-3 overflow-hidden rounded-lg border border-border bg-card p-3 transition-colors hover:border-foreground/20 hover:bg-muted/40"
                >
                  <button
                    type="button"
                    onClick={() => setDetail(i)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-muted">
                      {i.foto ? (
                        <img src={i.foto} alt="" className="h-full w-full object-cover" />
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
                      <div className="truncate text-xs text-muted-foreground">
                        {i.redes
                          .map((r) =>
                            [r.handle || r.plataforma, r.seguidores ? `${r.seguidores} seg.` : ""]
                              .filter(Boolean)
                              .join(" · "),
                          )
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {i.nicho && (
                          <span className="max-w-[120px] truncate rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                            {i.nicho}
                          </span>
                        )}
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {count} {count === 1 ? "campanha" : "campanhas"}
                        </span>
                        {reliability.total > 0 && (
                          <span
                            className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                              reliability.score >= 80
                                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                                : reliability.score >= 50
                                  ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                                  : "bg-rose-500/10 text-rose-700 dark:text-rose-400"
                            }`}
                            title="Confiabilidade: % de entregas cumpridas no prazo combinado"
                          >
                            {reliability.score}% confiável
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    aria-label="Apagar influenciador"
                    onClick={async (e) => {
                      e.stopPropagation();
                      const ok = await confirm(`Apagar "${i.nome}" do banco?`);
                      if (ok) {
                        persist(list.filter((x) => x.id !== i.id));
                      }
                    }}
                    className="absolute right-2 top-2 rounded p-1 text-muted-foreground opacity-0 transition hover:bg-muted hover:text-destructive group-hover:opacity-100"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </>

      <BankInfluDialog
        open={!!dialog}
        initial={dialog?.data}
        onClose={() => setDialog(null)}
        onSave={(i) => {
          if (dialog?.mode === "edit") {
            persist(list.map((x) => (x.id === i.id ? i : x)));
          } else {
            persist([...list, i]);
          }
          setDialog(null);
        }}
      />
      {confirmDialog}
    </div>
  );
}

/* ============================================================
 * Dialog
 * ============================================================ */

function BankInfluDialog({
  open,
  initial,
  onClose,
  onSave,
}: {
  open: boolean;
  initial?: BankInflu;
  onClose: () => void;
  onSave: (i: BankInflu) => void;
}) {
  const [nome, setNome] = useState("");
  const [nicho, setNicho] = useState("");
  const [foto, setFoto] = useState<string | undefined>(undefined);
  const [redes, setRedes] = useState<Rede[]>([]);
  const [endereco, setEndereco] = useState<Endereco>({});

  useEffect(() => {
    if (!open) return;
    setNome(initial?.nome ?? "");
    setNicho(initial?.nicho ?? "");
    setFoto(initial?.foto);
    setRedes(
      initial?.redes && initial.redes.length > 0
        ? initial.redes.map((r) => ({ ...r }))
        : [{ id: crypto.randomUUID(), plataforma: "Instagram", handle: "" }],
    );
    setEndereco(initial?.endereco ? { ...initial.endereco } : {});
  }, [open, initial]);

  const handlePhoto = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => setFoto(reader.result as string);
    reader.readAsDataURL(file);
  };

  const setEnd = (k: keyof Endereco, v: string) => setEndereco((e) => ({ ...e, [k]: v }));

  const submit = () => {
    if (!nome.trim()) return;
    const cleanedEnd: Endereco = Object.fromEntries(
      Object.entries(endereco).filter(([, v]) => v && String(v).trim()),
    );
    onSave({
      id: initial?.id ?? crypto.randomUUID(),
      nome: nome.trim(),
      nicho: nicho || undefined,
      foto,
      redes: redes.filter((r) => r.plataforma || r.handle),
      endereco: Object.keys(cleanedEnd).length ? cleanedEnd : undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="flex max-h-[85vh] max-w-md flex-col">
        <DialogTitle>{initial ? "Editar influenciador" : "Novo influenciador"}</DialogTitle>
        <DialogDescription className="sr-only">
          Cadastro simplificado do banco de influenciadores.
        </DialogDescription>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
          <div className="flex items-center gap-4">
            <label className="relative h-16 w-16 shrink-0 cursor-pointer overflow-hidden rounded-full bg-muted">
              {foto ? (
                <img src={foto} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                  <Camera className="h-5 w-5" />
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handlePhoto(f);
                }}
              />
            </label>
            <div className="flex-1">
              <label className="block text-xs font-medium text-muted-foreground">Nome</label>
              <input
                type="text"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Nome do influenciador"
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground">Nicho</label>
            <select
              value={nicho}
              onChange={(e) => setNicho(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">Selecione um nicho</option>
              {NICHOS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">Redes</label>
              <button
                type="button"
                onClick={() =>
                  setRedes((r) => [
                    ...r,
                    { id: crypto.randomUUID(), plataforma: "Instagram", handle: "" },
                  ])
                }
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <Plus className="h-3 w-3" /> adicionar
              </button>
            </div>
            <div className="space-y-2">
              {redes.map((r) => (
                <div key={r.id} className="flex items-center gap-2">
                  <select
                    value={r.plataforma}
                    onChange={(e) =>
                      setRedes((list) =>
                        list.map((x) => (x.id === r.id ? { ...x, plataforma: e.target.value } : x)),
                      )
                    }
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    {REDES_OPTS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={r.handle}
                    onChange={(e) =>
                      setRedes((list) =>
                        list.map((x) => (x.id === r.id ? { ...x, handle: e.target.value } : x)),
                      )
                    }
                    placeholder="@handle"
                    className="h-9 flex-1 rounded-md border border-input bg-background px-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <input
                    type="text"
                    inputMode="numeric"
                    value={r.seguidores ?? ""}
                    onChange={(e) =>
                      setRedes((list) =>
                        list.map((x) => (x.id === r.id ? { ...x, seguidores: e.target.value } : x)),
                      )
                    }
                    placeholder="Seguidores"
                    title="Seguidores"
                    className="h-9 w-28 rounded-md border border-input bg-background px-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <button
                    type="button"
                    onClick={() => setRedes((list) => list.filter((x) => x.id !== r.id))}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label="Remover rede"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Endereço
            </label>
            <div className="grid grid-cols-6 gap-2">
              <input
                type="text"
                value={endereco.rua ?? ""}
                onChange={(e) => setEnd("rua", e.target.value)}
                placeholder="Rua / Logradouro"
                className="col-span-4 h-9 rounded-md border border-input bg-background px-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <input
                type="text"
                value={endereco.numero ?? ""}
                onChange={(e) => setEnd("numero", e.target.value)}
                placeholder="Número"
                className="col-span-2 h-9 rounded-md border border-input bg-background px-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <input
                type="text"
                value={endereco.complemento ?? ""}
                onChange={(e) => setEnd("complemento", e.target.value)}
                placeholder="Complemento"
                className="col-span-3 h-9 rounded-md border border-input bg-background px-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <input
                type="text"
                value={endereco.bairro ?? ""}
                onChange={(e) => setEnd("bairro", e.target.value)}
                placeholder="Bairro"
                className="col-span-3 h-9 rounded-md border border-input bg-background px-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <input
                type="text"
                value={endereco.cidade ?? ""}
                onChange={(e) => setEnd("cidade", e.target.value)}
                placeholder="Cidade"
                className="col-span-3 h-9 rounded-md border border-input bg-background px-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <input
                type="text"
                value={endereco.estado ?? ""}
                onChange={(e) => setEnd("estado", e.target.value)}
                placeholder="UF"
                maxLength={2}
                className="col-span-1 h-9 rounded-md border border-input bg-background px-2.5 text-sm uppercase focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <input
                type="text"
                value={endereco.cep ?? ""}
                onChange={(e) => setEnd("cep", e.target.value)}
                placeholder="CEP"
                className="col-span-2 h-9 rounded-md border border-input bg-background px-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <input
                type="text"
                value={endereco.pais ?? ""}
                onChange={(e) => setEnd("pais", e.target.value)}
                placeholder="País"
                className="col-span-6 h-9 rounded-md border border-input bg-background px-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
          >
            <X className="h-4 w-4" /> Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!nome.trim()}
            className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50"
          >
            Salvar
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
