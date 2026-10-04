import { createFileRoute, useSearch } from "@tanstack/react-router";
import { z } from "zod";
import { ArquivosV2 } from "@/features/client-portal-v2/pages/ArquivosV2";

export const Route = createFileRoute("/_authenticated/preview-cliente/$clienteId/arquivos")({
  validateSearch: z.object({ arquivo: z.string().optional() }),
  component: PreviewArquivosPage,
});

function PreviewArquivosPage() {
  const search = useSearch({ from: "/_authenticated/preview-cliente/$clienteId/arquivos" });
  return <ArquivosV2 openFileId={search.arquivo} />;
}
