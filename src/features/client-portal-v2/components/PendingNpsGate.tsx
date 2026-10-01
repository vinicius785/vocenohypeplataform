import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ChevronLeft, ChevronRight, Loader2, RefreshCw, Send } from "lucide-react";
import { PortalV2ShellBackdrop } from "../layouts/PortalV2Shell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SURFACE, TYPOGRAPHY } from "@/lib/design-tokens";
import { getPendingNpsSession, submitNpsSession } from "@/lib/portal-auth.functions";
import {
  NPS_RATING_OPTIONS,
  NPS_SATISFACTION_LABELS,
  npsCommentPrompt,
  type NpsRating,
} from "@/lib/campanha-nps";

const SCORES = Array.from({ length: 11 }, (_, i) => i);

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

  // Mesmo padrão de "opção selecionável" do Portal do Time → Início (o
  // `Tab` de "Meu trabalho" em InicioDashboard.tsx): selecionado com fundo
  // de marca sutil (`bg-brand-subtle text-brand`), hover em `bg-muted`.
  const optionClass = (selected: boolean) =>
    `min-w-0 rounded-md border text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 ${
      selected
        ? "border-brand bg-brand-subtle text-brand"
        : "border-border bg-background text-foreground hover:bg-muted"
    }`;

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

            <div className="mt-6 min-h-[8.5rem] space-y-4">
              {step === 0 && (
                <>
                  <p className={TYPOGRAPHY.cardTitle}>
                    De 0 a 10, qual a probabilidade de você recomendar nosso trabalho?
                  </p>
                  <div className="space-y-2">
                    {/* 11 colunas de largura igual (minmax(0,1fr)): nunca quebra linha,
                        e o "10" tem exatamente o mesmo tamanho dos demais. */}
                    <div className="grid grid-cols-11 gap-1 sm:gap-1.5">
                      {SCORES.map((n) => (
                        <button
                          key={n}
                          type="button"
                          disabled={submitting}
                          onClick={() => patch({ score: n })}
                          aria-pressed={draft.score === n}
                          className={`flex h-10 w-full items-center justify-center px-0 tabular-nums ${optionClass(draft.score === n)}`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                    <div className={`flex justify-between gap-4 ${TYPOGRAPHY.caption}`}>
                      <span>Nada provável</span>
                      <span className="text-right">Extremamente provável</span>
                    </div>
                  </div>
                </>
              )}

              {step === 1 && (
                <>
                  <p className={TYPOGRAPHY.cardTitle}>
                    Qual seu nível de satisfação geral com esta campanha?
                  </p>
                  <div className="grid grid-cols-5 gap-1 sm:gap-1.5">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        disabled={submitting}
                        onClick={() => patch({ satisfactionScore: n })}
                        aria-pressed={draft.satisfactionScore === n}
                        className={`flex flex-col items-center gap-1 px-1 py-2.5 ${optionClass(draft.satisfactionScore === n)}`}
                      >
                        <span className="text-base font-semibold tabular-nums">{n}</span>
                        <span className="text-center text-[11px] font-normal leading-tight">
                          {NPS_SATISFACTION_LABELS[n]}
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {(step === 2 || step === 3) && (
                <>
                  <p className={TYPOGRAPHY.cardTitle}>
                    {step === 2
                      ? "Como você avalia a qualidade das entregas e conteúdos produzidos pelos creators?"
                      : "Como você avalia o acompanhamento e a comunicação da nossa equipe durante a campanha?"}
                  </p>
                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5">
                    {NPS_RATING_OPTIONS.map((o) => {
                      const selected =
                        (step === 2 ? draft.deliveryQuality : draft.communicationRating) ===
                        o.value;
                      return (
                        <button
                          key={o.value}
                          type="button"
                          disabled={submitting}
                          onClick={() =>
                            patch(
                              step === 2
                                ? { deliveryQuality: o.value }
                                : { communicationRating: o.value },
                            )
                          }
                          aria-pressed={selected}
                          className={`min-h-10 px-2 py-2 leading-tight ${optionClass(selected)}`}
                        >
                          {o.label}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {step === 3 && draft.score !== null && (
                <div className="space-y-2 pt-2">
                  <label htmlFor="nps-comment" className={`block ${TYPOGRAPHY.cardTitle}`}>
                    {npsCommentPrompt(draft.score)}{" "}
                    <span className="font-normal text-text-secondary">(opcional)</span>
                  </label>
                  <Textarea
                    id="nps-comment"
                    value={draft.comment}
                    onChange={(e) => patch({ comment: e.target.value })}
                    disabled={submitting}
                    maxLength={2000}
                    rows={3}
                  />
                </div>
              )}
            </div>

            {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

            <div className="mt-6 flex items-center gap-2">
              {(step > 0 || campIdx > 0) && (
                <Button
                  type="button"
                  variant="outline"
                  size="comfortable"
                  onClick={back}
                  disabled={submitting}
                  className="px-4"
                >
                  <ChevronLeft />
                  Voltar
                </Button>
              )}
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
