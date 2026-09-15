import { useEffect, useRef, useState } from "react";
import { Building2, ImageIcon, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LockedSection } from "@/components/LockedSection";
import {
  loadWorkspace,
  saveWorkspace,
  fetchWorkspace,
  canEditWorkspace,
  type Workspace,
} from "@/lib/workspace-store";
import {
  SettingsCard,
  SettingsSectionHeader,
  SettingsSaveBar,
  DangerZone,
} from "./settings-shared";

const inputCls =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

export function GeralSection({ canConfig }: { canConfig: boolean }) {
  if (!canConfig) return <LockedSection title="Geral" />;
  return <GeralForm />;
}

function GeralForm() {
  const [ws, setWs] = useState<Workspace>(() => loadWorkspace());
  const [baseline, setBaseline] = useState<Workspace>(ws);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [admin, setAdmin] = useState<boolean | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void fetchWorkspace().then((w) => {
      setWs(w);
      setBaseline(w);
    });
    void canEditWorkspace().then(setAdmin);
  }, []);

  const handleFile = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => setWs((p) => ({ ...p, logo: String(reader.result || "") }));
    reader.readAsDataURL(file);
  };

  const dirty = JSON.stringify(ws) !== JSON.stringify(baseline);

  const save = async () => {
    setErr(null);
    setSaving(true);
    const res = await saveWorkspace({ ...ws, nome: ws.nome.trim() || "Workspace" });
    setSaving(false);
    if (res.error) {
      setErr(res.error);
      return;
    }
    setBaseline(ws);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (admin === false) {
    return (
      <div className="space-y-6">
        <SettingsSectionHeader
          icon={<Building2 className="h-4 w-4" />}
          title="Geral"
          description="Identidade do workspace, visível pro time todo."
        />
        <p className="text-sm text-muted-foreground">
          Você não tem permissão para alterar o nome e a foto do workspace.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SettingsSectionHeader
        icon={<Building2 className="h-4 w-4" />}
        title="Geral"
        description="Aparece no menu lateral e nas telas compartilhadas com o time."
      />

      <SettingsCard>
        <div className="flex items-center gap-4">
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-border bg-muted">
            {ws.logo ? (
              <img src={ws.logo} alt="Logo" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <ImageIcon className="h-6 w-6 text-muted-foreground" />
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-3.5 w-3.5" />
              {ws.logo ? "Trocar logo" : "Anexar logo"}
            </Button>
          </div>
        </div>

        <label className="mt-5 block space-y-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Nome do workspace
          </span>
          <input
            value={ws.nome}
            onChange={(e) => setWs({ ...ws, nome: e.target.value })}
            className={inputCls}
            placeholder="Ex.: Você no Hype"
          />
          <span className="block text-[11px] text-muted-foreground">
            Aparece no menu lateral e nas telas compartilhadas com o time.
          </span>
        </label>
      </SettingsCard>

      {ws.logo && (
        <DangerZone
          title="Remover logo"
          description="O workspace volta a exibir só o ícone padrão."
          actionLabel="Remover logo"
          onAction={() => setWs({ ...ws, logo: "" })}
        />
      )}

      <SettingsSaveBar
        mode="manual"
        dirty={dirty}
        saving={saving}
        error={err}
        onDiscard={() => {
          setWs(baseline);
          setErr(null);
        }}
        onSave={() => void save()}
      />
      {saved && !dirty && <p className="text-xs text-emerald-600 dark:text-emerald-400">Salvo.</p>}
    </div>
  );
}
