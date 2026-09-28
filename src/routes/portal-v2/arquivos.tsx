import { createFileRoute, useSearch } from "@tanstack/react-router";
import { z } from "zod";
import { ArquivosV2 } from "@/features/client-portal-v2/pages/ArquivosV2";

const arquivosSearchSchema = z.object({
  arquivo: z.string().optional(),
});

export const Route = createFileRoute("/portal-v2/arquivos")({
  validateSearch: arquivosSearchSchema,
  component: ArquivosPage,
});

function ArquivosPage() {
  const search = useSearch({ from: "/portal-v2/arquivos" });
  return <ArquivosV2 openFileId={search.arquivo} />;
}
