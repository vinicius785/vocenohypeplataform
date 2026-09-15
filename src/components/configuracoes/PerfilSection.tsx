import { useRef, useState } from "react";
import { User, Mic, Camera, Trash2 } from "lucide-react";
import { DateField } from "@/components/ui/date-field";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { saveMe } from "@/lib/chat-store";
import { SettingsCard, SettingsSectionHeader, SettingsSaveBar } from "./settings-shared";

export type Perfil = {
  nome: string;
  email: string;
  telefone: string;
  aniversario: string;
  foto?: string;
};

export const PERFIL_KEY = "config:perfil";
export const loadPerfil = (): Perfil => {
  try {
    const raw = localStorage.getItem(PERFIL_KEY);
    return raw ? JSON.parse(raw) : { nome: "", email: "", telefone: "", aniversario: "", foto: "" };
  } catch {
    return { nome: "", email: "", telefone: "", aniversario: "", foto: "" };
  }
};

type AVPrefs = { audioIn?: string; audioOut?: string; videoIn?: string };
const AV_KEY = "config:av";
const loadAV = (): AVPrefs => {
  try {
    const raw = localStorage.getItem(AV_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const inputCls =
  "h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring";

/** Máscara simples de telefone BR (DDD + 8/9 dígitos) — não existia
 * nenhum util de máscara reutilizável no projeto para isso, então esta
 * função fica local ao formulário de Perfil (único consumidor). */
function maskPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function PerfilSection({
  perfil,
  setPerfil,
}: {
  perfil: Perfil;
  setPerfil: (p: Perfil) => void;
}) {
  const [p, setP] = useState<Perfil>(perfil);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dirty = JSON.stringify(p) !== JSON.stringify(perfil) || !!photoFile;

  const discard = () => {
    setP(perfil);
    setPhotoFile(null);
    setError("");
  };

  const save = async () => {
    setError("");
    setSaving(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) throw authError ?? new Error("Sessão inválida.");
      let photoUrl = p.foto || null;
      if (photoFile) {
        const ext = photoFile.name.split(".").pop() ?? "jpg";
        const path = `${authData.user.id}/avatar.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(path, photoFile, { upsert: true, contentType: photoFile.type });
        if (uploadError) throw uploadError;
        const { data: signed, error: signedError } = await supabase.storage
          .from("avatars")
          .createSignedUrl(path, 60 * 60 * 24 * 365);
        if (signedError) throw signedError;
        photoUrl = signed.signedUrl;
      }
      const next = { ...p, foto: photoUrl ?? "", email: authData.user.email ?? p.email };
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          full_name: next.nome.trim(),
          phone: next.telefone.trim(),
          birthday: next.aniversario || null,
          photo_url: photoUrl,
        })
        .eq("id", authData.user.id);
      if (profileError) throw profileError;
      localStorage.setItem(PERFIL_KEY, JSON.stringify(next));
      saveMe({
        id: authData.user.id,
        name: next.nome.trim(),
        photo: next.foto || undefined,
        email: next.email,
      });
      window.dispatchEvent(new StorageEvent("storage", { key: PERFIL_KEY }));
      window.dispatchEvent(new Event("time:membros:changed"));
      setP(next);
      setPerfil(next);
      setPhotoFile(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar o perfil.");
    } finally {
      setSaving(false);
    }
  };

  const onPickFile = (file?: File | null) => {
    setError("");
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Selecione um arquivo de imagem.");
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setError("A imagem deve ter até 3MB.");
      return;
    }
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = () => setP((prev) => ({ ...prev, foto: String(reader.result || "") }));
    reader.readAsDataURL(file);
  };

  const initials =
    (p.nome || "")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase())
      .join("") || "?";

  return (
    <div className="space-y-6">
      <SettingsSectionHeader
        icon={<User className="h-4 w-4" />}
        title="Perfil"
        description="Nome, foto e contato exibidos pro resto do time."
      />

      <SettingsCard>
        <div className="flex items-center gap-4">
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full border border-border bg-muted">
            {p.foto ? (
              <img src={p.foto} alt="Foto de perfil" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-lg font-semibold text-muted-foreground">
                {initials}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => onPickFile(e.target.files?.[0])}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
              >
                <Camera className="h-3.5 w-3.5" />
                {p.foto ? "Trocar foto" : "Anexar foto"}
              </Button>
              {p.foto && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setP({ ...p, foto: "" })}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Remover foto
                </Button>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">PNG ou JPG, até 3MB.</p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4">
          <label className="space-y-1">
            <span className="text-xs font-medium">Nome completo</span>
            <input
              value={p.nome}
              onChange={(e) => setP({ ...p, nome: e.target.value })}
              className={inputCls}
              required
            />
          </label>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs font-medium">E-mail</span>
              <input
                type="email"
                value={p.email}
                onChange={(e) => setP({ ...p, email: e.target.value })}
                className={inputCls}
                required
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium">Telefone</span>
              <input
                value={p.telefone}
                onChange={(e) => setP({ ...p, telefone: maskPhone(e.target.value) })}
                className={inputCls}
                placeholder="(00) 00000-0000"
                inputMode="numeric"
              />
            </label>
          </div>
          <label className="max-w-xs space-y-1">
            <span className="text-xs font-medium">Data de aniversário</span>
            <DateField
              value={p.aniversario || undefined}
              onChange={(v) => setP({ ...p, aniversario: v ?? "" })}
              className={inputCls}
            />
          </label>
        </div>
        {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
      </SettingsCard>

      <SettingsSectionHeader
        icon={<Mic className="h-4 w-4" />}
        title="Áudio e vídeo"
        description="Microfone, câmera e saída de áudio usados nas chamadas da plataforma."
      />
      <AVCard />

      <SettingsSaveBar
        mode="manual"
        dirty={dirty}
        saving={saving}
        error={error || null}
        onDiscard={discard}
        onSave={() => void save()}
      />
      {saved && !dirty && (
        <p className="text-xs text-emerald-600 dark:text-emerald-400">Perfil salvo.</p>
      )}
    </div>
  );
}

/** Lista dispositivos só quando o próprio usuário clica em "Atualizar
 * lista de dispositivos" — pedir `getUserMedia` automaticamente ao abrir
 * a página dispararia o prompt de permissão do navegador sem ação
 * explícita, o que o pedido de redesenho proíbe. */
function AVCard() {
  const [prefs, setPrefs] = useState<AVPrefs>(() => loadAV());
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [error, setError] = useState<string>("");
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) {
        setError("Este navegador não suporta seleção de dispositivos.");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        stream.getTracks().forEach((t) => t.stop());
      } catch {
        /* permission optional; labels may be empty */
      }
      const list = await navigator.mediaDevices.enumerateDevices();
      setDevices(list);
      setError("");
      setLoaded(true);
    } catch {
      setError("Não foi possível listar os dispositivos.");
    }
  };

  const audioIn = devices.filter((d) => d.kind === "audioinput");
  const audioOut = devices.filter((d) => d.kind === "audiooutput");
  const videoIn = devices.filter((d) => d.kind === "videoinput");

  const update = (patch: Partial<AVPrefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    localStorage.setItem(AV_KEY, JSON.stringify(next));
  };

  const Select = ({
    label,
    value,
    onChange,
    options,
    fallback,
  }: {
    label: string;
    value?: string;
    onChange: (v: string) => void;
    options: MediaDeviceInfo[];
    fallback: string;
  }) => (
    <label className="space-y-1">
      <span className="text-xs font-medium">{label}</span>
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value)} className={inputCls}>
        <option value="">Padrão do sistema</option>
        {options.map((d, i) => (
          <option key={d.deviceId || i} value={d.deviceId}>
            {d.label || `${fallback} ${i + 1}`}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <SettingsCard
      footer={
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
            Atualizar lista de dispositivos
          </Button>
          <p className="text-[11px] text-muted-foreground">
            Permita acesso ao microfone e à câmera para ver os nomes completos dos dispositivos.
          </p>
        </div>
      }
    >
      {error && <p className="text-xs text-destructive">{error}</p>}
      {!loaded && !error && (
        <p className="text-xs text-muted-foreground">
          Clique em "Atualizar lista de dispositivos" para escolher microfone, câmera e saída de
          áudio.
        </p>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Select
          label="Microfone (entrada de áudio)"
          value={prefs.audioIn}
          onChange={(v) => update({ audioIn: v })}
          options={audioIn}
          fallback="Microfone"
        />
        <Select
          label="Alto-falante (saída de áudio)"
          value={prefs.audioOut}
          onChange={(v) => update({ audioOut: v })}
          options={audioOut}
          fallback="Saída"
        />
        <Select
          label="Câmera (entrada de vídeo)"
          value={prefs.videoIn}
          onChange={(v) => update({ videoIn: v })}
          options={videoIn}
          fallback="Câmera"
        />
      </div>
    </SettingsCard>
  );
}
