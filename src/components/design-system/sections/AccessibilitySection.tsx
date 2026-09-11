import { TYPOGRAPHY } from "@/lib/design-tokens";
import { contrastRatio, meetsAA } from "@/lib/contrast";

const CONTRAST_PAIRS: { pair: string; a: string; b: string; large?: boolean }[] = [
  { pair: "Texto principal sobre fundo (claro)", a: "#111318", b: "#F3F4F6" },
  { pair: "Texto principal sobre fundo (escuro)", a: "#F7F8FA", b: "#090B0F" },
  { pair: "Texto secundário novo sobre branco/card", a: "#4B5563", b: "#FFFFFF" },
  { pair: "Texto secundário novo sobre #F3F4F6 (fundo real)", a: "#4B5563", b: "#F3F4F6" },
  { pair: "Texto secundário novo sobre fundo escuro", a: "#9CA3AF", b: "#090B0F" },
  { pair: "Botão primário: #0B1020 sobre #6F95FF (marca)", a: "#0B1020", b: "#6F95FF" },
  { pair: "Versão anterior (branco sobre a marca) — corrigida", a: "#FFFFFF", b: "#6F95FF" },
  { pair: "Badge/alert success (soft-fg sobre soft-bg)", a: "#005837", b: "#E2F7F0" },
  { pair: "Badge/alert warning (soft-fg sobre soft-bg)", a: "#723F00", b: "#FEF1DD" },
  { pair: "Badge/alert danger (soft-fg sobre soft-bg)", a: "#861118", b: "#FDE9E9" },
  { pair: "Badge/alert info (soft-fg sobre soft-bg)", a: "#173F81", b: "#E7F0FE" },
  { pair: "Badge default (branco sobre preto)", a: "#FFFFFF", b: "#000000" },
  { pair: "Botão destrutivo (branco sobre vermelho)", a: "#FFFFFF", b: "#E7000B" },
];

/**
 * Resultados de contraste (rodada corretiva §5) — calculados AO VIVO
 * (`contrastRatio`/`meetsAA` em `src/lib/contrast.ts`, testado em
 * `contrast.test.ts`) a partir dos valores reais de `styles.css`, não
 * digitados à mão. A única combinação que falhava (texto branco sobre a
 * marca) foi corrigida — ver `--brand-foreground`; a linha "versão
 * anterior" documenta o valor ANTERIOR pra registrar a correção.
 */
export function AccessibilitySection() {
  return (
    <section id="acessibilidade" className="space-y-4">
      <div>
        <h2 className={TYPOGRAPHY.sectionTitle}>Acessibilidade</h2>
        <p className={`${TYPOGRAPHY.bodySecondary} mt-1 max-w-2xl`}>
          Contraste WCAG AA validado nos pares principais, foco visível, navegação por teclado e
          `prefers-reduced-motion` — ver também os componentes individuais (Modal/Drawer fecham com
          Escape, DropdownMenu navega por seta, Tooltip nunca é a única fonte da informação).
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-text-secondary">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium">Par de cores</th>
              <th className="px-4 py-2.5 text-left font-medium">Contraste</th>
              <th className="px-4 py-2.5 text-left font-medium">AA (4.5:1 texto / 3:1 UI)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {CONTRAST_PAIRS.map((row) => {
              const ratio = contrastRatio(row.a, row.b);
              const passes = meetsAA(row.a, row.b, row.large);
              return (
                <tr key={row.pair}>
                  <td className="px-4 py-2.5 text-foreground">{row.pair}</td>
                  <td className="px-4 py-2.5 tabular-nums text-foreground">{ratio.toFixed(2)}:1</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={
                        passes
                          ? "inline-flex items-center rounded-full bg-success-soft px-2 py-0.5 text-xs font-medium text-success-soft-foreground"
                          : "inline-flex items-center rounded-full bg-danger-soft px-2 py-0.5 text-xs font-medium text-danger-soft-foreground"
                      }
                    >
                      {passes ? "Passa" : "Falha"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul className={`${TYPOGRAPHY.bodySecondary} list-inside list-disc space-y-1`}>
        <li>
          Foco visível: todos os controles novos usam `focus-visible:ring-brand` ou o `ring` padrão
          do Radix — nunca `outline: none` sem substituto.
        </li>
        <li>
          Estados nunca dependem só de cor: badges/alerts sempre têm texto, ícone de direção
          acompanha `MetricCard` (seta, não só verde/vermelho).
        </li>
        <li>
          Modal, Drawer, Dropdown, Popover e Tooltip são 100% navegáveis por teclado (Tab,
          Enter/Espaço, Escape, setas) — comportamento nativo do Radix, não recriado.
        </li>
        <li>
          `prefers-reduced-motion` é respeitado nas transições novas (`MOTION.reduceMotion` em
          `design-tokens.ts`) e nas do Radix via `tw-animate-css`.
        </li>
      </ul>
    </section>
  );
}
