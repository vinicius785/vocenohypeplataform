import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { OPEN_CAMPANHA_TASK_EVENT, OPEN_CAMPANHA_TASK_KEY } from "@/components/AppShell";
import { useConfirm } from "@/hooks/use-confirm";
import { isDemoCampanhaId } from "@/lib/clientes-store";
import {
  closeDemo,
  getDemoLink,
  renewDemoAccess,
  restartDemo,
  revokeDemoAccess,
} from "@/lib/demo.functions";
import {
  DEMO_ACTION_CONFIRM,
  DEMO_ACTION_SUCCESS,
  type DemoCardAction,
} from "@/lib/demo/demo-lead-view";
import type { DemoSessionView } from "@/lib/demo/demo-types";

const SAFE_FALLBACK = "Não foi possível concluir agora. Tente de novo em instantes.";

export function messageOf(error: unknown): string {
  return error instanceof Error && error.message ? error.message : SAFE_FALLBACK;
}

/**
 * Abre a campanha de demonstração no detalhe de Campanhas (mesmo handoff usado pelos avisos
 * do sino). A demo chega ao cache do time por Realtime; se o clique vier antes disso, avisa
 * em vez de abrir uma tela vazia.
 */
export function openDemoCampaign(campanhaId: string): boolean {
  if (!isDemoCampanhaId(campanhaId)) {
    toast.info("A demonstração ainda está sendo carregada. Tente de novo em instantes.");
    return false;
  }
  try {
    sessionStorage.setItem(OPEN_CAMPANHA_TASK_KEY, JSON.stringify({ campanhaId }));
  } catch {
    /* sem sessionStorage: segue só com o evento */
  }
  window.dispatchEvent(new Event(OPEN_CAMPANHA_TASK_EVENT));
  window.dispatchEvent(new CustomEvent("nav:section", { detail: "campanhas" }));
  return true;
}

/**
 * Ações de gestão de uma demonstração existente — as MESMAS no lead e na campanha: confirma o
 * que desfaz/corta, chama o servidor, avisa o resultado e pede para atualizar o estado.
 */
export function useDemoActions(
  session: DemoSessionView | null,
  onChanged: () => Promise<unknown> | void,
) {
  const restartFn = useServerFn(restartDemo);
  const closeFn = useServerFn(closeDemo);
  const revokeFn = useServerFn(revokeDemoAccess);
  const renewFn = useServerFn(renewDemoAccess);
  const linkFn = useServerFn(getDemoLink);
  const { confirm, confirmDialog } = useConfirm();
  const [pending, setPending] = useState<DemoCardAction | null>(null);

  const run = async (action: DemoCardAction) => {
    if (!session) return;
    if (action === "abrir") {
      openDemoCampaign(session.campanha_id);
      return;
    }
    if (action === "copiar_link" || action === "abrir_cliente") {
      setPending(action);
      try {
        const { token } = await linkFn({ data: { sessionId: session.id } });
        const url = `${window.location.origin}/demo/${token}`;
        if (action === "copiar_link") {
          await navigator.clipboard.writeText(url);
          toast.success(DEMO_ACTION_SUCCESS.copiar_link);
        } else {
          window.open(url, "_blank", "noopener,noreferrer");
        }
      } catch (e) {
        toast.error("Não foi possível obter o link", { description: messageOf(e) });
      } finally {
        setPending(null);
      }
      return;
    }

    const sure = DEMO_ACTION_CONFIRM[action];
    if (
      sure &&
      !(await confirm(sure.message, {
        title: sure.title,
        confirmLabel: sure.confirmLabel,
        destructive: sure.destructive,
      }))
    ) {
      return;
    }
    const sessionId = session.id;
    const call: Record<
      Exclude<DemoCardAction, "abrir" | "copiar_link" | "abrir_cliente">,
      () => Promise<unknown>
    > = {
      reiniciar: () => restartFn({ data: { sessionId } }),
      renovar: () => renewFn({ data: { sessionId } }),
      novo_link: () => renewFn({ data: { sessionId, newLink: true } }),
      revogar: () => revokeFn({ data: { sessionId } }),
      encerrar: () => closeFn({ data: { sessionId } }),
    };
    setPending(action);
    try {
      await call[action]();
      toast.success(DEMO_ACTION_SUCCESS[action]);
      await onChanged();
    } catch (e) {
      toast.error("Não foi possível concluir", { description: messageOf(e) });
    } finally {
      setPending(null);
    }
  };

  return { run, pending, confirmDialog };
}
