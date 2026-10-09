import { createFileRoute } from "@tanstack/react-router";
import { LegalPageShell } from "@/components/legal/LegalPageShell";
import { DeletionInstructionsContent } from "@/components/legal/DeletionInstructionsContent";
import { DELETION_PATH } from "@/lib/privacy-policy-config";

const TITLE = "Exclusão de dados | Você no Hype";
const DESCRIPTION =
  "Como solicitar a exclusão dos seus dados pessoais na Plataforma VNH, inclusive os vinculados à Meta, e como acompanhar o pedido.";
const CANONICAL = `https://plataforma.vocenohype.com.br${DELETION_PATH}`;

/** Instruções públicas de exclusão de dados (a Meta aceita esta URL como "Data Deletion Instructions URL"). */
export const Route = createFileRoute("/exclusao-de-dados/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { name: "robots", content: "index, follow" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:url", content: CANONICAL },
    ],
    links: [{ rel: "canonical", href: CANONICAL }],
  }),
  component: () => (
    <LegalPageShell>
      <DeletionInstructionsContent />
    </LegalPageShell>
  ),
});
