import { ChevronDown } from "lucide-react";
import { CHAT_V2_READING_COLUMN_CLASS } from "./chat-v2-utils";

/** Indicador compacto de "novas mensagens" — fica imediatamente ACIMA do
 * composer (é a última linha da timeline, que é a linha logo acima do
 * composer no grid da conversa), alinhado à mesma coluna de leitura
 * compartilhada com a timeline/composer — nunca centralizado no meio da
 * tela, nunca um botão grande. Extraído da Timeline pra manter o
 * componente principal enxuto. */
export function ChatV2NewMessagesIndicator({
  count,
  onClick,
}: {
  count: number;
  onClick: () => void;
}) {
  if (count <= 0) return null;
  const label = count > 9 ? "Novas mensagens" : `${count} nova${count > 1 ? "s" : ""}`;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3">
      <div className={`flex justify-end ${CHAT_V2_READING_COLUMN_CLASS}`}>
        <button
          type="button"
          onClick={onClick}
          className="pointer-events-auto flex h-8 items-center gap-1 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground shadow-md hover:bg-muted"
        >
          <ChevronDown className="h-3.5 w-3.5 text-brand" />
          {label}
        </button>
      </div>
    </div>
  );
}
