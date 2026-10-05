import { Check, ChevronDown, ChevronRight } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ResourceItem, ResourceKey } from "@/lib/influencer-resources";

/** "Recursos" = camada de CONSULTA do influenciador (perfil, financeiro, contexto…). Menu mínimo:
 * só os nomes, um chevron e — quando há algo a resolver — um ponto discreto. Sem ações genéricas
 * (editar / remover / alterar status ficam no contexto delas). `current` marca o recurso aberto,
 * para trocar de um para outro sem voltar ao detalhe. */
export function RecursosMenu({
  items,
  current,
  onSelect,
}: {
  items: ResourceItem[];
  current?: ResourceKey | null;
  onSelect: (key: ResourceKey) => void;
}) {
  if (items.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-text-secondary hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand data-[state=open]:text-foreground"
        >
          Recursos
          <ChevronDown className="h-3 w-3" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
          Recursos
        </DropdownMenuLabel>
        {items.map((it) => (
          <DropdownMenuItem
            key={it.key}
            onSelect={() => onSelect(it.key)}
            className="justify-between gap-3"
          >
            <span className="flex items-center gap-2">
              {it.label}
              {it.attention && (
                <span
                  role="img"
                  aria-label="Há pendências"
                  className="h-1.5 w-1.5 rounded-full bg-amber-500"
                />
              )}
            </span>
            {current === it.key ? (
              <Check className="h-3.5 w-3.5 text-text-secondary" aria-hidden />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-text-secondary" aria-hidden />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
