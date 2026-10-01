import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getInfluNpsPublic, submitInfluNps } from "@/lib/campanha-nps-influenciador.functions";
import { npsCommentPrompt } from "@/lib/campanha-nps";
import {
  NpsChoiceRow,
  NpsQuestionStep,
} from "@/features/client-portal-v2/components/NpsAnswerControl";
import { fetchWorkspace } from "@/lib/workspace-store";

type InfluNpsData = Awaited<ReturnType<typeof getInfluNpsPublic>>;

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
      { title: "Avaliação da sua experiência · Você no Hype" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

const SCORE_OPTIONS = Array.from({ length: 11 }, (_, i) => ({
  value: String(i),
  label: String(i),
}));

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
    <div className="flex min-h-screen flex-col bg-muted/30">
      <Header logo={logo} nome={nome} />
      <main className="flex flex-1 items-start justify-center px-4 py-8 sm:items-center">
        <div className="w-full max-w-md rounded-xl border border-border bg-background p-6 shadow-sm">
          {children}
        </div>
      </main>
    </div>
  );
}

function InfluNpsPage() {
  const { data, ws } = Route.useLoaderData();
  const submitFn = useServerFn(submitInfluNps);
  const { token } = Route.useParams();

  const [score, setScore] = useState<string | null>(
    data?.score !== null && data?.score !== undefined ? String(data.score) : null,
  );
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const commentPrompt = useMemo(
    () => (score !== null ? npsCommentPrompt(Number(score)) : null),
    [score],
  );

  if (!data) {
    return (
      <Shell nome={ws.nome} logo={ws.logo}>
        <p className="text-sm text-text-secondary">
          Link inválido ou expirado. Verifique se o link foi copiado corretamente.
        </p>
      </Shell>
    );
  }

  if (done || data.alreadyAnswered) {
    return (
      <Shell nome={ws.nome} logo={ws.logo}>
        {done ? (
          <div className="space-y-2">
            <h1 className="text-lg font-semibold text-foreground">
              Obrigado, {data.influenciadorNome}!
            </h1>
            <p className="text-sm text-text-secondary">
              Sua avaliação foi registrada. Sua opinião nos ajuda a melhorar a experiência com
              creators.
            </p>
          </div>
        ) : (
          <p className="text-sm text-text-secondary">Esta avaliação já foi registrada.</p>
        )}
      </Shell>
    );
  }

  async function handleSubmit() {
    if (score === null) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitFn({
        data: { token, score: Number(score), comment: comment.trim() || undefined },
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
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-base font-semibold text-foreground">Avaliação da sua experiência</h1>
          <p className="text-sm text-text-secondary">Olá, {data.influenciadorNome}.</p>
          <p className="text-sm text-text-secondary">
            Queremos saber como foi sua experiência participando desta campanha.
          </p>
        </div>

        <NpsQuestionStep question="De 0 a 10, qual a chance de você recomendar trabalhar com a Você no Hype para outro influenciador?">
          <NpsChoiceRow
            options={SCORE_OPTIONS}
            value={score}
            onChange={setScore}
            ariaLabel="Nota de 0 a 10"
            legend={["Nada provável", "Extremamente provável"]}
          />
        </NpsQuestionStep>

        {score !== null && commentPrompt && (
          <div className="space-y-1.5">
            <label htmlFor="influ-nps-comment" className="text-sm font-medium text-foreground">
              {commentPrompt}
            </label>
            <Textarea
              id="influ-nps-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Opcional"
              rows={4}
            />
          </div>
        )}

        {error && <p className="text-sm text-danger">{error}</p>}

        <Button onClick={handleSubmit} disabled={score === null || submitting} className="w-full">
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          Enviar avaliação
        </Button>
      </div>
    </Shell>
  );
}
