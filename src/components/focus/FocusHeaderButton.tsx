import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { useFocusSession } from "@/hooks/use-focus-session";
import { TomatoIcon } from "@/components/focus/TomatoIcon";

function formatShort(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Acesso principal do Modo Foco no cabeçalho global (item 1) — ao lado
 * do tema/notificações em `AppShell.tsx`. Ícone+texto azul `#6F95FF` no
 * desktop, só ícone com tooltip/nome acessível no mobile (mesmo padrão
 * de `IconButton`, já usado pra outros botões-ícone do design system).
 * Quando há sessão ativa, o texto muda pra "Voltar ao foco" e mostra o
 * tempo restante discretamente — clicar volta pra sessão sem reiniciá-la
 * (a rota `/foco` sempre lê a sessão já persistida, nunca cria uma
 * nova). */
export function FocusHeaderButton() {
  const navigate = useNavigate();
  const { session, remainingMs } = useFocusSession();
  const active = session?.status === "em_andamento" || session?.status === "pausado";

  const label = active ? "Voltar ao foco" : "Modo foco";
  const go = () => {
    // Sessão já ativa nunca é reiniciada: `/foco` sempre lê a sessão
    // persistida. `from` só importa pra abrir uma sessão nova (primeira
    // vez), pra "Sair do foco" saber pra onde voltar.
    const from = active ? undefined : `${window.location.pathname}${window.location.search}`;
    navigate({ to: "/foco", search: from ? { from } : undefined });
  };

  return (
    <>
      <IconButton
        label={active ? `${label} — ${formatShort(remainingMs)} restantes` : label}
        tone="neutral"
        onClick={go}
        className="sm:hidden text-brand hover:text-brand"
      >
        <TomatoIcon className="h-4 w-4" />
      </IconButton>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={go}
        className="hidden items-center gap-1.5 text-brand hover:bg-brand-subtle hover:text-brand sm:inline-flex"
      >
        <TomatoIcon className="h-4 w-4" />
        <span>{label}</span>
        {active && (
          <span className="text-[11px] font-normal text-brand/80" aria-hidden="true">
            {formatShort(remainingMs)}
          </span>
        )}
      </Button>
    </>
  );
}
