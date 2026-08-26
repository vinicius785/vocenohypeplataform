import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, XCircle } from "lucide-react";
import { processEmailUnsubscribe } from "@/lib/email-flows.functions";

export const Route = createFileRoute("/email/descadastro/$token")({
  component: EmailUnsubscribePage,
  loader: async ({ params }) =>
    processEmailUnsubscribe({ data: { token: params.token } }).catch(() => ({
      ok: false as const,
    })),
  head: () => ({
    meta: [{ title: "Descadastro" }, { name: "robots", content: "noindex, nofollow" }],
  }),
});

function EmailUnsubscribePage() {
  const result = Route.useLoaderData();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm space-y-3 rounded-xl border border-border bg-background p-6 text-center shadow-sm">
        {result.ok ? (
          <>
            <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600 dark:text-emerald-400" />
            <p className="text-sm font-semibold text-foreground">Descadastro concluído</p>
            <p className="text-xs text-muted-foreground">
              {result.email} não vai mais receber e-mails automáticos nossos.
            </p>
          </>
        ) : (
          <>
            <XCircle className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-semibold text-foreground">Link inválido</p>
            <p className="text-xs text-muted-foreground">
              Esse link de descadastro não é mais válido.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
