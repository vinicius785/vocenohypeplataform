import { createFileRoute } from "@tanstack/react-router";
import { LegalPageShell } from "@/components/legal/LegalPageShell";
import { InstagramResultContent } from "@/components/legal/InstagramConnectContent";
import { parseConnectResult } from "@/components/legal/instagram-connect-result";

/** Resultado do OAuth (sem token, sem dados pessoais na URL). */
export const Route = createFileRoute("/conectar-instagram/resultado")({
  validateSearch: (s: Record<string, unknown>) => ({ status: parseConnectResult(s.status) }),
  head: () => ({
    meta: [
      { title: "Conexão do Instagram | Você no Hype" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ResultPage,
});

function ResultPage() {
  const { status } = Route.useSearch();
  return (
    <LegalPageShell showLogin={false}>
      <InstagramResultContent status={status} />
    </LegalPageShell>
  );
}
