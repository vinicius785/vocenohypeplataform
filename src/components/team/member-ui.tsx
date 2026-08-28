import type { ReactNode } from "react";
import { getStatus, STATUS_COLOR, STATUS_LABEL, type MemberStatus } from "@/lib/chat-store";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** Cor de avatar determinística (mesmo seed → mesma cor sempre) — extraído
 * de `TimeSection.tsx` pra ser reaproveitado pelos novos componentes do
 * dashboard (`src/components/team/*`) sem duplicar a paleta. */
const AVATAR_ACCENTS = [
  "bg-chart-1/15 text-chart-1",
  "bg-chart-2/15 text-chart-2",
  "bg-chart-3/15 text-chart-3",
  "bg-chart-4/15 text-chart-4",
  "bg-chart-5/15 text-chart-5",
];

export function avatarAccent(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_ACCENTS[hash % AVATAR_ACCENTS.length];
}

export function initialsOf(name: string, fallback: string): string {
  const source = name.trim() || fallback;
  return source.slice(0, 1).toUpperCase();
}

export function PresenceDot({ status }: { status: MemberStatus }) {
  return (
    <span
      title={STATUS_LABEL[status]}
      className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-card ${STATUS_COLOR[status]}`}
    />
  );
}

export { getStatus };

/** Botão de ícone com tooltip — usado nas ações de admin (editar/
 * redefinir senha/remover) tanto na linha de performance quanto nos
 * diálogos de membro. */
export function IconAction({
  label,
  destructive,
  onClick,
  children,
}: {
  label: string;
  destructive?: boolean;
  onClick: (e: React.MouseEvent) => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          className={`rounded-md p-1.5 text-muted-foreground hover:bg-muted ${destructive ? "hover:text-destructive" : "hover:text-foreground"}`}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
