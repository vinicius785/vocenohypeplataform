import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

/** Botão "Voltar" padrão pra navegação de página/tela (voltar pra lista,
 * pra campanha anterior, etc) — não pros botões de "voltar uma etapa"
 * dentro de formulários/assistentes compactos, que ficam pequenos demais
 * pro tamanho fixo deste componente. */
export function BackButton({
  onClick,
  label = "Voltar",
  className = "",
}: {
  onClick: () => void;
  label?: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative h-9 w-28 rounded-xl border border-border bg-card text-center text-sm font-semibold text-foreground ${className}`}
    >
      <div className="absolute left-1 top-[3px] z-10 flex h-7 w-1/4 items-center justify-center rounded-lg bg-foreground duration-500 group-hover:w-[104px]">
        <ArrowLeft className="h-3.5 w-3.5 shrink-0 text-background" />
      </div>
      <p className="translate-x-1.5">{label}</p>
    </button>
  );
}
