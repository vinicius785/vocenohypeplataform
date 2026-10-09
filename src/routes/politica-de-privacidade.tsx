import { createFileRoute } from "@tanstack/react-router";
import { PrivacyPolicyContent } from "@/components/legal/PrivacyPolicyContent";
import { PRIVACY_POLICY_URL_PATH } from "@/lib/privacy-policy-config";

const TITLE = "Política de Privacidade | Você no Hype";
const DESCRIPTION =
  "Como a Você no Hype trata dados pessoais no site e na Plataforma VNH, incluindo a integração com o Google Agenda, seus direitos e como pedir a exclusão de dados.";
const CANONICAL = `https://plataforma.vocenohype.com.br${PRIVACY_POLICY_URL_PATH}`;

/** Página pública (fora de `_authenticated`): renderizada no servidor, sem depender de JS nem de login. */
export const Route = createFileRoute("/politica-de-privacidade")({
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
  component: PrivacyPolicyPage,
});

function PrivacyPolicyPage() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between gap-4 px-5 sm:px-6">
          <span className="text-sm font-semibold">Você no Hype</span>
          <a
            href="/"
            className="rounded-md px-2 py-1.5 text-sm font-medium text-text-secondary hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            Acessar a plataforma
          </a>
        </div>
      </header>
      <main id="conteudo" className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-6 sm:py-14">
        <PrivacyPolicyContent />
      </main>
      <footer className="border-t border-border">
        <div className="mx-auto w-full max-w-3xl px-5 py-6 text-xs text-text-secondary sm:px-6">
          © {new Date().getFullYear()} Você no Hype
        </div>
      </footer>
    </div>
  );
}
