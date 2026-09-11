import { Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { initialsOf } from "./cliente-ui";

const SIZE_CLASS = {
  sm: "h-8 w-8 rounded-lg text-[11px]",
  md: "h-12 w-12 rounded-xl text-sm",
  lg: "h-16 w-16 rounded-2xl text-base",
} as const;

/**
 * Logo/fallback único do módulo Clientes — usado em card, drawer de
 * criação/edição (com preview), drawer de detalhes e nas campanhas
 * vinculadas. Corrige o bug do `FlowingMenu` (marquee repetindo a logo
 * horizontalmente): aqui é sempre um único `<img>` com `object-contain`
 * (nunca `object-cover`, que cortaria/distorceria uma logo retangular),
 * container quadrado de tamanho fixo por contexto, padding interno,
 * `overflow-hidden` e sem upscaling além do tamanho natural do arquivo —
 * preserva proporção em logos horizontais, verticais, quadradas ou
 * transparentes, sem esticar/cortar/repetir.
 *
 * Fundo neutro (`bg-muted`) quando há foto real — uma cor de marca atrás
 * de uma logo com fundo branco/transparente de cor arbitrária ficaria
 * inconsistente; sem foto, o fallback de iniciais usa `bg-brand-subtle`
 * de propósito (identidade visual, mesmo padrão de avatar-com-iniciais já
 * usado em Metas/Time). Nenhum filtro é aplicado sobre a imagem — cores
 * originais da marca do cliente nunca são alteradas.
 */
export function ClienteLogo({
  photo,
  empresa,
  size = "md",
  className,
}: {
  photo?: string;
  empresa: string;
  size?: keyof typeof SIZE_CLASS;
  className?: string;
}) {
  const initials = initialsOf(empresa);
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden p-1.5",
        photo ? "bg-muted" : "bg-brand-subtle text-brand",
        SIZE_CLASS[size],
        className,
      )}
    >
      {photo ? (
        <img src={photo} alt={`Logo de ${empresa}`} className="h-full w-full object-contain" />
      ) : initials ? (
        <span className="font-semibold">{initials}</span>
      ) : (
        <Building2 className="h-1/2 w-1/2" strokeWidth={1.75} aria-hidden="true" />
      )}
    </div>
  );
}
