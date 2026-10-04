import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { OPEN_CAMPANHA_TASK_EVENT, OPEN_CAMPANHA_TASK_KEY } from "@/components/AppShell";
import { DemoCreateDialog } from "@/components/demo/DemoCreateDialog";
import { useConfirm } from "@/hooks/use-confirm";
import { isDemoCampanhaId } from "@/lib/clientes-store";
import {
  closeDemo,
  createDemo,
  getDemoForLead,
  renewDemoAccess,
  restartDemo,
  revokeDemoAccess,
} from "@/lib/demo.functions";
import {
  DEMO_ACTION_CONFIRM,
  DEMO_ACTION_SUCCESS,
  type DemoCardAction,
} from "@/lib/demo/demo-lead-view";
import { LeadDemoCardView } from "./LeadDemoCard";

const SAFE_FALLBACK = "Não foi possível concluir agora. Tente de novo em instantes.";

function messageOf(error: unknown): string {
  return error instanceof Error && error.message ? error.message : SAFE_FALLBACK;
}

/**
 * Abre a campanha de demonstração no detalhe de Campanhas (mesmo handoff usado pelos avisos
 * do sino). A demo chega ao cache do time por Realtime; se o clique vier antes disso, avisa
 * em vez de abrir uma tela vazia.
 */
function openDemoCampaign(campanhaId: string): boolean {
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

/** Demonstração do lead: busca o estado, cria e gerencia (reiniciar, renovar, revogar, encerrar). */
export function LeadDemoSection({ leadId, leadLabel }: { leadId: string; leadLabel: string }) {
  const queryClient = useQueryClient();
  const queryKey = ["demo-do-lead", leadId];

  const getFn = useServerFn(getDemoForLead);
  const createFn = useServerFn(createDemo);
  const restartFn = useServerFn(restartDemo);
  const closeFn = useServerFn(closeDemo);
  const revokeFn = useServerFn(revokeDemoAccess);
  const renewFn = useServerFn(renewDemoAccess);

  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: () => getFn({ data: { leadId } }),
    staleTime: 15_000,
  });
  const session = data?.session ?? null;

  const { confirm, confirmDialog } = useConfirm();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogError, setDialogError] = useState("");
  const [pending, setPending] = useState<DemoCardAction | "criar" | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey });

  const create = useMutation({
    mutationFn: () => createFn({ data: { leadId } }),
    onMutate: () => {
      setPending("criar");
      setDialogError("");
    },
    onSuccess: async () => {
      setDialogOpen(false);
      toast.success("Demonstração criada");
      await refresh();
    },
    onError: (e) => setDialogError(messageOf(e)),
    onSettled: () => setPending(null),
  });

  const runAction = async (action: DemoCardAction) => {
    if (!session) return;
    if (action === "abrir") {
      openDemoCampaign(session.campanha_id);
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
    const call: Record<Exclude<DemoCardAction, "abrir">, () => Promise<unknown>> = {
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
      await refresh();
    } catch (e) {
      toast.error("Não foi possível concluir", { description: messageOf(e) });
    } finally {
      setPending(null);
    }
  };

  if (isLoading) return null;
  if (isError) {
    return (
      <p className="border-t border-border/60 pt-5 text-xs text-text-secondary">
        Não foi possível carregar a demonstração deste lead.
      </p>
    );
  }

  return (
    <>
      <LeadDemoCardView
        session={session}
        now={new Date()}
        pending={pending}
        onCreate={() => {
          setDialogError("");
          setDialogOpen(true);
        }}
        onAction={(a) => void runAction(a)}
      />
      <DemoCreateDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        leadLabel={leadLabel}
        creating={create.isPending}
        error={dialogError}
        onConfirm={() => create.mutate()}
      />
      {confirmDialog}
    </>
  );
}
