import { AlertTriangle } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { DEMO_LINK_INVALID_MESSAGE } from "@/lib/demo/demo-types";

/**
 * Tela única para QUALQUER falha de acesso ao link da demonstração (não existe, expirou, foi
 * revogado, foi encerrado, limite de uso, erro): o texto nunca revela o motivo.
 */
export function DemoLinkInvalid() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-6">
      <EmptyState
        icon={<AlertTriangle className="h-5 w-5" />}
        title={DEMO_LINK_INVALID_MESSAGE}
        description="Peça um novo link a quem compartilhou a demonstração com você."
      />
    </div>
  );
}
