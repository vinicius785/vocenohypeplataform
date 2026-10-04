import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Confirmação de "Criar demonstração" — modal compacto: diz o que será criado e o que NÃO
 * acontece (nada é enviado ao cliente, o lead não muda). A criação em si é do chamador.
 */
export function DemoCreateDialog({
  open,
  onOpenChange,
  leadLabel,
  creating,
  error,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadLabel: string;
  creating: boolean;
  error: string;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !creating && onOpenChange(v)}>
      <DialogContent
        mobileFullScreen
        className="max-w-[460px] grid-cols-[minmax(0,1fr)] gap-4 p-5"
        style={{ alignContent: "start" }}
      >
        <DialogHeader className="space-y-0.5 pr-6">
          <DialogTitle className="text-base">Criar demonstração</DialogTitle>
          <DialogDescription className="truncate text-sm">{leadLabel}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm text-foreground">
          <p>
            Cria uma campanha de demonstração, isolada do restante da plataforma e com dados
            fictícios, que o time e o cliente operam ao vivo.
          </p>
          <ul className="list-disc space-y-1 pl-5 text-text-secondary">
            <li>Influenciadores, roteiros, conteúdos e métricas de exemplo.</li>
            <li>Não envia e-mail nem mensagem a ninguém, e não altera o lead.</li>
            <li>Pode ser reiniciada ou encerrada quando quiser.</li>
          </ul>
        </div>

        {error && (
          <Alert variant="destructive" className="py-2 text-sm">
            {error}
          </Alert>
        )}

        <div className="flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="ghost"
            disabled={creating}
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button type="button" variant="primary" isLoading={creating} onClick={onConfirm}>
            Criar demonstração
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
