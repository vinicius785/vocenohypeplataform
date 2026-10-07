import { createFileRoute } from "@tanstack/react-router";
import { BlogV2 } from "@/features/client-portal-v2/pages/BlogV2";

export const Route = createFileRoute("/portal-v2/blog/")({
  component: BlogV2,
});
