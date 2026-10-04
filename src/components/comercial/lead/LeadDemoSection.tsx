import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { DemoCreateDialog } from "@/components/demo/DemoCreateDialog";
import { messageOf, useDemoActions } from "@/components/demo/use-demo-actions";
import { createDemo, getDemoForLead } from "@/lib/demo.functions";
import { LeadDemoCardView } from "./LeadDemoCard";

/** Demonstração do lead: busca o estado, cria e gerencia (copiar link, reiniciar, renovar, revogar, encerrar). */
export function LeadDemoSection({ leadId, leadLabel }: { leadId: string; leadLabel: string }) {
  const queryClient = useQueryClient();
  const queryKey = ["demo-do-lead", leadId];

  const getFn = useServerFn(getDemoForLead);
  const createFn = useServerFn(createDemo);

  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: () => getFn({ data: { leadId } }),
    staleTime: 15_000,
  });
  const session = data?.session ?? null;

  const refresh = () => queryClient.invalidateQueries({ queryKey });
  const actions = useDemoActions(session, refresh);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogError, setDialogError] = useState("");

  const create = useMutation({
    mutationFn: () => createFn({ data: { leadId } }),
    onMutate: () => setDialogError(""),
    onSuccess: async () => {
      setDialogOpen(false);
      toast.success("Demonstração criada");
      await refresh();
    },
    onError: (e) => setDialogError(messageOf(e)),
  });

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
        pending={create.isPending ? "criar" : actions.pending}
        onCreate={() => {
          setDialogError("");
          setDialogOpen(true);
        }}
        onAction={(a) => void actions.run(a)}
      />
      <DemoCreateDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        leadLabel={leadLabel}
        creating={create.isPending}
        error={dialogError}
        onConfirm={() => create.mutate()}
      />
      {actions.confirmDialog}
    </>
  );
}
