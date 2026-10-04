import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

/** O que o campo editável recebe para se comportar como parte do fluxo
 * "clica → edita → sai = salva". */
export type InlineControlProps = {
  autoFocus: boolean;
  onBlur: () => void;
  onKeyDown: (e: KeyboardEvent) => void;
  /** Volta ao modo leitura sem esperar o blur (usado pelos seletores, que
   * salvam no ato da escolha). */
  close: () => void;
};

/**
 * Campo do perfil do lead: em LEITURA é só rótulo + valor (clicável, com um
 * lápis discreto no hover/foco); ao clicar vira o controle de edição e, ao
 * sair (blur/Enter), volta a ser texto e dispara `onCommit` — o mesmo
 * "salvar ao sair do campo" de antes, sem um formulário gigante aberto o
 * tempo todo. Na criação (`always`) o lead ainda não existe: o campo fica
 * sempre em modo de edição, como um formulário normal.
 */
export function InlineField({
  label,
  display,
  empty,
  placeholder = "Adicionar",
  always = false,
  multiline = false,
  required = false,
  className,
  trailing,
  onCommit,
  render,
}: {
  label: string;
  /** Texto do modo leitura. */
  display?: ReactNode;
  /** Sem valor: mostra o `placeholder` esmaecido em vez de `display`. */
  empty: boolean;
  placeholder?: string;
  always?: boolean;
  multiline?: boolean;
  required?: boolean;
  className?: string;
  /** Ações ao lado do valor em leitura (ligar, e-mail…). */
  trailing?: ReactNode;
  onCommit: () => void;
  render: (p: InlineControlProps) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const editing = always || open;
  const wasOpen = useRef(false);

  // Abre o seletor nativo já na primeira interação (um clique só).
  useEffect(() => {
    if (open && !wasOpen.current) {
      const el = document.activeElement;
      if (el instanceof HTMLSelectElement && "showPicker" in el) {
        try {
          el.showPicker();
        } catch {
          /* o navegador pode recusar fora de um gesto do usuário */
        }
      }
    }
    wasOpen.current = open;
  }, [open]);

  const control = render({
    autoFocus: open && !always,
    onBlur: () => {
      if (always) return;
      setOpen(false);
      onCommit();
    },
    onKeyDown: (e) => {
      if (always || multiline || e.key !== "Enter") return;
      e.preventDefault();
      (e.target as HTMLElement).blur();
    },
    close: () => setOpen(false),
  });

  return (
    <div className={cn("min-w-0", className)}>
      <p
        className={
          always
            ? "mb-1.5 text-sm font-medium text-foreground"
            : "text-[11px] font-medium uppercase tracking-wide text-text-secondary"
        }
      >
        {label}
        {always && required ? " *" : ""}
      </p>
      {editing ? (
        <div className={always ? undefined : "mt-1"}>{control}</div>
      ) : (
        <div className="mt-0.5 flex items-start gap-1">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={`Editar ${label}`}
            className="group -mx-1.5 flex min-w-0 flex-1 items-start gap-1.5 rounded-md px-1.5 py-0.5 text-left text-sm hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span
              className={cn(
                "min-w-0 flex-1",
                multiline ? "line-clamp-3 whitespace-pre-wrap break-words" : "truncate",
                empty ? "text-text-secondary" : "text-foreground",
              )}
              title={!empty && typeof display === "string" ? display : undefined}
            >
              {empty ? placeholder : display}
            </span>
            <Pencil
              className="mt-0.5 h-3 w-3 shrink-0 text-text-secondary opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
              aria-hidden="true"
            />
          </button>
          {trailing}
        </div>
      )}
    </div>
  );
}
