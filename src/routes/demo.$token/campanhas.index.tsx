import { createFileRoute } from "@tanstack/react-router";
import { CampanhasV2 } from "@/features/client-portal-v2/pages/CampanhasV2";

export const Route = createFileRoute("/demo/$token/campanhas/")({
  component: CampanhasV2,
});
