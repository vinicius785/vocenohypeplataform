import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Calendar, Check, ExternalLink, Loader2, Paperclip, Plus, Wallet, X } from "lucide-react";
import {
  getInscricaoCampanhaData,
  submitInscricaoCampanha,
} from "@/lib/inscricao-campanha.functions";
import { NICHOS, REDES_OPTS } from "@/components/influenciadores/InfluencerBoard";
import { fetchWorkspace } from "@/lib/workspace-store";

type InscricaoData = Awaited<ReturnType<typeof getInscricaoCampanhaData>>;

function fmtDate(iso: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y) return iso;
  return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString("pt-BR");
}

export const Route = createFileRoute("/inscricao/$token")({
  component: InscricaoPage,
  loader: async ({ params }) => {
    const [data, ws] = await Promise.all([
      getInscricaoCampanhaData({ data: { token: params.token } }).catch(() => null),
      fetchWorkspace().catch(() => ({ nome: "Você no Hype", logo: "" })),
    ]);
    return { data: data as InscricaoData | null, ws };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `Inscrição · ${loaderData?.data?.campanha.nome || "Campanha"}` },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

type RedeForm = { plataforma: string; handle: string; seguidores: string };

function InscricaoPage() {
  const { token } = Route.useParams();
  const { data, ws } = Route.useLoaderData();
  const submitFn = useServerFn(submitInscricaoCampanha);

  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [nicho, setNicho] = useState("");
  const [redes, setRedes] = useState<RedeForm[]>([]);
  const [mensagem, setMensagem] = useState("");
  const [anexo, setAnexo] = useState<{ nome: string; dataUrl: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleRede = (plataforma: string) => {
    setRedes((prev) =>
      prev.some((r) => r.plataforma === plataforma)
        ? prev.filter((r) => r.plataforma !== plataforma)
        : [...prev, { plataforma, handle: "", seguidores: "" }],
    );
  };
  const updateRede = (plataforma: string, patch: Partial<RedeForm>) =>
    setRedes((prev) => prev.map((r) => (r.plataforma === plataforma ? { ...r, ...patch } : r)));

  const uploadAnexo = async (file: File) => {
    setUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(r.error);
        r.readAsDataURL(file);
      });
      setAnexo({ nome: file.name, dataUrl });
    } finally {
      setUploading(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim() || !telefone.trim() || !email.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitFn({
        data: {
          token,
          nome,
          telefone,
          email,
          nicho: nicho || undefined,
          redes: redes.filter((r) => r.handle.trim()),
          mensagem: mensagem || undefined,
          anexo,
        },
      });
      setDone(true);
    } catch {
      setError("Não foi possível enviar sua inscrição. Tente novamente em instantes.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-background px-6 text-center">
        <p className="text-sm font-medium text-foreground">Link não encontrado.</p>
        <p className="text-xs text-muted-foreground">
          Verifique se o link de inscrição está correto ou peça um novo link pra campanha.
        </p>
      </div>
    );
  }

  const { campanha, clienteNome } = data;

  return (
    <div className="min-h-screen bg-background">
      <header className="flex h-14 shrink-0 items-center gap-2.5 border-b border-border bg-background px-5">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md bg-foreground text-background">
          {ws.logo ? (
            <img src={ws.logo} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-[11px] font-bold">{ws.nome.charAt(0).toUpperCase()}</span>
          )}
        </div>
        <span className="text-sm font-semibold text-foreground">{ws.nome}</span>
      </header>

      <div className="mx-auto w-full max-w-2xl px-5 py-10">
        {done ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-foreground text-background">
              <Check className="h-6 w-6" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Inscrição enviada!
            </h1>
            <p className="max-w-sm text-sm text-muted-foreground">
              Recebemos seus dados pra campanha <strong>{campanha.nome}</strong>. Nosso time vai
              analisar e entrar em contato caso avance.
            </p>
          </div>
        ) : (
          <>
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              {clienteNome}
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">
              {campanha.nome}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Preencha o formulário abaixo pra se inscrever como influenciador nesta campanha.
            </p>

            <section className="mt-6 space-y-3 rounded-2xl border border-border bg-card p-5">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Sobre a campanha
              </h2>
              {campanha.briefing && (
                <p className="whitespace-pre-wrap text-sm text-foreground">{campanha.briefing}</p>
              )}
              {campanha.briefingLinks.length > 0 && (
                <ul className="space-y-1">
                  {campanha.briefingLinks.map((url) => (
                    <li key={url}>
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-foreground hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" /> {url}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap gap-4 pt-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" /> Prazo {fmtDate(campanha.prazo)}
                </span>
                {campanha.prazoPag && (
                  <span className="inline-flex items-center gap-1.5">
                    <Wallet className="h-3.5 w-3.5" /> Pagamento {campanha.prazoPag}
                  </span>
                )}
              </div>
            </section>

            <form
              onSubmit={submit}
              className="mt-6 space-y-5 rounded-2xl border border-border bg-card p-5"
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Nome *</label>
                  <input
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    required
                    className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Telefone *</label>
                  <input
                    value={telefone}
                    onChange={(e) => setTelefone(e.target.value)}
                    required
                    className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">E-mail *</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Nicho</label>
                  <select
                    value={nicho}
                    onChange={(e) => setNicho(e.target.value)}
                    className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">Selecione</option>
                    {NICHOS.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Redes sociais</label>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {REDES_OPTS.map((p) => {
                    const active = redes.some((r) => r.plataforma === p);
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => toggleRede(p)}
                        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                          active
                            ? "border-foreground bg-foreground text-background"
                            : "border-border text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {active ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                        {p}
                      </button>
                    );
                  })}
                </div>
                {redes.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {redes.map((r) => (
                      <div key={r.plataforma} className="flex items-center gap-2">
                        <span className="w-20 shrink-0 text-xs text-muted-foreground">
                          {r.plataforma}
                        </span>
                        <input
                          placeholder="@usuario ou link"
                          value={r.handle}
                          onChange={(e) => updateRede(r.plataforma, { handle: e.target.value })}
                          className="h-8 flex-1 rounded-md border border-border bg-background px-2.5 text-xs outline-none focus:ring-2 focus:ring-ring"
                        />
                        <input
                          placeholder="Seguidores"
                          value={r.seguidores}
                          onChange={(e) => updateRede(r.plataforma, { seguidores: e.target.value })}
                          className="h-8 w-28 rounded-md border border-border bg-background px-2.5 text-xs outline-none focus:ring-2 focus:ring-ring"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Mensagem (opcional)
                </label>
                <textarea
                  value={mensagem}
                  onChange={(e) => setMensagem(e.target.value)}
                  rows={3}
                  placeholder="Conte um pouco sobre você, disponibilidade, proposta de valor..."
                  className="mt-1 w-full resize-none rounded-md border border-border bg-background px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Mídia kit (opcional)
                </label>
                <div className="mt-1.5">
                  {anexo ? (
                    <div className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground">
                      <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                      {anexo.nome}
                      <button
                        type="button"
                        onClick={() => setAnexo(null)}
                        aria-label="Remover anexo"
                        className="rounded p-0.5 hover:bg-muted"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-dashed border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:border-foreground hover:text-foreground">
                      {uploading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Paperclip className="h-3.5 w-3.5" />
                      )}
                      {uploading ? "Enviando..." : "Anexar arquivo"}
                      <input
                        type="file"
                        className="hidden"
                        disabled={uploading}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void uploadAnexo(file);
                        }}
                      />
                    </label>
                  )}
                </div>
              </div>

              {error && <p className="text-xs text-destructive">{error}</p>}

              <button
                type="submit"
                disabled={submitting || uploading}
                className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-full bg-foreground text-sm font-medium text-background hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {submitting ? "Enviando..." : "Enviar inscrição"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
