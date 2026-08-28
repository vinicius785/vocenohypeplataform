import { useRef, useState } from "react";
import { Plus, X, Image as ImageIcon, ExternalLink, Megaphone, Upload } from "lucide-react";
import type { Campaign, CampaignPlatform, CampaignStatus, Creative, Project } from "@/lib/projetos";
import { resizeImageToDataUrl } from "@/lib/image-upload";
import { FormattedNumberInput } from "@/components/ui/formatted-number-input";

const PLATFORMS: CampaignPlatform[] = ["Meta", "Google", "TikTok", "LinkedIn", "Outro"];
const STATUS: { key: CampaignStatus; label: string; cls: string }[] = [
  { key: "rascunho", label: "Rascunho", cls: "bg-muted text-foreground" },
  { key: "ativa", label: "Ativa", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  { key: "pausada", label: "Pausada", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  { key: "encerrada", label: "Encerrada", cls: "bg-muted text-muted-foreground" },
];

const inputCls =
  "h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs outline-none focus:ring-2 focus:ring-ring";

export function TrafegoPagoPanel({
  project,
  update,
}: {
  project: Project;
  update: (p: Partial<Project>) => void;
}) {
  const campaigns = project.campaigns ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(campaigns[0]?.id ?? null);
  const [creating, setCreating] = useState(false);

  const setCampaigns = (next: Campaign[]) => update({ campaigns: next });

  const create = (name: string) => {
    const c: Campaign = {
      id: crypto.randomUUID(),
      name,
      platform: "Meta",
      status: "rascunho",
      creatives: [],
      metrics: {},
    };
    setCampaigns([...campaigns, c]);
    setSelectedId(c.id);
    setCreating(false);
  };

  const updateCampaign = (id: string, patch: Partial<Campaign>) => {
    setCampaigns(campaigns.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };
  const removeCampaign = (id: string) => {
    const next = campaigns.filter((c) => c.id !== id);
    setCampaigns(next);
    if (selectedId === id) setSelectedId(next[0]?.id ?? null);
  };

  const selected = campaigns.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[240px_1fr]">
      <aside className="rounded-lg border border-border bg-background">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-xs font-semibold">Campanhas</span>
          <button
            onClick={() => setCreating(true)}
            aria-label="Nova"
            className="rounded p-1 hover:bg-muted"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        {creating && <NewCampaignRow onCreate={create} onCancel={() => setCreating(false)} />}
        <ul className="max-h-[420px] overflow-y-auto">
          {campaigns.length === 0 && !creating && (
            <li className="p-3 text-center text-[11px] text-muted-foreground">Nenhuma campanha.</li>
          )}
          {campaigns.map((c) => {
            const s = STATUS.find((x) => x.key === c.status)!;
            return (
              <li key={c.id}>
                <button
                  onClick={() => setSelectedId(c.id)}
                  className={`flex w-full items-center gap-2 border-b border-border px-3 py-2 text-left last:border-b-0 hover:bg-muted/60 ${selectedId === c.id ? "bg-muted/60" : ""}`}
                >
                  <Megaphone className="h-3.5 w-3.5 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">{c.name}</p>
                    <p className="truncate text-[10px] text-muted-foreground">{c.platform}</p>
                  </div>
                  <span className={`rounded px-1.5 py-0.5 text-[9px] ${s.cls}`}>{s.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {selected ? (
        <CampaignEditor
          key={selected.id}
          campaign={selected}
          onChange={(patch) => updateCampaign(selected.id, patch)}
          onDelete={() => removeCampaign(selected.id)}
        />
      ) : (
        <div className="flex items-center justify-center rounded-lg border border-dashed border-border p-8 text-xs text-muted-foreground">
          Selecione ou crie uma campanha.
        </div>
      )}
    </div>
  );
}

function NewCampaignRow({
  onCreate,
  onCancel,
}: {
  onCreate: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onCreate(name.trim());
      }}
      className="flex gap-1 border-b border-border p-2"
    >
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nome"
        className={inputCls}
      />
      <button
        type="button"
        onClick={onCancel}
        className="rounded px-2 text-[11px] text-muted-foreground"
      >
        ✕
      </button>
    </form>
  );
}

function CampaignEditor({
  campaign,
  onChange,
  onDelete,
}: {
  campaign: Campaign;
  onChange: (patch: Partial<Campaign>) => void;
  onDelete: () => void;
}) {
  const c = campaign;
  const setMetric = (k: keyof Campaign["metrics"], v: string) => {
    const n = v === "" ? undefined : Number(v);
    onChange({
      metrics: { ...c.metrics, [k]: Number.isFinite(n as number) ? (n as number) : undefined },
    });
  };

  const ctr =
    c.metrics.impressions && c.metrics.clicks
      ? ((c.metrics.clicks / c.metrics.impressions) * 100).toFixed(2) + "%"
      : "—";
  const cpc =
    c.metrics.spend && c.metrics.clicks
      ? "R$ " + (c.metrics.spend / c.metrics.clicks).toFixed(2)
      : "—";
  const cpa =
    c.metrics.spend && c.metrics.conversions
      ? "R$ " + (c.metrics.spend / c.metrics.conversions).toFixed(2)
      : "—";

  const addCreative = (creative: Creative) => onChange({ creatives: [...c.creatives, creative] });
  const removeCreative = (id: string) =>
    onChange({ creatives: c.creatives.filter((x) => x.id !== id) });

  return (
    <div className="space-y-4 rounded-lg border border-border bg-background p-4">
      <div className="flex items-start justify-between gap-3">
        <input
          value={c.name}
          onChange={(e) => onChange({ name: e.target.value })}
          className="flex-1 border-0 bg-transparent p-0 text-lg font-semibold outline-none focus:ring-0"
        />
        <button onClick={onDelete} aria-label="Excluir" className="rounded p-1 hover:bg-muted">
          <X className="h-4 w-4 text-muted-foreground hover:text-destructive" />
        </button>
      </div>

      {/* Basic fields */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <label className="space-y-1">
          <span className="text-[11px] font-medium text-muted-foreground">Plataforma</span>
          <select
            value={c.platform}
            onChange={(e) => onChange({ platform: e.target.value as CampaignPlatform })}
            className={inputCls}
          >
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-[11px] font-medium text-muted-foreground">Status</span>
          <select
            value={c.status}
            onChange={(e) => onChange({ status: e.target.value as CampaignStatus })}
            className={inputCls}
          >
            {STATUS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-[11px] font-medium text-muted-foreground">Início</span>
          <input
            type="date"
            value={c.startDate ?? ""}
            onChange={(e) => onChange({ startDate: e.target.value || undefined })}
            className={inputCls}
          />
        </label>
        <label className="space-y-1">
          <span className="text-[11px] font-medium text-muted-foreground">Fim</span>
          <input
            type="date"
            value={c.endDate ?? ""}
            onChange={(e) => onChange({ endDate: e.target.value || undefined })}
            className={inputCls}
          />
        </label>
        <label className="space-y-1 md:col-span-2">
          <span className="text-[11px] font-medium text-muted-foreground">Objetivo</span>
          <input
            value={c.objective ?? ""}
            onChange={(e) => onChange({ objective: e.target.value })}
            placeholder="Conversões, tráfego, awareness..."
            className={inputCls}
          />
        </label>
        <label className="space-y-1 md:col-span-2">
          <span className="text-[11px] font-medium text-muted-foreground">Verba (R$)</span>
          <FormattedNumberInput
            mode="currency"
            value={c.budget}
            onValueChange={(budget) => onChange({ budget })}
            className={inputCls}
          />
        </label>
      </div>

      {/* Brief */}
      <div className="space-y-2">
        <label className="block space-y-1">
          <span className="text-[11px] font-medium text-muted-foreground">Público-alvo</span>
          <input
            value={c.audience ?? ""}
            onChange={(e) => onChange({ audience: e.target.value })}
            placeholder="Idade, interesses, localização..."
            className={inputCls}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[11px] font-medium text-muted-foreground">
            Briefing / esboço da campanha
          </span>
          <textarea
            value={c.brief ?? ""}
            onChange={(e) => onChange({ brief: e.target.value })}
            rows={4}
            placeholder="Mensagem-chave, ofertas, CTA, ângulos criativos..."
            className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
      </div>

      {/* Metrics */}
      <div>
        <p className="mb-2 text-xs font-semibold">Métricas</p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <MetricInput
            label="Impressões"
            value={c.metrics.impressions}
            onChange={(v) => setMetric("impressions", v)}
          />
          <MetricInput
            label="Cliques"
            value={c.metrics.clicks}
            onChange={(v) => setMetric("clicks", v)}
          />
          <MetricInput
            label="Conversões"
            value={c.metrics.conversions}
            onChange={(v) => setMetric("conversions", v)}
          />
          <MetricInput
            label="Investido (R$)"
            value={c.metrics.spend}
            onChange={(v) => setMetric("spend", v)}
            step="0.01"
          />
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
          <div className="rounded-md border border-border bg-muted/40 px-2 py-1.5">
            <span className="text-muted-foreground">CTR:</span> <b>{ctr}</b>
          </div>
          <div className="rounded-md border border-border bg-muted/40 px-2 py-1.5">
            <span className="text-muted-foreground">CPC:</span> <b>{cpc}</b>
          </div>
          <div className="rounded-md border border-border bg-muted/40 px-2 py-1.5">
            <span className="text-muted-foreground">CPA:</span> <b>{cpa}</b>
          </div>
        </div>
      </div>

      {/* Creatives */}
      <div>
        <p className="mb-2 text-xs font-semibold">Criativos</p>
        <CreativeAdder onAdd={addCreative} />
        {c.creatives.length === 0 ? (
          <p className="mt-2 text-[11px] text-muted-foreground">Nenhum criativo salvo.</p>
        ) : (
          <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
            {c.creatives.map((cr) => (
              <div
                key={cr.id}
                className="group relative overflow-hidden rounded-md border border-border bg-muted"
              >
                {/\.(png|jpg|jpeg|gif|webp|svg)$/i.test(cr.url) ? (
                  <img src={cr.url} alt={cr.name} className="aspect-square w-full object-cover" />
                ) : (
                  <div className="flex aspect-square items-center justify-center">
                    <ImageIcon className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
                <div className="flex items-center gap-1 border-t border-border bg-background px-1.5 py-1">
                  <span className="min-w-0 flex-1 truncate text-[10px]">{cr.name}</span>
                  <a
                    href={cr.url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Abrir"
                    className="rounded p-0.5 hover:bg-muted"
                  >
                    <ExternalLink className="h-3 w-3 text-muted-foreground" />
                  </a>
                  <button
                    onClick={() => removeCreative(cr.id)}
                    aria-label="Remover"
                    className="rounded p-0.5 hover:bg-muted"
                  >
                    <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Notes */}
      <label className="block space-y-1">
        <span className="text-[11px] font-medium text-muted-foreground">
          Anotações / aprendizados
        </span>
        <textarea
          value={c.notes ?? ""}
          onChange={(e) => onChange({ notes: e.target.value })}
          rows={3}
          className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-ring"
        />
      </label>
    </div>
  );
}

function MetricInput({
  label,
  value,
  onChange,
  step = "1",
}: {
  label: string;
  value?: number;
  onChange: (v: string) => void;
  step?: string;
}) {
  return (
    <label className="space-y-1">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      <input
        type="number"
        min="0"
        step={step}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className={inputCls}
      />
    </label>
  );
}

function CreativeAdder({ onAdd }: { onAdd: (c: Creative) => void }) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      setUrl(dataUrl);
    } catch {
      /* ignore */
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim() || !url.trim()) return;
        onAdd({ id: crypto.randomUUID(), name: name.trim(), url: url.trim() });
        setName("");
        setUrl("");
      }}
      className="flex flex-wrap gap-2"
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nome do criativo"
        className={`${inputCls} max-w-[180px]`}
      />
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="URL da imagem/vídeo ou envie um arquivo"
        className={`${inputCls} flex-1 min-w-[220px]`}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && void handleFile(e.target.files[0])}
      />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
      >
        <Upload className="h-3.5 w-3.5" /> Enviar imagem
      </button>
      <button className="inline-flex items-center gap-1 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90">
        <Plus className="h-3.5 w-3.5" /> Adicionar
      </button>
    </form>
  );
}
