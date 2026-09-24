import { createFileRoute } from "@tanstack/react-router";
import { ContaV2 } from "@/features/client-portal-v2/pages/ContaV2";

export const Route = createFileRoute("/portal-v2/conta")({
  component: ContaV2,
});
