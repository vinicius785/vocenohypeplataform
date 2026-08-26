import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Check, Loader2, Paperclip, Plus, X } from "lucide-react";
import {
  getInscricaoCampanhaData,
  submitInscricaoCampanha,
} from "@/lib/inscricao-campanha.functions";
import { NICHOS, REDES_OPTS } from "@/components/influenciadores/InfluencerBoard";
import { fetchWorkspace } from "@/lib/workspace-store";
import type { CustomQuestion } from "@/lib/inscricao-page";

type InscricaoData = Awaited<ReturnType<typeof getInscricaoCampanhaData>>;

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
      { title: `Inscrição · ${loaderData?.data?.page.publicTitle || "Campanha"}` },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

type RedeForm = { plataforma: string; handle: string; seguidores: string };
type RespostaValue = string | string[];

function Header({ logo, nome }: { logo?: string; nome: string }) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2.5 border-b border-border bg-background px-5">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md bg-foreground text-background">
        {logo ? (
          <img src={logo} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="text-[11px] font-bold">{nome.charAt(0).toUpperCase()}</span>
        )}
      </div>
      <span className="text-sm font-semibold text-foreground">{nome}</span>
    </header>
  );
}

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
  const [respostas, setRespostas] = useState<Record<string, RespostaValue>>({});
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

  const { campanha, clienteNome, page } = data;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim() || !telefone.trim() || !email.trim()) return;
    for (const q of page.customQuestions) {
      if (q.required && !respostas[q.id]) return;
    }
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
          respostas: page.customQuestions
            .filter((q) => respostas[q.id] !== undefined && respostas[q.id] !== "")
            .map((q) => ({ questionId: q.id, label: q.label, value: respostas[q.id] })),
        },
      });
      setDone(true);
    } catch {
      setError("Não foi possível enviar sua inscrição. Tente novamente em instantes.");
    } finally {
      setSubmitting(false);
    }
  };

  if (page.status === "RASCUNHO") {
    return (
      <div className="min-h-screen bg-background">
        <Header logo={ws.logo} nome={ws.nome} />
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-2 px-5 py-24 text-center">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Esta página ainda não está disponível.
          </h1>
          <p className="text-sm text-muted-foreground">
            A inscrição pra <strong>{page.publicTitle}</strong> ainda não foi publicada.
          </p>
        </div>
      </div>
    );
  }

  const encerrada = page.status === "ENCERRADA";

  return (
    <div className="min-h-screen bg-background">
      <Header logo={ws.logo} nome={ws.nome} />

      <div className="mx-auto w-full max-w-2xl px-5 py-10">
        {done ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-foreground text-background">
              <Check className="h-6 w-6" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Inscrição enviada!
            </h1>
            <p className="max-w-sm text-sm text-muted-foreground whitespace-pre-wrap">
              {page.thankYouMessage}
            </p>
          </div>
        ) : (
          <>
            {page.bannerUrl && (
              <div className="mx-auto mb-6 w-full max-w-[280px] overflow-hidden rounded-2xl border border-border">
                <img src={page.bannerUrl} alt="" className="aspect-[9/16] w-full object-cover" />
              </div>
            )}

            {page.showClientName && (
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                {clienteNome}
              </p>
            )}
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">
              {page.publicTitle}
            </h1>
            {page.publicSubtitle && (
              <p className="mt-2 text-base text-muted-foreground">{page.publicSubtitle}</p>
            )}

            {page.description && (
              <section className="mt-6 rounded-2xl border border-border bg-card p-5">
                <p className="whitespace-pre-wrap text-sm text-foreground">{page.description}</p>
              </section>
            )}

            {(page.sobre.objetivo ||
              page.sobre.regioes ||
              page.sobre.periodo ||
              page.sobre.tipoConteudo ||
              page.sobre.requisitos ||
              page.sobre.publicoDesejado ||
              page.sobre.infoImportante) && (
              <section className="mt-6 space-y-3 rounded-2xl border border-border bg-card p-5">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Sobre a campanha
                </h2>
                <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                  <SobreRow label="Objetivo" value={page.sobre.objetivo} />
                  <SobreRow label="Regiões" value={page.sobre.regioes} />
                  <SobreRow label="Período" value={page.sobre.periodo} />
                  <SobreRow label="Formato" value={page.sobre.tipoConteudo} />
                  <SobreRow label="Requisitos" value={page.sobre.requisitos} />
                  <SobreRow label="Público desejado" value={page.sobre.publicoDesejado} />
                </dl>
                {page.sobre.infoImportante && (
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                    {page.sobre.infoImportante}
                  </p>
                )}
              </section>
            )}

            {(page.showDos && page.dos.length > 0) || (page.showDonts && page.donts.length > 0) ? (
              <section className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {page.showDos && page.dos.length > 0 && (
                  <div className="rounded-2xl border border-border bg-card p-5">
                    <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      O que fazer
                    </h2>
                    <ul className="mt-3 space-y-2">
                      {page.dos.map((d, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground" />
                          {d}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {page.showDonts && page.donts.length > 0 && (
                  <div className="rounded-2xl border border-border bg-card p-5">
                    <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      O que evitar
                    </h2>
                    <ul className="mt-3 space-y-2">
                      {page.donts.map((d, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                          <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          {d}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            ) : null}

            {encerrada ? (
              <section className="mt-6 rounded-2xl border border-border bg-card p-8 text-center">
                <p className="text-sm font-medium text-foreground">
                  As inscrições para esta campanha estão encerradas.
                </p>
              </section>
            ) : (
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
                  {page.fields.nicho.visible && (
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">
                        Nicho{page.fields.nicho.required ? " *" : ""}
                      </label>
                      <select
                        value={nicho}
                        onChange={(e) => setNicho(e.target.value)}
                        required={page.fields.nicho.required}
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
                  )}
                </div>

                {page.fields.redes.visible && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">
                      Redes sociais{page.fields.redes.required ? " *" : ""}
                    </label>
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
                              onChange={(e) =>
                                updateRede(r.plataforma, { seguidores: e.target.value })
                              }
                              className="h-8 w-28 rounded-md border border-border bg-background px-2.5 text-xs outline-none focus:ring-2 focus:ring-ring"
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {page.customQuestions.map((q) => (
                  <CustomQuestionField
                    key={q.id}
                    question={q}
                    value={respostas[q.id]}
                    onChange={(v) => setRespostas((prev) => ({ ...prev, [q.id]: v }))}
                  />
                ))}

                {page.fields.mensagem.visible && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">
                      Mensagem{page.fields.mensagem.required ? " *" : " (opcional)"}
                    </label>
                    <textarea
                      value={mensagem}
                      onChange={(e) => setMensagem(e.target.value)}
                      required={page.fields.mensagem.required}
                      rows={3}
                      placeholder="Conte um pouco sobre você, disponibilidade, proposta de valor..."
                      className="mt-1 w-full resize-none rounded-md border border-border bg-background px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                )}

                {page.fields.midiaKit.visible && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">
                      Mídia kit{page.fields.midiaKit.required ? " *" : " (opcional)"}
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
                            required={page.fields.midiaKit.required}
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
                )}

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
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SobreRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-foreground">{value}</dd>
    </div>
  );
}

function CustomQuestionField({
  question,
  value,
  onChange,
}: {
  question: CustomQuestion;
  value: RespostaValue | undefined;
  onChange: (v: RespostaValue) => void;
}) {
  const inputCls =
    "mt-1 h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring";
  const label = `${question.label}${question.required ? " *" : ""}`;

  if (question.type === "texto_longo") {
    return (
      <div>
        <label className="text-xs font-medium text-muted-foreground">{label}</label>
        <textarea
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          required={question.required}
          rows={3}
          className={`${inputCls} h-auto resize-none py-2`}
        />
      </div>
    );
  }
  if (question.type === "numero") {
    return (
      <div>
        <label className="text-xs font-medium text-muted-foreground">{label}</label>
        <input
          type="number"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          required={question.required}
          className={inputCls}
        />
      </div>
    );
  }
  if (question.type === "data") {
    return (
      <div>
        <label className="text-xs font-medium text-muted-foreground">{label}</label>
        <input
          type="date"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          required={question.required}
          className={inputCls}
        />
      </div>
    );
  }
  if (question.type === "sim_nao") {
    return (
      <div>
        <label className="text-xs font-medium text-muted-foreground">{label}</label>
        <div className="mt-1.5 flex gap-2">
          {["Sim", "Não"].map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                value === opt
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>
    );
  }
  if (question.type === "selecao_unica") {
    return (
      <div>
        <label className="text-xs font-medium text-muted-foreground">{label}</label>
        <select
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          required={question.required}
          className={inputCls}
        >
          <option value="">Selecione</option>
          {(question.options ?? []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>
    );
  }
  if (question.type === "selecao_multipla") {
    const selected = Array.isArray(value) ? value : [];
    return (
      <div>
        <label className="text-xs font-medium text-muted-foreground">{label}</label>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {(question.options ?? []).map((opt) => {
            const active = selected.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() =>
                  onChange(active ? selected.filter((o) => o !== opt) : [...selected, opt])
                }
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                  active
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {active ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                {opt}
              </button>
            );
          })}
        </div>
      </div>
    );
  }
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <input
        value={(value as string) ?? ""}
        onChange={(e) => onChange(e.target.value)}
        required={question.required}
        className={inputCls}
      />
    </div>
  );
}
