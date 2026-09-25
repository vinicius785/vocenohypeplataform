import { useEffect, useState } from "react";
import { Laptop, Moon, Sun } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  getThemePreference,
  setThemePreference,
  watchThemePreference,
  type ThemePreference,
} from "@/lib/theme";

const ICON: Record<ThemePreference, typeof Sun> = { system: Laptop, light: Sun, dark: Moon };

/**
 * Controle de tema global — botão compacto (ícone + tooltip), sempre ao
 * lado do sino de notificações na topbar. Nunca um texto grande "Modo
 * escuro" nem uma seção "Aparência" dentro de Configurações — esta é a
 * única superfície de tema do Portal V2. Muda na hora (sem reload),
 * mantém "Sistema" reagindo a `prefers-color-scheme`, e sincroniza entre
 * abas via `watchThemePreference` (ver `lib/theme.ts`).
 */
export function ClientThemeMenu() {
  const [pref, setPref] = useState<ThemePreference>("system");

  useEffect(() => {
    setPref(getThemePreference());
    return watchThemePreference(setPref);
  }, []);

  const Icon = ICON[pref];

  return (
    <DropdownMenu>
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Tema"
                className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Tema</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuLabel>Tema</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={pref}
          onValueChange={(v) => {
            const next = v as ThemePreference;
            setThemePreference(next);
            setPref(next);
          }}
        >
          <DropdownMenuRadioItem value="system">Sistema</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="light">Claro</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">Escuro</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
