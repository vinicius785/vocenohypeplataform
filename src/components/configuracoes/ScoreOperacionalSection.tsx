import { useEffect, useState } from "react";
import { Sliders } from "lucide-react";
import { LockedSection } from "@/components/LockedSection";
import { usePerformanceSettings, savePerformanceSettings } from "@/lib/performance-events-store";
import type { PerformanceSettings } from "@/lib/performance-engine";
import { SettingsCard, SettingsSectionHeader, SettingsSaveBar } from "./settings-shared";

const numField =
  "h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring";

function Field({
  label,
  description,
  unit,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  description?: string;
  unit?: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-foreground">{label}</span>
      {description && (
        <span className="block text-[11px] text-muted-foreground">{description}</span>
      )}
      <div className="relative">
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className={numField}
        />
        {unit && (
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {unit}
          </span>
        )}
      </div>
      {value < 0 && (
        <span className="block text-[11px] text-amber-600 dark:text-amber-400">
          Penalidade (valor negativo).
        </span>
      )}
    </label>
  );
}

export function ScoreOperacionalSection({ isAdmin }: { isAdmin: boolean }) {
  if (!isAdmin) return <LockedSection title="Configuração do Score Operacional" />;
  return <ScoreOperacionalForm />;
}

function ScoreOperacionalForm() {
  const { settings, loading } = usePerformanceSettings();
  const [draft, setDraft] = useState<PerformanceSettings>(settings);
  const [baseline, setBaseline] = useState<PerformanceSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!loading) {
      setDraft(settings);
      setBaseline(settings);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);

  const save = async () => {
    setSaving(true);
    setError("");
    setSaved(false);
    const { error: err } = await savePerformanceSettings(draft);
    if (err) setError(err);
    else {
      setSaved(true);
      setBaseline(draft);
    }
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      <SettingsSectionHeader
        icon={<Sliders className="h-4 w-4" />}
        title="Score operacional"
        description="Pesos de XP e regras de prazo usados no score de cada membro do time."
        adminOnly
      />

      <SettingsCard
        title="Pontuação por tarefas"
        description="Entrega (50 pts), Previsibilidade (35 pts) e Compromissos (15 pts) usam regras de classificação fixas — não são mais configuráveis por peso."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="XP tarefa no prazo"
            value={draft.xpTaskOnTime}
            onChange={(v) => setDraft((d) => ({ ...d, xpTaskOnTime: v }))}
            unit="XP"
          />
          <Field
            label="XP bônus antecipada"
            value={draft.xpTaskEarlyBonus}
            onChange={(v) => setDraft((d) => ({ ...d, xpTaskEarlyBonus: v }))}
            unit="XP"
          />
          <Field
            label="Teto de dias (penalidade XP)"
            description="Acima desse número de dias de atraso, a penalidade para de crescer."
            value={draft.xpOverdueDiasTeto}
            onChange={(v) => setDraft((d) => ({ ...d, xpOverdueDiasTeto: v }))}
            min={1}
            unit="dias"
          />
        </div>
      </SettingsCard>

      <SettingsCard title="Pontuação por reuniões">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="XP reunião realizada"
            value={draft.xpMeetingAttended}
            onChange={(v) => setDraft((d) => ({ ...d, xpMeetingAttended: v }))}
            unit="XP"
          />
          <Field
            label="XP reunião perdida"
            description="Normalmente um valor negativo — penaliza faltas."
            value={draft.xpMeetingMissed}
            onChange={(v) => setDraft((d) => ({ ...d, xpMeetingMissed: v }))}
            unit="XP"
          />
        </div>
      </SettingsCard>

      <SettingsCard
        title="Regras de prazo"
        description='Uma tarefa com prazo hoje só vira "atrasada" depois desse horário — antes disso, ainda conta como dentro do prazo mesmo que o dia já tenha virado.'
      >
        <label className="block max-w-xs space-y-1">
          <span className="text-xs font-medium text-foreground">Horário limite do expediente</span>
          <input
            type="time"
            value={`${String(draft.deadlineCutoffHour).padStart(2, "0")}:00`}
            onChange={(e) => {
              const hour = Number(e.target.value.split(":")[0] ?? 0);
              setDraft((d) => ({ ...d, deadlineCutoffHour: Math.min(23, Math.max(0, hour)) }));
            }}
            className={numField}
          />
        </label>
      </SettingsCard>

      <SettingsSaveBar
        mode="manual"
        dirty={dirty}
        saving={saving}
        error={error || null}
        onDiscard={() => setDraft(baseline)}
        onSave={() => void save()}
      />
      {saved && !dirty && <p className="text-xs text-emerald-600 dark:text-emerald-400">Salvo.</p>}
    </div>
  );
}
