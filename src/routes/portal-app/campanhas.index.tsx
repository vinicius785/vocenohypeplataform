import { createFileRoute, redirect } from "@tanstack/react-router";

/** Redirect de compatibilidade — ver `route.tsx`/`campanhas.tsx` neste diretório. */
export const Route = createFileRoute("/portal-app/campanhas/")({
  beforeLoad: () => {
    throw redirect({ to: "/portal-v2/campanhas" });
  },
});
