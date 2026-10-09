import type { ReactNode } from "react";
import { PRIVACY_POLICY_URL_PATH, TERMS_PATH } from "@/lib/privacy-policy-config";

/** Moldura das páginas legais públicas (política e termos): sem login, renderizada no servidor. */
export function LegalPageShell({ children }: { children: ReactNode }) {
  const link =
    "rounded-md px-1.5 py-1 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";
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
        {children}
      </main>
      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-2 px-5 py-6 text-xs text-text-secondary sm:px-6">
          <span>© {new Date().getFullYear()} Você no Hype</span>
          <nav aria-label="Documentos legais" className="flex gap-2">
            <a href={TERMS_PATH} className={link}>
              Termos de Serviço
            </a>
            <a href={PRIVACY_POLICY_URL_PATH} className={link}>
              Política de Privacidade
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
