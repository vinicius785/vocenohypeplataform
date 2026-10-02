import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Cutover concluído: a Time V2 agora é a própria seção "time" de `/time`
 * (ver `time.tsx`). Esta URL existiu durante a comparação lado a lado;
 * mantida como redirect pra não quebrar links já compartilhados.
 */
export const Route = createFileRoute("/_authenticated/time-v2")({
  beforeLoad: () => {
    throw redirect({ to: "/time", search: { section: "time" } });
  },
});
