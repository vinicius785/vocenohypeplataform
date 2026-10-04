import { Badge } from "@/components/ui/badge";

/** Selo discreto de "ambiente de demonstração" (Design System §8.8: badge suave, um selo por
 * informação). Aparece no detalhe de uma campanha de demo e, nas próximas etapas, no portal
 * do cliente. */
export const DEMO_CHIP_LABEL = "Ambiente de demonstração";

export function DemoChip({ className }: { className?: string }) {
  return (
    <Badge
      variant="info"
      className={className}
      title="Dados fictícios, isolados do restante da plataforma."
    >
      {DEMO_CHIP_LABEL}
    </Badge>
  );
}
