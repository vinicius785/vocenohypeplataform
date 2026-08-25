import { User } from "lucide-react";
import { initialsOf } from "./metas-ui-utils";

/** Avatar de dono compartilhado entre cards/linhas de Metas — foto do
 * membro do time quando disponível, senão iniciais, senão um ícone
 * genérico (sem dono definido). */
export function Avatar({
  name,
  photo,
  size = "sm",
}: {
  name?: string;
  photo?: string;
  size?: "sm" | "md";
}) {
  const dim = size === "md" ? "h-9 w-9 text-[11px]" : "h-6 w-6 text-[9px]";
  return (
    <span
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted font-semibold text-foreground ring-1 ring-border ${dim}`}
    >
      {photo ? (
        <img src={photo} alt="" className="h-full w-full object-cover" />
      ) : name ? (
        initialsOf(name) || "?"
      ) : (
        <User className="h-3 w-3 text-muted-foreground" />
      )}
    </span>
  );
}
