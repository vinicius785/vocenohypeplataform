import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import {
  getInscricaoCampanhaData,
  submitInscricaoCampanha,
} from "@/lib/inscricao-campanha.functions";
import { NICHOS } from "@/lib/influencer-model";
import { normalizeSocialInput, isDuplicateProfile } from "@/lib/social-profiles";
import { fetchWorkspace } from "@/lib/workspace-store";
import {
  inscricaoSteps,
  validateAnexoFile,
  validateInscricao,
  type InscricaoRules,
} from "@/lib/inscricao-validation";
import { NativeSelect } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { PublicFooter, PublicHeader } from "@/components/inscricao/PublicChrome";
import {
  CustomQuestionField,
  Field,
  FormStep,
  SocialPicker,
  UploadField,
  type RedeForm,
  type RespostaValue,
} from "@/components/inscricao/InscricaoParts";
import { inputClass } from "@/components/inscricao/input-class";

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
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
    ],
  }),
});

function Fact({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-widest text-text-secondary">{label}</dt>
      <dd className="mt-1.5 text-base font-medium leading-snug text-foreground">{value}</dd>
    </div>
  );
}

function BriefRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-widest text-text-secondary">{label}</dt>
      <dd className="mt-2 whitespace-pre-wrap text-base leading-relaxed text-foreground">
        {value}
      </dd>
    </div>
  );
}

function ReviewBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-border/60 pt-5 first:border-t-0 first:pt-0">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">{title}</h3>
      <div className="mt-2 space-y-1 text-sm text-foreground">{children}</div>
    </div>
  );
}

function InscricaoPage() {
  const { token } = Route.useParams();
  const { data, ws } = Route.useLoaderData();
  const submitFn = useServerFn(submitInscricaoCampanha);
  // Gerada uma vez por carregamento do formulário — enviada em toda tentativa de submit (inclusive
  // um retry de rede pro MESMO clique), pra o servidor detectar resubmissão exata via a constraint
  // única de `inscricao_campanha_idempotency`. Não regenerar a cada tentativa.
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [nicho, setNicho] = useState("");
  const [redes, setRedes] = useState<RedeForm[]>([]);
  const [redesDupError, setRedesDupError] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState("");
  const [anexo, setAnexo] = useState<{ nome: string; dataUrl: string } | null>(null);
  const [anexoError, setAnexoError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [respostas, setRespostas] = useState<Record<string, RespostaValue>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [attempted, setAttempted] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);

  const rules: InscricaoRules | null = data
    ? {
        fields: data.page.fields,
        customQuestions: data.page.customQuestions,
      }
    : null;
  const values = {
    nome,
    telefone,
    email,
    nicho,
    redesComHandle: redes.filter((r) => r.handle.trim()).length,
    mensagem,
    temAnexo: !!anexo,
    respostas,
  };
  const errors = useMemo(
    () => (rules ? validateInscricao(values, rules) : {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nome, telefone, email, nicho, redes, mensagem, anexo, respostas, data],
  );
  const steps = rules ? inscricaoSteps(values, rules) : [];
  const stepOf = (id: string) => steps.findIndex((s) => s.id === id) + 1;
  const doneOf = (id: string) => steps.find((s) => s.id === id)?.done ?? false;
  const shown = (key: string) => (attempted || touched[key] ? errors[key] : undefined);
  const touch = (key: string) => setTouched((t) => ({ ...t, [key]: true }));

  const addRede = (plataforma: string) =>
    setRedes((prev) => [
      ...prev,
      { id: crypto.randomUUID(), plataforma, handle: "", seguidores: "" },
    ]);
  const updateRede = (id: string, patch: Partial<RedeForm>) => {
    setRedesDupError(null);
    setRedes((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };
  const commitRede = (r: RedeForm) => {
    const { handle, profileUrl } = normalizeSocialInput(r.plataforma, r.handle);
    if (isDuplicateProfile(redes, r.plataforma, handle, r.id)) {
      setRedesDupError(r.id);
      return;
    }
    setRedes((prev) => prev.map((x) => (x.id === r.id ? { ...x, handle, profileUrl } : x)));
  };
  const removeRede = (id: string) => setRedes((prev) => prev.filter((r) => r.id !== id));
  const setPrimaryRede = (plataforma: string, id: string) =>
    setRedes((prev) =>
      prev.map((r) => (r.plataforma === plataforma ? { ...r, isPrimary: r.id === id } : r)),
    );

  const uploadAnexo = async (file: File) => {
    setAnexoError(null);
    const problem = validateAnexoFile(file);
    if (problem) {
      setAnexoError(problem);
      return;
    }
    setUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(r.error);
        r.readAsDataURL(file);
      });
      setAnexo({ nome: file.name, dataUrl });
    } catch {
      setAnexoError("Não foi possível ler este arquivo. Tente outro arquivo.");
    } finally {
      setUploading(false);
    }
  };

  if (!data || !rules) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <PublicHeader logo={ws.logo} nome={ws.nome} />
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-2 px-6 py-24 text-center">
          <h1 className="text-lg font-semibold text-foreground">Link não encontrado.</h1>
          <p className="text-sm text-text-secondary">
            Verifique se o link de inscrição está correto ou peça um novo link para a campanha.
          </p>
        </main>
        <PublicFooter logo={ws.logo} nome={ws.nome} />
      </div>
    );
  }

  const { clienteNome, page } = data;

  const goFirstError = () => {
    const first = Object.keys(errors)[0];
    if (!first) return;
    const el = document.getElementById(`field-${first}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => (el as HTMLElement | null)?.focus({ preventScroll: true }), 250);
  };

  const review = () => {
    setAttempted(true);
    if (Object.keys(errors).length > 0) {
      goFirstError();
      return;
    }
    setReviewing(true);
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const submit = async () => {
    setAttempted(true);
    if (Object.keys(errors).length > 0) {
      setReviewing(false);
      goFirstError();
      return;
    }
    const validRedes = redes.filter((r) => r.handle.trim());
    setSubmitting(true);
    setError(null);
    try {
      await submitFn({
        data: {
          token,
          idempotencyKey,
          nome,
          telefone,
          email,
          nicho: nicho || undefined,
          redes: validRedes.map((r) => ({
            plataforma: r.plataforma,
            handle: r.handle.trim(),
            profileUrl: r.profileUrl,
            isPrimary: r.isPrimary,
            seguidores: r.seguidores || undefined,
          })),
          mensagem: mensagem || undefined,
          anexo,
          respostas: page.customQuestions
            .filter((q) => respostas[q.id] !== undefined && respostas[q.id] !== "")
            .map((q) => ({
              questionId: q.id,
              label: q.label,
              value: respostas[q.id],
              fieldType: q.type,
            })),
        },
      });
      setDone(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      const isSizeError = /too large|exceeds|maximum|payload|8000000|8_000_000/i.test(message);
      setError(
        isSizeError
          ? "Não foi possível enviar sua inscrição: o mídia kit é maior do que o permitido (5 MB). Anexe um arquivo menor."
          : "Não foi possível enviar sua inscrição. Tente novamente em instantes.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (page.status === "RASCUNHO") {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <PublicHeader logo={ws.logo} nome={ws.nome} />
        <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center gap-2 px-5 py-24 text-center">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Esta página ainda não está disponível.
          </h1>
          <p className="text-sm text-text-secondary">
            A inscrição para <strong>{page.publicTitle}</strong> ainda não foi publicada.
          </p>
        </main>
        <PublicFooter logo={ws.logo} nome={ws.nome} />
      </div>
    );
  }

  const encerrada = page.status === "ENCERRADA";
  const showBar = !done && !encerrada;
  const missing = steps.filter((s) => !s.done);
  const pct = steps.length ? Math.round(((steps.length - missing.length) / steps.length) * 100) : 0;
  const sobre = page.sobre;
  const hasBrief =
    sobre.objetivo || sobre.requisitos || sobre.publicoDesejado || sobre.infoImportante;
  const hasFacts = sobre.periodo || sobre.regioes || sobre.tipoConteudo;
  const hasDos = page.showDos && page.dos.length > 0;
  const hasDonts = page.showDonts && page.donts.length > 0;
  const validRedes = redes.filter((r) => r.handle.trim());

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <PublicHeader logo={ws.logo} nome={ws.nome} contexto={page.publicTitle} />

      <main
        className={`mx-auto w-full max-w-5xl flex-1 px-6 py-10 sm:py-16 lg:px-8 ${showBar ? "pb-28" : ""}`}
      >
        {done ? (
          <section
            role="status"
            className="surface-card mx-auto flex max-w-xl flex-col items-center gap-3 px-6 py-14 text-center"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-foreground text-background">
              <Check className="h-6 w-6" aria-hidden="true" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Inscrição enviada
            </h1>
            <p className="text-sm text-text-secondary">
              Recebemos sua inscrição para{" "}
              <strong className="text-foreground">{page.publicTitle}</strong>.
            </p>
            {page.thankYouMessage && (
              <p className="max-w-sm whitespace-pre-wrap text-sm text-text-secondary">
                {page.thankYouMessage}
              </p>
            )}
            <p className="text-xs text-text-secondary">Você já pode fechar esta página.</p>
          </section>
        ) : (
          <>
            {/* HERO — o título é o elemento principal; fatos escaneáveis só com tipografia. */}
            <section aria-labelledby="titulo-campanha">
              {page.bannerUrl && (
                <div className="mb-10 overflow-hidden rounded-2xl">
                  <img
                    src={page.bannerUrl}
                    alt=""
                    className="aspect-[21/9] w-full object-cover"
                    fetchPriority="high"
                  />
                </div>
              )}
              {page.showClientName && (
                <p className="text-xs font-medium uppercase tracking-widest text-text-secondary">
                  {clienteNome}
                </p>
              )}
              <h1
                id="titulo-campanha"
                className="mt-2 max-w-3xl text-4xl font-semibold leading-[1.08] tracking-tight text-foreground sm:text-5xl"
              >
                {page.publicTitle}
              </h1>
              {page.publicSubtitle && (
                <p className="mt-4 max-w-2xl text-lg leading-snug text-text-secondary sm:text-xl">
                  {page.publicSubtitle}
                </p>
              )}
              {hasFacts && (
                <dl className="mt-10 grid grid-cols-1 gap-x-12 gap-y-6 sm:grid-cols-[0.7fr_1.5fr_1fr]">
                  <Fact label="Período" value={sobre.periodo} />
                  <Fact label="Regiões" value={sobre.regioes} />
                  <Fact label="Formato" value={sobre.tipoConteudo} />
                </dl>
              )}
              {page.description && (
                <p className="mt-10 max-w-3xl whitespace-pre-wrap text-base leading-relaxed text-foreground/85 sm:text-lg">
                  {page.description}
                </p>
              )}
            </section>

            {/* BRIEFING */}
            {hasBrief && (
              <section aria-labelledby="sobre" className="mt-20">
                <h2
                  id="sobre"
                  className="text-xs font-semibold uppercase tracking-widest text-text-secondary"
                >
                  Sobre a campanha
                </h2>
                <dl className="mt-6 grid grid-cols-1 gap-x-16 gap-y-8 sm:grid-cols-2">
                  <BriefRow label="Objetivo" value={sobre.objetivo} />
                  <BriefRow label="Público desejado" value={sobre.publicoDesejado} />
                  <BriefRow label="Requisitos" value={sobre.requisitos} />
                </dl>
                {sobre.infoImportante && (
                  <p className="mt-8 max-w-3xl whitespace-pre-wrap text-sm leading-relaxed text-text-secondary">
                    {sobre.infoImportante}
                  </p>
                )}
              </section>
            )}

            {(hasDos || hasDonts) && (
              <section className="mt-16 grid grid-cols-1 gap-10 sm:grid-cols-2">
                {hasDos && (
                  <div>
                    <h2 className="text-xs font-semibold uppercase tracking-widest text-text-secondary">
                      O que fazer
                    </h2>
                    <ul className="mt-3 space-y-2">
                      {page.dos.map((d, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                          <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                          {d}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {hasDonts && (
                  <div>
                    <h2 className="text-xs font-semibold uppercase tracking-widest text-text-secondary">
                      O que evitar
                    </h2>
                    <ul className="mt-3 space-y-2">
                      {page.donts.map((d, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                          <span
                            aria-hidden="true"
                            className="w-4 shrink-0 text-center text-text-secondary"
                          >
                            ×
                          </span>
                          {d}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            )}

            {/* SUA INSCRIÇÃO */}
            <div ref={topRef} className="scroll-mt-6" />
            <section id="inscricao" aria-labelledby="sua-inscricao" className="mt-24">
              <h2
                id="sua-inscricao"
                className="text-3xl font-semibold tracking-tight text-foreground"
              >
                Sua inscrição
              </h2>
              <p className="mt-2 max-w-xl text-base text-text-secondary">
                Conte um pouco sobre você e sua disponibilidade para esta campanha.
              </p>

              {encerrada ? (
                <p className="surface-card mt-10 p-8 text-center text-sm font-medium text-foreground">
                  As inscrições para esta campanha estão encerradas.
                </p>
              ) : reviewing ? (
                <div className="surface-card mt-10 space-y-5 p-6 sm:p-8">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">Revise sua inscrição</h3>
                    <p className="mt-0.5 text-sm text-text-secondary">
                      Confira os dados abaixo. Depois do envio, não será possível editar.
                    </p>
                  </div>
                  <ReviewBlock title="Seus dados">
                    <p className="font-medium">{nome}</p>
                    <p>{telefone}</p>
                    <p>{email}</p>
                    {nicho && <p className="text-text-secondary">Nicho: {nicho}</p>}
                  </ReviewBlock>
                  {page.fields.redes.visible && (
                    <ReviewBlock title="Redes sociais">
                      {validRedes.length === 0 ? (
                        <p className="text-text-secondary">Nenhuma rede informada.</p>
                      ) : (
                        validRedes.map((r) => (
                          <p key={r.id}>
                            <span className="font-medium">{r.plataforma}</span> · {r.handle}
                            {r.seguidores ? ` · ${r.seguidores} seguidores` : ""}
                          </p>
                        ))
                      )}
                    </ReviewBlock>
                  )}
                  {(page.customQuestions.length > 0 || page.fields.mensagem.visible) && (
                    <ReviewBlock title="Proposta">
                      {page.customQuestions.map((q) => {
                        const v = respostas[q.id];
                        const text = Array.isArray(v) ? v.join(", ") : v;
                        return text ? (
                          <p key={q.id}>
                            <span className="text-text-secondary">{q.label}:</span> {text}
                          </p>
                        ) : null;
                      })}
                      {mensagem ? (
                        <p className="whitespace-pre-wrap">{mensagem}</p>
                      ) : (
                        !page.customQuestions.length && (
                          <p className="text-text-secondary">Sem mensagem.</p>
                        )
                      )}
                    </ReviewBlock>
                  )}
                  {page.fields.midiaKit.visible && (
                    <ReviewBlock title="Materiais">
                      <p>
                        {anexo ? (
                          anexo.nome
                        ) : (
                          <span className="text-text-secondary">Sem mídia kit.</span>
                        )}
                      </p>
                    </ReviewBlock>
                  )}
                  {error && (
                    <p role="alert" className="text-sm text-destructive">
                      {error}
                    </p>
                  )}
                </div>
              ) : (
                <form
                  noValidate
                  onSubmit={(e) => {
                    e.preventDefault();
                    review();
                  }}
                  className="mt-12 space-y-16"
                  aria-label="Formulário de inscrição"
                >
                  <FormStep
                    n={stepOf("dados")}
                    title="Seus dados"
                    description="Como a equipe pode falar com você."
                    done={doneOf("dados")}
                  >
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field id="field-nome" label="Nome completo" required error={shown("nome")}>
                        {(a) => (
                          <Input
                            {...a}
                            value={nome}
                            onChange={(e) => setNome(e.target.value)}
                            onBlur={() => touch("nome")}
                            autoComplete="name"
                            placeholder="Como você se chama"
                            className={inputClass(!!shown("nome"))}
                          />
                        )}
                      </Field>
                      <Field
                        id="field-telefone"
                        label="Telefone / WhatsApp"
                        required
                        error={shown("telefone")}
                      >
                        {(a) => (
                          <Input
                            {...a}
                            type="tel"
                            inputMode="tel"
                            value={telefone}
                            onChange={(e) => setTelefone(e.target.value)}
                            onBlur={() => touch("telefone")}
                            autoComplete="tel"
                            placeholder="(21) 99999-9999"
                            className={inputClass(!!shown("telefone"))}
                          />
                        )}
                      </Field>
                      <Field id="field-email" label="E-mail" required error={shown("email")}>
                        {(a) => (
                          <Input
                            {...a}
                            type="email"
                            inputMode="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            onBlur={() => touch("email")}
                            autoComplete="email"
                            placeholder="voce@email.com"
                            className={inputClass(!!shown("email"))}
                          />
                        )}
                      </Field>
                      {page.fields.nicho.visible && (
                        <Field
                          id="field-nicho"
                          label="Nicho"
                          required={page.fields.nicho.required}
                          optional={!page.fields.nicho.required}
                          error={shown("nicho")}
                        >
                          {(a) => (
                            <NativeSelect
                              {...a}
                              value={nicho}
                              onChange={(e) => setNicho(e.target.value)}
                              onBlur={() => touch("nicho")}
                              selectClassName={inputClass(!!shown("nicho"))}
                            >
                              <option value="">Selecione</option>
                              {NICHOS.map((n) => (
                                <option key={n} value={n}>
                                  {n}
                                </option>
                              ))}
                            </NativeSelect>
                          )}
                        </Field>
                      )}
                    </div>
                  </FormStep>

                  {page.fields.redes.visible && (
                    <FormStep
                      n={stepOf("redes")}
                      title={`Redes sociais${page.fields.redes.required ? "" : " (opcional)"}`}
                      description="Escolha onde você publica e informe seu usuário ou link."
                      done={doneOf("redes") && validRedes.length > 0}
                    >
                      <SocialPicker
                        redes={redes}
                        error={shown("redes")}
                        dupError={redesDupError}
                        onAdd={addRede}
                        onUpdate={updateRede}
                        onCommit={commitRede}
                        onRemove={removeRede}
                        onPrimary={setPrimaryRede}
                      />
                    </FormStep>
                  )}

                  {(page.customQuestions.length > 0 || page.fields.mensagem.visible) && (
                    <FormStep
                      n={stepOf("proposta")}
                      title="Sua proposta"
                      description="Conte à equipe sua disponibilidade e o que você pode entregar nesta campanha."
                      done={doneOf("proposta")}
                    >
                      {page.customQuestions.map((q) => (
                        <CustomQuestionField
                          key={q.id}
                          question={q}
                          value={respostas[q.id]}
                          error={shown(`q:${q.id}`)}
                          onChange={(v) => setRespostas((prev) => ({ ...prev, [q.id]: v }))}
                        />
                      ))}
                      {page.fields.mensagem.visible && (
                        <Field
                          id="field-mensagem"
                          label="Mensagem para a equipe"
                          required={page.fields.mensagem.required}
                          optional={!page.fields.mensagem.required}
                          hint="Explique rapidamente sua disponibilidade e o que você pode entregar."
                          error={shown("mensagem")}
                        >
                          {(a) => (
                            <Textarea
                              {...a}
                              rows={4}
                              value={mensagem}
                              onChange={(e) => setMensagem(e.target.value)}
                              onBlur={() => touch("mensagem")}
                              className={inputClass(!!shown("mensagem"))}
                            />
                          )}
                        </Field>
                      )}
                    </FormStep>
                  )}

                  {page.fields.midiaKit.visible && (
                    <FormStep
                      n={stepOf("materiais")}
                      title="Materiais"
                      description="Seu mídia kit ajuda a equipe a conhecer melhor o seu trabalho."
                      done={doneOf("materiais") && !!anexo}
                    >
                      <UploadField
                        anexo={anexo}
                        uploading={uploading}
                        required={page.fields.midiaKit.required}
                        error={anexoError ?? shown("anexo")}
                        onFile={(f) => void uploadAnexo(f)}
                        onRemove={() => {
                          setAnexo(null);
                          setAnexoError(null);
                        }}
                      />
                    </FormStep>
                  )}
                  <button type="submit" className="sr-only">
                    Revisar inscrição
                  </button>
                </form>
              )}
            </section>
          </>
        )}
      </main>

      {showBar && (
        <div
          role="region"
          aria-label="Andamento da inscrição"
          className="fixed inset-x-0 bottom-0 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          {/* Progresso como um fio sobre a borda superior — sem ocupar altura. */}
          <div
            role="progressbar"
            aria-label="Progresso da inscrição"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={reviewing ? 100 : pct}
            className="h-px w-full bg-border"
          >
            <div
              className="h-0.5 -translate-y-px bg-brand transition-[width] duration-300"
              style={{ width: `${reviewing ? 100 : pct}%` }}
            />
          </div>
          <div className="mx-auto flex w-full max-w-5xl items-center gap-4 px-6 py-2.5 lg:px-8">
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-sm font-medium text-foreground">
                {reviewing
                  ? "Revise e envie"
                  : missing.length === 0
                    ? "Tudo pronto para revisar"
                    : `${steps.length - missing.length} de ${steps.length} etapas`}
              </p>
              <p className="truncate text-xs text-text-secondary">
                {reviewing
                  ? "Depois do envio não é possível editar."
                  : missing.length === 0
                    ? "Confira e envie sua inscrição."
                    : `${missing.length === 1 ? "Falta" : "Faltam"}: ${missing.map((s) => s.label).join(", ")}`}
              </p>
            </div>
            {reviewing ? (
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  variant="ghost"
                  size="comfortable"
                  onClick={() => setReviewing(false)}
                  disabled={submitting}
                >
                  Editar
                </Button>
                <Button
                  variant="primary"
                  size="comfortable"
                  onClick={() => void submit()}
                  disabled={submitting || uploading}
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {submitting ? "Enviando..." : "Enviar inscrição"}
                </Button>
              </div>
            ) : (
              <Button
                variant="primary"
                size="comfortable"
                className="shrink-0"
                onClick={review}
                disabled={uploading}
              >
                Revisar inscrição
              </Button>
            )}
          </div>
        </div>
      )}

      <PublicFooter logo={ws.logo} nome={ws.nome} className={showBar ? "pb-16" : ""} />
    </div>
  );
}
