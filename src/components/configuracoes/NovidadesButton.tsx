import { useState } from "react";
import { Sparkles } from "lucide-react";
import { ReleaseHistoryDialog } from "@/components/ReleaseHistoryDialog";

/**
 * "Novidades" saiu da navegação de Configurações (não é uma configuração)
 * — este botão abre o histórico de versões (`ReleaseHistoryDialog`,
 * lido da tabela `platform_releases`) sob demanda, sem esperar detectar
 * uma versão nova. Renderizado no rodapé da sidebar (`AppShell.tsx`),
 * acessível a qualquer usuário.
 */
export function NovidadesButton({
  className,
  showLabel = true,
}: {
  className?: string;
  showLabel?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />
        {showLabel && "Novidades da plataforma"}
      </button>
      <ReleaseHistoryDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
