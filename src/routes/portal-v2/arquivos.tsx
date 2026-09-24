import { createFileRoute } from "@tanstack/react-router";
import { ArquivosV2 } from "@/features/client-portal-v2/pages/ArquivosV2";

export const Route = createFileRoute("/portal-v2/arquivos")({
  component: ArquivosV2,
});
