import { useState } from "react";

/** Avatar de mensagem com fallback real quando a foto falha ao carregar —
 * não só quando `authorPhoto` é `undefined`. Sem isso, uma URL antiga que
 * parou de existir (ex.: o avatar do Hypito, removido do bundle junto com
 * o bot — as mensagens históricas continuam no banco com a URL antiga
 * salva) aparece como ícone de imagem quebrada em vez de cair no círculo
 * com a inicial, que é o mesmo fallback já usado pra mensagens sem foto. */
export function MessageAvatar({
  photo,
  name,
  className,
  shape = "circle",
}: {
  photo?: string;
  name: string;
  className: string;
  shape?: "circle" | "square";
}) {
  const [failed, setFailed] = useState(false);
  const radius = shape === "circle" ? "rounded-full" : "rounded-md";
  if (photo && !failed) {
    return (
      <img
        src={photo}
        alt=""
        className={`${className} ${radius} object-cover`}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span
      className={`flex items-center justify-center ${radius} bg-muted font-semibold text-foreground ${className}`}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
