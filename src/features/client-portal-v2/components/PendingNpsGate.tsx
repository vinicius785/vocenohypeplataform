import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Send } from "lucide-react";
import { getPendingNpsSession, submitNpsSession } from "@/lib/portal-auth.functions";

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
  const { data, isLoading, isError } = useQuery({
    queryKey: ["portal-v2-nps-pending"],
    queryFn: () => getPendingFn(),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  // Falha de rede ao consultar a pendência não deve travar o portal
  // inteiro pra sempre — a proteção real (servidor recusa qualquer
  // mutação enquanto houver NPS pendente) continua de pé independente
  // disso; aqui é só a experiência de "mostrar o formulário logo".
  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (isError || !data || data.pendentes.length === 0) {
    return <>{children}</>;
  }

  return <NpsForm pendentes={data.pendentes} />;
}

function NpsForm({ pendentes }: { pendentes: { campanhaId: string; nome: string }[] }) {
  const submitFn = useServerFn(submitNpsSession);
  const queryClient = useQueryClient();
  const [scores, setScores] = useState<Record<string, number | null>>(() =>
    Object.fromEntries(pendentes.map((p) => [p.campanhaId, null])),
  );
  const [comments, setComments] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const allAnswered = pendentes.every((p) => scores[p.campanhaId] !== null);

  const submit = async () => {
    if (!allAnswered || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      await submitFn({
        data: {
          respostas: pendentes.map((p) => ({
            campanhaId: p.campanhaId,
            score: scores[p.campanhaId]!,
            comment: comments[p.campanhaId]?.trim() || undefined,
          })),
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["portal-v2-nps-pending"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível enviar sua avaliação.");
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-background p-4 py-8 sm:p-6">
      <div className="w-full max-w-lg space-y-6 rounded-2xl border border-border bg-card p-5 shadow-lg sm:p-6">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold text-foreground">
            Queremos saber como está sendo sua experiência
          </h1>
          <p className="text-sm text-text-secondary">
            Antes de continuar, responda a avaliação mensal{" "}
            {pendentes.length > 1 ? "das campanhas abaixo" : "da campanha abaixo"}.
          </p>
        </div>

        <div className="space-y-5">
          {pendentes.map((p) => (
            <div key={p.campanhaId} className="space-y-2 rounded-xl border border-border/60 p-3.5">
              <p className="text-sm font-medium text-foreground">{p.nome}</p>
              <p className="text-xs text-text-secondary">
                De 0 a 10, qual a probabilidade de você recomendar nosso trabalho?
              </p>
              <div className="flex flex-wrap gap-1.5">
                {SCORES.map((n) => (
                  <button
                    key={n}
                    type="button"
                    disabled={submitting}
                    onClick={() => setScores((s) => ({ ...s, [p.campanhaId]: n }))}
                    aria-pressed={scores[p.campanhaId] === n}
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border text-xs font-medium transition-colors disabled:opacity-50 ${
                      scores[p.campanhaId] === n
                        ? "border-brand bg-brand text-brand-foreground"
                        : "border-border text-foreground hover:bg-muted"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <textarea
                value={comments[p.campanhaId] ?? ""}
                onChange={(e) => setComments((c) => ({ ...c, [p.campanhaId]: e.target.value }))}
                disabled={submitting}
                placeholder="Comentário (opcional)"
                rows={2}
                className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
              />
            </div>
          ))}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <button
          type="button"
          onClick={() => void submit()}
          disabled={!allAnswered || submitting}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-brand px-4 py-2.5 text-sm font-medium text-brand-foreground hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {submitting ? "Enviando…" : "Enviar avaliações"}
        </button>
      </div>
    </div>
  );
}
