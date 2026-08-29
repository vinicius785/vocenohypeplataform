import { useEffect, useMemo, useState } from "react";
import { DateField } from "@/components/ui/date-field";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Plus,
  Trash2,
  Paperclip,
  X,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import { resizeImageToDataUrl } from "@/lib/image-upload";
import {
  AEO_CATEGORIAS,
  AEO_CATEGORIA_LABEL,
  AEO_IAS,
  AEO_IDIOMAS,
  AEO_POSICOES,
  aeoRodadas,
  aiVisibilityScore,
  categoryScore,
  competitorFrequency,
  loadAeoPrompts,
  loadAeoRespostas,
  onAeoPromptsChange,
  onAeoRespostasChange,
  promptsZero,
  rankingPrompts,
  recomendacaoAutomatica,
  saveAeoPrompts,
  saveAeoRespostas,
  shareOfAnswers,
  type AeoCategoria,
  type AeoIa,
  type AeoIdioma,
  type AeoPosicao,
  type AeoPrompt,
  type AeoResposta,
} from "@/lib/aeo-store";

const CHART_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)"];

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y) return iso;
  return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString("pt-BR");
}

const inputCls =
  "h-8 rounded-md border border-border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring";

type Tab = "rodada" | "dashboard" | "relatorio" | "biblioteca";

export function AeoMonitorPanel() {
  const [tab, setTab] = useState<Tab>("rodada");
  const [prompts, setPrompts] = useState<AeoPrompt[]>(() => loadAeoPrompts());
  const [respostas, setRespostas] = useState<AeoResposta[]>(() => loadAeoRespostas());

  useEffect(() => onAeoPromptsChange(() => setPrompts(loadAeoPrompts())), []);
  useEffect(() => onAeoRespostasChange(() => setRespostas(loadAeoRespostas())), []);

  const tabs: { key: Tab; label: string }[] = [
    { key: "rodada", label: "Preencher rodada" },
    { key: "dashboard", label: "Dashboard" },
    { key: "relatorio", label: "Relatório" },
    { key: "biblioteca", label: "Biblioteca de prompts" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-1 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
              tab === t.key
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "rodada" && (
        <RodadaTab prompts={prompts} respostas={respostas} setRespostas={setRespostas} />
      )}
      {tab === "dashboard" && <DashboardTab prompts={prompts} respostas={respostas} />}
      {tab === "relatorio" && <RelatorioTab prompts={prompts} respostas={respostas} />}
      {tab === "biblioteca" && <BibliotecaTab prompts={prompts} setPrompts={setPrompts} />}
    </div>
  );
}

/* -------- Preencher rodada -------- */
function RodadaTab({
  prompts,
  respostas,
  setRespostas,
}: {
  prompts: AeoPrompt[];
  respostas: AeoResposta[];
  setRespostas: (r: AeoResposta[]) => void;
}) {
  const [rodadaData, setRodadaData] = useState(todayISO());
  const [ia, setIa] = useState<AeoIa>(AEO_IAS[0]);
  const [categoriaFiltro, setCategoriaFiltro] = useState<AeoCategoria | "">("");

  const ativos = useMemo(
    () =>
      prompts
        .filter((p) => p.ativo && (!categoriaFiltro || p.categoria === categoriaFiltro))
        .sort((a, b) => a.idCodigo.localeCompare(b.idCodigo)),
    [prompts, categoriaFiltro],
  );

  const respostaFor = (promptId: string): AeoResposta | undefined =>
    respostas.find((r) => r.promptId === promptId && r.ia === ia && r.rodadaData === rodadaData);

  const upsert = (promptId: string, patch: Partial<AeoResposta>) => {
    const existing = respostaFor(promptId);
    const now = new Date().toISOString();
    if (existing) {
      const next = { ...existing, ...patch, updatedAt: now };
      setRespostas(respostas.map((r) => (r.id === existing.id ? next : r)));
      saveAeoRespostas(loadAeoRespostas().map((r) => (r.id === existing.id ? next : r)));
    } else {
      const novo: AeoResposta = {
        id: crypto.randomUUID(),
        rodadaData,
        promptId,
        ia,
        citada: false,
        createdAt: now,
        ...patch,
      };
      const next = [...respostas, novo];
      setRespostas(next);
      saveAeoRespostas([...loadAeoRespostas(), novo]);
    }
  };

  const preenchidos = ativos.filter((p) => respostaFor(p.id)).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-4">
        <div>
          <label className="block text-[11px] font-medium text-muted-foreground">
            Data da rodada
          </label>
          <DateField
            value={rodadaData || undefined}
            onChange={(v) => setRodadaData(v ?? "")}
            className={`${inputCls} mt-1`}
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-muted-foreground">IA</label>
          <select
            value={ia}
            onChange={(e) => setIa(e.target.value as AeoIa)}
            className={`${inputCls} mt-1`}
          >
            {AEO_IAS.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-muted-foreground">Categoria</label>
          <select
            value={categoriaFiltro}
            onChange={(e) => setCategoriaFiltro(e.target.value as AeoCategoria | "")}
            className={`${inputCls} mt-1`}
          >
            <option value="">Todas</option>
            {AEO_CATEGORIAS.map((c) => (
              <option key={c} value={c}>
                {c} — {AEO_CATEGORIA_LABEL[c]}
              </option>
            ))}
          </select>
        </div>
        <p className="ml-auto text-xs text-muted-foreground">
          {preenchidos} de {ativos.length} prompts preenchidos nesta rodada/IA
        </p>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[1100px] text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 font-medium">Prompt</th>
              <th className="px-3 py-2 font-medium">Citada?</th>
              <th className="px-3 py-2 font-medium">Posição</th>
              <th className="px-3 py-2 font-medium">Descrição</th>
              <th className="px-3 py-2 font-medium">Fonte</th>
              <th className="px-3 py-2 font-medium">Concorrentes</th>
              <th className="px-3 py-2 font-medium">Narrativa</th>
              <th className="px-3 py-2 font-medium">Evidência</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {ativos.map((p) => {
              const r = respostaFor(p.id);
              return (
                <tr key={p.id} className="align-top">
                  <td className="px-3 py-2">
                    <p className="font-medium text-foreground">
                      {p.idCodigo} <span className="text-muted-foreground">· {p.idioma}</span>
                    </p>
                    <p className="mt-0.5 max-w-[220px] text-muted-foreground">{p.texto}</p>
                  </td>
                  <td className="px-3 py-2">
                    <div className="inline-flex rounded-md border border-border p-0.5">
                      <button
                        type="button"
                        onClick={() => upsert(p.id, { citada: true })}
                        className={`rounded px-2 py-1 text-[11px] font-medium ${
                          r?.citada
                            ? "bg-foreground text-background"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        Sim
                      </button>
                      <button
                        type="button"
                        onClick={() => upsert(p.id, { citada: false, posicao: undefined })}
                        className={`rounded px-2 py-1 text-[11px] font-medium ${
                          r && !r.citada
                            ? "bg-foreground text-background"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        Não
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={r?.posicao ?? ""}
                      disabled={!r?.citada}
                      onChange={(e) => upsert(p.id, { posicao: e.target.value as AeoPosicao })}
                      className={`${inputCls} disabled:opacity-40`}
                    >
                      <option value="">—</option>
                      {AEO_POSICOES.map((pos) => (
                        <option key={pos} value={pos}>
                          {pos}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      defaultValue={r?.descricao ?? ""}
                      onBlur={(e) => upsert(p.id, { descricao: e.target.value })}
                      placeholder="Como foi descrita"
                      className={`${inputCls} w-40`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      defaultValue={r?.fonte ?? ""}
                      onBlur={(e) => upsert(p.id, { fonte: e.target.value })}
                      placeholder="Site, LinkedIn..."
                      className={`${inputCls} w-32`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      defaultValue={r?.concorrentes ?? ""}
                      onBlur={(e) => upsert(p.id, { concorrentes: e.target.value })}
                      placeholder="Squid, Airfluencers..."
                      className={`${inputCls} w-36`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={r?.narrativeScore ?? ""}
                      onChange={(e) =>
                        upsert(p.id, {
                          narrativeScore: e.target.value ? Number(e.target.value) : undefined,
                        })
                      }
                      className={`${inputCls} w-16`}
                    >
                      <option value="">—</option>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <EvidenciaCell
                      value={r?.evidenciaUrl}
                      onChange={(dataUrl) => upsert(p.id, { evidenciaUrl: dataUrl })}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EvidenciaCell({
  value,
  onChange,
}: {
  value?: string;
  onChange: (dataUrl: string | undefined) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      onChange(dataUrl);
    } catch {
      /* ignore */
    } finally {
      setUploading(false);
    }
  };
  if (value) {
    return (
      <div className="flex items-center gap-1">
        <a href={value} target="_blank" rel="noreferrer">
          <img src={value} alt="Evidência" className="h-8 w-8 rounded object-cover" />
        </a>
        <button
          type="button"
          onClick={() => onChange(undefined)}
          aria-label="Remover"
          className="rounded p-1 text-muted-foreground hover:text-destructive"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    );
  }
  return (
    <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-[11px] text-muted-foreground hover:border-foreground hover:text-foreground">
      <Paperclip className="h-3 w-3" />
      {uploading ? "..." : "Print"}
      <input
        type="file"
        accept="image/*"
        className="hidden"
        disabled={uploading}
        onChange={(e) => e.target.files?.[0] && void handleFile(e.target.files[0])}
      />
    </label>
  );
}

/* -------- Dashboard -------- */
function DashboardTab({ prompts, respostas }: { prompts: AeoPrompt[]; respostas: AeoResposta[] }) {
  const rodadas = useMemo(() => aeoRodadas(respostas), [respostas]);
  const [rodada, setRodada] = useState(rodadas[0] ?? "");
  const rodadaAtual = rodada || rodadas[0] || "";

  const evolucao = useMemo(() => {
    return rodadas
      .slice()
      .reverse()
      .map((data) => {
        const point: Record<string, string | number> = { data: fmtDate(data) };
        for (const i of AEO_IAS) point[i] = aiVisibilityScore(respostas, data, i);
        return point;
      });
  }, [rodadas, respostas]);

  const cats = rodadaAtual ? categoryScore(respostas, prompts, rodadaAtual) : { A: 0, B: 0, C: 0 };
  const zero = useMemo(() => promptsZero(respostas, prompts), [respostas, prompts]);

  if (rodadas.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        Nenhuma rodada registrada ainda — preencha em "Preencher rodada".
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <label className="text-xs text-muted-foreground">Rodada</label>
        <select
          value={rodadaAtual}
          onChange={(e) => setRodada(e.target.value)}
          className={inputCls}
        >
          {rodadas.map((r) => (
            <option key={r} value={r}>
              {fmtDate(r)}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {AEO_IAS.map((i) => (
          <div key={i} className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs font-medium text-muted-foreground">{i}</p>
            <p className="mt-1 text-3xl font-light tracking-tighter text-foreground">
              {aiVisibilityScore(respostas, rodadaAtual, i)}%
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {shareOfAnswers(respostas, rodadaAtual, i)}% em 1º lugar
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-4">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Visibilidade por categoria
          </h3>
          <div className="mt-3 space-y-3">
            {AEO_CATEGORIAS.map((c) => (
              <div key={c}>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-foreground">
                    {c} — {AEO_CATEGORIA_LABEL[c]}
                  </span>
                  <span className="text-muted-foreground">{cats[c]}%</span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-foreground transition-all"
                    style={{ width: `${cats[c]}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Prompts zero ({zero.length})
          </h3>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Nunca citaram a VNH em nenhuma rodada.
          </p>
          <ul className="mt-3 max-h-40 space-y-1.5 overflow-y-auto">
            {zero.length === 0 && (
              <li className="text-xs text-muted-foreground">Nenhum — ótimo sinal.</li>
            )}
            {zero.map((p) => (
              <li key={p.id} className="truncate text-xs text-foreground">
                {p.idCodigo} · {p.texto}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {evolucao.length > 1 && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Evolução por IA
          </h3>
          <div className="mt-3 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={evolucao}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="data" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                <YAxis
                  tick={{ fontSize: 11 }}
                  stroke="var(--muted-foreground)"
                  domain={[0, 100]}
                  unit="%"
                />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {AEO_IAS.map((i, idx) => (
                  <Line
                    key={i}
                    type="monotone"
                    dataKey={i}
                    stroke={CHART_COLORS[idx % CHART_COLORS.length]}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

/* -------- Relatório -------- */
function RelatorioTab({ prompts, respostas }: { prompts: AeoPrompt[]; respostas: AeoResposta[] }) {
  const rodadas = useMemo(() => aeoRodadas(respostas), [respostas]);
  const [rodada, setRodada] = useState(rodadas[0] ?? "");
  const rodadaAtual = rodada || rodadas[0] || "";
  const idx = rodadas.indexOf(rodadaAtual);
  const rodadaAnterior = idx >= 0 ? rodadas[idx + 1] : undefined;

  if (rodadas.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        Nenhuma rodada registrada ainda.
      </p>
    );
  }

  const ranking = rankingPrompts(
    respostas.filter((r) => r.rodadaData === rodadaAtual),
    prompts,
  ).slice(0, 10);
  const zero = promptsZero(respostas, prompts);
  const concorrentes = competitorFrequency(respostas.filter((r) => r.rodadaData === rodadaAtual));
  const recomendacao = recomendacaoAutomatica(respostas, prompts, rodadaAtual);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <label className="text-xs text-muted-foreground">Rodada</label>
        <select
          value={rodadaAtual}
          onChange={(e) => setRodada(e.target.value)}
          className={inputCls}
        >
          {rodadas.map((r) => (
            <option key={r} value={r}>
              {fmtDate(r)}
            </option>
          ))}
        </select>
        {rodadaAnterior && (
          <span className="text-xs text-muted-foreground">vs. {fmtDate(rodadaAnterior)}</span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {AEO_IAS.map((i) => {
          const atual = aiVisibilityScore(respostas, rodadaAtual, i);
          const anterior = rodadaAnterior ? aiVisibilityScore(respostas, rodadaAnterior, i) : null;
          const delta = anterior === null ? null : atual - anterior;
          return (
            <div key={i} className="rounded-2xl border border-border bg-card p-4">
              <p className="text-xs font-medium text-muted-foreground">{i}</p>
              <p className="mt-1 text-2xl font-light tracking-tighter text-foreground">{atual}%</p>
              {delta !== null && (
                <p
                  className={`mt-1 inline-flex items-center gap-1 text-[11px] font-medium ${
                    delta > 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : delta < 0
                        ? "text-rose-600 dark:text-rose-400"
                        : "text-muted-foreground"
                  }`}
                >
                  {delta > 0 ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : delta < 0 ? (
                    <TrendingDown className="h-3 w-3" />
                  ) : (
                    <Minus className="h-3 w-3" />
                  )}
                  {delta > 0 ? "+" : ""}
                  {delta}pp vs. rodada anterior
                </p>
              )}
            </div>
          );
        })}
      </div>

      {recomendacao && (
        <div className="flex items-start gap-2.5 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-sm text-foreground">{recomendacao}</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-4">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Ranking de prompts (mais citada)
          </h3>
          <ul className="mt-3 space-y-1.5">
            {ranking.length === 0 && (
              <li className="text-xs text-muted-foreground">Sem respostas nesta rodada.</li>
            )}
            {ranking.map(({ prompt, citacoes, total }) => (
              <li key={prompt.id} className="flex items-center justify-between text-xs">
                <span className="truncate text-foreground">
                  {prompt.idCodigo} · {prompt.texto}
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {citacoes}/{total}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Concorrentes mais citados
          </h3>
          <ul className="mt-3 space-y-1.5">
            {concorrentes.length === 0 && (
              <li className="text-xs text-muted-foreground">Nenhum concorrente registrado.</li>
            )}
            {concorrentes.slice(0, 10).map((c) => (
              <li key={c.nome} className="flex items-center justify-between text-xs">
                <span className="text-foreground">{c.nome}</span>
                <span className="text-muted-foreground">{c.vezes}x</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Prompts zero ({zero.length})
        </h3>
        <ul className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {zero.map((p) => (
            <li key={p.id} className="truncate text-xs text-foreground">
              {p.idCodigo} · {p.texto}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* -------- Biblioteca de prompts -------- */
function BibliotecaTab({
  prompts,
  setPrompts,
}: {
  prompts: AeoPrompt[];
  setPrompts: (p: AeoPrompt[]) => void;
}) {
  const [novoTexto, setNovoTexto] = useState("");
  const [novaCategoria, setNovaCategoria] = useState<AeoCategoria>("A");
  const [novoIdioma, setNovoIdioma] = useState<AeoIdioma>("PT");

  const grouped = useMemo(() => {
    const map = new Map<string, AeoPrompt[]>();
    for (const c of AEO_CATEGORIAS) {
      map.set(
        c,
        prompts
          .filter((p) => p.categoria === c)
          .sort((a, b) => a.idCodigo.localeCompare(b.idCodigo)),
      );
    }
    return map;
  }, [prompts]);

  const toggleAtivo = (id: string) => {
    const next = prompts.map((p) => (p.id === id ? { ...p, ativo: !p.ativo } : p));
    setPrompts(next);
    saveAeoPrompts(next);
  };
  const updateTexto = (id: string, texto: string) => {
    const next = prompts.map((p) => (p.id === id ? { ...p, texto } : p));
    setPrompts(next);
    saveAeoPrompts(next);
  };
  const remove = (id: string) => {
    const next = prompts.filter((p) => p.id !== id);
    setPrompts(next);
    saveAeoPrompts(next);
  };
  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!novoTexto.trim()) return;
    const countCat = prompts.filter((p) => p.categoria === novaCategoria).length;
    const novo: AeoPrompt = {
      id: crypto.randomUUID(),
      idCodigo: `${novaCategoria}${String(countCat + 1).padStart(2, "0")}`,
      categoria: novaCategoria,
      idioma: novoIdioma,
      texto: novoTexto.trim(),
      ativo: true,
      createdAt: new Date().toISOString(),
    };
    const next = [...prompts, novo];
    setPrompts(next);
    saveAeoPrompts(next);
    setNovoTexto("");
  };

  return (
    <div className="space-y-5">
      <form
        onSubmit={add}
        className="flex flex-wrap items-end gap-2 rounded-2xl border border-border bg-card p-4"
      >
        <div className="min-w-[240px] flex-1">
          <label className="block text-[11px] font-medium text-muted-foreground">Novo prompt</label>
          <input
            value={novoTexto}
            onChange={(e) => setNovoTexto(e.target.value)}
            placeholder='Ex: "O que é a Você no Hype?"'
            className={`${inputCls} mt-1 w-full`}
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-muted-foreground">Categoria</label>
          <select
            value={novaCategoria}
            onChange={(e) => setNovaCategoria(e.target.value as AeoCategoria)}
            className={`${inputCls} mt-1`}
          >
            {AEO_CATEGORIAS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-muted-foreground">Idioma</label>
          <select
            value={novoIdioma}
            onChange={(e) => setNovoIdioma(e.target.value as AeoIdioma)}
            className={`${inputCls} mt-1`}
          >
            {AEO_IDIOMAS.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-xs font-medium text-background hover:opacity-90"
        >
          <Plus className="h-3.5 w-3.5" /> Adicionar
        </button>
      </form>

      {AEO_CATEGORIAS.map((c) => (
        <div key={c} className="rounded-2xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground">
            Categoria {c} — {AEO_CATEGORIA_LABEL[c]}
          </h3>
          <ul className="mt-3 divide-y divide-border">
            {grouped.get(c)?.map((p) => (
              <li key={p.id} className="flex items-center gap-2 py-2">
                <span className="w-10 shrink-0 text-[11px] font-medium text-muted-foreground">
                  {p.idCodigo}
                </span>
                <span className="w-8 shrink-0 text-[11px] text-muted-foreground">{p.idioma}</span>
                <input
                  defaultValue={p.texto}
                  onBlur={(e) => updateTexto(p.id, e.target.value)}
                  className="h-8 flex-1 rounded-md border border-transparent bg-transparent px-1.5 text-xs text-foreground outline-none hover:border-border focus:border-ring focus:ring-2 focus:ring-ring/20"
                />
                <button
                  type="button"
                  onClick={() => toggleAtivo(p.id)}
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                    p.ativo ? "bg-foreground text-background" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {p.ativo ? "Ativo" : "Inativo"}
                </button>
                <button
                  type="button"
                  onClick={() => remove(p.id)}
                  aria-label="Remover"
                  className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
