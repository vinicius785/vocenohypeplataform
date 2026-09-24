import { createFileRoute } from "@tanstack/react-router";
import { RelatoriosV2 } from "@/features/client-portal-v2/pages/RelatoriosV2";

export const Route = createFileRoute("/portal-v2/relatorios")({
  component: RelatoriosV2,
});
