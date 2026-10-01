import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getInfluNpsPublic, submitInfluNps } from "@/lib/campanha-nps-influenciador.functions";
import { NPS_RATING_OPTIONS } from "@/lib/campanha-nps";
import { WOULD_WORK_AGAIN_OPTIONS, type WouldWorkAgain } from "@/lib/campanha-nps-influenciador";
import { formatReferenceMonth } from "@/lib/campanha-nps-insights";
import {
  NpsChoiceRow,
  NpsQuestionStep,
} from "@/features/client-portal-v2/components/NpsAnswerControl";
import { fetchWorkspace } from "@/lib/workspace-store";
import { SURFACE, TYPOGRAPHY, TONE_SOFT_BG } from "@/lib/design-tokens";
import { cn } from "@/lib/utils";

type InfluNpsData = Awaited<ReturnType<typeof getInfluNpsPublic>>;
type Rating = (typeof NPS_RATING_OPTIONS)[number]["value"];

export const Route = createFileRoute("/nps-influenciador/$token")({
  component: InfluNpsPage,
  loader: async ({ params }) => {
    const [data, ws] = await Promise.all([
      getInfluNpsPublic({ data: { token: params.token } }).catch(() => null),
      fetchWorkspace().catch(() => ({ nome: "Você no Hype", logo: "" })),
    ]);
    return { data: data as InfluNpsData | null, ws };
  },
  head: () => ({
    meta: [
      { title: "Como foi sua experiência? · Você no Hype" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

const SCORE_OPTIONS = Array.from({ length: 11 }, (_, i) => ({
  value: String(i),
  label: String(i),
}));

const RATING_QUESTIONS: { key: keyof RatingAnswers; question: string }[] = [
  { key: "communicationRating", question: "Como você avalia a comunicação com a equipe?" },
  {
    key: "briefingRating",
    question: "Como você avalia a clareza do briefing e das orientações da campanha?",
  },
  {
    key: "approvalProcessRating",
    question: "Como você avalia o processo de acompanhamento, aprovação e feedback das entregas?",
  },
  {
    key: "paymentExperienceRating",
    question: "Como você avalia a experiência relacionada ao pagamento?",
  },
  {
    key: "overallExperienceRating",
    question: "Como você avalia sua experiência geral nesta campanha?",
  },
];

type RatingAnswers = {
  communicationRating: Rating | null;
  briefingRating: Rating | null;
  approvalProcessRating: Rating | null;
  paymentExperienceRating: Rating | null;
  overallExperienceRating: Rating | null;
};

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

function Shell({
  logo,
  nome,
  children,
}: {
  logo?: string;
  nome: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header logo={logo} nome={nome} />
      <main className="flex flex-1 justify-center px-4 py-8 md:px-8 md:py-10">
        <div className="w-full max-w-[680px] space-y-6 md:space-y-8">{children}</div>
      </main>
    </div>
  );
}

/** Mesma superfície de card da Home do time (`InicioDashboard.tsx`'s
 * `Card`/`SURFACE.raised`) — `rounded-2xl`, sem sombra pesada, hierarquia
 * por contraste de superfície em vez de borda+sombra. Reaproveitado aqui
 * como classe, não como import direto do componente da Home (que traria
 * o módulo inteiro do dashboard interno pro bundle público). */
function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("overflow-hidden rounded-2xl p-5 md:p-7", SURFACE.raised, className)}>
      {children}
    </div>
  );
}

function InfluNpsPage() {
  const { data, ws } = Route.useLoaderData();
  const submitFn = useServerFn(submitInfluNps);
  const { token } = Route.useParams();

  const [step, setStep] = useState(1);
  const [score, setScore] = useState<string | null>(
    data?.score !== null && data?.score !== undefined ? String(data.score) : null,
  );
  const [ratings, setRatings] = useState<RatingAnswers>({
    communicationRating: null,
    briefingRating: null,
    approvalProcessRating: null,
    paymentExperienceRating: null,
    overallExperienceRating: null,
  });
  const [improvementComment, setImprovementComment] = useState("");
  const [positiveComment, setPositiveComment] = useState("");
  const [wouldWorkAgain, setWouldWorkAgain] = useState<WouldWorkAgain | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!data) {
    return (
      <Shell nome={ws.nome} logo={ws.logo}>
        <Card>
          <p className={TYPOGRAPHY.bodySecondary}>
            Link inválido ou expirado. Verifique se o link foi copiado corretamente.
          </p>
        </Card>
      </Shell>
    );
  }

  if (done || data.alreadyAnswered) {
    return (
      <Shell nome={ws.nome} logo={ws.logo}>
        <Card>
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <span
              className={cn(
                "flex h-12 w-12 items-center justify-center rounded-full",
                TONE_SOFT_BG.success,
              )}
            >
              <Check className="h-6 w-6" />
            </span>
            {done ? (
              <>
                <p className={TYPOGRAPHY.sectionTitle}>Obrigado, {data.influenciadorNome}!</p>
                <p className={cn(TYPOGRAPHY.bodySecondary, "max-w-sm")}>
                  Sua avaliação foi registrada. A gente usa esse feedback para melhorar a
                  experiência dos creators em cada campanha. Até a próxima! ❤️
                </p>
              </>
            ) : (
              <>
                <p className={TYPOGRAPHY.sectionTitle}>Esta avaliação já foi respondida.</p>
                <p className={cn(TYPOGRAPHY.bodySecondary, "max-w-sm")}>
                  Obrigado por compartilhar sua experiência com a gente. ❤️
                </p>
              </>
            )}
          </div>
        </Card>
      </Shell>
    );
  }

  const periodo = data.campanhaPeriodo
    ? formatReferenceMonth(data.campanhaPeriodo.slice(0, 7))
    : null;
  const ratingsComplete = RATING_QUESTIONS.every((q) => ratings[q.key] !== null);

  async function handleSubmit() {
    if (score === null || !ratingsComplete) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitFn({
        data: {
          token,
          score: Number(score),
          communicationRating: ratings.communicationRating!,
          briefingRating: ratings.briefingRating!,
          approvalProcessRating: ratings.approvalProcessRating!,
          paymentExperienceRating: ratings.paymentExperienceRating!,
          overallExperienceRating: ratings.overallExperienceRating!,
          improvementComment: improvementComment.trim() || undefined,
          positiveComment: positiveComment.trim() || undefined,
          wouldWorkAgain: wouldWorkAgain ?? undefined,
        },
      });
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível registrar sua avaliação.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Shell nome={ws.nome} logo={ws.logo}>
      {/* HERO — marca + headline, mesmo peso de título usado pela Home
       * (`TYPOGRAPHY.pageTitle`), nunca o display XL de uma landing. */}
      <div className="space-y-1.5 text-center sm:text-left">
        <p className={cn(TYPOGRAPHY.label, "text-brand")}>{ws.nome || "Você no Hype"}</p>
        <p className={TYPOGRAPHY.pageTitle}>Como foi sua experiência?</p>
        <p className={TYPOGRAPHY.bodySecondary}>
          Sua opinião ajuda a gente a melhorar cada campanha e a experiência dos nossos creators.
        </p>
      </div>

      {/* IDENTIDADE — mesmo tratamento do cabeçalho de saudação da Home
       * (avatar circular + nome em destaque + linha secundária), dentro
       * da MESMA superfície de card usada no resto da página. */}
      <Card>
        <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted md:h-16 md:w-16">
            {data.influenciadorFoto ? (
              <img src={data.influenciadorFoto} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-xl font-semibold text-muted-foreground">
                {data.influenciadorNome.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <div>
            <p className="text-2xl font-semibold tracking-tight text-foreground md:text-[26px]">
              {data.influenciadorNome}
            </p>
            {data.influenciadorHandle && (
              <p className="mt-0.5 text-sm text-muted-foreground">@{data.influenciadorHandle}</p>
            )}
            {data.campanhaNome && (
              <p className="mt-0.5 text-sm text-muted-foreground">
                Campanha {data.campanhaNome}
                {periodo ? ` · ${periodo}` : ""}
              </p>
            )}
          </div>
        </div>

        {/* PARTICIPAÇÃO — resumo contextual dentro do mesmo card, nunca
         * um dashboard à parte. */}
        {data.entregas.length > 0 && (
          <div className="mt-5 border-t border-border/60 pt-5">
            <p className={TYPOGRAPHY.label}>Sua participação</p>
            <p className={cn(TYPOGRAPHY.body, "mt-1")}>
              Você participou desta campanha com {data.entregas.length}{" "}
              {data.entregas.length === 1 ? "entrega" : "entregas"}:
            </p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {data.entregas.map((e, idx) => (
                <li
                  key={idx}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-3 py-1 text-xs font-medium text-foreground"
                >
                  {e.publicada && <Check className="h-3 w-3 text-success" />}
                  {e.titulo || e.tipo}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      {/* PESQUISA — etapas progressivas, indicador discreto. */}
      <Card>
        <p className={cn(TYPOGRAPHY.label, "mb-5")}>Passo {step} de 3</p>

        {step === 1 && (
          <div className="space-y-6">
            <NpsQuestionStep question="De 0 a 10, qual a chance de você recomendar trabalhar com a Você no Hype para outro influenciador?">
              <NpsChoiceRow
                options={SCORE_OPTIONS}
                value={score}
                onChange={setScore}
                ariaLabel="Nota de 0 a 10"
                legend={["Nada provável", "Extremamente provável"]}
              />
            </NpsQuestionStep>
            <Button onClick={() => setStep(2)} disabled={score === null} className="w-full">
              Continuar
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <p className={TYPOGRAPHY.cardTitle}>Durante a campanha</p>
            {RATING_QUESTIONS.map((q) => (
              <NpsQuestionStep key={q.key} question={q.question}>
                <NpsChoiceRow
                  options={NPS_RATING_OPTIONS as unknown as { value: string; label: string }[]}
                  value={ratings[q.key]}
                  onChange={(v) => setRatings((r) => ({ ...r, [q.key]: v as Rating }))}
                  ariaLabel={q.question}
                />
              </NpsQuestionStep>
            ))}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
                Voltar
              </Button>
              <Button onClick={() => setStep(3)} disabled={!ratingsComplete} className="flex-1">
                Continuar
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <p className={TYPOGRAPHY.cardTitle}>Queremos ouvir você</p>

            <div className="space-y-1.5">
              <label htmlFor="improvement" className="text-sm font-medium text-foreground">
                O que poderíamos melhorar?
              </label>
              <Textarea
                id="improvement"
                value={improvementComment}
                onChange={(e) => setImprovementComment(e.target.value)}
                placeholder="Conte o que poderia tornar sua próxima experiência ainda melhor."
                rows={3}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="positive" className="text-sm font-medium text-foreground">
                O que você mais gostou na experiência?
              </label>
              <Textarea
                id="positive"
                value={positiveComment}
                onChange={(e) => setPositiveComment(e.target.value)}
                placeholder="Queremos saber o que funcionou bem para você."
                rows={3}
              />
            </div>

            <div className="space-y-1.5">
              <p className="text-sm font-medium text-foreground">
                Você gostaria de trabalhar novamente com a {ws.nome || "Você no Hype"}?
              </p>
              <div className="grid grid-cols-3 gap-2">
                {WOULD_WORK_AGAIN_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setWouldWorkAgain(o.value)}
                    className={`h-10 rounded-md border text-sm font-medium transition-colors ${
                      wouldWorkAgain === o.value
                        ? "border-brand bg-brand-subtle text-brand"
                        : "border-border bg-background text-foreground hover:bg-muted"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            {error && <p className="text-sm text-danger">{error}</p>}

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(2)} className="flex-1">
                Voltar
              </Button>
              <Button onClick={handleSubmit} disabled={submitting} className="flex-1">
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Enviar avaliação
              </Button>
            </div>
          </div>
        )}
      </Card>
    </Shell>
  );
}
