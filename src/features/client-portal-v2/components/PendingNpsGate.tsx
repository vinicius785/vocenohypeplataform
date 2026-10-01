import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ChevronLeft, ChevronRight, Loader2, RefreshCw, Send } from "lucide-react";
import { PortalV2ShellBackdrop } from "../layouts/PortalV2Shell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { NpsChoiceRow, NpsQuestionStep } from "./NpsAnswerControl";
import { SURFACE, TYPOGRAPHY } from "@/lib/design-tokens";
import { getPendingNpsSession, submitNpsSession } from "@/lib/portal-auth.functions";
import {
  NPS_RATING_OPTIONS,
  NPS_SATISFACTION_LABELS,
  npsCommentPrompt,
  type NpsRating,
} from "@/lib/campanha-nps";

// 0-10 em 11 colunas (numa linha só) e 1-5 em 5 — mesmo NpsChoiceRow.
const SCORE_OPTIONS = Array.from({ length: 11 }, (_, i) => ({
  value: String(i),
  label: String(i),
}));
const SATISFACTION_OPTIONS = [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }));

/**
 * NPS mensal obrigatório — gate único que envolve TODO o Portal do Cliente
 * (montado em `PortalV2Shell`, acima de `<Outlet/>`, então cobre qualquer
 * rota/URL direta, não só a navegação pelo menu). Enquanto existir
 * campanha elegível sem resposta no mês corrente
 * (`getPendingNpsSession`), renderiza o formulário bloqueante NO LUGAR do
 * conteúdo do portal — nunca um modal fechável por cima, nunca um botão
 * "Agora não". A mesma pendência também é checada no servidor
 * (`assertCanMutate` em `portal-auth.functions.ts`) antes de qualquer
 * mutação, então mesmo alguém que force a navegação por URL não consegue
 * agir no portal enquanto isso aqui não deixar passar.
 *
 * Uma campanha nova elegível criada no meio do mês reaparece aqui sozinha
 * (`refetchInterval` + refetch ao focar a aba) — sem depender de um job
 * rodando à meia-noite do dia 1º: a pendência é sempre recalculada na
 * hora, a partir do estado atual das campanhas + do que já foi respondido
 * (`campanhasComNpsPendente`, `campanha-nps.ts`).
 */
export function PendingNpsGate({ children }: { children: ReactNode }) {
  const getPendingFn = useServerFn(getPendingNpsSession);
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["portal-v2-nps-pending"],
    queryFn: () => getPendingFn(),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  // Fail-closed: o bloqueio principal é o guard de rota + o loader
  // (`portal-v2/route.tsx`, `getPortalDataForSession`). Este componente
  // cobre pendência que surge NO MEIO da sessão (campanha nova, virada de
  // mês com a aba aberta). Se a checagem falhar sem nenhum resultado bom
  // anterior, NÃO libera o portal — mostra erro + "Tentar novamente".
  // (Falha num refetch periódico mantém o último resultado bom.)
  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (isError && !data) {
    return (
      <NpsGateError
        message={error instanceof Error ? error.message : undefined}
        retrying={isFetching}
        onRetry={() => void refetch()}
      />
    );
  }
  if (!data || data.pendentes.length === 0) {
    return <>{children}</>;
  }

  return <NpsForm pendentes={data.pendentes} />;
}

export function NpsGateError({
  message,
  onRetry,
  retrying = false,
}: {
  message?: string;
  onRetry: () => void;
  retrying?: boolean;
}) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <div
        className={`w-full max-w-md space-y-4 rounded-2xl p-6 text-center shadow-lg ${SURFACE.raised}`}
      >
        <AlertTriangle className="mx-auto h-8 w-8 text-destructive" />
        <div className="space-y-1">
          <h1 className="text-base font-semibold text-foreground">
            Não foi possível carregar o portal
          </h1>
          <p className="text-sm text-text-secondary">
            Não conseguimos verificar suas avaliações pendentes. Verifique sua conexão e tente
            novamente.
          </p>
          {message && <p className="text-xs text-muted-foreground">{message}</p>}
        </div>
        <Button type="button" variant="primary" onClick={onRetry} disabled={retrying}>
          <RefreshCw className={retrying ? "animate-spin" : ""} />
          Tentar novamente
        </Button>
      </div>
    </div>
  );
}

type Draft = {
  score: number | null;
  satisfactionScore: number | null;
  deliveryQuality: NpsRating | null;
  communicationRating: NpsRating | null;
  comment: string;
};

const EMPTY_DRAFT: Draft = {
  score: null,
  satisfactionScore: null,
  deliveryQuality: null,
  communicationRating: null,
  comment: "",
};

const TOTAL_QUESTIONS = 4;

function isStepAnswered(d: Draft, step: number) {
  if (step === 0) return d.score !== null;
  if (step === 1) return d.satisfactionScore !== null;
  if (step === 2) return d.deliveryQuality !== null;
  return d.communicationRating !== null;
}

/**
 * Formulário progressivo: para cada campanha pendente, 4 perguntas
 * obrigatórias uma de cada vez (o comentário opcional fica na 4ª etapa,
 * com rótulo que varia conforme a nota de NPS). Tudo é acumulado em
 * memória e enviado de uma vez só no fim, pelo mesmo `submitNpsSession`.
 */
export function NpsForm({
  pendentes,
  onSubmitted,
}: {
  pendentes: { campanhaId: string; nome: string }[];
  onSubmitted?: () => Promise<unknown> | void;
}) {
  const submitFn = useServerFn(submitNpsSession);
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(pendentes.map((p) => [p.campanhaId, { ...EMPTY_DRAFT }])),
  );
  const [campIdx, setCampIdx] = useState(0);
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const current = pendentes[Math.min(campIdx, pendentes.length - 1)];
  const draft = drafts[current.campanhaId] ?? EMPTY_DRAFT;
  const isLastCampaign = campIdx >= pendentes.length - 1;
  const isLastStep = step === TOTAL_QUESTIONS - 1;
  const answered = isStepAnswered(draft, step);

  const patch = (p: Partial<Draft>) =>
    setDrafts((all) => ({ ...all, [current.campanhaId]: { ...draft, ...p } }));

  const submit = async () => {
    if (submitting) return;
    const complete = pendentes.every((p) =>
      [0, 1, 2, 3].every((s) => isStepAnswered(drafts[p.campanhaId] ?? EMPTY_DRAFT, s)),
    );
    if (!complete) return;
    setSubmitting(true);
    setError("");
    try {
      await submitFn({
        data: {
          respostas: pendentes.map((p) => {
            const d = drafts[p.campanhaId];
            return {
              campanhaId: p.campanhaId,
              score: d.score!,
              satisfactionScore: d.satisfactionScore!,
              deliveryQuality: d.deliveryQuality!,
              communicationRating: d.communicationRating!,
              comment: d.comment.trim() || undefined,
            };
          }),
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["portal-v2-nps-pending"] });
      await onSubmitted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível enviar sua avaliação.");
      setSubmitting(false);
    }
  };

  const next = () => {
    if (!answered || submitting) return;
    if (!isLastStep) return setStep(step + 1);
    if (!isLastCampaign) {
      setCampIdx(campIdx + 1);
      setStep(0);
      return;
    }
    void submit();
  };

  const back = () => {
    if (submitting) return;
    if (step > 0) return setStep(step - 1);
    if (campIdx > 0) {
      setCampIdx(campIdx - 1);
      setStep(TOTAL_QUESTIONS - 1);
    }
  };

  return (
    <div className="fixed inset-0 z-[100]">
      {/* Casca real do Portal ao fundo (sem dados — ver PortalV2ShellBackdrop). */}
      <PortalV2ShellBackdrop />
      {/* Overlay leve: o Portal continua reconhecível atrás. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-black/30 backdrop-blur-[3px] duration-300 animate-in fade-in-0 dark:bg-black/50"
      />
      <div className="absolute inset-0 overflow-y-auto">
        <div className="flex min-h-full items-end justify-center pt-8 sm:items-center sm:p-6">
          {/* Superfície = Card do Início (rounded-2xl + SURFACE.raised) + elevação de overlay. */}
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="nps-dialog-title"
            className={`w-full max-w-[560px] rounded-t-2xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] shadow-lg duration-300 animate-in fade-in-0 slide-in-from-bottom-4 sm:rounded-2xl sm:p-6 sm:zoom-in-95 sm:slide-in-from-bottom-0 ${SURFACE.raised}`}
          >
            <div className="space-y-2">
              <p className={TYPOGRAPHY.label}>
                Avaliação mensal
                {pendentes.length > 1 && ` · Campanha ${campIdx + 1} de ${pendentes.length}`}
              </p>
              <p id="nps-dialog-title" className={TYPOGRAPHY.sectionTitle}>
                {current.nome}
              </p>
              <p className={TYPOGRAPHY.bodySecondary}>
                Antes de continuar, conte como está sendo sua experiência com esta campanha.
              </p>
            </div>

            <div className="mt-6 space-y-2">
              <p className={TYPOGRAPHY.caption}>
                Pergunta {step + 1} de {TOTAL_QUESTIONS}
              </p>
              <div
                className="flex gap-1"
                role="progressbar"
                aria-valuemin={1}
                aria-valuemax={TOTAL_QUESTIONS}
                aria-valuenow={step + 1}
              >
                {Array.from({ length: TOTAL_QUESTIONS }, (_, i) => (
                  <div
                    key={i}
                    className={`h-1 flex-1 rounded-full ${i <= step ? "bg-brand" : "bg-muted"}`}
                  />
                ))}
              </div>
            </div>

            {/* QUESTION_AREA: altura mínima fixa (dimensionada pela etapa mais alta,
                a 4ª com comentário) — o modal não "pula" entre perguntas. Só o
                conteúdo aqui dentro troca, com transição sutil. */}
            <div className="mt-6 min-h-[17rem] sm:min-h-[15.5rem]">
              <div
                key={`${campIdx}-${step}`}
                className="duration-200 animate-in fade-in-0 slide-in-from-right-2"
              >
                {step === 0 && (
                  <NpsQuestionStep question="De 0 a 10, qual a probabilidade de você recomendar nosso trabalho?">
                    <NpsChoiceRow
                      ariaLabel="Nota de 0 a 10"
                      options={SCORE_OPTIONS}
                      value={draft.score === null ? null : String(draft.score)}
                      onChange={(v) => patch({ score: Number(v) })}
                      disabled={submitting}
                      legend={["Nada provável", "Extremamente provável"]}
                    />
                  </NpsQuestionStep>
                )}
                {step === 1 && (
                  <NpsQuestionStep question="Qual seu nível de satisfação geral com esta campanha?">
                    <NpsChoiceRow
                      ariaLabel="Satisfação de 1 a 5"
                      options={SATISFACTION_OPTIONS}
                      value={
                        draft.satisfactionScore === null ? null : String(draft.satisfactionScore)
                      }
                      onChange={(v) => patch({ satisfactionScore: Number(v) })}
                      disabled={submitting}
                      legend={[NPS_SATISFACTION_LABELS[1], NPS_SATISFACTION_LABELS[5]]}
                    />
                  </NpsQuestionStep>
                )}
                {step === 2 && (
                  <NpsQuestionStep question="Como você avalia a qualidade das entregas e conteúdos produzidos pelos creators?">
                    <NpsChoiceRow
                      ariaLabel="Qualidade das entregas"
                      options={NPS_RATING_OPTIONS}
                      value={draft.deliveryQuality}
                      onChange={(v) => patch({ deliveryQuality: v as NpsRating })}
                      disabled={submitting}
                    />
                  </NpsQuestionStep>
                )}
                {step === 3 && (
                  <NpsQuestionStep
                    question="Como você avalia o acompanhamento e a comunicação da nossa equipe durante a campanha?"
                    secondary={
                      draft.score !== null && (
                        <div className="space-y-1.5">
                          <label htmlFor="nps-comment" className={`block ${TYPOGRAPHY.caption}`}>
                            {npsCommentPrompt(draft.score)} (opcional)
                          </label>
                          <Textarea
                            id="nps-comment"
                            value={draft.comment}
                            onChange={(e) => patch({ comment: e.target.value })}
                            disabled={submitting}
                            maxLength={2000}
                            rows={2}
                            className="h-16 min-h-0 resize-none"
                          />
                        </div>
                      )
                    }
                  >
                    <NpsChoiceRow
                      ariaLabel="Acompanhamento e comunicação"
                      options={NPS_RATING_OPTIONS}
                      value={draft.communicationRating}
                      onChange={(v) => patch({ communicationRating: v as NpsRating })}
                      disabled={submitting}
                    />
                  </NpsQuestionStep>
                )}
              </div>
            </div>

            {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

            <div className="mt-6 flex items-center gap-2">
              {/* Sempre renderizado (invisível na 1ª etapa) para o botão principal
                  manter exatamente a mesma largura/posição em todas as etapas. */}
              <Button
                type="button"
                variant="outline"
                size="comfortable"
                onClick={back}
                disabled={submitting || !(step > 0 || campIdx > 0)}
                aria-hidden={!(step > 0 || campIdx > 0)}
                tabIndex={step > 0 || campIdx > 0 ? undefined : -1}
                className={`px-4 ${step > 0 || campIdx > 0 ? "" : "invisible"}`}
              >
                <ChevronLeft />
                Voltar
              </Button>
              <Button
                type="button"
                variant="primary"
                size="comfortable"
                onClick={next}
                disabled={!answered}
                isLoading={submitting}
                className="flex-1"
              >
                {isLastStep && isLastCampaign ? (
                  <>
                    {!submitting && <Send />}
                    {submitting ? "Enviando…" : "Enviar avaliação"}
                  </>
                ) : isLastStep ? (
                  <>
                    Próxima campanha
                    <ChevronRight />
                  </>
                ) : (
                  <>
                    Próxima
                    <ChevronRight />
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
