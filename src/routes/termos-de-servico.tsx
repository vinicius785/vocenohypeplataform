import { createFileRoute } from "@tanstack/react-router";
import { LegalPageShell } from "@/components/legal/LegalPageShell";
import { TermsOfServiceContent } from "@/components/legal/TermsOfServiceContent";
import { TERMS_PATH } from "@/lib/privacy-policy-config";

const TITLE = "Termos de Serviço | Você no Hype";
const DESCRIPTION =
  "Condições de uso da Plataforma VNH da Você no Hype: acesso, conta, uso permitido, integrações, responsabilidades e contato.";
const CANONICAL = `https://plataforma.vocenohype.com.br${TERMS_PATH}`;

/** Página pública (fora de `_authenticated`): renderizada no servidor, sem depender de JS nem de login. */
export const Route = createFileRoute("/termos-de-servico")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { name: "robots", content: "index, follow" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "article" },
      { property: "og:url", content: CANONICAL },
    ],
    links: [{ rel: "canonical", href: CANONICAL }],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <LegalPageShell>
      <TermsOfServiceContent />
    </LegalPageShell>
  );
}
