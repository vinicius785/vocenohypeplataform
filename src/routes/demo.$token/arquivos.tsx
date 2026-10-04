import { createFileRoute, useSearch } from "@tanstack/react-router";
import { z } from "zod";
import { ArquivosV2 } from "@/features/client-portal-v2/pages/ArquivosV2";

export const Route = createFileRoute("/demo/$token/arquivos")({
  validateSearch: z.object({ arquivo: z.string().optional() }),
  component: DemoArquivosPage,
});

function DemoArquivosPage() {
  const search = useSearch({ from: "/demo/$token/arquivos" });
  return <ArquivosV2 openFileId={search.arquivo} />;
}
