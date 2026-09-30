import { useEffect, useState } from "react";
import { Check, Circle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import type { Campaign } from "@/components/VincularCampanhaDialog";
import { campanhaActivationChecklist } from "./campanha-ui";

/**
 * Ativação de campanha (Negociação → Ativa, Fase 3) — mesmo `AlertDialog`
 * do `useConfirm` usado nas outras trocas de status da campanha, com:
 * checklist informativo (não bloqueante), toggle "sem faturamento" e, se o
 * cliente ainda está "Negociando", o aviso de que ele também precisa ser
 * ativado (o botão vira "Ativar cliente e continuar" — nunca ativa o cliente
 * sem essa confirmação explícita).
 */
export function CampanhaActivationDialog({
  open,
  campaign,
  clienteNegotiating,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  campaign: Campaign;
  clienteNegotiating: boolean;
  onCancel: () => void;
  onConfirm: (opts: { semFaturamento: boolean }) => void;
}) {
  const [semFaturamento, setSemFaturamento] = useState(Boolean(campaign.semFaturamento));
  useEffect(() => {
    if (open) setSemFaturamento(Boolean(campaign.semFaturamento));
  }, [open, campaign.semFaturamento]);

  const checklist = campanhaActivationChecklist({ ...campaign, semFaturamento });

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Iniciar campanha</AlertDialogTitle>
          <AlertDialogDescription>
            A campanha passará de Negociação para Ativa.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {clienteNegotiating && (
          <div
            role="alert"
            className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300"
          >
            Este cliente ainda está em negociação. Para ativar a campanha, o cliente também precisa
            ser ativado.
          </div>
        )}

        <div className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">
            Checklist de ativação
          </p>
          <ul className="space-y-1 text-sm">
            {checklist.map((item) => (
              <li key={item.key} className="flex items-center gap-2">
                {item.ok ? (
                  <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <Circle className="h-4 w-4 text-text-secondary" />
                )}
                <span className={item.ok ? "text-foreground" : "text-text-secondary"}>
                  {item.label}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-text-secondary">Itens pendentes não impedem a ativação.</p>
        </div>

        <label className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm">
          <span>
            <span className="block font-medium text-foreground">Sem faturamento</span>
            <span className="block text-xs text-text-secondary">
              A campanha não gera receita no Financeiro, mesmo com valor preenchido.
            </span>
          </span>
          <Switch checked={semFaturamento} onCheckedChange={setSemFaturamento} />
        </label>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={() => onConfirm({ semFaturamento })}>
            {clienteNegotiating ? "Ativar cliente e continuar" : "Iniciar campanha"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
