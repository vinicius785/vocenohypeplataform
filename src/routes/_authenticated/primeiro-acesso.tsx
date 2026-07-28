import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/primeiro-acesso")({
  component: PrimeiroAcessoPage,
  head: () => ({
    meta: [
      { title: "Primeiro acesso · Plataforma VNH" },
      { name: "description", content: "Configure sua conta no primeiro acesso." },
    ],
  }),
});

function PrimeiroAcessoPage() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [birthday, setBirthday] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      setUserId(data.user.id);
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, birthday, phone, photo_url")
        .eq("id", data.user.id)
        .maybeSingle();
      if (profile) {
        setFullName(profile.full_name ?? "");
        setBirthday(profile.birthday ?? "");
        setPhone(profile.phone ?? "");
        setPhotoPreview(profile.photo_url ?? null);
      }
    });
  }, []);

  const onPhoto = (file: File | null) => {
    setPhotoFile(file);
    if (file) {
      const reader = new FileReader();
      reader.onload = () => setPhotoPreview(String(reader.result));
      reader.readAsDataURL(file);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError("A senha precisa ter pelo menos 8 caracteres.");
    if (password !== confirmPassword) return setError("As senhas não conferem.");
    if (!fullName.trim()) return setError("Informe seu nome completo.");
    if (!birthday) return setError("Informe sua data de aniversário.");
    if (!phone.trim()) return setError("Informe seu telefone.");
    if (!userId) return;

    setLoading(true);
    try {
      let photoUrl: string | null = photoPreview;
      if (photoFile) {
        const ext = photoFile.name.split(".").pop() ?? "jpg";
        const path = `${userId}/avatar.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("avatars")
          .upload(path, photoFile, { upsert: true, contentType: photoFile.type });
        if (upErr) throw upErr;
        const { data: signed } = await supabase.storage
          .from("avatars")
          .createSignedUrl(path, 60 * 60 * 24 * 365);
        photoUrl = signed?.signedUrl ?? null;
      }

      const { error: passErr } = await supabase.auth.updateUser({ password });
      if (passErr) throw passErr;

      const { error: profErr } = await supabase
        .from("profiles")
        .update({
          full_name: fullName.trim(),
          birthday,
          phone: phone.trim(),
          photo_url: photoUrl,
          must_change_password: false,
        })
        .eq("id", userId);
      if (profErr) throw profErr;

      const { data: authData } = await supabase.auth.getUser();
      const perfil = {
        nome: fullName.trim(),
        email: authData.user?.email ?? "",
        telefone: phone.trim(),
        aniversario: birthday,
        foto: photoUrl ?? "",
      };
      localStorage.setItem("config:perfil", JSON.stringify(perfil));
      window.dispatchEvent(new StorageEvent("storage", { key: "config:perfil" }));

      navigate({ to: "/time" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao concluir cadastro.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Bem-vindo(a)!</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Complete seu perfil e defina uma senha definitiva para continuar.
        </p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 overflow-hidden rounded-full bg-muted">
              {photoPreview ? (
                <img src={photoPreview} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                  Foto
                </div>
              )}
            </div>
            <label className="cursor-pointer rounded-md border border-input px-3 py-1.5 text-xs hover:bg-muted">
              Escolher foto
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => onPhoto(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>

          <Field label="Nome completo">
            <input
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className={inputCls}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Data de aniversário">
              <input
                required
                type="date"
                value={birthday}
                onChange={(e) => setBirthday(e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Telefone">
              <input
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(11) 99999-0000"
                className={inputCls}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nova senha">
              <input
                required
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Confirmar senha">
              <input
                required
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={inputCls}
              />
            </Field>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="h-10 w-full rounded-md bg-foreground text-sm font-medium text-background hover:opacity-90 disabled:opacity-60"
          >
            {loading ? "Salvando..." : "Concluir cadastro"}
          </button>
        </form>
      </div>
    </div>
  );
}

const inputCls =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
