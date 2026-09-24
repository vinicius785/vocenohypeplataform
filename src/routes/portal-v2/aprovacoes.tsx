import { createFileRoute } from "@tanstack/react-router";
import { AprovacoesV2 } from "@/features/client-portal-v2/pages/AprovacoesV2";

export const Route = createFileRoute("/portal-v2/aprovacoes")({
  component: AprovacoesV2,
});
