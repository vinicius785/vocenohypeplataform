import { createFileRoute, useSearch } from "@tanstack/react-router";
import { z } from "zod";
import { RelatoriosV2 } from "@/features/client-portal-v2/pages/RelatoriosV2";

export const Route = createFileRoute("/demo/$token/relatorios")({
  validateSearch: z.object({ arquivo: z.string().optional() }),
  component: DemoRelatoriosPage,
});

function DemoRelatoriosPage() {
  const search = useSearch({ from: "/demo/$token/relatorios" });
  return <RelatoriosV2 openFileId={search.arquivo} />;
}
