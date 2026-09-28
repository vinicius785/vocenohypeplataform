import { createFileRoute } from "@tanstack/react-router";
import { CampanhasV2 } from "@/features/client-portal-v2/pages/CampanhasV2";

export const Route = createFileRoute("/portal-v2/campanhas/")({
  component: CampanhasV2,
});
