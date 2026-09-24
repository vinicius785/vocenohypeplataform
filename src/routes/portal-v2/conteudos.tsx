import { createFileRoute } from "@tanstack/react-router";
import { ConteudosV2 } from "@/features/client-portal-v2/pages/ConteudosV2";

export const Route = createFileRoute("/portal-v2/conteudos")({
  component: ConteudosV2,
});
