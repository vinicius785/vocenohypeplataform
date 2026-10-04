import { createFileRoute } from "@tanstack/react-router";
import { InicioV2 } from "@/features/client-portal-v2/pages/InicioV2";

export const Route = createFileRoute("/demo/$token/inicio")({
  component: InicioV2,
});
