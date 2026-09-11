import { TYPOGRAPHY } from "@/lib/design-tokens";

export function ResponsiveSection() {
  return (
    <section id="responsivo" className="space-y-4">
      <h2 className={TYPOGRAPHY.sectionTitle}>Exemplos responsivos</h2>
      <p className={TYPOGRAPHY.bodySecondary}>
        Redimensione a janela (ou use as ferramentas de dispositivo) — o grid abaixo vai de 1 coluna
        (mobile) → 2 (tablet) → 4 (desktop), sem overflow horizontal no documento em nenhuma largura
        entre 320px e 1440px.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          "320-767px: 1 coluna",
          "768-1023px: 2 colunas",
          "1024px+: 4 colunas",
          "Área de toque ≥44px",
        ].map((label) => (
          <div
            key={label}
            className="rounded-xl border border-border bg-card p-4 text-center text-xs text-muted-foreground"
          >
            {label}
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-border bg-muted/30 p-4">
        <p className={`${TYPOGRAPHY.caption} break-words`}>
          Todos os componentes desta página evitam `hover` como única forma de revelar informação ou
          ação, respeitam `prefers-reduced-motion` (as transições do Radix já reagem a isso via
          `tw-animate-css`), e o Drawer e o Modal viram tela cheia no mobile (`mobileFullScreen` e
          `Sheet`, já testados na seção de overlays).
        </p>
      </div>
    </section>
  );
}
