import {
  AtSign,
  BarChart3,
  Globe,
  KeyRound,
  Mail,
  Megaphone,
  Palette,
  Server,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { serviceInitials } from "./cofre-model";

const CATEGORY_ICON: Record<string, typeof KeyRound> = {
  "Rede social": AtSign,
  Ferramenta: Wrench,
  "E-mail": Mail,
  Hospedagem: Server,
  Domínio: Globe,
  Analytics: BarChart3,
  Anúncios: Megaphone,
  Design: Palette,
  Outros: KeyRound,
};

export function CategoryIcon({ categoria, className }: { categoria: string; className?: string }) {
  const Icon = CATEGORY_ICON[categoria] ?? KeyRound;
  return <Icon className={className} aria-hidden="true" />;
}

/**
 * Identidade do serviço: selo com as iniciais do nome. Não busca favicon/logo de terceiros de
 * propósito — pedir o ícone de um site a um serviço externo revelaria ao terceiro quais ferramentas
 * e domínios o workspace guarda no cofre.
 */
export function ServiceBadge({
  nome,
  size = "md",
  className,
}: {
  nome: string;
  size?: "md" | "lg";
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 select-none items-center justify-center rounded-xl bg-muted font-semibold tracking-tight text-foreground/80 ring-1 ring-border/60",
        size === "lg" ? "h-14 w-14 text-lg" : "h-11 w-11 text-sm",
        className,
      )}
    >
      {serviceInitials(nome)}
    </span>
  );
}
