import { createFileRoute, useSearch } from "@tanstack/react-router";
import { z } from "zod";
import { RelatoriosV2 } from "@/features/client-portal-v2/pages/RelatoriosV2";

const relatoriosSearchSchema = z.object({
  arquivo: z.string().optional(),
});

export const Route = createFileRoute("/portal-v2/relatorios")({
  validateSearch: relatoriosSearchSchema,
  component: RelatoriosPage,
});

function RelatoriosPage() {
  const search = useSearch({ from: "/portal-v2/relatorios" });
  return <RelatoriosV2 openFileId={search.arquivo} />;
}
