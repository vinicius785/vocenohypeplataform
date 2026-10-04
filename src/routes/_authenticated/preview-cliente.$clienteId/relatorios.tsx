import { createFileRoute, useSearch } from "@tanstack/react-router";
import { z } from "zod";
import { RelatoriosV2 } from "@/features/client-portal-v2/pages/RelatoriosV2";

export const Route = createFileRoute("/_authenticated/preview-cliente/$clienteId/relatorios")({
  validateSearch: z.object({ arquivo: z.string().optional() }),
  component: PreviewRelatoriosPage,
});

function PreviewRelatoriosPage() {
  const search = useSearch({ from: "/_authenticated/preview-cliente/$clienteId/relatorios" });
  return <RelatoriosV2 openFileId={search.arquivo} />;
}
