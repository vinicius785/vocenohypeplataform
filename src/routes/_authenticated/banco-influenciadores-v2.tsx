import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Cutover concluído: o Banco de Influenciadores V2 agora é a própria
 * seção "influenciadores" de `/time` (ver `time.tsx`). Esta URL existiu
 * durante a fase de comparação lado a lado; mantida como redirect pra não
 * quebrar links/favoritos já compartilhados.
 */
export const Route = createFileRoute("/_authenticated/banco-influenciadores-v2")({
  beforeLoad: () => {
    throw redirect({ to: "/time", search: { section: "influenciadores" } });
  },
});
