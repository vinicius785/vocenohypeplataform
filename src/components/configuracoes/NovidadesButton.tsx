import { useState } from "react";
import { Sparkles } from "lucide-react";
import { ReleaseNotesDialog } from "@/components/ReleaseNotesDialog";
import { fetchVersionInfo, type VersionInfo } from "@/lib/release-notes";

/**
 * "Novidades" saiu da navegação de Configurações (não é uma configuração)
 * — este botão reaproveita o MESMO `ReleaseNotesDialog`/dado de
 * `public/version.json` que `VersionWatcher` já usa, só que sob demanda
 * (sem esperar detectar uma versão nova). Renderizado no rodapé da
 * sidebar (`AppShell.tsx`), acessível a qualquer usuário.
 */
export function NovidadesButton({
  className,
  showLabel = true,
}: {
  className?: string;
  showLabel?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<VersionInfo | null>(null);

  const handleOpen = () => {
    setOpen(true);
    if (!info) void fetchVersionInfo().then(setInfo);
  };

  return (
    <>
      <button type="button" onClick={handleOpen} className={className}>
        <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />
        {showLabel && "Novidades da plataforma"}
      </button>
      <ReleaseNotesDialog
        open={open}
        onOpenChange={setOpen}
        version={info?.version ?? ""}
        release={info?.releases?.[0] ?? null}
      />
    </>
  );
}
