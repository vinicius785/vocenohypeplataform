import { TYPOGRAPHY } from "@/lib/design-tokens";
import { AppShellPreview } from "../AppShellPreview";

export function AppShellSection() {
  return (
    <section id="appshell" className="space-y-4">
      <div>
        <h2 className={TYPOGRAPHY.sectionTitle}>AppShellPreview</h2>
        <p className={`${TYPOGRAPHY.bodySecondary} mt-1 max-w-2xl`}>
          Demonstração isolada do futuro layout global — sidebar, header, busca e navegação ativa em
          `#6F95FF`. NÃO é o `AppShell.tsx` real e não afeta a navegação de produção. Redimensione a
          janela pra ver a sidebar virar drawer no mobile.
        </p>
      </div>
      <AppShellPreview />
    </section>
  );
}
