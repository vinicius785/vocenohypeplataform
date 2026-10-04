import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/preview-cliente/$clienteId/")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/preview-cliente/$clienteId/inicio", params });
  },
});
