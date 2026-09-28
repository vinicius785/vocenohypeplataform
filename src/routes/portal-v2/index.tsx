import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/portal-v2/")({
  beforeLoad: () => {
    throw redirect({ to: "/portal-v2/inicio" });
  },
});
