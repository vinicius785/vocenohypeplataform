import { createFileRoute } from "@tanstack/react-router";
import { CampanhasV2 } from "@/features/client-portal-v2/pages/CampanhasV2";

export const Route = createFileRoute("/_authenticated/preview-cliente/$clienteId/campanhas/")({
  component: CampanhasV2,
});
