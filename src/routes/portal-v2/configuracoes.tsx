import { createFileRoute } from "@tanstack/react-router";
import { ConfiguracoesV2 } from "@/features/client-portal-v2/pages/ConfiguracoesV2";

export const Route = createFileRoute("/portal-v2/configuracoes")({
  component: ConfiguracoesV2,
});
