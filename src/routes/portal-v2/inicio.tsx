import { createFileRoute } from "@tanstack/react-router";
import { InicioV2 } from "@/features/client-portal-v2/pages/InicioV2";

export const Route = createFileRoute("/portal-v2/inicio")({
  component: InicioV2,
});
