import { createFileRoute } from "@tanstack/react-router";
import { LegalPageShell } from "@/components/legal/LegalPageShell";
import { DeletionStatusContent } from "@/components/legal/DeletionStatusContent";
import { getMetaDeletionStatus } from "@/lib/meta-data-deletion.functions";

/** Acompanhamento público do pedido de exclusão (código devolvido à Meta). Sem login; sem dados pessoais. */
export const Route = createFileRoute("/exclusao-de-dados/$code")({
  loader: ({ params }) => getMetaDeletionStatus({ data: { code: params.code } }),
  head: () => ({
    meta: [
      { title: "Status do pedido de exclusão de dados | Você no Hype" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: StatusPage,
});

function StatusPage() {
  const status = Route.useLoaderData();
  return (
    <LegalPageShell>
      <DeletionStatusContent status={status} />
    </LegalPageShell>
  );
}
