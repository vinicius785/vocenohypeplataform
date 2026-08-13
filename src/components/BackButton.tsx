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
      className={`group relative h-14 w-48 rounded-2xl border border-border bg-card text-center text-xl font-semibold text-foreground ${className}`}
    >
      <div className="absolute left-1 top-[4px] z-10 flex h-12 w-1/4 items-center justify-center rounded-xl bg-foreground duration-500 group-hover:w-[184px]">
        <ArrowLeft className="h-5 w-5 shrink-0 text-background" />
      </div>
      <p className="translate-x-2">{label}</p>
    </button>
  );
}
